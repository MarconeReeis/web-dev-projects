-- ─── avisos dos Advisors do Supabase ─────────────────────────────────────
--
-- O que o linter do painel (splinter) apontou, corrigido sem mudar quem
-- pode o quê: cada tabela continua permitindo exatamente as mesmas
-- leituras e escritas, para os mesmos papéis.
--
-- Fica de fora, de propósito:
--   - "RLS ligada sem política" em email_outbox e staff_pins: ninguém lê
--     essas tabelas direto; só as funções do banco (security definer).
--   - "security definer executável por anon/authenticated": são as funções
--     que os apps chamam (marcar, cancelar, PIN…), e busy_intervals é a
--     vitrine — horários ocupados, sem nome de ninguém.
--   - "índice sem uso": num banco com pouco movimento, quase todos estão.

-- ─── auth.uid() uma vez por consulta, não uma vez por linha ──────────────
--
-- `auth.uid()` solto numa política é chamado para cada linha lida;
-- `(select auth.uid())` vira um valor só para a consulta inteira.

alter policy "equipe vê a equipe" on public.tenant_members
  using (user_id = (select auth.uid()) or private.is_member(tenant_id));

alter policy "cada um lê o seu perfil" on public.profiles
  using (id = (select auth.uid()));

alter policy "cada um edita o seu perfil" on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ─── uma política de leitura por tabela ──────────────────────────────────
--
-- Duas políticas permissivas para a mesma ação são avaliadas as duas, para
-- toda linha. Onde a leitura da equipe e a da vitrine (ou do cliente) se
-- sobrepunham, fica uma só, com o "ou" dentro.

-- Agenda: a equipe lê a da barbearia; o cliente, os próprios horários.
drop policy "equipe lê a agenda" on public.appointments;
drop policy "cliente lê os próprios horários" on public.appointments;
create policy "equipe ou o próprio cliente lê a agenda" on public.appointments
  for select to authenticated
  using (private.is_member(tenant_id) or private.is_own_client(client_id));

-- Fichas: a equipe cuida de todas; o cliente lê a dele.
drop policy "equipe cuida das fichas" on public.clients;
drop policy "cliente lê a própria ficha" on public.clients;
create policy "equipe ou o próprio cliente lê a ficha" on public.clients
  for select to authenticated
  using (private.is_member(tenant_id) or user_id = (select auth.uid()));
create policy "equipe cria fichas" on public.clients
  for insert to authenticated with check (private.is_member(tenant_id));
create policy "equipe edita fichas" on public.clients
  for update to authenticated
  using (private.is_member(tenant_id)) with check (private.is_member(tenant_id));
create policy "equipe exclui fichas" on public.clients
  for delete to authenticated using (private.is_member(tenant_id));

-- Catálogo: a leitura é a da vitrine, que já inclui o que só a equipe vê
-- (inativos). A equipe fica com inserir, editar e excluir.
drop policy "equipe cuida dos profissionais" on public.professionals;
create policy "equipe cria profissionais" on public.professionals
  for insert to authenticated with check (private.is_member(tenant_id));
create policy "equipe edita profissionais" on public.professionals
  for update to authenticated
  using (private.is_member(tenant_id)) with check (private.is_member(tenant_id));
create policy "equipe exclui profissionais" on public.professionals
  for delete to authenticated using (private.is_member(tenant_id));

drop policy "equipe cuida dos serviços" on public.services;
create policy "equipe cria serviços" on public.services
  for insert to authenticated with check (private.is_member(tenant_id));
create policy "equipe edita serviços" on public.services
  for update to authenticated
  using (private.is_member(tenant_id)) with check (private.is_member(tenant_id));
create policy "equipe exclui serviços" on public.services
  for delete to authenticated using (private.is_member(tenant_id));

drop policy "equipe define quem faz o quê" on public.professional_services;
create policy "equipe liga profissional e serviço" on public.professional_services
  for insert to authenticated with check (private.is_member(tenant_id));
create policy "equipe edita quem faz o quê" on public.professional_services
  for update to authenticated
  using (private.is_member(tenant_id)) with check (private.is_member(tenant_id));
create policy "equipe desliga profissional e serviço" on public.professional_services
  for delete to authenticated using (private.is_member(tenant_id));

drop policy "equipe define o expediente" on public.professional_schedule;
create policy "equipe cria o expediente" on public.professional_schedule
  for insert to authenticated with check (private.is_member(tenant_id));
create policy "equipe edita o expediente" on public.professional_schedule
  for update to authenticated
  using (private.is_member(tenant_id)) with check (private.is_member(tenant_id));
create policy "equipe exclui o expediente" on public.professional_schedule
  for delete to authenticated using (private.is_member(tenant_id));

-- ─── índices nas chaves estrangeiras ─────────────────────────────────────
--
-- Sem eles, excluir um profissional, serviço ou cliente — ou listar o
-- histórico de um cliente — varre a tabela inteira.

create index appointments_tenant_client_idx on public.appointments (tenant_id, client_id);
create index appointments_tenant_professional_idx on public.appointments (tenant_id, professional_id);
create index appointments_tenant_service_idx on public.appointments (tenant_id, service_id);
create index clients_user_idx on public.clients (user_id);
create index email_outbox_tenant_idx on public.email_outbox (tenant_id);
create index finance_entries_tenant_appointment_idx on public.finance_entries (tenant_id, appointment_id);
create index finance_entries_tenant_professional_idx on public.finance_entries (tenant_id, professional_id);
create index notifications_appointment_idx on public.notifications (appointment_id);
create index professional_schedule_tenant_professional_idx on public.professional_schedule (tenant_id, professional_id);
create index professional_services_tenant_professional_idx on public.professional_services (tenant_id, professional_id);
create index professional_services_tenant_service_idx on public.professional_services (tenant_id, service_id);
create index time_blocks_tenant_professional_idx on public.time_blocks (tenant_id, professional_id);

-- ─── search_path fixo ────────────────────────────────────────────────────
--
-- As duas só devolvem uma constante, mas função sem search_path fixo
-- resolveria nomes pelo de quem chama.

alter function private.change_limit() set search_path = '';
alter function private.booking_horizon() set search_path = '';
