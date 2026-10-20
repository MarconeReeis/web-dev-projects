-- ════════════════════════════════════════════════════════════════════════
-- Átrio — e-mails do agendamento
--
-- Quem recebe o quê:
--
--   evento                     cliente            barbearia
--   marcou pelo app            "agendado"         "novo_horario"
--   marcou no balcão           "agendado"¹        —
--   cancelou (cliente)         —                  "cancelado"
--   cancelou (equipe)          "cancelado"¹       —
--   remarcou (cliente)         "reagendado"       "reagendado"
--   remarcou (equipe)          "reagendado"¹      —
--   véspera                    "lembrete"¹        —
--
--   ¹ só se o cliente tem conta (é dela o e-mail). Cliente do balcão sem
--     conta não tem e-mail para receber.
--
-- A barbearia é avisada só do que ela não fez — da própria ação ela já
-- sabe. O e-mail da barbearia é o do responsável pela conta
-- (tenant_accounts.admin_email).
--
-- Como funciona: um gatilho em `appointments` grava na FILA (email_outbox)
-- e não envia nada. Uma Edge Function (supabase/functions/enviar-emails)
-- pega a fila, monta o e-mail e envia pelo Resend; o pg_cron a chama a cada
-- minuto. Fila em vez de envio direto porque o envio depende de rede: um
-- Resend fora do ar não pode desfazer o agendamento, e o que falhou é
-- tentado de novo.
-- ════════════════════════════════════════════════════════════════════════

create table public.email_outbox (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  appointment_id      uuid not null references public.appointments (id) on delete cascade,
  kind                text not null
                        check (kind in ('agendado', 'novo_horario', 'cancelado', 'reagendado', 'lembrete')),
  recipient           text not null check (recipient in ('cliente', 'barbearia')),
  to_email            text not null,
  -- O horário a que o aviso se refere, e o anterior numa remarcação. Também
  -- separa avisos do mesmo tipo: remarcar duas vezes gera dois avisos.
  starts_at           timestamptz not null,
  previous_starts_at  timestamptz,
  status              text not null default 'pendente'
                        check (status in ('pendente', 'enviando', 'enviado', 'falhou', 'descartado')),
  attempts            integer not null default 0,
  last_error          text,
  created_at          timestamptz not null default now(),
  claimed_at          timestamptz,
  sent_at             timestamptz,
  unique (appointment_id, kind, recipient, starts_at)
);

create index email_outbox_pending on public.email_outbox (created_at)
  where status in ('pendente', 'enviando');

-- RLS ligada e nenhuma política: só as funções abaixo tocam a fila.
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from anon, authenticated;

-- ─── quem é quem ─────────────────────────────────────────────────────────

create function private.client_email(p_client_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email
    from public.clients c
    join auth.users u on u.id = c.user_id
   where c.id = p_client_id
$$;

create function private.tenant_email(p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select admin_email from public.tenant_accounts where tenant_id = p_tenant_id
$$;

create function private.enqueue_email(
  p_appointment  public.appointments,
  p_kind         text,
  p_recipient    text,
  p_to           text,
  p_previous     timestamptz default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.email_outbox
    (tenant_id, appointment_id, kind, recipient, to_email, starts_at, previous_starts_at)
  select (p_appointment).tenant_id, (p_appointment).id, p_kind, p_recipient, p_to,
         (p_appointment).starts_at, p_previous
   where nullif(trim(p_to), '') is not null
  on conflict (appointment_id, kind, recipient, starts_at) do nothing
$$;

-- ─── o gatilho ───────────────────────────────────────────────────────────
--
-- Quem fez a ação vem da sessão (auth.uid()): da equipe da barbearia, ou
-- não. "Não" inclui o cliente e o próprio banco (excluir conta cancela os
-- horários futuros — e a barbearia precisa saber).

create function private.enqueue_appointment_emails()
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
    end if;
    return new;
  end if;

  if new.status = 'cancelado' and old.status is distinct from 'cancelado' then
    if v_staff then
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

create trigger appointments_emails
  after insert or update of status, starts_at on public.appointments
  for each row execute function private.enqueue_appointment_emails();

-- ─── lembrete da véspera ─────────────────────────────────────────────────
--
-- Horários das próximas 24 horas, marcados com mais de um dia de
-- antecedência — quem marcou hoje para amanhã acabou de receber a
-- confirmação. Rodado a cada minuto; a chave única impede repetir.

create function private.enqueue_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.email_outbox
    (tenant_id, appointment_id, kind, recipient, to_email, starts_at)
  select a.tenant_id, a.id, 'lembrete', 'cliente', private.client_email(a.client_id), a.starts_at
    from public.appointments a
   where a.status = 'agendado'
     and a.starts_at > now()
     and a.starts_at <= now() + interval '24 hours'
     and a.created_at <= a.starts_at - interval '24 hours'
     and private.client_email(a.client_id) is not null
  on conflict (appointment_id, kind, recipient, starts_at) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ─── para quem envia (a Edge Function, com a chave de serviço) ──────────
--
-- claim_emails reserva um lote e devolve tudo o que o e-mail precisa. Duas
-- chamadas ao mesmo tempo não pegam o mesmo aviso (skip locked); um lote
-- reservado há mais de 10 minutos sem resposta volta para a fila.
--
-- Aviso que perdeu o sentido antes de sair — horário cancelado ou remarcado
-- de novo — é descartado aqui, em vez de enviado.

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
  time_zone           text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Perdeu o sentido: o horário mudou ou foi cancelado depois do aviso.
  update public.email_outbox o
     set status = 'descartado'
    from public.appointments a
   where a.id = o.appointment_id
     and o.status = 'pendente'
     and o.kind in ('agendado', 'novo_horario', 'reagendado', 'lembrete')
     and (a.status <> 'agendado' or a.starts_at <> o.starts_at);

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
         -- Responder vai para o outro lado: o cliente fala com a barbearia,
         -- a barbearia com o cliente.
         case when c.recipient = 'cliente'
              then private.tenant_email(c.tenant_id)
              else private.client_email(a.client_id) end,
         a.id, c.starts_at, c.starts_at + make_interval(mins => a.duration_minutes),
         c.previous_starts_at, a.service_name, a.price_cents, p.name,
         a.client_name, a.client_phone, a.notes,
         t.name, t.slug, t.phone, t.address, t.time_zone
    from claimed c
    join public.appointments a on a.id = c.appointment_id
    join public.tenants t on t.id = c.tenant_id
    join public.professionals p on p.id = a.professional_id;
end;
$$;

create function public.finish_email(p_id uuid, p_ok boolean, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.email_outbox
     set status = case
                    when p_ok then 'enviado'
                    when attempts >= 5 then 'falhou'
                    else 'pendente'
                  end,
         sent_at = case when p_ok then now() end,
         last_error = case when p_ok then null else left(p_error, 500) end
   where id = p_id and status = 'enviando'
$$;

revoke execute on function public.claim_emails(integer) from public, anon, authenticated;
revoke execute on function public.finish_email(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_emails(integer) to service_role;
grant execute on function public.finish_email(uuid, boolean, text) to service_role;
grant select, insert, update on public.email_outbox to service_role;
