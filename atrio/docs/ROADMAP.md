# Roadmap até o lançamento

O que falta para uma barbearia de verdade usar o Átrio no dia a dia — e para
vender a assinatura.

**Onde estamos (24/10/2026).** O produto está fechado: o cliente marca pelo
`atrioagenda.com.br/<barbearia>`, a barbearia vê em tempo real (tablet ou
celular), confirma, atende e recebe, e os dois lados recebem e-mail. A
segurança está no código — captcha, monitoramento de erros (Sentry) e aceite
dos termos no cadastro — e os avisos dos Advisors do Supabase, corrigidos.
Falta a revisão jurídica dos textos; depois, publicar (banco de produção,
hospedagem) e a parte comercial.

**Como ler.** `[x]` feito, `[~]` em andamento, `[ ]` a fazer. Cada item
tem um tamanho relativo — **P** (pequeno, cabe numa sessão), **M** (médio,
uma ou duas sessões), **G** (grande, várias). As fases 1 a 4 **bloqueiam o
lançamento**; o resto vem depois.

**Versão visual.** `npm run roadmap` gera `docs/roadmap.html` a partir deste
arquivo — progresso por fase, o que está em andamento e o que vem a seguir.
Este arquivo é a fonte: edite aqui e gere de novo.

---

## Direção do produto (20/10/2026)

**Átrio Agenda, um produto só.** Em vez de um app por barbearia, um site:
`atrioagenda.com.br/<barbearia>`. O Átrio é a moldura (topo, barra, app
instalado); a barbearia é o assunto da página (logo, capa, nome,
profissionais). Combina com o que já existe: a conta do cliente é uma só para
todas as barbearias, e o app instalado deixa de precisar do nome de cada uma.

**Planos por tamanho, não por canal.** O barbeiro sozinho não precisa de
financeiro; a barbearia com equipe precisa. Mas mesmo o barbeiro sozinho
precisa dizer ao sistema quando trabalha e quando folga — o plano pequeno tem
um painel enxuto, não nenhum.

| Plano | Para quem | O que tem |
|---|---|---|
| **Solo** | 1 profissional | Página de agendamento, agenda simples no celular (dia, folgas, horários), avisos por e-mail para cliente e barbeiro |
| **Barbearia** | Equipe | Tudo do Solo + painel completo: financeiro, dashboard, vários profissionais, PIN do balcão e, depois do lançamento, Métricas |
| **+ WhatsApp** (adicional) | Qualquer plano | Confirmação e lembrete pelo WhatsApp |
| **Agendamento pelo WhatsApp** (futuro) | Qualquer plano | Marcar pelo WhatsApp, por menu de opções |

Os valores ainda não existem: os que surgiram na conversa (R$ 200, R$ 100,
R$ 60) eram exemplos. Saem do **estudo de preços** (fase 4), antes do
lançamento.

**Decidido (20/10/2026):**

- **Identidade do Átrio para todas as barbearias.** A barbearia aparece pelo
  logo, nome e fotos; a cor é a do Átrio. Cor própria pode virar extra de
  marca própria (premium).
- **Nunca mostrar concorrente.** Regra do produto, a escrever no contrato: o
  link que cada barbearia divulga leva só a ela — a página de uma barbearia
  nunca mostra outra.

## Antes de tudo (não espere)

- [x] **Enviar o código para o GitHub** — feito em 19/10/2026.
- [x] **Região e ambientes** — decidido em 19/10/2026. O projeto atual, na
      Virgínia, vira o de **desenvolvimento**: dados fictícios, pode quebrar,
      latência não importa. O de **produção** nasce em **São Paulo**, vazio,
      na hora de publicar (fase 3) — sem migração nenhuma. As migrações vão
      sempre para os dois; o seed, só para o de desenvolvimento.

## Fase 1 — Fechar o produto

O que impede o fluxo de ponta a ponta: cliente marca → barbearia vê, atende
e recebe.

- [x] **Login da equipe** — feito em 19/10/2026. Tela de entrar, sessão no
      tablet, "Sair", rotas protegidas e a barbearia vinda do vínculo em
      `tenant_members`. Falta só a tela de equipe (convidar e remover
      pessoas): por enquanto a conta é criada no Supabase — ver
      `supabase/README.md`.
- [x] **Painel no banco** — feito em 19/10/2026. Agenda em tempo real,
      marcar no balcão, status, pagamento, profissionais, serviços,
      bloqueios, financeiro e configurações. As escritas que tocam várias
      tabelas viraram funções do banco (uma transação cada).
- [x] **Cadastrar uma barbearia sem SQL** — feito em 19/10/2026:
      `npm run barbearia:nova` (ver `supabase/README.md`). Cadastro
      self-service, pela própria barbearia, fica para depois.
- [x] **Tela de nova senha** — feito em 19/10/2026, nos dois apps. O link
      do e-mail leva a "Crie uma senha nova"; link vencido oferece pedir
      outro. Depende das Redirect URLs no Supabase (`supabase/README.md`).
- [x] **E-mails de conta** — feito em 20/10/2026 no banco de
      desenvolvimento. Domínio `atrioagenda.com.br` na Cloudflare, envio pelo
      Resend (verificado), SMTP no Supabase, modelos em português com o nome
      da barbearia e "Confirm email" ligado; o cadastro mostra "Confirme seu
      e-mail" com reenviar. No banco de produção, repetir SMTP e modelos —
      passo a passo em `supabase/README.md`, "E-mails".
- [x] **E-mails do agendamento** — feito em 20/10/2026: confirmação para o
      cliente, aviso de novo horário, cancelamento e remarcação para o outro
      lado, e lembrete na véspera. Fila no banco (gatilho), envio por Edge
      Function + Resend a cada minuto (pg_cron). Configurar chave e segredo
      em cada projeto — `supabase/README.md`, "E-mails do agendamento".
- [x] **URL `atrioagenda.com.br/<barbearia>`** — feito em 20/10/2026. Sem
      o `/b/`; endereços reservados pelo Átrio recusados no banco; links
      antigos redirecionam com o resto do caminho.
- [x] **Marca Átrio no topo** — feito em 20/10/2026. "Átrio Agenda" na
      moldura, a barbearia (logo, nome, saudação) no topo do Início, o app
      instalado como "Átrio Agenda" e a cor do Átrio para todas. Falta a
      foto de capa da barbearia, que ainda não tem onde cadastrar.
- [x] **Planos no banco** — feito em 20/10/2026. Plano na conta
      (`tenant_accounts.plan`), Barbearia por padrão. Solo: 1 profissional
      ativo, só o dono, caixa sem despesas — recusado no banco. O painel
      mostra o plano em Configurações e avisa onde o Solo esbarra
      (Profissionais, Financeiro). Troca: `npm run barbearia:plano`.
- [x] **Painel de celular** — feito em 21/10/2026, para os dois planos em
      tela de celular (o tablet continua igual). Barra inferior com quatro
      abas: **Hoje** (pedidos para confirmar no topo e o dia em lista),
      **Agenda** (um dia de cada vez), **Horários** (jornada, folgas e
      bloqueios) e **Mais** (serviços, caixa, resumo, configurações e o link
      da página da barbearia). Tocar num atendimento abre o mesmo painel de
      detalhes do tablet.
- [x] **Notificações no painel (sino)** — feito em 21/10/2026. Sino no
      topo com o número de não lidas; cada aviso (novo horário, cancelou,
      remarcou) abre o atendimento na agenda e fica lido. Nasce no banco
      (`notifications`, mesmas regras dos e-mails à barbearia), chega em
      tempo real, lido é da barbearia; com mais de 60 dias, sai. O "pedido
      para confirmar" entra com a confirmação pelo barbeiro.
- [x] **Confirmação pelo barbeiro** — feito em 21/10/2026. Opção da barbearia em
      Configurações: "confirmação automática" (como hoje, o padrão) ou "eu
      confirmo cada agendamento". Na segunda, o horário marcado pelo app
      nasce **pendente** — já reservado, para ninguém mais pegar — e o
      cliente recebe "pedido recebido". O barbeiro confirma ou recusa pelo
      painel, pelo sino ou **pelos botões do próprio e-mail** (link seguro,
      sem abrir o painel); o cliente recebe a resposta. Sem resposta até um
      prazo (ex.: 2 horas antes), o pedido é recusado sozinho e o cliente,
      avisado. Lembrete da véspera só para confirmado. Os botões do e-mail
      levam à página `/responder` do painel (sem login, com um segundo
      toque: leitores de e-mail abrem links sozinhos).
- [x] **Fotos no Storage** — feito em 19/10/2026. Foto de profissional e
      logo vão para o bucket `midia`, com envio só pela equipe da barbearia
      e na pasta dela; no banco fica o link.
- [x] **Ligar a ficha do balcão à conta do cliente** — feito em
      19/10/2026. No painel do atendimento, a equipe confirma "é a mesma
      pessoa"; o histórico do balcão passa a aparecer no app e os próximos
      já nascem ligados.

## Fase 2 — Segurança, LGPD e confiabilidade

- [~] **LGPD** — M + revisão jurídica. Feito em 19/10/2026: **excluir minha
      conta** no app. Feito em 21/10/2026: **aceite no cadastro** (caixa
      obrigatória; o banco recusa conta de cliente sem aceite e guarda versão
      e data) e **rascunho da Política de privacidade e dos Termos de uso**
      no app. Falta: revisão por advogado, preencher razão social, CNPJ e o
      e-mail do encarregado (`legal-texts.ts`), pedir novo aceite quando a
      versão mudar (`accept_terms` já existe no banco) e o papel do Átrio
      como operador no contrato com a barbearia.
- [x] **PIN no balcão** — feito em 19/10/2026. PIN de 4 números por conta
      da equipe, conferido no servidor (5 erros travam por 5 minutos), pedido
      para abrir o Financeiro e para cancelar atendimento, marcar falta,
      remover bloqueio, excluir despesa e desativar profissional ou serviço
      com horários futuros. Vale 5 minutos depois de digitado.
- [x] **Proteção contra abuso** — feito em 24/10/2026. Cloudflare Turnstile
      invisível em entrar, criar conta, senha e PIN. Widget "Átrio Agenda"
      criado (atrioagenda.com.br e painel.) e a site key nos apps; no
      computador, a chave de teste. Captcha ligado no Supabase de
      desenvolvimento com a secret de teste. No de produção, colar a secret
      de verdade (Authentication → Attack Protection).
- [x] **Monitoramento de erros** — feito em 21/10/2026. Sentry nos dois
      apps (projeto `atrio`, tag `app`), só erros, sem dados pessoais e sem
      tokens nos endereços; o SDK só carrega com DSN.
- [x] **Advisors do Supabase** — feito em 24/10/2026. Os 10 avisos de
      desempenho e as 12 chaves sem índice corrigidos sem mudar quem pode o
      quê (`20261024000100_advisors.sql`), com testes que impedem a volta.
      Ficam, de propósito: as funções que os apps chamam, as tabelas só de
      uso interno e "índice sem uso". Repetir no banco de produção.

## Fase 3 — Publicação

- [x] **Integração contínua** — feito em 19/10/2026: GitHub Actions roda os
      testes do banco, da camada de dados e os builds de produção a cada push
      que toca `atrio/`. Falta, com o banco de produção: aplicar migrações a
      partir da `main`.
- [ ] **Banco de produção** — P. Criar o projeto em São Paulo, aplicar as
      migrações (sem o seed) e um `environment.prod.ts` em cada app apontando
      para ele.
- [ ] **Plano Pro do Supabase** — P. No projeto de produção: backup diário
      e projeto sem pausa por inatividade.
- [ ] **Hospedagem e domínio** — M. Os dois apps publicados com HTTPS
      (Cloudflare Pages, já com o domínio lá), o app do cliente em
      `atrioagenda.com.br/<barbearia>` e o painel num endereço próprio.
- [ ] **PWA de verdade** — P. Testar a instalação em Android e iPhone com o
      app publicado (HTTPS).
- [x] **Fuso da barbearia** — feito em 19/10/2026. O app calcula e mostra
      tudo no fuso da barbearia (`tenants.time_zone`), como o banco: horários
      livres, agenda, "hoje", períodos do Financeiro e da Dashboard. Um
      cliente com o celular em outro fuso vê os horários da barbearia.
- [ ] **Agenda sem internet no tablet** — M. Guardar a última agenda
      carregada para consulta quando a internet cair (confirmar continua
      exigindo conexão).

## Fase 4 — Comercial

- [ ] **Piloto** — 2 a 4 semanas com uma barbearia real, antes de vender
      para a segunda. É onde aparece o que nenhum teste mostra.
- [ ] **Cobrança da assinatura** — G (automática) ou P (manual no piloto).
      Provedor (Asaas, Mercado Pago, Stripe…), status da assinatura no banco
      e o painel em modo leitura para inadimplente — o campo já existe.
- [ ] **Kit da barbearia** — P. Link e QR code para divulgar o agendamento
      no balcão, no Instagram e no WhatsApp.
- [ ] **Estudo de preços** — P. Valores dos planos Solo e Barbearia e do
      adicional de WhatsApp, olhando o mercado e o custo de cada um (o
      WhatsApp oficial cobra por mensagem). Validar no piloto: mostrar os
      planos a barbearias pequenas e grandes e ver qual escolhem e quanto
      aceitam pagar.
- [ ] **Página do Átrio e preço** — M. Onde a barbearia conhece o produto e
      assina.
- [ ] **Canal de suporte** — P. WhatsApp ou e-mail, com quem responde e em
      quanto tempo.

---

## Depois do lançamento

Pedidos previsíveis, já considerados no modelo — nenhum exige migração:

- **Notificação no celular (push)** — avisos do sino mesmo com o app
  fechado, para o barbeiro que não fica olhando o painel (plano Solo). No
  iPhone, só com o app instalado na tela inicial. Mesmo problema que o
  WhatsApp resolve por outro canal.
- **WhatsApp oficial (adicional)** — confirmação e lembrete pela API oficial
  da Meta (WhatsApp Business Platform). Só a oficial: as bibliotecas "não
  oficiais" violam os termos e derrubam o número. Exige verificar a empresa
  na Meta e aprovar cada modelo de mensagem; cada lembrete é cobrado por
  mensagem. É o que mais reduz falta.
- **Agendamento pelo WhatsApp, por menu** — o cliente escolhe por opções, sem
  texto livre: "1 — Agendar com um profissional", depois a lista de
  profissionais, de serviços, de dias e de horários. O WhatsApp tem
  mensagens interativas para isso (botões de resposta e listas de opções),
  e menu não precisa entender frase: é mais simples de fazer, não erra e
  evita mensagens desnecessárias. As respostas a quem escreveu primeiro
  costumam não ser cobradas pela Meta (conferir a tabela na hora). Por
  baixo, as mesmas regras de horário do app.
- **Métricas (plano Barbearia)** — tela nova no painel com o funil do app
  do cliente: quantos visitaram a página, começaram a agendar, escolheram
  horário, entraram ou se cadastraram e confirmaram — e em que passo
  desistem. Com a origem de cada visita (`?origem=instagram`, `whatsapp`,
  `qrcode` nos links do kit da barbearia), mostra qual canal traz mais
  agendamento. Gráficos de funil e de evolução no período.
  Eventos no nosso banco, sem rastreador de terceiros: anônimos, sem nome,
  e-mail ou telefone, com um identificador de visita aleatório — e citados
  na política de privacidade. A tabela de eventos cresce rápido: guardar
  o detalhe por alguns meses e o resumo por dia depois.
- **"Meus horários" de todas as barbearias** — com a marca Átrio, o cliente
  que usa duas barbearias vê os horários das duas num lugar só.
- **Marca própria (premium)** — app e endereço com o nome da barbearia, para
  quem quiser: o antigo "app instalado com o nome da barbearia" e o
  subdomínio por barbearia viram esta oferta.
- **Login com Google** — o botão já está na tela. Falta o cliente OAuth no
  Google Cloud, o provedor no Supabase e guardar as escolhas do agendamento
  durante o redirecionamento.
- **Tela de equipe** — convidar e remover pessoas pelo painel (hoje a
  conta da equipe é criada no Supabase).
- **Foto de capa da barbearia** — no topo do Início; falta onde cadastrar.
- **Comissão por profissional** — vai ser pedida no primeiro mês; o
  atendimento já guarda profissional e preço.
- **Fechamento de caixa** do dia.
- **Código do agendamento** com busca no painel.
- **Relatórios** além do Financeiro atual.

## Ordem sugerida

1. ~~Código no GitHub, região e ambientes~~ — feito.
2. ~~Login da equipe → painel no banco~~ — feito.
3. ~~E-mails de conta, nova senha e cadastro de barbearia~~ — feito.
4. ~~Decidir a cor e a regra de concorrentes → URL nova e marca Átrio~~ —
   feito.
5. ~~E-mails do agendamento → planos no banco → sino de notificações →
   confirmação pelo barbeiro → painel de celular~~ — feito.
6. Segurança: ~~monitoramento~~, ~~Advisors~~ e ~~captcha~~ feitos; LGPD
   pronta no código (falta a revisão jurídica).
7. Banco de produção (com o plano Pro), hospedagem, PWA.
8. Estudo de preços → piloto → cobrança → lançamento.
