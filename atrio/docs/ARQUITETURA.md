# Arquitetura

Decisões tomadas, com o motivo. Quando uma delas for revista, atualize aqui
junto — o valor deste documento está em explicar o *porquê*, que o código não
consegue contar sozinho.

---

## Camadas

```
admin / booking          telas, rotas, estado de tela
      ↓
@atrio/ui                design system (não conhece o domínio)
@atrio/core              configuração, tenant, white-label
      ↓
@atrio/data              modelos + contratos de repositório
      ↓
demo/ (hoje)             em memória, localStorage
supabase/ (depois)       Postgres, Auth, Realtime — esquema em /supabase
```

A regra que sustenta tudo: **o componente depende do contrato, nunca da
implementação**. `provideDemoData()` e, adiante, `provideSupabaseData()` são a
única linha que muda.

Isso compra três coisas concretas:

1. A interface inteira é construída e revisada antes de existir backend.
2. Teste injeta um fake, sem banco nenhum.
3. A troca de backend não encosta em tela nenhuma — e já aconteceu uma vez:
   o plano era Firebase, e a escolha final foi Supabase (ver "Backend").

---

## Multi-tenancy

Todo documento tem `tenantId`. Desde o primeiro dia, com um cliente só.

Não é zelo prematuro: a Row Level Security do banco filtra por esse campo, e acrescentar isolamento depois significa migrar dados em produção de
um cliente pagante. É das refatorações mais caras que existem.

O tenant vem da **custom claim** do usuário autenticado — nunca de parâmetro
de rota no admin, que seria trocável pela barra de endereço.

### Assinatura

`tenant.subscription` fica no documento do tenant e é lido pelas regras de
segurança. Quando a mensalidade para, o acesso degrada sozinho para somente
leitura. Sem isso, cobrar depende de desligar na mão.

`TenantContext.isActive()` é só a camada de interface. A trava de verdade é
server-side.

---

## O agendamento é o coração

### Conflito de horário precisa ser resolvido no servidor

Validar no cliente não basta. Dois celulares marcando o mesmo horário ao mesmo
tempo passam os dois pela validação local e gravam. O cliente chega, a cadeira
está ocupada, e a barbearia cancela a assinatura.

A checagem tem de acontecer dentro de uma **transação no servidor** (Cloud
Function callable). `AppointmentRepository.create()` existe justamente para ser
uma chamada a essa função, não uma escrita direta.

É o primeiro requisito técnico não-visual do projeto.

### Preço e duração são congelados na marcação

`Appointment` grava `price`, `durationMinutes`, `serviceName` e `endsAt` por
cópia. Reajustar a tabela de serviços não pode reescrever o faturamento do mês
passado nem reabrir buracos em agendas já fechadas.

---

## Quem faz o quê: um lado só

O vínculo entre profissional e serviço mora **apenas** em
`Professional.serviceIds`. `Service.professionalIds` existiu por um tempo e
foi removido.

Guardar a relação dos dois lados parece conveniente — cada consulta lê o
documento que já tem em mãos — e é a origem garantida de divergência: a tela
de Profissionais editava um lado, a de Serviços editaria o outro, e nada
avisaria quando discordassem. O bug só apareceria no agendamento, como um
profissional que some da lista de um serviço que ele faz.

O custo de ter um lado só é varrer os profissionais para descobrir quem
realiza um serviço. São poucos por barbearia, então é irrelevante — e a tela
de Serviços escreve o vínculo por `ProfessionalRepository.setServiceAssignment`,
que altera vários profissionais numa operação só. Metade deles atualizados
deixaria o catálogo discordando da equipe, então no banco isso é uma transação.

---

## O horário da barbearia é derivado

Não existe campo de horário de funcionamento no tenant. O horário real é a
união das jornadas dos profissionais ativos: a barbearia abre quando o
primeiro começa e fecha quando o último termina, porque é quando existe
alguém para atender.

Um campo separado seria uma segunda fonte de verdade — o mesmo erro do vínculo
profissional↔serviço. A vitrine anunciaria 09:00, o cliente tentaria marcar às
09:00 e não haveria horário nenhum, porque ninguém trabalha a essa hora. As
Configurações exibem o horário derivado, em leitura, com link para a tela de
Profissionais.

---

## Financeiro

Regras que a modelagem existe para garantir:

1. **Recebimento só vira lançamento quando o pagamento é registrado.**
   Atendimento concluído e não pago não entra em "total recebido".
2. **`occurredAt` é a data do dinheiro**, não a do atendimento. Corte feito
   sexta e pago sábado conta no sábado.
3. **`appointmentId` é único entre recebimentos** — a trava contra lançamento
   duplicado quando a tela é submetida duas vezes.
4. **Lançamento não se edita no lugar**: estorna e relança. O histórico precisa
   reconstruir qualquer fechamento passado.
5. **Saldo = recebimentos − despesas.** Não é lucro contábil, e a interface
   nunca usa essa palavra.

Registrar pagamento escreve em dois lugares (o atendimento e o lançamento). As
duas escritas são **uma operação só** — batch ou transação. Pagamento
registrado sem lançamento deixa o caixa errado, que é o pior tipo de bug para
a confiança no produto.

---

## Dinheiro em centavos

`Cents = number`, sempre inteiro. `4500` é R$ 45,00.

Ponto flutuante não representa 0,1 exatamente, e o erro acumulado aparece
exatamente onde não pode: no fechamento de caixa do dono. Formatação só na
exibição (`formatMoney`).

---

## Datas

ISO 8601 em string, não `Date`. Serializa direto para a API e o
localStorage, não sofre a mutabilidade silenciosa do `Date`, e é comparável.
Converte para `Date` só na borda de apresentação.

Intervalos são sempre `[início, fim)` — fim exclusivo. É o que impede o
atendimento da meia-noite de contar em dois dias.

**Pendência conhecida:** os cálculos de período usam o fuso do navegador. No
tablet da barbearia isso coincide com o fuso dela, então funciona hoje. Quando
o backend entrar, o cálculo precisa usar `tenant.timeZone` — o Brasil tem mais
de um fuso, e o dono em Rio Branco não pode ver o caixa fechar às 21h.

---

## White-label

O **admin** tem sempre a marca Átrio, identificando qual barbearia está
logada. O **booking** é que muda de cara.

Funciona assim: a barbearia escolhe UMA cor; `deriveBrandScale()` calcula
hover, fundo suave e cor de texto em OKLCH, mantendo L e C da paleta padrão.
O `BrandingService` sobrescreve as primitivas `--atr-brand-*` no `:root`, e
toda a camada semântica segue junto.

OKLCH e não HSL porque em OKLCH o L é perceptual: fixar L e variar o matiz
mantém o contraste. Em HSL, "L 55%" em amarelo e em azul têm luminosidade real
muito diferente, e o texto ficaria ilegível em metade das marcas.

A aplicação acontece em `provideAppInitializer`, antes da primeira pintura —
senão o cliente veria o roxo do Átrio piscar antes da cor da barbearia.

### Endereço do app do cliente

**v1:** por caminho — `agenda.atrio.com.br/b/barbearia-do-ze`. Simples:
qualquer hospedagem estática resolve sem wildcard de DNS. (O Supabase não
hospeda o front; a escolha da hospedagem ainda está aberta.)

**Depois:** por subdomínio — `barbearia-do-ze.atrio.com.br`. Cada barbearia
vira uma origem isolada, com ícone, nome e armazenamento próprios na tela
inicial do celular — a sensação de white-label que se vende. Custa wildcard DNS
e certificado — Cloudflare na frente resolve, qualquer que seja a
hospedagem.

A migração é chata mas não bloqueia o lançamento.

---

## Backend: Supabase (Postgres)

O plano inicial era Firebase, pela familiaridade com a ferramenta, com o
trade-off registrado: agendamento e financeiro são domínios relacionais com
muita agregação, e o Firestore não faz isso bem. Na hora de escolher, pesou
mais o domínio, e a escolha foi **Postgres pelo Supabase**:

- **Horário duplo impossível no próprio banco.** Uma *exclusion constraint*
  recusa dois atendimentos sobrepostos do mesmo profissional, para qualquer
  caminho de escrita e mesmo com duas gravações no mesmo instante. No
  Firestore, isso exigiria uma Cloud Function transacional escrita à mão.
- **Relatórios são SQL.** Somar por período, profissional e forma de
  pagamento é uma consulta, não um contador mantido por função — e todo bug
  de contador vira número errado na tela do dono.
- **Isolamento por barbearia na RLS**, com chaves estrangeiras compostas
  `(tenant_id, id)`: nem por bug um agendamento aponta para o profissional de
  outra barbearia.
- **Custo previsível** (plano fixo, não cobrança por leitura) e **sem
  aprisionamento**: é Postgres, muda de hospedagem quando quiser.

O que se perde em relação ao Firebase: a persistência offline pronta (ver
Offline). O esquema, as regras e os testes estão em `supabase/` — e o
`supabase/README.md` descreve o que muda no contrato dos repositórios.

---

## Como o cliente é identificado

O cliente entra com conta (e-mail e senha) antes de revisar o agendamento, e
"Meus horários" só abre com a conta. O contrato é `ClientAuth`, em
`@atrio/data`; o modo demonstração implementa no armazenamento local
(`DemoClientAuth`), e o Supabase Auth entra no lugar sem tocar nas telas.

**Por que a exigência vem só no fim.** Profissional, serviço e horário são
escolhidos sem conta; o login aparece no passo 4, no mesmo lugar, e a revisão
surge sozinha quando a sessão abre. Pedir conta antes de a pessoa ter
investido nas escolhas é o ponto em que ela mais desiste. O custo de exigir
conta continua real — quem chega para marcar um corte e encontra um cadastro
pode ir embora —, e por isso a criação de conta fica na mesma tela.

**O que mudou em relação à fase sem login.** Antes, nome e telefone ficavam
lembrados no aparelho, e "Meus horários" consultava por qualquer telefone
digitado: quem soubesse o número de outra pessoa via — e cancelava — os
horários dela. Com conta, a consulta usa o telefone DA conta, que é o que liga
a pessoa aos horários marcados no balcão antes de ela se cadastrar.

**Conta não é `Client`.** `ClientAccount` é da pessoa e vale para qualquer
barbearia do Átrio; `Client` é o cadastro dela dentro de uma barbearia, e
existe sem conta. A ligação (`Client.userId`) é feita pelo servidor ao gravar
o agendamento — o app grava `clientId: null` e não tem como se passar por
outro cliente. No banco, a leitura de "Meus horários" é filtrada pela RLS,
pela ficha ligada à conta — não pela tela, e não pelo telefone.

**Telefone não liga conta a histórico.** Telefone é identificador fraco —
gente troca de número, e ele é reatribuído —, e o da conta não é verificado.
Por isso horários marcados no balcão antes de a pessoa ter conta não aparecem
sozinhos em "Meus horários": ligar por telefone entregaria o histórico de
outra pessoa a quem cadastrasse o número dela. A ligação fica para a equipe,
ou para quando houver verificação por SMS. Entrar com Google e verificação do
e-mail ficam para quando o Supabase Auth entrar. O "Esqueci minha senha" do modo demonstração não
envia nada; a mensagem é a mesma do real, que não revela se o e-mail tem
conta.

---

## Offline

Barbearia tem internet ruim e o tablet fica no balcão. O Supabase não traz
persistência offline pronta, como o Firestore traria; a leitura da agenda
precisa de um cache no app (a última agenda carregada, guardada no aparelho).
O comportamento continua decidido assim:

- consulta da agenda offline: **sim**;
- confirmar agendamento offline: **não** — depende da checagem de conflito no
  servidor.

---

## Segurança no balcão compartilhado

O tablet fica logado o dia inteiro, ao alcance de qualquer um. A sessão da
barbearia permanece aberta, mas **Financeiro e ações destrutivas** (cancelar,
excluir despesa) devem pedir um PIN por usuário.

---

## LGPD

Nome e telefone de clientes finais são dados pessoais de terceiros sob
responsabilidade da barbearia; o Átrio é operador. Antes de vender:

- política de privacidade e consentimento no cadastro do cliente;
- caminho de exclusão a pedido — apaga o cliente, anonimiza o nome nos
  atendimentos passados e **preserva os valores do financeiro**;
- a responsabilidade como operador precisa estar no contrato de assinatura.

---

## Fora de escopo nesta fase

Comissão por profissional, fechamento de caixa, estoque, emissão fiscal,
integração bancária e folha de pagamento.

Comissão merece nota: a maioria dos barbeiros trabalha por porcentagem e isso
vai ser pedido no primeiro mês de uso. A modelagem já comporta — o atendimento
guarda `professionalId` e `price`, então comissão é uma camada de cálculo em
cima, não uma migração.
