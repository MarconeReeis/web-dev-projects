-- ════════════════════════════════════════════════════════════════════════
-- Átrio — dados de desenvolvimento
--
-- A mesma barbearia do modo demonstração (demo-seed.ts): Navalha & Co., com
-- os mesmos profissionais, serviços e expediente. Ids fixos para os testes e
-- para links de exemplo continuarem valendo depois de recriar o banco.
--
-- Sem agendamentos: eles dependem de "agora" e nascem pelo próprio app.
-- Sem usuários: contas são criadas pelo Supabase Auth (ver supabase/README.md).
-- ════════════════════════════════════════════════════════════════════════

insert into public.tenants (id, slug, name, phone, address, branding, highlight, time_zone)
values (
  '00000000-0000-4000-8000-000000000001',
  'navalha-e-co',
  'Navalha & Co.',
  '(11) 98888-1234',
  jsonb_build_object(
    'street', 'Rua Augusta', 'number', '1472', 'complement', 'Loja 3',
    'district', 'Consolação', 'city', 'São Paulo', 'state', 'SP', 'zipCode', '01304-001'
  ),
  jsonb_build_object('logoUrl', null, 'primaryColor', null),
  jsonb_build_object(
    'title', 'Terça é dia de barba',
    'subtitle', '20% de desconto na barba, só com agendamento pelo app.',
    'ctaLabel', 'Agendar agora',
    'active', true
  ),
  'America/Sao_Paulo'
);

insert into public.tenant_accounts (tenant_id, subscription, admin_name, admin_email)
values ('00000000-0000-4000-8000-000000000001', 'trial', 'Marcone Reis', 'admin@navalhaeco.com.br');

insert into public.services (id, tenant_id, name, description, duration_minutes, price_cents) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001',
   'Corte', 'Corte na máquina ou tesoura, com finalização.', 45, 4500),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000001',
   'Barba', 'Toalha quente, navalha e hidratação.', 30, 3500),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-000000000001',
   'Corte + Barba', 'O combo completo.', 75, 7000),
  ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-000000000001',
   'Acabamento', 'Pezinho e contorno.', 20, 2500);

insert into public.professionals (id, tenant_id, name, phone, bio, about, active) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001',
   'Rafael Lima', '(11) 97777-0001', 'Cortes clássicos e barba',
   '12 anos de navalha. Especialista em barba com toalha quente e cortes clássicos.', true),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000001',
   'Diego Nunes', '(11) 97777-0002', 'Degradê e freestyle',
   'Formado em barbearia moderna. Faz degradê, risco e desenho na máquina.', true),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-000000000001',
   'Caio Prado', '(11) 97777-0003', 'Máquina e acabamento',
   'Rápido e caprichoso no acabamento. Ideal para manutenção entre cortes.', true),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-000000000001',
   'Marcos Vieira', null, 'Barba e navalha', null, false);

-- Quem faz o quê: Rafael e Diego tudo; Caio corte e acabamento; Marcos
-- (inativo) barba e combo.
insert into public.professional_services (tenant_id, professional_id, service_id)
select '00000000-0000-4000-8000-000000000001', p.id, s.id
from (values
  ('00000000-0000-4000-8000-0000000000b1'::uuid, '00000000-0000-4000-8000-0000000000a1'::uuid),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a3'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a4'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a3'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a4'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000a4'),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000a3')
) as link (professional, service)
join public.professionals p on p.id = link.professional
join public.services s on s.id = link.service;

-- Expediente da barbearia, igual para todos: seg–qui 09–20, sex 09–21,
-- almoço 12–13 nesses dias; sábado 08–18 sem intervalo; domingo fechado.
insert into public.professional_schedule (tenant_id, professional_id, weekday, kind, starts, ends)
select p.tenant_id, p.id, d.weekday, d.kind::public.schedule_kind, d.starts, d.ends
from public.professionals p
cross join (values
  (1, 'expediente', time '09:00', time '20:00'), (1, 'intervalo', time '12:00', time '13:00'),
  (2, 'expediente', time '09:00', time '20:00'), (2, 'intervalo', time '12:00', time '13:00'),
  (3, 'expediente', time '09:00', time '20:00'), (3, 'intervalo', time '12:00', time '13:00'),
  (4, 'expediente', time '09:00', time '20:00'), (4, 'intervalo', time '12:00', time '13:00'),
  (5, 'expediente', time '09:00', time '21:00'), (5, 'intervalo', time '12:00', time '13:00'),
  (6, 'expediente', time '08:00', time '18:00')
) as d (weekday, kind, starts, ends)
where p.tenant_id = '00000000-0000-4000-8000-000000000001';
