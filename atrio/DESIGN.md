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
| Família (painel) | **Manrope**, pesos 400–800 |
| Família (app do cliente) | **Plus Jakarta Sans**, pesos 400–800 |
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
histórico e o financeiro apontam para o cadastro. O mesmo vale para serviço.

**O aviso de preço só aparece quando o preço muda.** A referência mostrava o
aviso o tempo todo no formulário de serviço. Aviso permanente vira parte do
cenário e deixa de ser lido justamente na vez em que importa — então ele
aparece na alteração, e diz o valor antigo e o novo.

**O catálogo de serviços fica em ordem de cadastro, não alfabética.** O dono
pensa nisso como "a tabela", e a tabela tem a ordem que ele definiu. Inativos
vão para o fim.

**No Financeiro, "Pendentes" não é uma movimentação.** Enquanto o pagamento
não é registrado, não houve dinheiro e não existe lançamento. A aba continua
— é trabalho de balcão saber o que falta cobrar —, mas quando está ativa a
tabela troca de cabeçalho, perde a coluna "Forma" (não há forma de pagamento
ainda) e ganha a ação de registrar. Misturar as duas coisas na mesma lista
convidaria a somar pendência com recebimento.

**"Período personalizado" abre um seletor de datas.** Na referência era um
botão que não fazia nada — aqui e na Dashboard, onde escolher o período
personalizado caía silenciosamente no dia de hoje. Escolhido o período, a
cápsula passa a mostrá-lo ("01/10 a 10/10") em vez do rótulo genérico, senão
o usuário perde de vista qual recorte está olhando.

**Registrar pagamento abre direto na escolha da forma.** Quem clicou em
"Registrar" já decidiu o que quer fazer; mostrar os detalhes antes seria um
toque a mais para chegar no mesmo lugar.

**Nas Configurações, o endereço é estruturado.** A referência usava um campo
de texto livre. O app do cliente vai precisar da cidade e do CEP separados
para exibir e abrir no mapa, e extrair isso de uma string digitada à mão não
funciona.

**O horário de funcionamento é exibido, não editado.** Ele é a união das
jornadas dos profissionais — ver docs/ARQUITETURA.md. Um campo editável seria
uma segunda fonte de verdade.

**"Instalar como aplicativo" instala de verdade quando dá.** O Chromium avisa
que o app é instalável; guardamos esse aviso e oferecemos um botão. As
instruções por plataforma continuam, mas só quando o navegador não oferece o
caminho direto — Safari, por exemplo. Quem está configurando o tablet da
barbearia não deveria precisar seguir instruções de menu.

**O botão de salvar diz o estado.** "Salvar alterações" quando há mudança,
"Tudo salvo" desabilitado quando não há. Botão sempre habilitado não informa
se o que foi digitado chegou a ser gravado.

---

## 9. App do cliente

Mesmos tokens, mesma fonte, mesmos componentes do painel. As referências de
layout serviram para o **ritmo** — passo a passo, chips de dia roláveis, barra
inferior, ação fixa no rodapé —, não para a pele: nada de laranja, verde ou
cantos quadrados.

Diferenças de forma, por ser celular:

| Item | Painel | App do cliente |
| --- | --- | --- |
| Navegação | menu lateral grafite | barra inferior, duas seções |
| Largura | até 1600px | coluna de 2xl, centrada |
| Ação principal | no cabeçalho | fixa no rodapé, largura total |

**A barra inferior tem dois itens, não cinco.** Um app de barbearia tem dois
assuntos — marcar e acompanhar. As referências de e-commerce trazem busca e
favoritos porque têm catálogo; aqui inventariam seções para preencher.

**O agendamento fica fora da barra inferior.** Durante o fluxo não há para
onde navegar senão adiante ou para trás, e a barra roubaria espaço do polegar
na tela com mais toques.

**Ordem: profissional → serviço → horário → confirmação.**

A escolha do profissional vem primeiro porque a lista de serviços do passo
seguinte sai **filtrada** pelo que aquela pessoa realiza — o beco do "ele não
faz barba" deixa de existir. Numa barbearia a fidelidade ao barbeiro pesa mais
que a preferência por serviço.

> Isto inverte a ordem que o projeto usou primeiro (serviço → profissional). O
> argumento original era justamente evitar o beco, mas filtrar a lista resolve
> melhor: o beco só trocava de lado. A inversão também acabou com três
> caminhos de contagens diferentes — hoje o fluxo tem **sempre quatro
> etapas**, e os atalhos da tela inicial apenas pré-selecionam.

**"Qualquer profissional" é a primeira opção.** Boa parte das pessoas não tem
preferência, e obrigar a escolher esconde horários: o cliente vê a agenda de
um barbeiro lotada e desiste, sem saber que o outro tinha a mesma hora livre.
Escolhendo essa opção, o passo de serviço mostra o catálogo inteiro.

### Passos do agendamento

| Etapa | Tela | Rodapé mostra |
| --- | --- | --- |
| 1 | Escolha o profissional | o profissional escolhido |
| 2 | Escolha o serviço | serviço e preço |
| 3 | Data e horário | dia, início–fim e, em destaque, o preço |
| 4 | Identificação (sem conta), depois Revisão | nada: o botão ocupa a largura e leva o valor |

O passo de serviço repete o profissional num cartão de contexto no topo: mudar
de etapa apaga da tela a escolha anterior, e na etapa 4 o cliente não deveria
precisar lembrar o que marcou três telas atrás. O rodapé fixo tem a mesma
função — resumo à esquerda, ação à direita.

**O progresso é segmentado, não contínuo.** Quatro barras dizem quantas etapas
faltam; uma barra única só diz quanto já andou.

### Data e horário

No topo, o que está sendo marcado — foto, serviço, profissional, duração e
preço — com um lápis que volta ao serviço.

**Os dias andam em semanas, não numa faixa rolável.** Sete colunas fixas, duas
setas e um calendário. A faixa escondia os dias fora da tela e não dizia até
onde dava para ir; e rolar na horizontal dentro de uma página que rola na
vertical é o gesto que mais escapa do polegar. A semana começa **hoje**, não no
domingo, para nenhuma semana abrir com dias mortos. A janela é de três semanas
(`BOOKING_HORIZON_DAYS`); as setas param nas pontas.

**O calendário complementa, não substitui.** Marcar para a semana que vem
continua a um toque; o calendário é para o caso raro de marcar longe. Fecha ao
escolher, ao tocar fora e com Esc.

**Dia sem vaga fica esmaecido e não aceita toque** — e "sem vaga" é a conta
real (expediente, atendimentos, bloqueios, hora já passada), não só "trabalha
nesse dia da semana": sábado lotado é tão inútil quanto domingo fechado. Para
isso a página consulta a janela inteira de uma vez, em vez de dia a dia. O
calendário só desabilita o que está fora da janela: pintar a disponibilidade de
um mês inteiro não compensa, e o dia vazio já tem saída na tela.

**Dia vazio oferece a próxima data livre**, em vez de só dizer "tente outra".
Quando o dia de hoje já acabou — o caso mais comum à noite — o cliente chega
nesse estado e resolve com um toque. O app **não pula sozinho** para o próximo
dia livre: trocar a data sem o cliente pedir faz parecer que ele marcou o dia
errado.

| Diferença da referência | Por quê |
| --- | --- |
| "Outubro de 2026", não "Outubro De 2026" | `capitalize` capitaliza a preposição; só a primeira letra sobe |
| Mês pelo dia do meio da semana | semana de 31/10 a 6/11 é de novembro |
| "Hoje" no lugar do dia da semana | a primeira coluna nem sempre é óbvia |
| Título do mês em `text-xl` | em 375px, `text-2xl` cortava o ano ao lado dos três botões |

### Revisão

Uma ficha com uma linha por decisão — barbearia, profissional, serviço,
duração, data, horário, cliente — e o total em destaque. Cada decisão tem um
**Editar** que volta ao passo que a tomou, sem perder o resto. Duração e
barbearia não têm: decorrem do serviço e do link por onde o cliente entrou.

**Sem conta, a revisão espera pela identificação** — no mesmo passo, com o
título "Identificação". Não é uma etapa a mais na contagem: quem já entrou
pula direto para a revisão, e um contador que muda de tamanho conforme a
pessoa está logada ou não é o tipo de inconsistência que o fluxo de quatro
etapas fixas existe para evitar. Também não é uma rota de login: sair da
página descartaria as escolhas. Ao abrir a sessão, a revisão aparece sozinha.

A linha "Cliente" mostra nome e telefone da conta, com **Trocar** (sair e
entrar com outra) no lugar de Editar: editar dados da conta é perfil, não
agendamento.

**"Pagamento na barbearia"** em verde: o app não cobra nada, e dizer isso
antes do botão tira a dúvida que faz a pessoa desistir na última tela.

No rodapé, só a ação — o resumo já é a tela inteira —, com o valor no próprio
botão.

| Diferença da referência | Por quê |
| --- | --- |
| "Segunda-feira, 19 de outubro" | `capitalize` subia "Feira" e "De" |
| Profissional "qualquer" mostra quem ficou e "Quem estiver livre no horário" | a escolha foi da agenda, não do cliente |

### Tela inicial

Ordem: cabeçalho com saudação → destaque → próximo agendamento (quando há) →
agendar → **profissionais** → serviços → a barbearia → instalar.

Profissionais vêm antes dos serviços porque são o primeiro passo do
agendamento. Ficam numa faixa rolável de uma linha: cabe sem empurrar os
serviços para baixo da dobra.

**O cabeçalho não tem borda.** Ele se dissolve no conteúdo, como na
referência; uma linha separando saudação de conteúdo dividiria a tela em duas
sem que haja duas coisas. À esquerda, avatar e saudação; à direita, o logo da
barbearia — que é assinatura, não botão.

**Sem login, a saudação é "Olá!".** Quando o aparelho já guarda um nome de um
agendamento anterior, mostra o nome. Com autenticação, entram nome e foto da
conta.

**O destaque é editável pela barbearia** (Configurações → Destaque no app do
cliente) e some quando desligado. Banner que só o desenvolvedor muda não serve
para promoção: a data passa e ele fica mentindo na tela do cliente. Espaço
vazio é melhor que anúncio genérico ocupando o topo.

**Serviços em cards de duas colunas**, com bloco lilás e ícone no lugar da
foto. Foto por serviço é o próximo passo natural — exige campo no modelo e
upload no painel.

### Agendamento confirmado

Sem cabeçalho nem progresso: não há para onde voltar — o agendamento já
existe — e etapa nenhuma a contar. Selo verde, "Seu horário está marcado!" e
um comprovante: data, início–fim, serviço, profissional, valor ("na
barbearia") e endereço. Os botões ficam no pé da tela.

O comprovante lê o **agendamento gravado**, não o que estava na tela: preço e
nome do serviço são os congelados na marcação, e o profissional é quem de
fato ficou com o atendimento — no "qualquer profissional", a escolha é da
agenda.

| Diferença da referência | Por quê |
| --- | --- |
| Sem "Código" | nada no sistema o usa: o painel não busca por código e o balcão acha o cliente por nome e horário. Volta quando a agenda puder buscar por ele |
| "Te esperamos na Navalha & Co." com um ponto só | a referência dobrava o ponto quando o nome já termina em um |
| "Segunda-feira, 19 de outubro" | o mesmo `capitalize` das outras telas |

O endereço sai de `formatAddress` (`@atrio/data`), o mesmo da vitrine: dois
formatos para a mesma barbearia parecem dois lugares diferentes.

### Entrar

Uma tela, três modos — entrar, criar conta, recuperar senha —, trocados no
lugar. A mesma peça (`bkg-sign-in`) serve ao passo 4 e a "Meus horários"; só o
título e o texto de apoio mudam. Ela não navega ao terminar: quem a usa observa
a sessão.

| Decisão | Por quê |
| --- | --- |
| Erro de login não diz se foi o e-mail ou a senha | dizer entrega quem tem conta |
| "Esqueci minha senha" responde igual exista a conta ou não | mesmo motivo |
| Tamanho mínimo da senha cobrado só no cadastro | no login, "curta demais" para uma senha errada só confunde |
| E-mail atravessa os modos, a senha não | quem errou a senha e foi recuperar não redigita o e-mail |
| Mínimo de 6 caracteres | é o do Firebase Auth; exigir mais barraria quem ele aceita |
| "Usar acesso demonstrativo" só com `demoMode` | entra por `signIn` como qualquer pessoa, com um cliente que o seed já atende |
| Rodapé fixo some na identificação | a tela tem os próprios botões; dois "continuar" seriam um a mais |

### Barras fixas: sombra, não linha

Nenhuma barra fixa do app do cliente usa borda. A linha corta a tela em duas
partes iguais em peso visual; a sombra apenas sugere que há conteúdo passando
por baixo, que é o que de fato acontece.

| Barra | Tratamento |
| --- | --- |
| Navegação inferior | cápsula flutuante com `floating`, descolada das bordas |
| Rodapé de ação (fluxo de agendamento) | `edge-top` |
| Cabeçalho | sem nada: mesmo fundo do conteúdo |

**Na navegação, só o item ativo mostra o rótulo.** Com dois itens, ícone
sozinho seria ambíguo — um calendário pode ser qualquer coisa —, e exibir os
dois rótulos o tempo todo engorda a barra sem informar nada novo.

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
