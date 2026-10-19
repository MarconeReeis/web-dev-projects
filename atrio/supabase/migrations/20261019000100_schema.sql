-- ════════════════════════════════════════════════════════════════════════
-- Átrio — esquema do banco
--
-- Espelha os modelos de projects/shared/data/src/lib/models. Onde o banco
-- diverge do modelo (horário em linhas, conta separada do cadastro), o
-- comentário da tabela diz por quê; a tradução fica no repositório Supabase.
--
-- Convenções:
--   - dinheiro em centavos, integer — nunca numeric de reais nem float;
--   - instantes em timestamptz; horário de expediente em `time` local da
--     barbearia, convertido com tenants.time_zone;
--   - todo dado de barbearia carrega tenant_id, e as relações entre tabelas
--     de barbearia usam chave composta (tenant_id, id): um agendamento não
--     consegue apontar para o profissional de OUTRA barbearia nem por engano
--     de código — o banco recusa.
-- ════════════════════════════════════════════════════════════════════════

-- Necessária para a regra de horário duplo: o índice GiST precisa comparar
-- uuid com "=" ao lado dos intervalos de tempo.
create extension if not exists btree_gist with schema extensions;

-- Funções internas (gatilhos, checagens). Fora de `public` para a API do
-- Supabase não expô-las como endpoint.
create schema if not exists private;

-- ─── tipos ───────────────────────────────────────────────────────────────

create type public.appointment_status as enum (
  'agendado', 'em_atendimento', 'concluido', 'cancelado', 'nao_compareceu'
);
create type public.payment_status as enum ('pendente', 'pago');
create type public.payment_method as enum ('pix', 'dinheiro', 'cartao');
create type public.entry_kind as enum ('recebimento', 'despesa');
create type public.expense_category as enum (
  'produtos', 'aluguel', 'energia', 'agua', 'internet', 'manutencao', 'marketing', 'outros'
);
create type public.subscription_status as enum ('trial', 'ativa', 'inadimplente', 'cancelada');
create type public.member_role as enum ('dono', 'atendente');
create type public.schedule_kind as enum ('expediente', 'intervalo');

-- ─── utilitário: updated_at ──────────────────────────────────────────────

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── barbearia ───────────────────────────────────────────────────────────

-- O que o app do cliente pode ler sem login: vitrine, endereço, marca.
-- Dados da assinatura e do responsável ficam em tenant_accounts, que só a
-- equipe lê.
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique
              check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (length(trim(name)) > 0),
  phone       text,
  -- Address, Branding e Highlight do modelo: objetos lidos e gravados
  -- inteiros, sem consulta por dentro — jsonb basta.
  address     jsonb,
  branding    jsonb not null default '{}'::jsonb,
  highlight   jsonb,
  -- O horário de expediente é local; é por este fuso que o servidor sabe se
  -- 14:00 UTC cai dentro do expediente de uma barbearia em São Paulo.
  time_zone   text not null default 'America/Sao_Paulo',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.tenant_accounts (
  tenant_id     uuid primary key references public.tenants (id) on delete cascade,
  subscription  public.subscription_status not null default 'trial',
  admin_name    text not null,
  admin_email   text not null,
  updated_at    timestamptz not null default now()
);

-- Quem trabalha na barbearia. A conta é do Supabase Auth; o papel é daqui.
create table public.tenant_members (
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.member_role not null default 'atendente',
  created_at  timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index tenant_members_user_idx on public.tenant_members (user_id);

-- ─── conta do cliente final ──────────────────────────────────────────────

-- ClientAccount do modelo. O e-mail mora em auth.users; aqui, o que a
-- barbearia precisa para falar com a pessoa.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) >= 2),
  phone       text not null check (length(regexp_replace(phone, '\D', '', 'g')) >= 10),
  photo_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── equipe e catálogo ───────────────────────────────────────────────────

create table public.professionals (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  photo_url   text,
  phone       text,
  bio         text,
  about       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.services (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  name              text not null check (length(trim(name)) > 0),
  description       text,
  duration_minutes  integer not null check (duration_minutes between 5 and 600),
  price_cents       integer not null check (price_cents >= 0),
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, id)
);

-- Professional.serviceIds. Um lado só da relação, como no modelo: quem faz
-- o quê é decidido aqui e em nenhum outro lugar.
create table public.professional_services (
  tenant_id        uuid not null,
  professional_id  uuid not null,
  service_id       uuid not null,
  primary key (professional_id, service_id),
  foreign key (tenant_id, professional_id)
    references public.professionals (tenant_id, id) on delete cascade,
  foreign key (tenant_id, service_id)
    references public.services (tenant_id, id) on delete cascade
);

create index professional_services_service_idx on public.professional_services (service_id);

-- WeeklySchedule do modelo, em linhas. Uma linha por janela de expediente
-- ou intervalo; dia sem linha de expediente é dia de folga.
--
-- Em linhas, e não num jsonb, para o SERVIDOR conseguir checar que um
-- agendamento cai dentro do expediente — com jsonb, essa conta ficaria só
-- no app, e qualquer um que chamasse a API direto marcaria às três da
-- manhã.
create table public.professional_schedule (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  professional_id  uuid not null,
  weekday          smallint not null check (weekday between 0 and 6),  -- 0 = domingo
  kind             public.schedule_kind not null,
  starts           time not null,
  ends             time not null,  -- aceita 24:00, fim do dia
  check (ends > starts),
  foreign key (tenant_id, professional_id)
    references public.professionals (tenant_id, id) on delete cascade
);

create index professional_schedule_lookup_idx
  on public.professional_schedule (professional_id, weekday);

-- ─── clientes da barbearia ───────────────────────────────────────────────

-- Client do modelo: o cadastro da pessoa DENTRO de uma barbearia. Existe sem
-- conta (o atendente cadastra no balcão); user_id liga à conta quando ela
-- marca pelo app.
create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  phone       text,
  user_id     uuid references auth.users (id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id),
  -- Uma ficha por conta em cada barbearia.
  unique (tenant_id, user_id)
);

-- ─── agenda ──────────────────────────────────────────────────────────────

create table public.appointments (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  professional_id   uuid not null,
  service_id        uuid not null,

  -- Congelados na marcação: o catálogo pode mudar depois, e o atendimento
  -- guarda o que valia naquele dia.
  service_name      text not null,
  duration_minutes  integer not null check (duration_minutes > 0),
  price_cents       integer not null check (price_cents >= 0),

  -- Cliente por cópia (AppointmentClient): a agenda mostra nome e telefone
  -- sem uma leitura extra por linha, e o histórico não muda se a ficha mudar.
  client_id         uuid,
  client_name       text not null check (length(trim(client_name)) > 0),
  client_phone      text,

  starts_at         timestamptz not null,
  -- Gravado, não derivado: a regra de horário duplo compara intervalos
  -- gravados. Derivar da duração atual do serviço reabriria buracos em
  -- agendas fechadas quando a barbearia mudasse a duração.
  ends_at           timestamptz not null,

  status            public.appointment_status not null default 'agendado',
  payment_status    public.payment_status not null default 'pendente',
  payment_method    public.payment_method,
  -- Data do RECEBIMENTO, não do atendimento: é por ela que o caixa soma.
  paid_at           timestamptz,

  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (tenant_id, id),
  foreign key (tenant_id, professional_id) references public.professionals (tenant_id, id),
  foreign key (tenant_id, service_id) references public.services (tenant_id, id),
  foreign key (tenant_id, client_id)
    references public.clients (tenant_id, id) on delete set null (client_id),

  check (extract(epoch from (ends_at - starts_at)) = duration_minutes * 60),
  check ((payment_status = 'pago') = (paid_at is not null and payment_method is not null)),

  -- ┌───────────────────────────────────────────────────────────────────┐
  -- │ A regra mais importante do sistema: um profissional não tem dois  │
  -- │ atendimentos ao mesmo tempo.                                      │
  -- │                                                                   │
  -- │ Vale para QUALQUER caminho de escrita — app, painel, função,      │
  -- │ script — e para duas gravações no mesmo milissegundo: o banco     │
  -- │ serializa a checagem, e a segunda falha. Nenhuma validação no app │
  -- │ consegue isso.                                                    │
  -- │                                                                   │
  -- │ Intervalo [início, fim): o atendimento que termina 10:00 convive  │
  -- │ com o que começa 10:00. Os status são os BLOCKING_STATUSES do     │
  -- │ modelo — cancelado e não compareceu liberam o horário.            │
  -- └───────────────────────────────────────────────────────────────────┘
  constraint appointments_no_overlap exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('agendado', 'em_atendimento', 'concluido'))
);

create index appointments_tenant_starts_idx on public.appointments (tenant_id, starts_at);
create index appointments_client_idx on public.appointments (client_id);

-- Bloqueios pontuais (folga, feriado). professional_id nulo = barbearia toda.
-- O motivo é privado: o app do cliente só enxerga o intervalo ocupado (ver
-- public.busy_intervals).
create table public.time_blocks (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  professional_id  uuid,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  reason           text,
  created_at       timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (tenant_id, professional_id)
    references public.professionals (tenant_id, id) on delete cascade
);

create index time_blocks_tenant_starts_idx on public.time_blocks (tenant_id, starts_at);

-- ─── financeiro ──────────────────────────────────────────────────────────

-- Movimentações. Recebimento nasce do pagamento de um atendimento e é
-- imutável; despesa é lançada à mão e pode ser corrigida.
create table public.finance_entries (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  kind             public.entry_kind not null,
  description      text not null check (length(trim(description)) > 0),
  amount_cents     integer not null check (amount_cents > 0),
  occurred_at      timestamptz not null,
  method           public.payment_method,
  -- Único: registrar o mesmo pagamento duas vezes não duplica o recebimento.
  appointment_id   uuid unique,
  professional_id  uuid,
  category         public.expense_category,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (tenant_id, appointment_id) references public.appointments (tenant_id, id),
  foreign key (tenant_id, professional_id) references public.professionals (tenant_id, id),
  check (
    (kind = 'recebimento' and method is not null and appointment_id is not null and category is null)
    or
    (kind = 'despesa' and category is not null and appointment_id is null)
  )
);

create index finance_entries_tenant_occurred_idx on public.finance_entries (tenant_id, occurred_at);

-- ─── regras que um CHECK não expressa ────────────────────────────────────

-- Transições de status, as mesmas de nextStatusIsAllowed no app. Estado
-- final não volta: um atendimento concluído reaberto bagunçaria o caixa.
create function private.guard_appointment_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and not (
    (old.status = 'agendado'
       and new.status in ('em_atendimento', 'cancelado', 'nao_compareceu', 'concluido'))
    or (old.status = 'em_atendimento' and new.status in ('concluido', 'cancelado'))
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

create trigger appointments_guard
  before update on public.appointments
  for each row execute function private.guard_appointment_change();

-- Recebimento é imutável: corrigir caixa é lançar outra movimentação, não
-- reescrever a antiga.
create function private.guard_receipt()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.kind = 'recebimento' then
    raise exception 'Recebimentos não podem ser alterados nem removidos.'
      using hint = 'recebimento_imutavel';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger finance_entries_guard
  before update or delete on public.finance_entries
  for each row execute function private.guard_receipt();

-- updated_at em todas as tabelas que têm.
create trigger tenants_touch before update on public.tenants
  for each row execute function private.touch_updated_at();
create trigger tenant_accounts_touch before update on public.tenant_accounts
  for each row execute function private.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger professionals_touch before update on public.professionals
  for each row execute function private.touch_updated_at();
create trigger services_touch before update on public.services
  for each row execute function private.touch_updated_at();
create trigger clients_touch before update on public.clients
  for each row execute function private.touch_updated_at();
create trigger appointments_touch before update on public.appointments
  for each row execute function private.touch_updated_at();
create trigger finance_entries_touch before update on public.finance_entries
  for each row execute function private.touch_updated_at();

-- ─── conta nova → perfil ─────────────────────────────────────────────────

-- O cadastro do app envia nome e telefone como metadados do usuário; o
-- perfil nasce junto, na mesma transação. Contas da equipe, criadas pelo
-- painel do Supabase sem esses dados, não ganham perfil de cliente.
create function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name  text := trim(coalesce(new.raw_user_meta_data ->> 'name', ''));
  v_phone text := trim(coalesce(new.raw_user_meta_data ->> 'phone', ''));
begin
  if length(v_name) >= 2 and length(regexp_replace(v_phone, '\D', '', 'g')) >= 10 then
    insert into public.profiles (id, name, phone) values (new.id, v_name, v_phone);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.create_profile_for_new_user();
