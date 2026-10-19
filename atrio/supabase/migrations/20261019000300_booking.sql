-- ════════════════════════════════════════════════════════════════════════
-- Átrio — operações de agenda
--
-- Toda escrita que precisa de regra além de "é da sua barbearia" mora aqui.
-- São SECURITY DEFINER: rodam como dono das tabelas e por isso fazem a
-- própria checagem de quem chama — cada função começa decidindo isso.
--
-- Erros levam um código estável em HINT (horario_ocupado, prazo_encerrado…).
-- A mensagem é para gente; o hint é para o app decidir o que fazer, sem
-- depender do texto.
-- ════════════════════════════════════════════════════════════════════════

-- Antecedência mínima para o CLIENTE cancelar ou reagendar sozinho. A mesma
-- de CHANGE_LIMIT_HOURS no app; a equipe não tem limite.
create function private.change_limit()
returns interval
language sql
immutable
as $$ select interval '2 hours' $$;

-- Quanto à frente o cliente pode marcar. Folga sobre os 21 dias do app, para
-- a barbearia aumentar a janela sem migração.
create function private.booking_horizon()
returns interval
language sql
immutable
as $$ select interval '90 days' $$;

-- ─── o horário cabe? ─────────────────────────────────────────────────────
--
-- Profissional ativo, da barbearia; dentro do expediente (quando pedido);
-- fora de intervalos e bloqueios. Conflito com outro atendimento NÃO é
-- checado aqui: quem garante é a constraint appointments_no_overlap, que é
-- a única checagem imune a duas gravações simultâneas.

create function private.check_slot(
  p_tenant        uuid,
  p_professional  uuid,
  p_starts_at     timestamptz,
  p_ends_at       timestamptz,
  p_check_hours   boolean
)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz         text;
  v_local      timestamp;
  v_weekday    smallint;
  v_start_min  numeric;
  v_end_min    numeric;
begin
  if not exists (
    select 1 from public.professionals p
    where p.id = p_professional and p.tenant_id = p_tenant and p.active
  ) then
    raise exception 'Este profissional não está atendendo.'
      using hint = 'profissional_indisponivel';
  end if;

  if p_check_hours then
    select t.time_zone into v_tz from public.tenants t where t.id = p_tenant;

    -- Expediente é hora local da barbearia. Contado em minutos desde a
    -- meia-noite local, que é como o app conta — e assim "24:00" (fim do
    -- dia) vira 1440 sem caso especial.
    v_local     := p_starts_at at time zone v_tz;
    v_weekday   := extract(dow from v_local);
    v_start_min := extract(epoch from (v_local - date_trunc('day', v_local))) / 60;
    v_end_min   := v_start_min + extract(epoch from (p_ends_at - p_starts_at)) / 60;

    if not exists (
      select 1 from public.professional_schedule s
      where s.professional_id = p_professional
        and s.weekday = v_weekday
        and s.kind = 'expediente'
        and extract(epoch from s.starts) / 60 <= v_start_min
        and extract(epoch from s.ends) / 60 >= v_end_min
    ) then
      raise exception 'Fora do horário de atendimento.' using hint = 'fora_do_expediente';
    end if;

    if exists (
      select 1 from public.professional_schedule s
      where s.professional_id = p_professional
        and s.weekday = v_weekday
        and s.kind = 'intervalo'
        and extract(epoch from s.starts) / 60 < v_end_min
        and extract(epoch from s.ends) / 60 > v_start_min
    ) then
      raise exception 'Este horário cai no intervalo do profissional.'
        using hint = 'fora_do_expediente';
    end if;
  end if;

  if exists (
    select 1 from public.time_blocks b
    where b.tenant_id = p_tenant
      and (b.professional_id is null or b.professional_id = p_professional)
      and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'Este horário está bloqueado na agenda.' using hint = 'horario_bloqueado';
  end if;
end;
$$;

-- ─── horários ocupados (app do cliente) ──────────────────────────────────
--
-- O app calcula os horários livres sozinho, mas não pode ler a agenda: ela
-- tem nome e telefone de outros clientes, e o motivo dos bloqueios ("consulta
-- médica"). Esta função entrega só o que o cálculo precisa — quem está
-- ocupado e quando.
--
-- appointment_id vem preenchido só nos agendamentos que quem chama pode ver
-- (os próprios, ou todos, para a equipe): é o que permite ao reagendamento
-- ignorar o próprio horário.

create function public.busy_intervals(
  p_tenant_id  uuid,
  p_from       timestamptz,
  p_to         timestamptz
)
returns table (
  professional_id  uuid,
  starts_at        timestamptz,
  ends_at          timestamptz,
  appointment_id   uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Janela limitada: sem limite, a função vira um jeito de baixar a agenda
  -- inteira de qualquer barbearia.
  if p_to <= p_from or p_to - p_from > interval '62 days' then
    raise exception 'Janela de consulta inválida (máximo de 62 dias).'
      using hint = 'janela_invalida';
  end if;

  return query
    select a.professional_id, a.starts_at, a.ends_at,
           case
             when private.is_member(a.tenant_id) or private.is_own_client(a.client_id)
             then a.id
           end
    from public.appointments a
    where a.tenant_id = p_tenant_id
      and a.status in ('agendado', 'em_atendimento', 'concluido')
      and a.starts_at < p_to and a.ends_at > p_from
    union all
    -- Bloqueio sem profissional vale para todos: professional_id nulo.
    select b.professional_id, b.starts_at, b.ends_at, null::uuid
    from public.time_blocks b
    where b.tenant_id = p_tenant_id
      and b.starts_at < p_to and b.ends_at > p_from;
end;
$$;

-- ─── marcar (cliente) ────────────────────────────────────────────────────

create function public.book_appointment(
  p_professional_id  uuid,
  p_service_id       uuid,
  p_starts_at        timestamptz,
  p_notes            text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_profile  public.profiles;
  v_service  public.services;
  v_client   uuid;
  v_ends     timestamptz;
  v_row      public.appointments;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para agendar.' using hint = 'nao_autenticado';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception 'Complete seu cadastro com nome e telefone.' using hint = 'perfil_incompleto';
  end if;

  select * into v_service from public.services where id = p_service_id and active;
  if not found then
    raise exception 'Este serviço não está disponível.' using hint = 'servico_indisponivel';
  end if;

  if not exists (
    select 1 from public.professional_services ps
    where ps.professional_id = p_professional_id and ps.service_id = p_service_id
  ) then
    raise exception 'Este profissional não realiza este serviço.'
      using hint = 'servico_indisponivel';
  end if;

  if p_starts_at < now() then
    raise exception 'Este horário já passou.' using hint = 'horario_passado';
  end if;
  if p_starts_at > now() + private.booking_horizon() then
    raise exception 'Ainda não é possível marcar para tão longe.' using hint = 'fora_da_janela';
  end if;

  v_ends := p_starts_at + make_interval(mins => v_service.duration_minutes);
  perform private.check_slot(v_service.tenant_id, p_professional_id, p_starts_at, v_ends, true);

  -- A ficha do cliente na barbearia: criada no primeiro agendamento pelo
  -- app, atualizada com nome e telefone da conta nos seguintes.
  --
  -- Fichas criadas no balcão NÃO são ligadas por telefone: o telefone da
  -- conta não é verificado, e ligar por ele entregaria o histórico de outra
  -- pessoa a quem cadastrasse o número dela. A ligação fica para a equipe,
  -- ou para quando houver verificação por SMS.
  insert into public.clients (tenant_id, name, phone, user_id)
  values (v_service.tenant_id, v_profile.name, v_profile.phone, v_uid)
  on conflict (tenant_id, user_id)
    do update set name = excluded.name, phone = excluded.phone
  returning id into v_client;

  begin
    insert into public.appointments (
      tenant_id, professional_id, service_id, service_name, duration_minutes, price_cents,
      client_id, client_name, client_phone, starts_at, ends_at, notes
    ) values (
      v_service.tenant_id, p_professional_id, v_service.id, v_service.name,
      v_service.duration_minutes, v_service.price_cents,
      v_client, v_profile.name, v_profile.phone, p_starts_at, v_ends,
      nullif(trim(p_notes), '')
    )
    returning * into v_row;
  exception when exclusion_violation then
    raise exception 'Esse horário acabou de ser ocupado. Escolha outro.'
      using hint = 'horario_ocupado';
  end;

  return v_row;
end;
$$;

-- ─── marcar (equipe, no balcão) ──────────────────────────────────────────
--
-- Diferenças em relação ao cliente: o cliente vem por parâmetro (ficha ou
-- nome e telefone avulsos), o preço pode ser ajustado, e o expediente não é
-- cobrado — encaixe fora de hora é decisão da barbearia. Bloqueios e
-- conflitos continuam valendo.

create function public.create_appointment(
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

  v_ends := p_starts_at + make_interval(mins => v_service.duration_minutes);
  perform private.check_slot(v_service.tenant_id, p_professional_id, p_starts_at, v_ends, false);

  begin
    insert into public.appointments (
      tenant_id, professional_id, service_id, service_name, duration_minutes, price_cents,
      client_id, client_name, client_phone, starts_at, ends_at, notes
    ) values (
      v_service.tenant_id, p_professional_id, v_service.id, v_service.name,
      v_service.duration_minutes, coalesce(p_price_cents, v_service.price_cents),
      p_client_id, trim(p_client_name), nullif(trim(p_client_phone), ''),
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

-- ─── reagendar ───────────────────────────────────────────────────────────
--
-- Cliente: só os próprios, só "agendado", com mais de 2h de antecedência,
-- dentro do expediente e com o mesmo profissional. Equipe: qualquer um da
-- barbearia, pode trocar de profissional, sem cobrar expediente.
--
-- A duração é a congelada na marcação. A constraint de horário duplo ignora
-- a própria linha, então mudar 09:30 para 09:45 não colide consigo mesmo.

create function public.reschedule_appointment(
  p_id               uuid,
  p_starts_at        timestamptz,
  p_professional_id  uuid default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row     public.appointments;
  v_staff   boolean;
  v_pro     uuid;
  v_ends    timestamptz;
begin
  select * into v_row from public.appointments where id = p_id for update;

  -- "Não existe" e "não é seu" respondem igual, de propósito.
  if not found then
    raise exception 'Agendamento não encontrado.' using hint = 'nao_encontrado';
  end if;
  v_staff := private.is_member(v_row.tenant_id);
  if not v_staff and not private.is_own_client(v_row.client_id) then
    raise exception 'Agendamento não encontrado.' using hint = 'nao_encontrado';
  end if;

  if v_row.status <> 'agendado' then
    raise exception 'Este agendamento não pode mais ser reagendado.'
      using hint = 'nao_reagendavel';
  end if;

  v_pro := coalesce(p_professional_id, v_row.professional_id);

  if not v_staff then
    if v_pro <> v_row.professional_id then
      raise exception 'Para trocar de profissional, faça um novo agendamento.'
        using hint = 'sem_permissao';
    end if;
    if v_row.starts_at <= now() + private.change_limit() then
      raise exception 'Faltam menos de 2h. Para reagendar, fale com a barbearia.'
        using hint = 'prazo_encerrado';
    end if;
    if p_starts_at < now() then
      raise exception 'Este horário já passou.' using hint = 'horario_passado';
    end if;
    if p_starts_at > now() + private.booking_horizon() then
      raise exception 'Ainda não é possível marcar para tão longe.' using hint = 'fora_da_janela';
    end if;
  end if;

  if v_pro <> v_row.professional_id and not exists (
    select 1 from public.professional_services ps
    where ps.professional_id = v_pro and ps.service_id = v_row.service_id
  ) then
    raise exception 'Este profissional não realiza este serviço.'
      using hint = 'servico_indisponivel';
  end if;

  v_ends := p_starts_at + make_interval(mins => v_row.duration_minutes);
  perform private.check_slot(v_row.tenant_id, v_pro, p_starts_at, v_ends, not v_staff);

  begin
    update public.appointments
       set starts_at = p_starts_at, ends_at = v_ends, professional_id = v_pro
     where id = p_id
    returning * into v_row;
  exception when exclusion_violation then
    raise exception 'Esse horário acabou de ser ocupado. Escolha outro.'
      using hint = 'horario_ocupado';
  end;

  return v_row;
end;
$$;

-- ─── cancelar ────────────────────────────────────────────────────────────
--
-- O caminho do cliente (a equipe também pode usar, sem o limite de 2h).

create function public.cancel_appointment(p_id uuid)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    public.appointments;
  v_staff  boolean;
begin
  select * into v_row from public.appointments where id = p_id for update;

  if not found then
    raise exception 'Agendamento não encontrado.' using hint = 'nao_encontrado';
  end if;
  v_staff := private.is_member(v_row.tenant_id);
  if not v_staff and not private.is_own_client(v_row.client_id) then
    raise exception 'Agendamento não encontrado.' using hint = 'nao_encontrado';
  end if;

  if not v_staff then
    if v_row.status <> 'agendado' then
      raise exception 'Este agendamento não pode mais ser cancelado.'
        using hint = 'nao_cancelavel';
    end if;
    if v_row.starts_at <= now() + private.change_limit() then
      raise exception 'Faltam menos de 2h. Para cancelar, fale com a barbearia.'
        using hint = 'prazo_encerrado';
    end if;
  end if;

  -- A equipe passa pela mesma regra de transição, no gatilho.
  update public.appointments set status = 'cancelado' where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

-- ─── receber ─────────────────────────────────────────────────────────────
--
-- Baixa no atendimento e recebimento no caixa, na mesma transação: os dois
-- ou nenhum. Registrar de novo não duplica — o atendimento já pago volta
-- como está.

create function public.register_payment(
  p_id            uuid,
  p_method        public.payment_method,
  p_amount_cents  integer default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row  public.appointments;
begin
  select * into v_row from public.appointments where id = p_id for update;

  if not found or not private.is_member(v_row.tenant_id) then
    raise exception 'Agendamento não encontrado.' using hint = 'nao_encontrado';
  end if;
  if v_row.payment_status = 'pago' then
    return v_row;
  end if;
  if v_row.status in ('cancelado', 'nao_compareceu') then
    raise exception 'Atendimento cancelado não recebe pagamento.' using hint = 'nao_pagavel';
  end if;

  update public.appointments
     set payment_status = 'pago', payment_method = p_method, paid_at = now()
   where id = p_id
  returning * into v_row;

  insert into public.finance_entries (
    tenant_id, kind, description, amount_cents, occurred_at, method,
    appointment_id, professional_id
  ) values (
    v_row.tenant_id, 'recebimento',
    v_row.service_name || ' — ' || v_row.client_name,
    coalesce(p_amount_cents, v_row.price_cents),
    v_row.paid_at, p_method, v_row.id, v_row.professional_id
  );

  return v_row;
end;
$$;

-- ─── quem pode chamar ────────────────────────────────────────────────────
--
-- O Supabase concede execução de toda função nova em `public` a anon e
-- authenticated. Revoga-se de todos e concede-se só o necessário — as
-- funções se protegem sozinhas, mas a porta fechada é a primeira linha.

revoke execute on all functions in schema private from public;
grant execute on function private.is_member(uuid) to anon, authenticated;
grant execute on function private.is_owner(uuid) to anon, authenticated;
grant execute on function private.is_own_client(uuid) to anon, authenticated;

revoke execute on function public.busy_intervals(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.book_appointment(uuid, uuid, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.create_appointment(uuid, uuid, timestamptz, text, text, uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.reschedule_appointment(uuid, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.cancel_appointment(uuid) from public, anon, authenticated;
revoke execute on function public.register_payment(uuid, public.payment_method, integer) from public, anon, authenticated;

grant execute on function public.busy_intervals(uuid, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.book_appointment(uuid, uuid, timestamptz, text) to authenticated;
grant execute on function public.create_appointment(uuid, uuid, timestamptz, text, text, uuid, text, integer) to authenticated;
grant execute on function public.reschedule_appointment(uuid, timestamptz, uuid) to authenticated;
grant execute on function public.cancel_appointment(uuid) to authenticated;
grant execute on function public.register_payment(uuid, public.payment_method, integer) to authenticated;

-- ─── tempo real ──────────────────────────────────────────────────────────
--
-- O painel acompanha agenda, bloqueios e caixa ao vivo. A publicação só
-- existe no Supabase; fora dele (testes locais), o bloco não faz nada.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime
      add table public.appointments, public.time_blocks, public.finance_entries;
  end if;
end;
$$;
