# Átrio

Plataforma de gestão para barbearias, vendida por assinatura. Duas aplicações
PWA sobre a mesma base:

| App | Quem usa | Onde roda |
| --- | --- | --- |
| **admin** | dono e atendentes da barbearia | tablet Android em paisagem, no balcão |
| **booking** | cliente final | celular, instalável sem loja de aplicativos |

O admin tem sempre a marca Átrio, identificando qual barbearia está logada. O
booking é white-label: logo, nome e cor são da barbearia.

## Rodando

```bash
npm install
npm start              # admin em http://localhost:4200
npm run start:booking  # booking em http://localhost:4300
```

Requer **Node 22.22.3+, 24.15+ ou 26+** (exigência do Angular 22).

Nenhum backend é necessário: o app sobe em **modo demonstração**, com dados
fictícios gerados para o dia corrente e guardados no `localStorage`. A grade de
atendimentos se ajusta ao horário em que você abre, então a Dashboard sempre
mostra atendimentos concluídos, um em andamento e os próximos.

```bash
npm run build          # compila os dois apps
npm run icons          # regenera o conjunto de ícones (ver tools/)
```

## Estrutura

```
projects/
├── admin/                  aplicação do painel (prefixo adm-)
│   └── src/app/
│       ├── layout/         shell, menu lateral, barra superior
│       ├── features/       uma pasta por seção, carregada sob demanda
│       └── shared/         componentes reusados entre seções do admin
├── booking/                aplicação do cliente (prefixo bkg-)
└── shared/
    ├── core/   @atrio/core  configuração, tenant, white-label
    ├── data/   @atrio/data  modelos, repositórios, modo demonstração
    └── ui/     @atrio/ui    design system (componentes + tokens CSS)
```

As libs são consumidas direto do código-fonte (os `paths` do `tsconfig.json`
apontam para `public-api.ts`), então não existe passo de build intermediário
durante o desenvolvimento.

## Decisões que valem saber antes de mexer

- **Dinheiro é inteiro, em centavos.** `4500` é R$ 45,00. Ponto flutuante erra
  no fechamento de caixa.
- **Todo documento tem `tenantId`.** Multi-tenant desde o primeiro dia, mesmo
  com um cliente só — acrescentar isolamento depois significa migrar produção.
- **Componente não conhece backend.** As telas dependem dos contratos em
  `@atrio/data/repositories`. Trocar demonstração por Firebase é mudar
  `provideDemoData()` por `provideFirebaseData()` no `app.config.ts`.
- **Quem faz o quê mora só em `Professional.serviceIds`.** A relação com
  serviços tem um lado só, de propósito — ver docs/ARQUITETURA.md.
- **Componente não escreve cor crua.** Sempre um token semântico
  (`bg-primary`, `text-muted-foreground`). É o que faz o white-label funcionar.
- **Conflito de horário é problema do servidor.** A validação local do modo
  demonstração não sobrevive a dois celulares marcando ao mesmo tempo.

Detalhes em [DESIGN.md](DESIGN.md) e [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Estado atual

Pronto: workspace, design system, camada de domínio, modo demonstração, shell
do admin, Dashboard, PWA nos dois apps, motor de disponibilidade, a tela de
Agenda — grade diária e semanal, bloqueio de horário, painel de detalhes com
as ações do atendimento e o cadastro de agendamento com horários livres
calculados — a tela de Profissionais, com cadastro, edição, jornada, serviços
realizados, foto e bloqueios, e a tela de Serviços e preços, com catálogo,
duração, valores e profissionais habilitados.

A seguir: tela de Financeiro (lista de movimentações, despesas, registro de
pagamento fora da Agenda), Configurações, o app do cliente além da vitrine,
autenticação e Firebase.
