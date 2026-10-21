# Banco de dados (Supabase / Postgres)

```
supabase/
├── migrations/
│   ├── 20261019000100_schema.sql     tabelas, tipos, regra de horário duplo, gatilhos
│   ├── 20261019000200_security.sql   RLS: quem enxerga e quem escreve o quê
│   ├── 20261019000300_booking.sql    marcar, reagendar, cancelar, receber, horários ocupados
│   ├── 20261019000400_admin.sql      salvar profissional, serviço e configurações numa operação
│   ├── 20261019000500_onboarding.sql cadastrar barbearia (create_tenant)
│   ├── 20261019000600_storage.sql    imagens: bucket "midia" e quem envia o quê
│   ├── 20261019000700_client_link.sql histórico do balcão ligado à conta do cliente
│   ├── 20261019000800_delete_account.sql excluir minha conta (LGPD)
│   ├── 20261019000900_counter_pin.sql PIN do balcão
│   ├── 20261020000100_reserved_slugs.sql endereços reservados pelo Átrio
│   ├── 20261020000200_appointment_emails.sql fila dos e-mails do agendamento
│   ├── 20261020000300_email_dispatch.sql a cada minuto, chama o envio
│   ├── 20261020000400_notification_email.sql e-mail para os avisos da barbearia
│   ├── 20261020000500_plans.sql      planos Solo e Barbearia, e os limites de cada um
│   └── 20261021000100_notifications.sql avisos do sino do painel
├── functions/enviar-emails/          envia a fila pelo Resend (Edge Function)
├── templates/                        os e-mails de conta (cadastro, senha, troca de e-mail)
├── seed.sql                          a Navalha & Co. do modo demonstração
└── tests/schema.test.mjs             95 testes contra Postgres de verdade
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

   O link leva a `/<barbearia>/nova-senha` (cliente) e a `/nova-senha`
   (painel).

## E-mails

O envio padrão do Supabase é só para teste: poucos e-mails por hora e, em
projeto novo, só para quem é da equipe do projeto. Para valer, o Supabase
envia pelo **Resend**, com o domínio **atrioagenda.com.br**.

**1. Domínio no Resend.** Em resend.com → **Domains → Add domain**:
`atrioagenda.com.br`, região São Paulo se oferecer. Ele mostra os registros
de DNS (DKIM e SPF) — copie cada um na Cloudflare (**DNS → Records**), com a
nuvem **cinza** ("DNS only"). Junto, crie o DMARC:

| Tipo | Nome     | Conteúdo           |
| ---- | -------- | ------------------ |
| TXT  | `_dmarc` | `v=DMARC1; p=none;` |

Espere o Resend marcar o domínio como **Verified**. Sem isso, os e-mails
caem no spam ou nem saem.

**2. Chave do Resend.** **API Keys → Create API key**, permissão **Sending
access**, só para o domínio. A chave aparece uma vez: vai direto para o
painel do Supabase — nunca para o código, o Git ou o chat.

**3. SMTP no Supabase.** **Authentication → Emails → SMTP Settings**, ligar
"Enable custom SMTP":

| Campo        | Valor                             |
| ------------ | --------------------------------- |
| Sender email | `naoresponda@atrioagenda.com.br`  |
| Sender name  | `Agendamento`                     |
| Host         | `smtp.resend.com`                 |
| Port         | `465`                             |
| Username     | `resend`                          |
| Password     | a chave do passo 2                |

O remetente é neutro de propósito: o cliente se cadastrou na "Barbearia X",
não no Átrio. O nome da barbearia vai no corpo do e-mail — o cadastro envia
`barbearia` junto com `name` e `phone`, e os modelos usam
`{{ .Data.barbearia }}`.

**4. Os modelos.** **Authentication → Emails → Templates**, colando assunto
e o HTML de `supabase/templates/`:

| No painel            | Assunto                  | Arquivo                 |
| -------------------- | ------------------------ | ----------------------- |
| Confirm sign up      | Confirme seu e-mail      | `confirmation.html`     |
| Reset password       | Redefinir sua senha      | `recovery.html`         |
| Change email address | Confirme o novo e-mail   | `email_change.html`     |
| Password changed *   | Sua senha foi alterada   | `password_changed.html` |

\* Em **Security notifications**: ligar e colar.

Os mesmos arquivos valem para o Supabase local (`config.toml`). Mudou um
modelo aqui, cole de novo no painel — nos dois projetos, teste e produção.

**5. Confirmar e-mail.** **Authentication → Providers → Email → Confirm
email**: ligado. O cadastro passa a responder "Enviamos um link para o seu
e-mail"; o link volta para a página da barbearia (`/<barbearia>`), já
logado — coberto pelo `/**` das Redirect URLs.

## E-mails do agendamento

Confirmação, aviso à barbearia, cancelamento, remarcação e lembrete da
véspera. Quem recebe o quê está no topo de
`migrations/20261020000200_appointment_emails.sql`. Os avisos à barbearia vão
para o **e-mail para avisos** (painel → Configurações) ou, em branco, para o
e-mail do administrador.

**Como funciona.** Marcar, cancelar ou remarcar grava um aviso na fila
(`email_outbox`) — no banco, na mesma transação, sem depender de rede. A cada
minuto o pg_cron roda `private.dispatch_emails()`: enfileira os lembretes e,
se há algo na fila, chama a Edge Function `enviar-emails`, que monta cada
e-mail (`functions/enviar-emails/render.ts`) e envia pelo Resend. O que falha
volta para a fila, até 5 tentativas. Aviso que perdeu o sentido (horário
cancelado antes de a confirmação sair) é descartado.

**Configurar** (uma vez por projeto — teste e produção):

1. **Chave do Resend.** resend.com → API Keys → Create: nome
   `emails-agendamento-teste`, **Sending access**, domínio
   `atrioagenda.com.br`. A chave aparece uma vez.
2. **Um segredo** para o banco provar à função que é ele. Gere no terminal e
   guarde para os passos 3 e 4:

   ```bash
   node -e "console.log(crypto.randomUUID())"
   ```

3. **Secrets da função.** Painel do Supabase → Edge Functions → Secrets:

   | Nome | Valor |
   | --- | --- |
   | `RESEND_API_KEY` | a chave do passo 1 |
   | `EMAILS_SECRET` | o segredo do passo 2 |
   | `APP_URL` | `http://localhost:4300` (teste) ou `https://atrioagenda.com.br` |
   | `PAINEL_URL` | `http://localhost:4200` (teste) ou o endereço do painel |

4. **Vault.** SQL Editor, trocando o segredo:

   ```sql
   select vault.create_secret(
     'https://<ref-do-projeto>.supabase.co/functions/v1/enviar-emails', 'emails_url');
   select vault.create_secret('<o segredo do passo 2>', 'emails_secret');
   ```

5. **Publicar a função** (já feito no projeto de teste):

   ```bash
   npx supabase functions deploy enviar-emails --no-verify-jwt --use-api
   ```

Sem os passos 3 e 4 nada quebra: os avisos ficam na fila esperando.

**Acompanhar.** Table Editor → `email_outbox`: `status` (`pendente`,
`enviando`, `enviado`, `falhou`, `descartado`) e `last_error`. No Resend, em
Emails, cada envio e se foi entregue.

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

## Plano da barbearia

Dois planos: **Solo** (1 profissional ativo, só a conta do dono, caixa sem
despesas) e **Barbearia** (sem esses limites). Toda barbearia nasce no
Barbearia. Os limites são do banco (`20261020000500_plans.sql`); o painel só
os mostra.

```bash
npm run barbearia:plano -- --endereco barbearia-do-ze               # mostra o plano
npm run barbearia:plano -- --endereco barbearia-do-ze --plano solo  # troca
```

Rebaixar para Solo só é aceito quando a barbearia já cabe nele — com dois
profissionais ativos ou com atendentes, o comando diz o que ajustar antes.
Nada é apagado. Usa a chave service_role de `.env.local`, como
`barbearia:nova`.

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
| De qual barbearia | do endereço (`/:slug`) | do vínculo da conta da equipe |
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
