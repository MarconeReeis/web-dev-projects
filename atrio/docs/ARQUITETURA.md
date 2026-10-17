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
firebase/ (depois)       Firestore, Auth, Cloud Functions
```

A regra que sustenta tudo: **o componente depende do contrato, nunca da
implementação**. `provideDemoData()` e, adiante, `provideFirebaseData()` são a
única linha que muda.

Isso compra três coisas concretas:

1. A interface inteira é construída e revisada antes de existir backend.
2. Teste injeta um fake, sem emulador do Firebase.
3. Se o Firestore se mostrar o backend errado para a parte financeira, a troca
   não encosta em tela nenhuma.

---

## Multi-tenancy

Todo documento tem `tenantId`. Desde o primeiro dia, com um cliente só.

Não é zelo prematuro: as regras de segurança do Firestore filtram por esse
campo, e acrescentar isolamento depois significa migrar dados em produção de
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
deixaria o catálogo discordando da equipe, então em Firestore isso é um batch.

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

ISO 8601 em string, não `Date`. Serializa direto para Firestore e
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

**v1:** por caminho — `agenda.atrio.com.br/b/barbearia-do-ze`. Simples, o
Firebase Hosting resolve sem wildcard de DNS.

**Depois:** por subdomínio — `barbearia-do-ze.atrio.com.br`. Cada barbearia
vira uma origem isolada, com ícone, nome e armazenamento próprios na tela
inicial do celular — a sensação de white-label que se vende. Custa wildcard DNS
e certificado, que o Firebase Hosting não entrega bem; resolve com Cloudflare
na frente.

A migração é chata mas não bloqueia o lançamento.

---

## Firebase: o que ainda precisa ser decidido

A escolha é pelo Firebase por domínio da ferramenta. Vale registrar o
trade-off: agendamento e financeiro são domínios relacionais com muita
agregação (relatórios por período, por profissional, por forma de pagamento),
e o Firestore não faz isso bem. A alternativa técnica melhor encaixada seria
Postgres (Supabase, com Row Level Security mapeando multi-tenancy).

Indo de Firebase, dois pontos exigem cuidado deliberado:

1. Escrita de agendamento **sempre** via Cloud Function transacional.
2. Relatórios calculados a partir de uma coleção de movimentações imutável,
   nunca recalculados sobre documentos editáveis.

Contadores denormalizados mantidos por Cloud Function são o caminho usual para
agregação no Firestore — e todo bug de contador vira um número errado na tela
do dono da barbearia.

---

## Offline

Barbearia tem internet ruim e o tablet fica no balcão. A persistência offline
do Firestore ajuda, mas o comportamento precisa ser decidido explicitamente:

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
