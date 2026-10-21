-- ════════════════════════════════════════════════════════════════════════
-- Átrio — avisos do painel (o sino)
--
-- O que acontece na agenda sem a barbearia ter feito: cliente marcou,
-- cancelou ou remarcou pelo app. As mesmas regras dos e-mails à barbearia
-- (20261020000200_appointment_emails.sql) — mas o aviso existe mesmo sem
-- e-mail configurado, e fica no painel até alguém ler.
--
-- Lido é da barbearia, não de cada pessoa: o tablet do balcão é de todos, e
-- o aviso que um atendente já viu não precisa piscar para o outro.
-- ════════════════════════════════════════════════════════════════════════

create table public.notifications (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  appointment_id      uuid not null references public.appointments (id) on delete cascade,
  kind                text not null check (kind in ('novo_horario', 'cancelado', 'reagendado')),
  -- Cópia do que o aviso mostra: a lista abre sem uma leitura por linha, e o
  -- texto não muda se o atendimento mudar depois.
  client_name         text not null,
  starts_at           timestamptz not null,
  previous_starts_at  timestamptz,
  read_at             timestamptz,
  created_at          timestamptz not null default now()
);

create index notifications_tenant_recent on public.notifications (tenant_id, created_at desc);

alter table public.notifications enable row level security;

-- A equipe lê os avisos da própria barbearia e marca como lido — só isso.
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy "equipe lê os avisos" on public.notifications
  for select to authenticated using (private.is_member(tenant_id));

create policy "equipe marca como lido" on public.notifications
  for update to authenticated
  using (private.is_member(tenant_id)) with check (private.is_member(tenant_id));

-- ─── o gatilho ───────────────────────────────────────────────────────────

create function private.notify_shop()
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
    end if;
  elsif new.status = 'cancelado' and old.status is distinct from 'cancelado' then
    v_kind := 'cancelado';
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

create trigger appointments_notifications
  after insert or update of status, starts_at on public.appointments
  for each row execute function private.notify_shop();

-- ─── tempo real e limpeza ────────────────────────────────────────────────
--
-- O sino acende sem recarregar. Avisos com mais de 60 dias saem uma vez por
-- dia: o histórico de verdade é a agenda.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule(
      'atrio-limpar-avisos',
      '15 3 * * *',
      $job$delete from public.notifications where created_at < now() - interval '60 days'$job$
    );
  end if;
end;
$$;
