# Roadmap até o lançamento

O que falta para uma barbearia de verdade usar o Átrio no dia a dia — e para
vender a assinatura.

**Onde estamos (19/10/2026).** As telas do painel e do app do cliente estão
prontas. O banco está no Supabase, com as regras de agenda, acesso e caixa
testadas (`npm run test:db`). O **app do cliente já usa o banco** e foi
testado de ponta a ponta: cadastro, agendamento, reagendamento e
cancelamento. O **painel ainda roda no modo demonstração**: sem login da
equipe, o agendamento feito pelo cliente não aparece na agenda da barbearia.

**Como ler.** Cada item tem um tamanho relativo — **P** (pequeno, cabe numa
sessão), **M** (médio, uma ou duas sessões), **G** (grande, várias). As fases
1 a 4 **bloqueiam o lançamento**; o resto vem depois.

---

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
- [ ] **E-mails de verdade** — P/M. O envio padrão do Supabase é para
      testes: limite baixo por hora e, pelo que sei, entrega só para e-mails
      da equipe do projeto (confirmar no painel). Antes de abrir para
      clientes: SMTP próprio (Resend, Brevo…), modelos em português e
      **"Confirm email" religado**.
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
      (Cloudflare Pages, Vercel ou similar), domínio do Átrio, e o app do
      cliente em `…/b/<barbearia>`.
- [ ] **PWA de verdade** — P. Testar a instalação em Android e iPhone com o
      app publicado (HTTPS).
- [ ] **Fuso da barbearia** — P/M. O banco já confere expediente no fuso da
      barbearia; o app ainda calcula no fuso do aparelho. Coincide em São
      Paulo, mas um cliente viajando veria horários errados.
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
- [ ] **Página do Átrio e preço** — M. Onde a barbearia conhece o produto e
      assina.
- [ ] **Canal de suporte** — P. WhatsApp ou e-mail, com quem responde e em
      quanto tempo.

---

## Depois do lançamento

Pedidos previsíveis, já considerados no modelo — nenhum exige migração:

- **App instalado com o nome e o ícone da barbearia** — hoje, instalado, ele
  aparece como "Agendar horário" com o ícone do Átrio. Deixado para depois
  por decisão de 19/10/2026: não é necessário agora.
- **Login com Google** — o botão já está na tela. Falta o cliente OAuth no
  Google Cloud, o provedor no Supabase e guardar as escolhas do agendamento
  durante o redirecionamento.
- **Lembretes por WhatsApp** — o que mais reduz falta.
- **Comissão por profissional** — vai ser pedida no primeiro mês; o
  atendimento já guarda profissional e preço.
- **Fechamento de caixa** do dia.
- **Subdomínio por barbearia** (`barbearia.atrio.com.br`).
- **Código do agendamento** com busca no painel.
- **Relatórios** além do Financeiro atual.

## Ordem sugerida

1. ~~Código no GitHub, região e ambientes~~ — feito.
2. Login da equipe → painel no banco. Fecha o fluxo de ponta a ponta.
3. E-mails, nova senha e cadastro de barbearia.
4. LGPD, PIN, captcha, monitoramento, plano Pro.
5. Integração contínua, hospedagem, PWA.
6. Piloto → cobrança → lançamento.
