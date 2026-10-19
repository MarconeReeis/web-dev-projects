-- ════════════════════════════════════════════════════════════════════════
-- Átrio — "Excluir minha conta" (LGPD)
--
-- O cliente apaga a própria conta pelo app. O que acontece:
--
--   conta e perfil (e-mail, senha, nome, telefone) ......... apagados
--   ficha da pessoa em cada barbearia ...................... apagada
--   horários futuros ....................................... cancelados
--   atendimentos passados .................................. sem nome,
--                                                           telefone nem
--                                                           observações
--   recebimentos no caixa .................................. valores
--                                                           intactos, nome
--                                                           tirado da
--                                                           descrição
--
-- O histórico fica com a barbearia porque é dela — agenda e caixa são
-- registros do negócio, e um buraco no faturamento de um mês passado não é
-- o que a lei pede. O que identifica a pessoa sai.
--
-- Fora daqui: horários marcados no BALCÃO e nunca ligados à conta. Eles
-- não são da conta, são da barbearia (que é a controladora desses dados);
-- pedido de exclusão sobre eles é com a barbearia.
-- ════════════════════════════════════════════════════════════════════════

-- O recebimento continua imutável, com uma exceção só: a anonimização, que
-- troca a descrição e nada mais. Ela só vale dentro de delete_my_account,
-- que liga a marca 'atrio.anonimizando' na própria transação.
create or replace function private.guard_receipt()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.kind = 'recebimento' then
    if tg_op = 'UPDATE'
       and current_setting('atrio.anonimizando', true) = 'on'
       and new.kind = old.kind
       and new.amount_cents = old.amount_cents
       and new.occurred_at = old.occurred_at
       and new.method is not distinct from old.method
       and new.appointment_id is not distinct from old.appointment_id
       and new.professional_id is not distinct from old.professional_id
       and new.tenant_id = old.tenant_id then
      return new;
    end if;

    raise exception 'Recebimentos não podem ser alterados nem removidos.'
      using hint = 'recebimento_imutavel';
  end if;
  return coalesce(new, old);
end;
$$;

create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_clients  uuid[];
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para excluí-la.' using hint = 'nao_autenticado';
  end if;

  -- Conta da equipe não sai pelo app do cliente: a barbearia ficaria sem
  -- dono (ou sem atendente) de uma hora para outra.
  if exists (select 1 from public.tenant_members where user_id = v_uid) then
    raise exception 'Esta conta faz parte da equipe de uma barbearia. Para excluí-la, fale com o suporte do Átrio.'
      using hint = 'conta_da_equipe';
  end if;

  select coalesce(array_agg(id), '{}') into v_clients
  from public.clients where user_id = v_uid;

  -- Horários que ainda vão acontecer: cancelados, e o horário volta a ficar
  -- livre para outra pessoa.
  update public.appointments
     set status = 'cancelado'
   where client_id = any (v_clients)
     and status = 'agendado'
     and starts_at > now();

  -- O caixa perde o nome, não os valores (ver guard_receipt acima).
  perform set_config('atrio.anonimizando', 'on', true);
  update public.finance_entries f
     set description = a.service_name || ' — Cliente removido'
    from public.appointments a
   where f.appointment_id = a.id
     and a.client_id = any (v_clients);

  update public.appointments
     set client_name = 'Cliente removido',
         client_phone = null,
         notes = null
   where client_id = any (v_clients);

  -- Fichas fora; os agendamentos ficam com client_id nulo (on delete set null).
  delete from public.clients where id = any (v_clients);

  -- Conta fora; o perfil vai junto (on delete cascade).
  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
