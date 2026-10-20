# Roadmap até o lançamento

O que falta para uma barbearia de verdade usar o Átrio no dia a dia — e para
vender a assinatura.

**Onde estamos (20/10/2026).** Painel e app do cliente rodam no banco
(Supabase), com as regras de agenda, acesso e caixa testadas
(`npm run test:db`), e o fluxo de ponta a ponta funciona: o cliente marca, a
barbearia vê em tempo real, atende e recebe. Os e-mails de conta saem pelo
domínio `atrioagenda.com.br`. O app do cliente está no layout novo (Início e
Perfil). Falta o que está abaixo — com a **direção do produto** decidida em
20/10/2026 (seção a seguir) mudando parte do que vem antes do lançamento.

**Como ler.** Cada item tem um tamanho relativo — **P** (pequeno, cabe numa
sessão), **M** (médio, uma ou duas sessões), **G** (grande, várias). As fases
1 a 4 **bloqueiam o lançamento**; o resto vem depois.

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
| **Barbearia** | Equipe | Tudo do Solo + painel completo: financeiro, dashboard, vários profissionais, PIN do balcão |
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
- [ ] **E-mails do agendamento** — M. O que mais entrega valor ao plano Solo:
      confirmação para o cliente, aviso de novo horário para a barbearia,
      aviso de cancelamento e reagendamento, e lembrete na véspera. Disparo
      pelo banco (função + Resend), com agendamento para o lembrete.
- [x] **URL `atrioagenda.com.br/<barbearia>`** — feito em 20/10/2026. Sem
      o `/b/`; endereços reservados pelo Átrio recusados no banco; links
      antigos redirecionam com o resto do caminho.
- [x] **Marca Átrio no topo** — feito em 20/10/2026. "Átrio Agenda" na
      moldura, a barbearia (logo, nome, saudação) no topo do Início, o app
      instalado como "Átrio Agenda" e a cor do Átrio para todas. Falta a
      foto de capa da barbearia, que ainda não tem onde cadastrar.
- [ ] **Planos no banco** — M. Plano na assinatura (`tenant_accounts`) e o
      que cada um libera: o painel completo só no plano Barbearia. A regra
      vale no banco, não só na tela.
- [ ] **Painel enxuto do plano Solo** — M/G. A agenda do dia no celular,
      folgas e horários de trabalho; reaproveita o painel atual.
- [x] **Fotos no Storage** — feito em 19/10/2026. Foto de profissional e
      logo vão para o bucket `midia`, com envio só pela equipe da barbearia
      e na pasta dela; no banco fica o link.
- [x] **Ligar a ficha do balcão à conta do cliente** — feito em
      19/10/2026. No painel do atendimento, a equipe confirma "é a mesma
      pessoa"; o histórico do balcão passa a aparecer no app e os próximos
      já nascem ligados.

## Fase 2 — Segurança, LGPD e confiabilidade

- [ ] **LGPD** — M + revisão jurídica. Feito em 19/10/2026: **excluir minha
      conta** no app. Falta: política de privacidade e termos de uso,
      consentimento no cadastro e o papel do Átrio como operador no contrato
      com a barbearia.
- [x] **PIN no balcão** — feito em 19/10/2026. PIN de 4 números por conta
      da equipe, conferido no servidor (5 erros travam por 5 minutos), pedido
      para abrir o Financeiro e para cancelar atendimento, marcar falta,
      remover bloqueio, excluir despesa e desativar profissional ou serviço
      com horários futuros. Vale 5 minutos depois de digitado.
- [ ] **Proteção contra abuso** — P. Captcha no cadastro (o Supabase aceita
      Cloudflare Turnstile e hCaptcha) — sem ele, um robô cria mil contas e
      enche a agenda.
- [ ] **Monitoramento de erros** — P. Sentry (ou similar) nos dois apps: o
      erro que a barbearia não relata é o que faz ela cancelar a assinatura.
- [ ] **Plano Pro do Supabase** — P. Backup diário e projeto sem pausa por
      inatividade.
- [ ] **Advisors do Supabase** — P. Rodar os avisos de segurança e
      desempenho do painel e corrigir o que aparecer.

## Fase 3 — Publicação

- [x] **Integração contínua** — feito em 19/10/2026: GitHub Actions roda os
      testes do banco, da camada de dados e os builds de produção a cada push
      que toca `atrio/`. Falta, com o banco de produção: aplicar migrações a
      partir da `main`.
- [ ] **Banco de produção** — P. Criar o projeto em São Paulo, aplicar as
      migrações (sem o seed) e um `environment.prod.ts` em cada app apontando
      para ele.
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
- **"Meus horários" de todas as barbearias** — com a marca Átrio, o cliente
  que usa duas barbearias vê os horários das duas num lugar só.
- **Marca própria (premium)** — app e endereço com o nome da barbearia, para
  quem quiser: o antigo "app instalado com o nome da barbearia" e o
  subdomínio por barbearia viram esta oferta.
- **Login com Google** — o botão já está na tela. Falta o cliente OAuth no
  Google Cloud, o provedor no Supabase e guardar as escolhas do agendamento
  durante o redirecionamento.
- **Lembretes por WhatsApp** — o que mais reduz falta.
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
5. E-mails do agendamento → planos no banco → painel enxuto do Solo.
6. LGPD, captcha, monitoramento, plano Pro.
7. Banco de produção, hospedagem, PWA.
8. Estudo de preços → piloto → cobrança → lançamento.
