# Banco de dados (Supabase / Postgres)

```
supabase/
├── migrations/
│   ├── 20261019000100_schema.sql     tabelas, tipos, regra de horário duplo, gatilhos
│   ├── 20261019000200_security.sql   RLS: quem enxerga e quem escreve o quê
│   └── 20261019000300_booking.sql    marcar, reagendar, cancelar, receber, horários ocupados
├── seed.sql                          a Navalha & Co. do modo demonstração
└── tests/schema.test.mjs             35 testes contra Postgres de verdade
```

## Testar

```bash
npm run test:db
```

Roda as migrações e o seed num Postgres em WebAssembly (PGlite) — sem
Docker, sem conta no Supabase — e exercita cada regra como cada tipo de
visitante, com a RLS valendo. Leva uns 3 segundos.

## Subir para um projeto Supabase

Ainda não há projeto criado. Quando houver:

```bash
npx supabase login
npx supabase link --project-ref <ref-do-projeto>
npx supabase db push
```

Região: **São Paulo (sa-east-1)** — os dados são de clientes brasileiros
(LGPD), e a latência do tablet no balcão agradece.

Depois do `db push`, no painel do Supabase:

1. **Authentication → Providers → Email**: ligado. O cadastro do app envia
   `name` e `phone` em `options.data`; o gatilho cria o perfil a partir disso.
2. **A equipe da barbearia**: criar o usuário em Authentication e ligar à
   barbearia com
   `insert into tenant_members (tenant_id, user_id, role) values (…, …, 'dono')`.
   Não há tela para isso ainda.

## As regras, e onde moram

| Regra | Onde | Por que ali |
| --- | --- | --- |
| Um profissional, um atendimento por vez | `appointments_no_overlap` (exclusion constraint) | é a única checagem imune a duas gravações simultâneas; vale para qualquer caminho de escrita |
| Dentro do expediente, fora de intervalo e bloqueio | `private.check_slot`, chamada pelas funções de agenda | o app calcula, mas quem chama a API direto não passaria pelo app |
| Cliente só cancela/reagenda com 2h de antecedência | `cancel_appointment`, `reschedule_appointment` | a equipe não tem o limite; o cliente não tem política de escrita na tabela |
| Transições de status (concluído não volta) | gatilho `appointments_guard` | vale também para a equipe, que atualiza a tabela direto |
| Pagamento e recebimento juntos, uma vez | `register_payment` + `unique (appointment_id)` | os dois ou nenhum |
| Recebimento imutável | gatilho `finance_entries_guard` | corrigir caixa é lançar outra movimentação |
| Nada aponta para outra barbearia | chaves estrangeiras compostas `(tenant_id, id)` | o banco recusa, mesmo com bug no app |
| Cada barbearia só vê o que é dela | RLS com `private.is_member` | — |

## Do modelo do app para as tabelas

Quase tudo é um para um (`camelCase` → `snake_case`, `price` → `price_cents`).
As exceções, que o repositório Supabase vai traduzir:

| No app | No banco | Por quê |
| --- | --- | --- |
| `Professional.schedule` (WeeklySchedule) | linhas em `professional_schedule` | o servidor precisa checar expediente em SQL; dia sem linha de `expediente` é folga |
| `Professional.serviceIds` | `professional_services` | relação de um lado só, como no modelo |
| `Tenant.admin`, `Tenant.subscription` | `tenant_accounts` | a vitrine é pública; assinatura e e-mail do responsável, não |
| `ClientAccount.email` | `auth.users.email` | o resto (nome, telefone, foto) em `profiles` |
| `Appointment.client` | colunas `client_id`, `client_name`, `client_phone` | cópia, como no modelo |
| `Appointment.payment` | `payment_status`, `payment_method`, `paid_at` | — |

## Erros

As funções levantam erro com uma mensagem para gente e um **hint** estável
para o app decidir o que fazer:

`nao_autenticado` · `perfil_incompleto` · `servico_indisponivel` ·
`profissional_indisponivel` · `horario_passado` · `fora_da_janela` ·
`fora_do_expediente` · `horario_bloqueado` · `horario_ocupado` ·
`nao_encontrado` · `nao_reagendavel` · `nao_cancelavel` · `prazo_encerrado` ·
`sem_permissao` · `nao_pagavel` · `transicao_invalida` · `pagamento_imutavel` ·
`campo_congelado` · `recebimento_imutavel` · `janela_invalida`

## O app ligado ao banco

`provideSupabaseData()` (em `@atrio/data`, pasta `lib/supabase/`) implementa os
contratos do **app do cliente**: vitrine, horários ocupados, marcar,
reagendar, cancelar, "Meus horários" e a conta (Supabase Auth). O app do
cliente usa o banco quando `dataSource` é `'supabase'` em
`projects/booking/src/environments/environment.ts`; `'demo'` volta ao modo
demonstração, sem rede.

**O painel continua no modo demonstração.** Ele depende do login da equipe,
que ainda não existe — sem ele, as regras do banco não devolvem nada. As
operações só da equipe (salvar profissional, receber pagamento…) respondem
com um erro dizendo isso, em vez de falhar em silêncio.

Três mudanças de contrato vieram do esquema:

1. **Horários livres não leem a agenda.** O app calcula sobre
   `AvailabilityRepository.watchBusy` — quem está ocupado e quando, sem nome,
   telefone nem motivo de bloqueio (`busy_intervals` no banco).
2. **"Meus horários" é pela conta** (`watchMine`), pela ficha ligada a ela —
   não por telefone. Horários marcados no balcão antes de a pessoa ter conta
   não aparecem sozinhos: ligar por telefone sem verificá-lo entregaria o
   histórico de outra pessoa a quem cadastrasse o número dela.
3. **O cliente marca com `book`**, sem dizer quem é nem quanto custa: o
   servidor tira os dois da conta e do catálogo. `create`, com cliente e
   preço por parâmetro, fica para a equipe.

O app do cliente não recebe a agenda em tempo real (sem permissão de
leitura, não há o que transmitir): cada consulta se refaz ao abrir a tela,
depois de cada escrita do próprio app e quando a pessoa volta para a aba.

**Pendente:** a página de "nova senha". O link de "Esqueci minha senha" já é
enviado pelo Supabase, mas ainda não há tela no app para definir a senha nova
ao voltar por ele.
