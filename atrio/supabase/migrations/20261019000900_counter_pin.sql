-- ════════════════════════════════════════════════════════════════════════
-- Átrio — PIN do balcão
--
-- O tablet fica logado o dia inteiro, ao alcance de qualquer um. O
-- Financeiro e as ações destrutivas (cancelar atendimento, remover
-- bloqueio…) pedem um PIN de 4 dígitos da conta logada.
--
-- O alcance é esse: proteger o TABLET contra quem está na frente dele. Não
-- é barreira contra quem tem a senha da conta — essa pessoa tem acesso
-- total de qualquer jeito.
--
-- Três cuidados:
--
-- 1. O resumo do PIN mora numa tabela sem nenhuma política de leitura: nem
--    a própria equipe o lê. Com 4 dígitos, quem tivesse o resumo acharia o
--    PIN por tentativa em segundos, fora daqui.
-- 2. A conferência é sempre aqui, com limite: 5 erros travam por 5 minutos.
--    As funções DEVOLVEM o resultado em vez de levantar erro — erro
--    desfaria a contagem de tentativas junto com a transação.
-- 3. Trocar exige o PIN atual; esquecer exige ter entrado com a senha há
--    pouco (reset_counter_pin).
-- ════════════════════════════════════════════════════════════════════════

create table public.staff_pins (
  tenant_id     uuid not null,
  user_id       uuid not null,
  pin_salt      text not null,
  pin_hash      text not null,
  failed        integer not null default 0,
  locked_until  timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (tenant_id, user_id),
  foreign key (tenant_id, user_id)
    references public.tenant_members (tenant_id, user_id) on delete cascade
);

-- RLS ligada e nenhuma política: só as funções abaixo (SECURITY DEFINER)
-- tocam a tabela.
alter table public.staff_pins enable row level security;
revoke all on public.staff_pins from anon, authenticated;

create function private.pin_digest(p_salt text, p_pin text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_salt || ':' || p_pin, 'UTF8')), 'hex')
$$;

create function private.assert_pin_format(p_pin text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'O PIN tem 4 números.' using hint = 'pin_invalido';
  end if;
end;
$$;

-- ─── situação ────────────────────────────────────────────────────────────

create function public.counter_pin_status(p_tenant_id uuid)
returns table (configured boolean, locked_until timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_member(p_tenant_id) then
    raise exception 'Barbearia não encontrada.' using hint = 'nao_encontrado';
  end if;

  return query
    select exists (select 1 from public.staff_pins s
                    where s.tenant_id = p_tenant_id and s.user_id = auth.uid()),
           (select case when s.locked_until > now() then s.locked_until end
              from public.staff_pins s
             where s.tenant_id = p_tenant_id and s.user_id = auth.uid());
end;
$$;

-- ─── conferir ────────────────────────────────────────────────────────────
--
-- ok: acertou. Errou: remaining = tentativas que sobram antes de travar.
-- Travado: locked_until diz até quando.

create function public.verify_counter_pin(p_tenant_id uuid, p_pin text)
returns table (ok boolean, remaining integer, locked_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pin public.staff_pins;
begin
  if not private.is_member(p_tenant_id) then
    raise exception 'Barbearia não encontrada.' using hint = 'nao_encontrado';
  end if;

  select * into v_pin from public.staff_pins
   where tenant_id = p_tenant_id and user_id = auth.uid()
   for update;
  if not found then
    raise exception 'Esta conta ainda não tem PIN.' using hint = 'pin_inexistente';
  end if;

  if v_pin.locked_until > now() then
    return query select false, 0, v_pin.locked_until;
    return;
  end if;

  if private.pin_digest(v_pin.pin_salt, coalesce(p_pin, '')) = v_pin.pin_hash then
    update public.staff_pins set failed = 0, locked_until = null
     where tenant_id = p_tenant_id and user_id = auth.uid();
    return query select true, null::integer, null::timestamptz;
    return;
  end if;

  if v_pin.failed + 1 >= 5 then
    update public.staff_pins set failed = 0, locked_until = now() + interval '5 minutes'
     where tenant_id = p_tenant_id and user_id = auth.uid()
    returning staff_pins.locked_until into v_pin.locked_until;
    return query select false, 0, v_pin.locked_until;
  else
    update public.staff_pins set failed = v_pin.failed + 1
     where tenant_id = p_tenant_id and user_id = auth.uid();
    return query select false, 5 - (v_pin.failed + 1), null::timestamptz;
  end if;
end;
$$;

-- ─── criar ou trocar ─────────────────────────────────────────────────────
--
-- Primeira vez: cria sem pedir nada. Já existe: só troca com o PIN atual
-- certo — conferido pela mesma regra de tentativas.

create function public.set_counter_pin(p_tenant_id uuid, p_new_pin text, p_current_pin text default null)
returns table (ok boolean, remaining integer, locked_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salt   text := gen_random_uuid()::text;
  v_check  record;
begin
  if not private.is_member(p_tenant_id) then
    raise exception 'Barbearia não encontrada.' using hint = 'nao_encontrado';
  end if;
  perform private.assert_pin_format(p_new_pin);

  if exists (select 1 from public.staff_pins
              where tenant_id = p_tenant_id and user_id = auth.uid()) then
    select * into v_check from public.verify_counter_pin(p_tenant_id, p_current_pin);
    if not v_check.ok then
      return query select false, v_check.remaining, v_check.locked_until;
      return;
    end if;
  end if;

  insert into public.staff_pins (tenant_id, user_id, pin_salt, pin_hash)
  values (p_tenant_id, auth.uid(), v_salt, private.pin_digest(v_salt, p_new_pin))
  on conflict (tenant_id, user_id) do update
    set pin_salt = excluded.pin_salt,
        pin_hash = excluded.pin_hash,
        failed = 0,
        locked_until = null,
        updated_at = now();

  return query select true, null::integer, null::timestamptz;
end;
$$;

-- ─── esqueci o PIN ───────────────────────────────────────────────────────
--
-- Sem o PIN atual, vale a senha da conta: o app pede a senha e entra de
-- novo com ela; aqui se confere que esse login acabou de acontecer. Quem só
-- está diante do tablet logado não tem a senha — e não passa.

create function public.reset_counter_pin(p_tenant_id uuid, p_new_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_member(p_tenant_id) then
    raise exception 'Barbearia não encontrada.' using hint = 'nao_encontrado';
  end if;
  perform private.assert_pin_format(p_new_pin);

  if not exists (
    select 1 from auth.users
     where id = auth.uid() and last_sign_in_at > now() - interval '5 minutes'
  ) then
    raise exception 'Confirme a senha da conta para criar um PIN novo.' using hint = 'reautenticar';
  end if;

  insert into public.staff_pins (tenant_id, user_id, pin_salt, pin_hash)
  select p_tenant_id, auth.uid(), salt, private.pin_digest(salt, p_new_pin)
  from (select gen_random_uuid()::text as salt) as fresh
  on conflict (tenant_id, user_id) do update
    set pin_salt = excluded.pin_salt,
        pin_hash = excluded.pin_hash,
        failed = 0,
        locked_until = null,
        updated_at = now();
end;
$$;

revoke execute on function public.counter_pin_status(uuid) from public, anon, authenticated;
revoke execute on function public.verify_counter_pin(uuid, text) from public, anon, authenticated;
revoke execute on function public.set_counter_pin(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.reset_counter_pin(uuid, text) from public, anon, authenticated;

grant execute on function public.counter_pin_status(uuid) to authenticated;
grant execute on function public.verify_counter_pin(uuid, text) to authenticated;
grant execute on function public.set_counter_pin(uuid, text, text) to authenticated;
grant execute on function public.reset_counter_pin(uuid, text) to authenticated;
