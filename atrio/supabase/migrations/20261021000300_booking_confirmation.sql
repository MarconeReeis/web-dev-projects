-- ════════════════════════════════════════════════════════════════════════
-- Átrio — confirmação pelo barbeiro
--
-- Opção da barbearia (tenants.confirmation_mode):
--
--   automatica   como sempre foi: o cliente marca e está confirmado;
--   manual       o horário marcado pelo app nasce PENDENTE — já reservado,
--                para ninguém mais pegar — e a barbearia confirma ou recusa.
--
-- O pedido tem prazo (respond_by): sem resposta, é recusado sozinho
-- (private.expire_pending, a cada minuto) e o cliente é avisado — horário
-- preso e cliente no escuro é o pior dos dois mundos.
--
-- Responder: pelo painel (confirm_appointment / decline_appointment) ou pelos
-- botões do próprio e-mail (respond_by_token, chamado pela Edge Function
-- responder-agendamento com o token do pedido — de uso único).
--
-- O que a equipe marca no balcão nasce confirmado, como antes: a barbearia
-- não precisa confirmar o próprio agendamento.
-- ════════════════════════════════════════════════════════════════════════

alter table public.tenants
  add column confirmation_mode text not null default 'automatica'
    check (confirmation_mode in ('automatica', 'manual'));

alter table public.appointments
  add column respond_by       timestamptz,
  add column response_token   uuid unique,
  add column declined_reason  text check (declined_reason in ('recusado', 'sem_resposta'));

-- ─── pedido também ocupa o horário ───────────────────────────────────────

alter table public.appointments drop constraint appointments_no_overlap;
alter table public.appointments add constraint appointments_no_overlap exclude using gist (
  professional_id with =,
  tstzrange(starts_at, ends_at, '[)') with &&
) where (status in ('pendente', 'agendado', 'em_atendimento', 'concluido'));

-- busy_intervals: os horários ocupados que o app do cliente vê incluem os
-- pedidos (cópia de 20261019000300_booking.sql).
create or replace function public.busy_intervals(
  p_tenant_id  uuid,
  p_from       timestamptz,
  p_to         timestamptz
)
returns table (
  -- 'agendamento' ou 'bloqueio'. O app distribui o "qualquer profissional"
  -- pela quantidade de atendimentos do dia, e bloqueio não é atendimento.
  kind             text,
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
    select 'agendamento'::text, a.professional_id, a.starts_at, a.ends_at,
           case
             when private.is_member(a.tenant_id) or private.is_own_client(a.client_id)
             then a.id
           end
    from public.appointments a
    where a.tenant_id = p_tenant_id
      and a.status in ('pendente', 'agendado', 'em_atendimento', 'concluido')
      and a.starts_at < p_to and a.ends_at > p_from
    union all
    -- Bloqueio sem profissional vale para todos: professional_id nulo.
    select 'bloqueio'::text, b.professional_id, b.starts_at, b.ends_at, null::uuid
    from public.time_blocks b
    where b.tenant_id = p_tenant_id
      and b.starts_at < p_to and b.ends_at > p_from;
end;
$$;

-- Transições (cópia de 20261019000100_schema.sql, com o pedido).
create or replace function private.guard_appointment_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and not (
    (old.status = 'agendado'
       and new.status in ('em_atendimento', 'cancelado', 'nao_compareceu', 'concluido'))
    or (old.status = 'em_atendimento' and new.status in ('concluido', 'cancelado'))
    -- Pedido: a barbearia confirma (agendado) ou recusa; o cliente desiste
    -- (cancelado). Tudo o mais, só depois de confirmado.
    or (old.status = 'pendente' and new.status in ('agendado', 'cancelado'))
  ) then
    raise exception 'Não é possível mudar de "%" para "%".', old.status, new.status
      using hint = 'transicao_invalida';
  end if;

  -- Pagamento registrado não se desfaz por aqui: ele já virou recebimento
  -- no caixa, e o caixa é imutável.
  if old.payment_status = 'pago' and (
    new.payment_status is distinct from old.payment_status
    or new.payment_method is distinct from old.payment_method
    or new.paid_at is distinct from old.paid_at
    or new.price_cents is distinct from old.price_cents
  ) then
    raise exception 'Pagamento já registrado não pode ser alterado.'
      using hint = 'pagamento_imutavel';
  end if;

  -- O que foi congelado na marcação continua congelado.
  if new.tenant_id is distinct from old.tenant_id
     or new.service_id is distinct from old.service_id
     or new.service_name is distinct from old.service_name
     or new.duration_minutes is distinct from old.duration_minutes then
    raise exception 'Serviço e duração do agendamento não mudam depois da marcação.'
      using hint = 'campo_congelado';
  end if;

  return new;
end;
$$;

-- ─── o pedido nasce pendente ─────────────────────────────────────────────
--
-- Antes de gravar: se o cliente (não a equipe) marca numa barbearia que
-- confirma cada agendamento, o horário vira pedido, com prazo e token. O
-- prazo é 2 horas antes do horário — ou, para quem pede em cima da hora,
-- meia hora a partir de agora, sem passar do horário.

create function private.pend_if_manual()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'agendado'
     and not private.is_member(new.tenant_id)
     and exists (
       select 1 from public.tenants t
        where t.id = new.tenant_id and t.confirmation_mode = 'manual'
     )
  then
    new.status := 'pendente';
    new.respond_by := greatest(
      new.starts_at - interval '2 hours',
      least(new.starts_at, now() + interval '30 minutes')
    );
    new.response_token := gen_random_uuid();
  end if;
  return new;
end;
$$;

create trigger appointments_pend
  before insert on public.appointments
  for each row execute function private.pend_if_manual();

-- ─── responder ───────────────────────────────────────────────────────────

-- O que responder a um pedido faz, venha de onde vier.
create function private.answer_request(p_id uuid, p_confirm boolean)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.appointments;
begin
  if p_confirm then
    update public.appointments
       set status = 'agendado', respond_by = null, response_token = null
     where id = p_id
    returning * into v_row;
  else
    update public.appointments
       set status = 'cancelado', declined_reason = 'recusado',
           respond_by = null, response_token = null
     where id = p_id
    returning * into v_row;
  end if;

  -- Respondido: o aviso do pedido no sino deixa de pedir atenção.
  update public.notifications set read_at = now()
   where appointment_id = p_id and kind = 'pedido' and read_at is null;

  return v_row;
end;
$$;

create function private.lock_request(p_id uuid)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.appointments;
begin
  select * into v_row from public.appointments where id = p_id for update;
  if not found or not private.is_member(v_row.tenant_id) then
    raise exception 'Agendamento não encontrado.' using hint = 'nao_encontrado';
  end if;
  if v_row.status <> 'pendente' then
    raise exception 'Este pedido já foi respondido.' using hint = 'ja_respondido';
  end if;
  return v_row;
end;
$$;

create function public.confirm_appointment(p_id uuid)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_request(p_id);
  return private.answer_request(p_id, true);
end;
$$;

create function public.decline_appointment(p_id uuid)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_request(p_id);
  return private.answer_request(p_id, false);
end;
$$;

-- Pelos botões do e-mail. 'ver' só mostra o pedido (a página pede um
-- segundo toque: leitores de e-mail abrem links sozinhos, e um GET não pode
-- confirmar nada). O token vale uma vez: respondido, some.
create function public.respond_by_token(p_token uuid, p_action text)
returns table (
  result             text,
  tenant_name        text,
  client_name        text,
  service_name       text,
  professional_name  text,
  starts_at          timestamptz,
  time_zone          text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.appointments;
begin
  if p_action not in ('ver', 'confirmar', 'recusar') then
    raise exception 'Ação inválida.' using hint = 'acao_invalida';
  end if;

  select * into v_row from public.appointments a
   where a.response_token = p_token and a.status = 'pendente'
   for update;
  if not found then
    return query select 'invalido'::text, null::text, null::text, null::text, null::text,
                        null::timestamptz, null::text;
    return;
  end if;

  if p_action <> 'ver' then
    v_row := private.answer_request(v_row.id, p_action = 'confirmar');
  end if;

  return query
    select case p_action when 'ver' then 'pendente'
                         when 'confirmar' then 'confirmado'
                         else 'recusado' end,
           t.name, v_row.client_name, v_row.service_name, p.name, v_row.starts_at, t.time_zone
      from public.tenants t
      join public.professionals p on p.id = v_row.professional_id
     where t.id = v_row.tenant_id;
end;
$$;

-- Sem resposta no prazo: recusado sozinho. Chamado a cada minuto.
create function private.expire_pending()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.appointments
     set status = 'cancelado', declined_reason = 'sem_resposta',
         respond_by = null, response_token = null
   where status = 'pendente' and respond_by < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function private.dispatch_emails()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url     text;
  v_secret  text;
begin
  perform private.expire_pending();
  perform private.enqueue_reminders();

  if not exists (
    select 1 from public.email_outbox
     where status = 'pendente'
        or (status = 'enviando' and claimed_at < now() - interval '10 minutes')
  ) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'emails_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'emails_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-atrio-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;

-- O cliente desiste do pedido também (cópia de 20261019000300_booking.sql).
create or replace function public.cancel_appointment(p_id uuid)
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
    if v_row.status not in ('agendado', 'pendente') then
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

-- Excluir a conta cancela pedidos também (cópia de 20261019000800).
create or replace function public.delete_my_account()
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
     and status in ('agendado', 'pendente')
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

-- ─── e-mails ─────────────────────────────────────────────────────────────
--
--   evento                         cliente             barbearia
--   pediu (barbearia manual)       "pedido_recebido"   "pedido" (com botões)
--   barbearia confirmou            "agendado"          —
--   barbearia recusou / sem prazo  "recusado"          —
--   (o resto, como em 20261020000200_appointment_emails.sql)

alter table public.email_outbox drop constraint email_outbox_kind_check;
alter table public.email_outbox add constraint email_outbox_kind_check check (kind in (
  'agendado', 'novo_horario', 'cancelado', 'reagendado', 'lembrete',
  'pedido', 'pedido_recebido', 'recusado'
));

create or replace function private.enqueue_appointment_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff   boolean := private.is_member(new.tenant_id);
  v_client  text := private.client_email(new.client_id);
  v_shop    text := private.tenant_email(new.tenant_id);
begin
  if tg_op = 'INSERT' then
    if new.status = 'agendado' then
      perform private.enqueue_email(new, 'agendado', 'cliente', v_client);
      if not v_staff then
        perform private.enqueue_email(new, 'novo_horario', 'barbearia', v_shop);
      end if;
    elsif new.status = 'pendente' then
      perform private.enqueue_email(new, 'pedido_recebido', 'cliente', v_client);
      perform private.enqueue_email(new, 'pedido', 'barbearia', v_shop);
    end if;
    return new;
  end if;

  if old.status = 'pendente' and new.status = 'agendado' then
    perform private.enqueue_email(new, 'agendado', 'cliente', v_client);
  elsif new.status = 'cancelado' and old.status is distinct from 'cancelado' then
    if new.declined_reason is not null then
      perform private.enqueue_email(new, 'recusado', 'cliente', v_client);
    elsif v_staff then
      perform private.enqueue_email(new, 'cancelado', 'cliente', v_client);
    else
      perform private.enqueue_email(new, 'cancelado', 'barbearia', v_shop);
    end if;
  elsif new.starts_at <> old.starts_at and new.status = 'agendado' then
    perform private.enqueue_email(new, 'reagendado', 'cliente', v_client, old.starts_at);
    if not v_staff then
      perform private.enqueue_email(new, 'reagendado', 'barbearia', v_shop, old.starts_at);
    end if;
  end if;
  return new;
end;
$$;

-- A fila devolve também o prazo, o token (só no "pedido", que leva os
-- botões) e o motivo da recusa. Tipo de retorno novo: a função é recriada.
drop function public.claim_emails(integer);

create function public.claim_emails(p_limit integer default 20)
returns table (
  id                  uuid,
  kind                text,
  recipient           text,
  to_email            text,
  reply_to            text,
  appointment_id      uuid,
  starts_at           timestamptz,
  ends_at             timestamptz,
  previous_starts_at  timestamptz,
  service_name        text,
  price_cents         integer,
  professional_name   text,
  client_name         text,
  client_phone        text,
  notes               text,
  tenant_name         text,
  tenant_slug         text,
  tenant_phone        text,
  tenant_address      jsonb,
  time_zone           text,
  respond_by          timestamptz,
  response_token      uuid,
  declined_reason     text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Perdeu o sentido antes de sair: horário mudou, foi cancelado, ou o
  -- pedido já foi respondido.
  update public.email_outbox o
     set status = 'descartado'
    from public.appointments a
   where a.id = o.appointment_id
     and o.status = 'pendente'
     and (
       (o.kind in ('agendado', 'novo_horario', 'reagendado', 'lembrete')
         and (a.status <> 'agendado' or a.starts_at <> o.starts_at))
       or (o.kind in ('pedido', 'pedido_recebido') and a.status <> 'pendente')
     );

  return query
  with picked as (
    select o.id
      from public.email_outbox o
     where o.status = 'pendente'
        or (o.status = 'enviando' and o.claimed_at < now() - interval '10 minutes')
     order by o.created_at
     limit greatest(p_limit, 1)
     for update skip locked
  ),
  claimed as (
    update public.email_outbox o
       set status = 'enviando', claimed_at = now(), attempts = o.attempts + 1
      from picked
     where o.id = picked.id
    returning o.*
  )
  select c.id, c.kind, c.recipient, c.to_email,
         case when c.recipient = 'cliente'
              then private.tenant_email(c.tenant_id)
              else private.client_email(a.client_id) end,
         a.id, c.starts_at, c.starts_at + make_interval(mins => a.duration_minutes),
         c.previous_starts_at, a.service_name, a.price_cents, p.name,
         a.client_name, a.client_phone, a.notes,
         t.name, t.slug, t.phone, t.address, t.time_zone,
         a.respond_by,
         case when c.kind = 'pedido' then a.response_token end,
         a.declined_reason
    from claimed c
    join public.appointments a on a.id = c.appointment_id
    join public.tenants t on t.id = c.tenant_id
    join public.professionals p on p.id = a.professional_id;
end;
$$;

-- ─── avisos do sino ──────────────────────────────────────────────────────

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'novo_horario', 'cancelado', 'reagendado', 'pedido', 'sem_resposta'
));

create or replace function private.notify_shop()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind      text;
  v_previous  timestamptz;
begin
  -- Da própria ação a barbearia já sabe.
  if private.is_member(new.tenant_id) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'agendado' then
      v_kind := 'novo_horario';
    elsif new.status = 'pendente' then
      v_kind := 'pedido';
    end if;
  elsif new.status = 'cancelado' and old.status is distinct from 'cancelado' then
    -- Recusa pelos botões do e-mail: foi a barbearia que respondeu.
    if new.declined_reason = 'sem_resposta' then
      v_kind := 'sem_resposta';
    elsif new.declined_reason is null then
      v_kind := 'cancelado';
    end if;
  elsif new.starts_at <> old.starts_at and new.status = 'agendado' then
    v_kind := 'reagendado';
    v_previous := old.starts_at;
  end if;

  if v_kind is not null then
    insert into public.notifications
      (tenant_id, appointment_id, kind, client_name, starts_at, previous_starts_at)
    values
      (new.tenant_id, new.id, v_kind, new.client_name, new.starts_at, v_previous);
  end if;
  return new;
end;
$$;

-- ─── configurações: a opção de confirmar ─────────────────────────────────

drop function public.save_tenant_settings(uuid, text, text, jsonb, jsonb, jsonb, text, text, text);

create function public.save_tenant_settings(
  p_tenant_id           uuid,
  p_name                text,
  p_phone               text,
  p_address             jsonb,
  p_branding            jsonb,
  p_highlight           jsonb,
  p_admin_name          text,
  p_admin_email         text,
  p_notification_email  text default null,
  p_confirmation_mode   text default null
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_owner(p_tenant_id) then
    raise exception 'Só o dono da barbearia altera as configurações.' using hint = 'sem_permissao';
  end if;

  update public.tenants
     set name = trim(p_name),
         phone = nullif(trim(p_phone), ''),
         address = p_address,
         branding = coalesce(p_branding, '{}'::jsonb),
         highlight = p_highlight,
         confirmation_mode = coalesce(p_confirmation_mode, confirmation_mode)
   where id = p_tenant_id;

  update public.tenant_accounts
     set admin_name = trim(p_admin_name),
         admin_email = trim(p_admin_email),
         notification_email = nullif(lower(trim(p_notification_email)), '')
   where tenant_id = p_tenant_id;
end;
$$;

-- ─── permissões ──────────────────────────────────────────────────────────

revoke execute on function public.confirm_appointment(uuid) from public, anon;
revoke execute on function public.decline_appointment(uuid) from public, anon;
revoke execute on function public.respond_by_token(uuid, text) from public, anon, authenticated;
revoke execute on function public.claim_emails(integer) from public, anon, authenticated;
revoke execute on function public.save_tenant_settings(uuid, text, text, jsonb, jsonb, jsonb, text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.confirm_appointment(uuid) to authenticated;
grant execute on function public.decline_appointment(uuid) to authenticated;
grant execute on function public.respond_by_token(uuid, text) to service_role;
grant execute on function public.claim_emails(integer) to service_role;
grant execute on function public.save_tenant_settings(uuid, text, text, jsonb, jsonb, jsonb, text, text, text, text)
  to authenticated;
