# DESIGN.md — Átrio

Especificação do design system. Adaptada da versão gerada no Lovable
(React + Tailwind + shadcn) para a realidade do projeto: Angular 22 +
Tailwind v4 + Angular CDK.

**Regra de ouro:** componente nunca usa cor hexadecimal nem classe de cor crua
(`bg-[#...]`, `text-white`). Sempre um token semântico. É isso que permite
trocar a identidade visual por barbearia sem encostar em componente.

---

## 1. Onde mora cada coisa

| Arquivo | Conteúdo |
| --- | --- |
| `projects/shared/ui/src/styles/tokens.css` | primitivas e tokens semânticos |
| `projects/shared/ui/src/styles/theme.css` | ponte `@theme inline` com o Tailwind |
| `projects/shared/ui/src/styles/base.css` | camada base do documento |
| `projects/shared/ui/src/styles/utilities.css` | `surface`, `pill`, `hatch`, `on-ink`, `tabular` |
| `projects/shared/ui/src/lib/` | componentes |

Cada app importa `tailwindcss` e, na sequência, `shared/ui/src/styles/index.css`.

---

## 2. Fonte

| Item | Valor |
| --- | --- |
| Família | **Manrope**, pesos 400–800 |
| Fallback | `ui-sans-serif, system-ui, sans-serif` |
| Carregamento | `<link>` no `index.html` de cada app |
| Números | `font-feature-settings: 'tnum' 1` no `body` |
| Serifas | nenhuma |

Use a utility `tabular` em colunas de valores que precisam alinhar.

### Escala

| Uso | Classe |
| --- | --- |
| Título de página | `text-3xl font-extrabold tracking-tight` / `sm:text-4xl` |
| Seção de card | `text-lg font-bold` |
| Rótulo de indicador | `text-sm text-muted-foreground` |
| Valor de indicador | `text-3xl font-extrabold` |
| Corpo | `text-sm` |
| Botão, filtro, badge | `text-sm font-semibold` / `text-xs font-semibold` |

---

## 3. Cores

Duas camadas. Componentes só tocam na segunda.

**Primitivas** (`--atr-*`): a paleta crua, em OKLCH. É a única camada com cor
literal. O white-label sobrescreve `--atr-brand-*` em tempo de execução.

**Semânticas**: `--primary`, `--background`, `--card`, `--ink`, `--border`,
`--muted-foreground` e companhia, todas apontando para primitivas.

| Token | Hex de referência | Uso |
| --- | --- | --- |
| `--primary` | `#6C4DF6` | ação principal, item ativo, foco |
| `--primary-soft` | `#EEEAFE` | fundo de destaque, indicador em evidência |
| `--primary-soft-foreground` | `#4A2BD4` | texto sobre o roxo suave |
| `--background` | `#F5F5F9` | fundo geral |
| `--card` | `#FFFFFF` | cards, modais, inputs |
| `--ink` | `#20212B` | menu lateral, painel escuro |
| `--ink-muted` | `#9094A6` | texto secundário sobre grafite |
| `--muted-foreground` | `#5C5F6E` | texto de apoio no claro |
| `--border` | `#E4E4EC` | bordas |

> O `#727583` da especificação original reprova no contraste AA sobre branco
> (4,37:1). Escurecido para `#5C5F6E`, que dá 6,33:1. Todos os pares
> texto/fundo do sistema foram conferidos e passam de 4,5:1.

### Status — uso restrito

`--success` (verde, **Pago**), `--warning` (laranja, **Pendente** e **Não
compareceu**), `--destructive` (vermelho, **Cancelado**). Cada um tem um par
`-soft` / `-soft-foreground` para badges.

**Nunca** como cor decorativa, e **nunca sozinhas**: todo badge tem texto. A
bolinha colorida é reforço, não informação — num tablet sob luz forte, e para
quem não distingue as cores, ela some.

Estados do atendimento: Agendado = `neutral`; Em atendimento = `primary` com
ponto pulsante; Concluído = `success`; Cancelado = `destructive`; Não
compareceu = `warning`.

### Gráficos

`chart-1` roxo · `chart-2` roxo claro · `chart-3` verde · `chart-4` laranja ·
`chart-5` grafite. Em SVG: `fill="var(--chart-1)"`.

---

## 4. Forma, espaçamento e elevação

| Item | Valor |
| --- | --- |
| Raio base | `1rem` |
| Cards (`surface`) | `1.5rem` |
| Botões, filtros, pills | cápsula (`rounded-full`) |
| Alvo de toque | mínimo **44px** em todo controle |
| Sombra de card | `--shadow-soft`, sutil |
| Sombra de popover | `--shadow-strong` |
| Padding de seção | `p-5` / `sm:p-6` |
| Gap entre cards | `gap-4` |

Tema claro único. O contraste vem do menu grafite, não de um dark mode.

---

## 5. Componentes

| Componente | Seletor | Observação |
| --- | --- | --- |
| Ícone | `<atr-icon name="scissors" />` | Lucide embutido, sem dependência de runtime |
| Botão | `<button atrButton>` | **diretiva**, não invólucro |
| Badge | `<atr-badge tone="success">` | texto obrigatório |
| Avatar | `<atr-avatar name="..." />` | iniciais, cor derivada do nome |
| Card | `<atr-card heading="...">` | ação do cabeçalho via `[card-action]` |
| Cabeçalho de página | `<atr-page-heading heading="...">` | |
| Estado vazio | `<atr-empty-state heading="...">` | |
| Campo | `<atr-field label="...">` | o `<label>` envolve o controle |
| Controle | `<input atrInput>` | retângulo arredondado, altura 44px |
| Moldura de overlay | `<atr-surface-shell heading="...">` | cabeçalho fixo, corpo rolável, rodapé fixo |
| Confirmação | `AtrOverlay.confirm({...})` | substitui o `confirm()` do navegador |
| Chave liga/desliga | `<atr-switch [(checked)]="..." label="...">` | a linha inteira é o alvo de toque |

Diálogos e painéis laterais passam por `AtrOverlay` (`openDialog`, `openSheet`,
`confirm`), uma camada fina sobre o CDK Dialog — que é headless e já resolve
foco preso, Escape, `aria-modal` e devolução do foco.

O botão é diretiva sobre o elemento nativo para não perder `type`, `disabled`,
`form` e o comportamento de link do `<a>`.

Variantes: `default`, `soft`, `ink`, `outline`, `secondary`, `success`,
`destructive`, `ghost`, `link`. Tamanhos: `sm` 40px, `default` 44px, `lg` 48px,
`icon` 44×44.

### Ícones

Gerados em build a partir do `lucide-static` por `tools/generate-icons.mjs`.
Para acrescentar um, inclua o nome na lista do script e rode `npm run icons`.

Escolha deliberada: `lucide-angular` trava a versão do Angular por peer
dependency (hoje suporta até a 21) e quebraria o upgrade. O conjunto embutido
não tem esse problema.

---

## 6. Diferenças em relação ao protótipo

Mudanças feitas de propósito, não por omissão.

**Título e descrição saíram da barra superior.** O protótipo repetia a mesma
frase duas vezes na tela — uma na barra, outra no cabeçalho da página. Num
tablet em paisagem a altura é o recurso mais escasso. A barra superior ficou
só com controle do menu, selo de demonstração e perfil.

**Sem busca global e sem sino de notificação.** Nada ainda os alimenta.
Controle que não faz nada ensina o usuário a ignorar a interface.

**Sem percentual de crescimento nos indicadores.** Barbearia tem volume baixo
e variação diária alta; "+12% vs. ontem" seria ruído com cara de informação.

**O perfil mostra só o papel enquanto não há login.** Em vez de repetir
"Administrador" em duas linhas.

**Na Agenda, atendimento concluído não é verde.** O protótipo pintava de verde
todo atendimento concluído; ao fim do dia a grade inteira ficava verde e a cor
parava de informar — além de gastar o verde, reservado para "pago". A
intensidade agora segue a necessidade de atenção:

| Estado | Aparência |
| --- | --- |
| Em atendimento | roxo com anel — o que está acontecendo agora |
| Agendado | branco com borda |
| Concluído | cinza discreto |
| Cancelado | vermelho suave, riscado |
| Não compareceu | laranja suave |
| Bloqueado / fora do expediente | listras diagonais |

O ícone de relógio no canto do cartão marca **pagamento pendente**: é dinheiro
que o balcão esquece de cobrar, e precisa saltar sem depender de abrir o
atendimento.

**Datas não usam `capitalize` do CSS.** Ele produzia "Sexta-Feira, 16 De
Outubro". Só a primeira letra sobe.

**Em Profissionais, os serviços são checkbox, não radio.** A referência
desenhava círculos de radio numa seleção múltipla. O controle é `checkbox`
de verdade — o visual circular ficou, a semântica para teclado e leitor de
tela é a correta.

**As iniciais dos dias ganham rótulo acessível.** "D S T Q Q S S" tem dois S
e dois Q; a inicial sozinha não identifica o dia. Cada chip carrega `title` e
`aria-label` com o dia por extenso e se é dia de trabalho ou folga.

**O cartão do profissional adapta o bloco de expediente.** A referência mostra
uma faixa única, o que só funciona quando a jornada é igual todo dia —
barbearia raramente é, com sexta fechando mais tarde e sábado abrindo mais
cedo. Quando o horário é único, saem os dois blocos da referência; quando não
é, sai uma lista agrupada ("Seg–Qui 09:00 – 20:00", "Sáb 08:00 – 18:00").
Exibir o horário de um dia como se valesse para todos seria mentira, e um
"Varia" genérico não informa nada.

**O formulário avisa antes de achatar a jornada.** Ele edita um horário só e
aplica a todos os dias marcados, como a referência. Quando o profissional já
tem horários diferentes por dia, aparece um aviso antes de salvar.

**Desativar com agendamentos futuros pede confirmação**, dizendo quantos são e
que eles continuam de pé. Não existe excluir profissional, só desativar: o
histórico e o financeiro apontam para o cadastro.

---

## 7. PWA

`theme-color` grafite `#20212B`, manifesto em pt-BR, ícones de 72 a 512px,
service worker do `@angular/pwa`. A instalação só funciona em HTTPS ou
`localhost`.

O manifesto do booking é único por enquanto. Para cada barbearia ter o próprio
ícone e nome na tela inicial do celular, ele precisa ser gerado por tenant —
ver `docs/ARQUITETURA.md`.

---

## 8. Idioma e tom

Português do Brasil, direto e curto. Ações no infinitivo: "Agendar cliente",
"Registrar pagamento", "Nova despesa".

Financeiro: **recebimentos**, **despesas**, **saldo** (= recebimentos −
despesas). **Nunca "lucro"** — saldo de caixa não é resultado contábil, e
chamar assim induz o dono a uma conclusão errada sobre o próprio negócio.
