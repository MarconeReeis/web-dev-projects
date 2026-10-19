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
fictícios guardados no `localStorage`. A grade de atendimentos se ajusta ao
horário em que você abre, então a Dashboard sempre mostra atendimentos
concluídos, um em andamento e os próximos. São gerados também 30 dias de
histórico, para os filtros de semana e mês e o Financeiro mostrarem algo real.

```bash
npm run test:db        # testa o esquema do banco (Postgres em WebAssembly)
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
  `@atrio/data/repositories`. Trocar demonstração por Supabase é mudar
  `provideDemoData()` por `provideSupabaseData()` no `app.config.ts`.
- **Quem faz o quê mora só em `Professional.serviceIds`.** A relação com
  serviços tem um lado só, de propósito — ver docs/ARQUITETURA.md.
- **O horário da barbearia é derivado** da jornada dos profissionais, não um
  campo. Mesmo motivo.
- **Componente não escreve cor crua.** Sempre um token semântico
  (`bg-primary`, `text-muted-foreground`). É o que faz o white-label funcionar.
- **Conflito de horário é problema do banco.** Uma *exclusion constraint* no
  Postgres recusa dois atendimentos sobrepostos do mesmo profissional, mesmo
  com dois celulares marcando no mesmo instante — ver `supabase/README.md`.

Detalhes em [DESIGN.md](DESIGN.md) e [docs/ARQUITETURA.md](docs/ARQUITETURA.md).
O que falta até o lançamento, em [docs/ROADMAP.md](docs/ROADMAP.md).

## Estado atual

Pronto: workspace, design system, camada de domínio, modo demonstração, shell
do admin, Dashboard, PWA nos dois apps, motor de disponibilidade, a tela de
Agenda — grade diária e semanal, bloqueio de horário, painel de detalhes com
as ações do atendimento e o cadastro de agendamento com horários livres
calculados — a tela de Profissionais, com cadastro, edição, jornada, serviços
realizados, foto e bloqueios, a tela de Serviços e preços, com catálogo,
duração, valores e profissionais habilitados, a tela de Financeiro, com
indicadores do período, movimentações, pendências, despesas e registro de
pagamento, e as Configurações, com dados da barbearia, contato da conta,
horário derivado e instalação do PWA.

No app do cliente: vitrine da barbearia com banner de destaque editável pelo
painel, lista de profissionais com especialidade, agendamento em quatro etapas
(profissional, serviço, dia e horário, revisão) com "qualquer profissional
disponível", conta do cliente — entrar, cadastro e recuperação de senha,
exigidos antes da revisão — e "Meus horários" com cancelamento, só com a
conta aberta. No modo demonstração, "Usar acesso demonstrativo" entra como
um cliente fictício que já tem histórico.

**O painel administrativo e o fluxo do cliente estão completos.** O backend
é Supabase: esquema, regras de acesso e operações de agenda estão em
`supabase/`, testados com `npm run test:db`. **O app do cliente já usa o
banco**; o painel continua no modo demonstração até existir o login da
equipe. A seguir: login do painel, a tela de nova senha e o painel no banco.

> Em modo demonstração os dois apps rodam em portas diferentes e, portanto, em
> origens diferentes: cada um tem o seu `localStorage`. Um agendamento feito no
> app do cliente **não** aparece no painel até os dois falarem com o mesmo
> backend.
