-- ════════════════════════════════════════════════════════════════════════
-- Átrio — planos
--
-- Dois planos, por tamanho da barbearia (docs/ROADMAP.md, "Direção do
-- produto"):
--
--   solo        1 profissional ativo, só a conta do dono, caixa só com o
--               que entrou (sem despesas)
--   barbearia   sem esses limites
--
-- As regras moram aqui, e não só na tela: um painel desatualizado, uma
-- chamada direta à API ou o SQL Editor esbarram nelas do mesmo jeito.
--
-- Quem troca o plano é o Átrio (set_tenant_plan, chave de serviço) — por
-- enquanto pelo script tools/plano-barbearia.mjs; com a cobrança, pelo
-- provedor de pagamento. Rebaixar não apaga nada: só é aceito quando a
-- barbearia já cabe no plano menor.
-- ════════════════════════════════════════════════════════════════════════

alter table public.tenant_accounts
  add column plan text not null default 'barbearia'
    check (plan in ('solo', 'barbearia'));

create function private.tenant_plan(p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select plan from public.tenant_accounts where tenant_id = p_tenant_id
$$;

-- ─── Solo: 1 profissional ativo ──────────────────────────────────────────

create function private.guard_plan_professionals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active
     and private.tenant_plan(new.tenant_id) = 'solo'
     and exists (
       select 1 from public.professionals p
        where p.tenant_id = new.tenant_id and p.active and p.id <> new.id
     )
  then
    raise exception 'No plano Solo, a barbearia tem 1 profissional ativo. Para ter equipe, mude para o plano Barbearia.'
      using hint = 'limite_do_plano';
  end if;
  return new;
end;
$$;

create trigger professionals_plan
  before insert or update of active on public.professionals
  for each row execute function private.guard_plan_professionals();

-- ─── Solo: só a conta do dono ────────────────────────────────────────────

create function private.guard_plan_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role <> 'dono' and private.tenant_plan(new.tenant_id) = 'solo' then
    raise exception 'No plano Solo, só a conta do dono acessa o painel. Para ter atendentes, mude para o plano Barbearia.'
      using hint = 'limite_do_plano';
  end if;
  return new;
end;
$$;

create trigger tenant_members_plan
  before insert or update of role on public.tenant_members
  for each row execute function private.guard_plan_members();

-- ─── Solo: caixa sem despesas ────────────────────────────────────────────
--
-- O recebimento continua (nasce em register_payment). Despesa nova, só no
-- plano Barbearia; as que já existiam — de antes de rebaixar — seguem
-- editáveis e removíveis.

drop policy "equipe lança despesas" on public.finance_entries;

create policy "equipe lança despesas" on public.finance_entries
  for insert to authenticated
  with check (
    private.is_member(tenant_id)
    and kind = 'despesa'
    and private.tenant_plan(tenant_id) = 'barbearia'
  );

-- ─── trocar de plano ─────────────────────────────────────────────────────

create function public.set_tenant_plan(p_tenant_id uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active    integer;
  v_staff     integer;
begin
  if p_plan not in ('solo', 'barbearia') then
    raise exception 'Plano "%" não existe. Use solo ou barbearia.', p_plan
      using hint = 'plano_invalido';
  end if;

  if p_plan = 'solo' then
    select count(*) into v_active
      from public.professionals where tenant_id = p_tenant_id and active;
    if v_active > 1 then
      raise exception 'A barbearia tem % profissionais ativos; o plano Solo permite 1. Desative os outros antes de mudar.', v_active
        using hint = 'rebaixar_profissionais';
    end if;

    select count(*) into v_staff
      from public.tenant_members where tenant_id = p_tenant_id and role <> 'dono';
    if v_staff > 0 then
      raise exception 'A barbearia tem % conta(s) de atendente; o plano Solo é só do dono. Remova-as antes de mudar.', v_staff
        using hint = 'rebaixar_equipe';
    end if;
  end if;

  update public.tenant_accounts set plan = p_plan where tenant_id = p_tenant_id;
  if not found then
    raise exception 'Barbearia não encontrada.' using hint = 'nao_encontrado';
  end if;
end;
$$;

revoke execute on function public.set_tenant_plan(uuid, text) from public, anon, authenticated;
grant execute on function public.set_tenant_plan(uuid, text) to service_role;
