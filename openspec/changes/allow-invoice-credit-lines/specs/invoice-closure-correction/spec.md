## MODIFIED Requirements

### Requirement: Balde informativo para linhas que não são compra

Linhas classificadas como pagamento de fatura SHALL ser exibidas num balde informativo e NÃO SHALL
oferecer ação de escrita: elas quitam a fatura anterior, já constam como despesa da conta corrente,
e lançá-las duplicaria a saída. Linhas classificadas como crédito SHALL oferecer criação de
lançamento de **receita no cartão**, porque abatem o valor desta fatura.

#### Scenario: Pagamento da fatura anterior não oferece criação

- **WHEN** a fatura contém `Pag Fatura Boleto` de R$ 12.164,10
- **THEN** a linha aparece no balde informativo e nenhuma ação de escrita é oferecida para ela

#### Scenario: Adiantamento pode virar crédito no cartão

- **WHEN** a fatura contém `Inclusao de Pagamento` de R$ 5.222,62 e o usuário escolhe criar o lançamento
- **THEN** é criado um lançamento de receita no cartão, no período da fatura, abatendo o valor dela

#### Scenario: Estorno pode virar crédito no cartão

- **WHEN** a fatura contém `Estorno Tarifa` de R$ 98,00 e o usuário escolhe criar o lançamento
- **THEN** é criado um lançamento de receita no cartão, no período da fatura

#### Scenario: Crédito não lançado não altera nada

- **WHEN** o usuário deixa a linha de crédito em "Pular"
- **THEN** nenhum lançamento é criado e o valor da fatura no app permanece como está

## ADDED Requirements

### Requirement: Quitação anuncia o complemento antes de gravar

A tela de quitação SHALL exibir o valor da fatura, o total já abatido e o complemento que será
lançado, antes da gravação. Quando o complemento for zero, a tela SHALL informar que a fatura já
está coberta e NÃO SHALL criar lançamento.

#### Scenario: Complemento é anunciado

- **WHEN** o usuário aciona a quitação de uma fatura com saldo restante de R$ 6.899,44
- **THEN** a tela mostra o valor da fatura, o total abatido e o complemento a lançar, e só grava após confirmação

#### Scenario: Fatura coberta pelos créditos não gera lançamento

- **WHEN** os créditos e pagamentos do período cobrem o valor da fatura
- **THEN** a tela informa que a fatura já está coberta e nenhum lançamento de complemento é criado
