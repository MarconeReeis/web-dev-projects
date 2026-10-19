-- ════════════════════════════════════════════════════════════════════════
-- Átrio — ligar o histórico do balcão à conta do cliente
--
-- O cenário: o Paulo sempre marcou no balcão (agendamentos sem client_id,
-- só nome e telefone). Um dia ele cria conta e marca pelo app. "Meus
-- horários" mostra só o que ele marcou pelo app — o histórico do balcão não
-- aparece, de propósito: o telefone da conta não é verificado, e ligar por
-- ele deixaria qualquer um ver os horários de outra pessoa cadastrando o
-- número dela.
--
-- Quem confirma é a equipe, que conhece o cliente. Três regras:
--
-- 1. A sugestão só considera contas que JÁ marcaram nesta barbearia pelo app
--    (clients com user_id). A equipe nunca descobre, testando telefones,
--    quem tem conta no Átrio.
-- 2. Ligar exige o toque da equipe (link_counter_history).
-- 3. Depois de ligada, a ficha vale para o futuro: o que a equipe marcar no
--    balcão com o mesmo telefone já nasce ligado (create_appointment).
-- ════════════════════════════════════════════════════════════════════════

-- Quando a equipe confirmou que a conta do app é mesmo daquela pessoa.
alter table public.clients add column linked_by_staff_at timestamptz;

-- Telefone comparável: só dígitos, sem o 55 do país. "(11) 91111-1111",
-- "11911111111" e "+55 11 91111-1111" viram a mesma chave. Curto demais
-- para ser telefone com DDD, não vira chave nenhuma.
create function private.phone_key(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d ~ '^55[0-9]{10,11}$' then substr(d, 3)
    when length(d) between 10 and 11 then d
  end
  from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) as digits
$$;

grant execute on function private.phone_key(text) to authenticated;

-- ─── sugestão ────────────────────────────────────────────────────────────
--
-- Para um agendamento do balcão (sem ficha), a ficha do app com o mesmo
-- telefone nesta barbearia, e quantos agendamentos do balcão iriam junto.
-- SECURITY INVOKER: a RLS decide — quem não é da equipe não enxerga o
-- agendamento nem as fichas, e a função não devolve nada.

create function public.link_suggestion(p_appointment_id uuid)
returns table (client_id uuid, client_name text, client_phone text, pending integer)
language sql
stable
set search_path = ''
as $$
  select c.id, c.name, c.phone,
         (select count(*)::integer
            from public.appointments other
           where other.tenant_id = a.tenant_id
             and other.client_id is null
             and private.phone_key(other.client_phone) = private.phone_key(a.client_phone))
    from public.appointments a
    join public.clients c
      on c.tenant_id = a.tenant_id
     and c.user_id is not null
     and private.phone_key(c.phone) = private.phone_key(a.client_phone)
   where a.id = p_appointment_id
     and a.client_id is null
     and private.phone_key(a.client_phone) is not null
   order by c.updated_at desc
   limit 1
$$;

-- ─── confirmação ─────────────────────────────────────────────────────────

create function public.link_counter_history(p_client_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_client  public.clients;
  v_key     text;
  v_count   integer;
begin
  select * into v_client from public.clients where id = p_client_id;
  if not found or not private.is_member(v_client.tenant_id) or v_client.user_id is null then
    raise exception 'Ficha não encontrada.' using hint = 'nao_encontrado';
  end if;

  v_key := private.phone_key(v_client.phone);
  if v_key is null then
    raise exception 'A ficha não tem um telefone válido para ligar.' using hint = 'sem_telefone';
  end if;

  update public.clients set linked_by_staff_at = now() where id = p_client_id;

  update public.appointments
     set client_id = p_client_id
   where tenant_id = v_client.tenant_id
     and client_id is null
     and private.phone_key(client_phone) = v_key;
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

-- ─── balcão: o que vier depois já nasce ligado ───────────────────────────

create or replace function public.create_appointment(
  p_professional_id  uuid,
  p_service_id       uuid,
  p_starts_at        timestamptz,
  p_client_name      text,
  p_client_phone     text default null,
  p_client_id        uuid default null,
  p_notes            text default null,
  p_price_cents      integer default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service  public.services;
  v_ends     timestamptz;
  v_client   uuid := p_client_id;
  v_row      public.appointments;
begin
  select * into v_service from public.services where id = p_service_id;
  if not found or not private.is_member(v_service.tenant_id) then
    raise exception 'Serviço não encontrado.' using hint = 'nao_encontrado';
  end if;

  if not exists (
    select 1 from public.professional_services ps
    where ps.professional_id = p_professional_id and ps.service_id = p_service_id
  ) then
    raise exception 'Este profissional não realiza este serviço.'
      using hint = 'servico_indisponivel';
  end if;

  -- Só fichas que a equipe JÁ confirmou: uma conta que apenas cadastrou o
  -- mesmo telefone não recebe o horário de ninguém.
  if v_client is null and private.phone_key(p_client_phone) is not null then
    select c.id into v_client
      from public.clients c
     where c.tenant_id = v_service.tenant_id
       and c.user_id is not null
       and c.linked_by_staff_at is not null
       and private.phone_key(c.phone) = private.phone_key(p_client_phone)
     order by c.linked_by_staff_at desc
     limit 1;
  end if;

  v_ends := p_starts_at + make_interval(mins => v_service.duration_minutes);
  perform private.check_slot(v_service.tenant_id, p_professional_id, p_starts_at, v_ends, false);

  begin
    insert into public.appointments (
      tenant_id, professional_id, service_id, service_name, duration_minutes, price_cents,
      client_id, client_name, client_phone, starts_at, ends_at, notes
    ) values (
      v_service.tenant_id, p_professional_id, v_service.id, v_service.name,
      v_service.duration_minutes, coalesce(p_price_cents, v_service.price_cents),
      v_client, trim(p_client_name), nullif(trim(p_client_phone), ''),
      p_starts_at, v_ends, nullif(trim(p_notes), '')
    )
    returning * into v_row;
  exception when exclusion_violation then
    raise exception 'Esse profissional já tem atendimento nesse horário.'
      using hint = 'horario_ocupado';
  end;

  return v_row;
end;
$$;

revoke execute on function public.link_suggestion(uuid) from public, anon, authenticated;
revoke execute on function public.link_counter_history(uuid) from public, anon, authenticated;
revoke execute on function public.create_appointment(uuid, uuid, timestamptz, text, text, uuid, text, integer) from public, anon, authenticated;

grant execute on function public.link_suggestion(uuid) to authenticated;
grant execute on function public.link_counter_history(uuid) to authenticated;
grant execute on function public.create_appointment(uuid, uuid, timestamptz, text, text, uuid, text, integer) to authenticated;
