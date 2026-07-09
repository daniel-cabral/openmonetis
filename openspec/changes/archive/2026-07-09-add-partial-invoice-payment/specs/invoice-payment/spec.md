## ADDED Requirements

### Requirement: Pagamento parcial de fatura

O sistema SHALL permitir registrar o pagamento de um valor arbitrário de uma fatura de cartão, com o valor debitado de uma conta escolhida. Cada pagamento parcial SHALL ser gravado como um lançamento `Despesa` na conta, com `cardId` nulo e nota no formato `AUTO_FATURA:<cardId>:<period>:<shortId>`, onde `<shortId>` garante unicidade entre múltiplos pagamentos da mesma fatura.

#### Scenario: Pagamento parcial abaixo do saldo em aberto

- **WHEN** o usuário confirma um pagamento de valor `V` menor que o saldo em aberto da fatura, com uma conta e data válidas
- **THEN** o sistema grava uma `Despesa` de valor `V` na conta com nota `AUTO_FATURA:<cardId>:<period>:<shortId>`
- **AND** a fatura permanece com `paymentStatus = "pendente"`
- **AND** o saldo em aberto exibido diminui em `V`

#### Scenario: Múltiplos pagamentos parciais na mesma fatura

- **WHEN** o usuário registra vários pagamentos parciais no mesmo cartão e período
- **THEN** cada pagamento gera um lançamento independente com `shortId` distinto
- **AND** o saldo em aberto reflete o total do cartão menos a soma de todos os pagamentos parciais

#### Scenario: Pagamento parcial que zera o saldo

- **WHEN** o usuário confirma um pagamento de valor igual ao saldo em aberto restante
- **THEN** o sistema grava o lançamento do pagamento
- **AND** marca a fatura como `paymentStatus = "pago"`
- **AND** marca as compras do cartão no período como `isSettled`

### Requirement: Validação do valor do pagamento

O sistema SHALL rejeitar pagamentos com valor menor ou igual a zero ou maior que o saldo em aberto da fatura. A validação SHALL ser aplicada no servidor como fonte da verdade, além de qualquer validação no cliente, e o saldo em aberto SHALL ser calculado dentro da transação de banco para evitar condições de corrida.

#### Scenario: Valor acima do saldo em aberto

- **WHEN** o usuário tenta pagar um valor maior que o saldo em aberto
- **THEN** o sistema rejeita a operação com uma mensagem genérica de valor inválido
- **AND** nenhum lançamento é criado

#### Scenario: Fatura já quitada

- **WHEN** o usuário tenta registrar um pagamento parcial em uma fatura cujo saldo em aberto é zero
- **THEN** o sistema rejeita a operação informando que a fatura já está quitada

#### Scenario: Cartão ou conta de outro usuário

- **WHEN** o `cardId` ou o `paymentAccountId` não pertence ao usuário autenticado
- **THEN** o sistema rejeita a operação e não cria nenhum lançamento

### Requirement: Saldo em aberto derivado

O sistema SHALL calcular o saldo em aberto de uma fatura como `|SUM(amount) das compras do cartão no período| − SUM(|amount|) dos pagamentos com nota AUTO_FATURA:<cardId>:<period>:*`. O valor pago NÃO SHALL ser armazenado em coluna própria; é sempre derivado dos lançamentos.

#### Scenario: Query de fatura expõe pago e restante

- **WHEN** o dashboard carrega as faturas de um período
- **THEN** cada fatura expõe `paidAmount` (soma dos pagamentos parciais) e `outstandingAmount` (total menos pago)

#### Scenario: Cancelamento de um pagamento parcial

- **WHEN** o usuário apaga o lançamento de um pagamento parcial pela UI de lançamentos
- **THEN** o saldo em aberto da fatura volta a incluir aquele valor, sem ação adicional (o saldo é derivado)
- **AND** o campo `paymentStatus` NÃO é revertido automaticamente pela exclusão — permanece uma flag explícita, revertida apenas pela ação "desfazer pagamento" (`updateInvoicePaymentStatusAction` com status `pendente`), consistente com o comportamento pré-existente do pagamento cheio

### Requirement: Pagamentos de fatura não contam como renda nem despesa

O sistema SHALL garantir que lançamentos de pagamento de fatura (nota com prefixo `AUTO_FATURA:`), incluindo pagamentos parciais, sejam excluídos dos cálculos de renda e de despesa do dashboard e relatórios.

#### Scenario: Pagamento parcial não aparece em renda

- **WHEN** um pagamento parcial é registrado no período
- **THEN** ele não é somado à renda total do período no dashboard

#### Scenario: Pagamento parcial não aparece em despesa

- **WHEN** um pagamento parcial é registrado no período
- **THEN** ele não é somado à despesa total do período no dashboard (as compras do cartão já representam a despesa)

### Requirement: Quitação reconcilia pagamentos parciais

Ao quitar uma fatura (pagamento cheio), o sistema SHALL cobrar apenas o saldo em aberto restante — total da fatura menos os pagamentos parciais já registrados — nunca o total bruto.

#### Scenario: Quitar fatura com parciais já pagos

- **WHEN** o usuário quita uma fatura que já recebeu pagamentos parciais
- **THEN** o lançamento de fechamento tem valor igual ao saldo em aberto restante
- **AND** a soma de todos os pagamentos da fatura equivale ao total, sem cobrança em dobro

#### Scenario: Quitar fatura já coberta por parciais

- **WHEN** os pagamentos parciais já cobriram todo o saldo e o usuário aciona a quitação
- **THEN** o sistema apenas marca a fatura como `pago` sem criar um novo lançamento de pagamento

### Requirement: Exibição do saldo parcial na UI

O sistema SHALL manter os dois status de fatura existentes (`pendente`/`pago`) e, enquanto a fatura não estiver quitada, exibir o valor pago e o valor restante em vez de introduzir um status "parcial". O campo de valor do dialog de pagamento SHALL vir pré-preenchido com o saldo em aberto.

#### Scenario: Dialog mostra pago e restante

- **WHEN** o usuário abre o dialog de pagamento de uma fatura com pagamentos parciais
- **THEN** o dialog exibe "Pago" e "Restante" e o campo de valor vem preenchido com o saldo restante

#### Scenario: Lista de faturas mostra o restante

- **WHEN** uma fatura `pendente` possui pagamentos parciais
- **THEN** a lista de faturas exibe o valor restante com o badge "Em aberto"
