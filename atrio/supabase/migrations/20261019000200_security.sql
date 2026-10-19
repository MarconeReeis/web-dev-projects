-- ════════════════════════════════════════════════════════════════════════
-- Átrio — quem enxerga e quem escreve o quê
--
-- Row Level Security em todas as tabelas. Três tipos de visitante:
--
--   anon           o app do cliente antes do login: lê a vitrine (barbearia,
--                  profissionais ativos, serviços ativos, expediente) e nada
--                  mais;
--   authenticated  cliente com conta: o mesmo, mais o próprio perfil e os
--                  próprios agendamentos;
--   equipe         authenticated que está em tenant_members: tudo da SUA
--                  barbearia, nada de outra.
--
-- Escrita de agendamento pelo cliente não passa por tabela: só pelas funções
-- de 20261019000300_booking.sql, que checam expediente, bloqueios e a regra
-- das 2h. Sem política de INSERT em appointments, uma chamada direta à API
-- para gravar um agendamento é recusada.
-- ════════════════════════════════════════════════════════════════════════

-- ─── auxiliares ──────────────────────────────────────────────────────────

-- SECURITY DEFINER para ler tenant_members sem cair na RLS da própria
-- tabela (a política dela chama esta função — sem isso, recursão).
create function private.is_member(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant and m.user_id = auth.uid()
  );
$$;

create function private.is_owner(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant and m.user_id = auth.uid() and m.role = 'dono'
  );
$$;

-- O agendamento é do cliente logado? Pela ficha ligada à conta.
create function private.is_own_client(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clients c
    where c.id = p_client and c.user_id = auth.uid()
  );
$$;

grant usage on schema private to anon, authenticated;
grant execute on function private.is_member(uuid) to anon, authenticated;
grant execute on function private.is_owner(uuid) to anon, authenticated;
grant execute on function private.is_own_client(uuid) to anon, authenticated;

-- ─── permissões de tabela ────────────────────────────────────────────────
--
-- O Supabase concede tudo a anon e authenticated por padrão e deixa a RLS
-- filtrar. Aqui o padrão é revogado e reconcedido por tabela: um esquecimento
-- de política passa a negar acesso, em vez de abrir.

revoke all on all tables in schema public from anon, authenticated;

grant select on public.tenants, public.professionals, public.services,
  public.professional_services, public.professional_schedule
  to anon, authenticated;

grant update on public.tenants to authenticated;
-- Assinatura não: quem muda é o faturamento (service_role), não o dono.
grant select on public.tenant_accounts to authenticated;
grant update (admin_name, admin_email) on public.tenant_accounts to authenticated;
grant select on public.tenant_members to authenticated;
grant select, update on public.profiles to authenticated;
grant insert, update, delete on public.professionals, public.services,
  public.professional_services, public.professional_schedule to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, update on public.appointments to authenticated;
grant select, insert, update, delete on public.time_blocks to authenticated;
grant select, insert, update, delete on public.finance_entries to authenticated;

alter table public.tenants                enable row level security;
alter table public.tenant_accounts        enable row level security;
alter table public.tenant_members         enable row level security;
alter table public.profiles               enable row level security;
alter table public.professionals          enable row level security;
alter table public.services               enable row level security;
alter table public.professional_services  enable row level security;
alter table public.professional_schedule  enable row level security;
alter table public.clients                enable row level security;
alter table public.appointments           enable row level security;
alter table public.time_blocks            enable row level security;
alter table public.finance_entries        enable row level security;

-- ─── barbearia ───────────────────────────────────────────────────────────

create policy "vitrine é pública" on public.tenants
  for select to anon, authenticated using (true);

create policy "dono edita a barbearia" on public.tenants
  for update to authenticated
  using (private.is_owner(id)) with check (private.is_owner(id));

create policy "equipe lê a conta" on public.tenant_accounts
  for select to authenticated using (private.is_member(tenant_id));

create policy "dono edita o contato" on public.tenant_accounts
  for update to authenticated
  using (private.is_owner(tenant_id)) with check (private.is_owner(tenant_id));

create policy "equipe vê a equipe" on public.tenant_members
  for select to authenticated
  using (user_id = auth.uid() or private.is_member(tenant_id));

-- ─── perfil ──────────────────────────────────────────────────────────────

create policy "cada um lê o seu perfil" on public.profiles
  for select to authenticated using (id = auth.uid());

create policy "cada um edita o seu perfil" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ─── equipe e catálogo ───────────────────────────────────────────────────
--
-- Inativos ficam visíveis só para a equipe: o painel lista quem saiu, o
-- app do cliente não.

create policy "vitrine: profissionais ativos" on public.professionals
  for select to anon, authenticated
  using (active or private.is_member(tenant_id));

create policy "equipe cuida dos profissionais" on public.professionals
  for all to authenticated
  using (private.is_member(tenant_id)) with check (private.is_member(tenant_id));

create policy "vitrine: serviços ativos" on public.services
  for select to anon, authenticated
  using (active or private.is_member(tenant_id));

create policy "equipe cuida dos serviços" on public.services
  for all to authenticated
  using (private.is_member(tenant_id)) with check (private.is_member(tenant_id));

create policy "vitrine: quem faz o quê" on public.professional_services
  for select to anon, authenticated using (true);

create policy "equipe define quem faz o quê" on public.professional_services
  for all to authenticated
  using (private.is_member(tenant_id)) with check (private.is_member(tenant_id));

-- O expediente é público porque o app calcula os horários livres com ele.
create policy "vitrine: expediente" on public.professional_schedule
  for select to anon, authenticated using (true);

create policy "equipe define o expediente" on public.professional_schedule
  for all to authenticated
  using (private.is_member(tenant_id)) with check (private.is_member(tenant_id));

-- ─── clientes ────────────────────────────────────────────────────────────

create policy "equipe cuida das fichas" on public.clients
  for all to authenticated
  using (private.is_member(tenant_id)) with check (private.is_member(tenant_id));

create policy "cliente lê a própria ficha" on public.clients
  for select to authenticated using (user_id = auth.uid());

-- ─── agenda ──────────────────────────────────────────────────────────────

create policy "equipe lê a agenda" on public.appointments
  for select to authenticated using (private.is_member(tenant_id));

-- "Meus horários": pela ficha ligada à conta — nunca pelo telefone. Telefone
-- digitado não prova nada; com ele, qualquer um veria os horários de outro.
create policy "cliente lê os próprios horários" on public.appointments
  for select to authenticated using (private.is_own_client(client_id));

-- A equipe muda status e reagenda; o gatilho appointments_guard barra
-- transição inválida e campo congelado. O cliente não tem política de
-- escrita: cancela e reagenda pelas funções, que aplicam a regra das 2h.
create policy "equipe atualiza a agenda" on public.appointments
  for update to authenticated
  using (private.is_member(tenant_id)) with check (private.is_member(tenant_id));

create policy "equipe cuida dos bloqueios" on public.time_blocks
  for all to authenticated
  using (private.is_member(tenant_id)) with check (private.is_member(tenant_id));

-- ─── financeiro ──────────────────────────────────────────────────────────

create policy "equipe lê o caixa" on public.finance_entries
  for select to authenticated using (private.is_member(tenant_id));

-- Só despesa entra por aqui. Recebimento nasce em register_payment, junto
-- com a baixa do atendimento — os dois ou nenhum.
create policy "equipe lança despesas" on public.finance_entries
  for insert to authenticated
  with check (private.is_member(tenant_id) and kind = 'despesa');

create policy "equipe corrige despesas" on public.finance_entries
  for update to authenticated
  using (private.is_member(tenant_id)) with check (private.is_member(tenant_id));

create policy "equipe remove despesas" on public.finance_entries
  for delete to authenticated using (private.is_member(tenant_id));
