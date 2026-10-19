# Banco de dados (Supabase / Postgres)

```
supabase/
├── migrations/
│   ├── 20261019000100_schema.sql     tabelas, tipos, regra de horário duplo, gatilhos
│   ├── 20261019000200_security.sql   RLS: quem enxerga e quem escreve o quê
│   ├── 20261019000300_booking.sql    marcar, reagendar, cancelar, receber, horários ocupados
│   ├── 20261019000400_admin.sql      salvar profissional, serviço e configurações numa operação
│   ├── 20261019000500_onboarding.sql cadastrar barbearia (create_tenant)
│   └── 20261019000600_storage.sql    imagens: bucket "midia" e quem envia o quê
├── seed.sql                          a Navalha & Co. do modo demonstração
└── tests/schema.test.mjs             52 testes contra Postgres de verdade
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
2. **A equipe da barbearia** (ver "Conta da equipe" abaixo).
3. **Authentication → URL Configuration**: o link de "Esqueci minha senha"
   só volta para o app se o endereço estiver liberado. Senão o Supabase
   manda para a Site URL e a pessoa cai fora do app.
   - **Site URL**: o endereço do app do cliente (em desenvolvimento,
     `http://localhost:4300`).
   - **Redirect URLs**: `http://localhost:4300/**` e `http://localhost:4200/**`
     — e, ao publicar, os endereços de produção dos dois apps.

   O link leva a `/b/<barbearia>/nova-senha` (cliente) e a `/nova-senha`
   (painel).

## Imagens

Foto de profissional e logo ficam no Storage, bucket `midia`, e no banco só o
link. Leitura é pública (é a vitrine); envio e remoção, só a equipe da
barbearia e só na pasta dela: `midia/<tenant_id>/profissionais/…` e
`midia/<tenant_id>/marca/…`. Até 1 MB, JPEG, PNG ou WebP.

As telas não mudaram: continuam produzindo a imagem embutida ao escolher o
arquivo, e é o repositório que a envia ao salvar (`storeImage`), grava o
link e apaga a anterior. Fotos antigas, gravadas como texto antes desta
mudança, continuam aparecendo e migram sozinhas na próxima vez que o
profissional (ou as configurações) for salvo.

## Nova barbearia

```bash
npm run barbearia:nova -- --nome "Barbearia do Zé" --endereco barbearia-do-ze   --dono "José Silva" --email ze@exemplo.com [--telefone "(11) 95555-0000"] [--sem-catalogo]
```

Cria a conta do dono (senha temporária, mostrada no fim), a barbearia, o
vínculo de dono e um catálogo inicial de serviços. As três últimas são uma
transação só no banco (`create_tenant`), e se ela falhar a conta recém-criada
é apagada. Se o e-mail já tiver conta, ela é reaproveitada sem mexer na senha.

Precisa da chave **service_role** em `.env.local` (copie de `.env.example`;
o Git ignora o arquivo). Essa chave ignora todas as regras do banco: só nesta
máquina, só nos scripts de `tools/`, nunca em app nem em chat.

## Conta da equipe

Não há cadastro aberto para o painel — de propósito. Para pôr **mais gente**
numa barbearia que já existe (até existir a tela de equipe):

1. **Authentication → Users → Add user → Create new user**: e-mail, senha e
   **Auto Confirm User** marcado.
2. **SQL Editor**, trocando o e-mail:

   ```sql
   -- Liga a conta à barbearia, como dono.
   insert into public.tenant_members (tenant_id, user_id, role)
   select '00000000-0000-4000-8000-000000000001', id, 'dono'
   from auth.users where email = 'voce@exemplo.com';

   -- Opcional: o nome que aparece na barra do painel.
   update auth.users
      set raw_user_meta_data = raw_user_meta_data || '{"name": "Seu Nome"}'
    where email = 'voce@exemplo.com';
   ```

Uma conta sem esse vínculo (a de um cliente, por exemplo) passa pela senha e
é barrada logo em seguida: "Esta conta não tem acesso a nenhuma barbearia".

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

## Os apps ligados ao banco

Os dois apps usam os mesmos repositórios (`@atrio/data`, pasta
`lib/supabase/`) — quem pode o quê é decidido pela RLS e pelas funções do
banco, não pelo app. O que muda entre eles:

| | App do cliente (`provideSupabaseData`) | Painel (`provideSupabaseAdminData`) |
| --- | --- | --- |
| De qual barbearia | do endereço (`/b/:slug`) | do vínculo da conta da equipe |
| Login | cliente (`profiles`) | equipe (`tenant_members`) |
| Tempo real | não — reconsulta ao abrir, após escrever e ao voltar à aba | agenda, bloqueios e caixa, filtrados pela barbearia |
| Sessão guardada em | `atrio.auth.cliente` | `atrio.auth.equipe` |

Cada app escolhe a fonte em `src/environments/environment.ts`
(`dataSource: 'supabase' | 'demo'`).

As escritas do painel que tocam mais de uma tabela são funções
(`20261019000400_admin.sql`), para nunca salvar pela metade:
`save_professional` (dados, expediente e serviços), `set_service_professionals`
e `save_tenant_settings` (só o dono).

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
