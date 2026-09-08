## MODIFIED Requirements

### Requirement: Parsing de fatura CSV do C6

O sistema SHALL interpretar o CSV de fatura de cartão do C6, usando `;` como separador. Cada linha SHALL produzir uma transação com `date` (Data de Compra, que é a data original da compra e não a do período da fatura), `installment` derivado do campo `Parcela`, `cardLast4`, `holderName` e `categoryRaw`. Linhas com valor negativo SHALL ser preservadas e classificadas em dois estados distintos: crédito desta fatura, ou pagamento da fatura anterior.

#### Scenario: Campo Parcela no formato N/M

- **WHEN** uma linha tem `Parcela` igual a `8/12`
- **THEN** a transação resultante tem `installment` igual a `{ current: 8, total: 12 }`

#### Scenario: Campo Parcela igual a Única

- **WHEN** uma linha tem `Parcela` igual a `Única`
- **THEN** a transação resultante não tem `installment`

#### Scenario: Data de compra anterior ao período da fatura

- **WHEN** uma fatura com vencimento em 2026-08-15 contém uma linha com `Data de Compra` igual a `14/01/2025`
- **THEN** a transação preserva `2025-01-14` como data, sem ser descartada nem reescrita para o período da fatura

#### Scenario: Estorno é crédito desta fatura

- **WHEN** uma linha tem `Valor (em R$)` negativo e descrição que não indica pagamento de fatura, como `Estorno Tarifa` de `-98.00`
- **THEN** a transação é preservada e classificada como crédito
- **AND** entra na soma usada na verificação de fechamento da fatura

#### Scenario: Pagamento da fatura anterior não pertence a esta fatura

- **WHEN** uma linha tem `Valor (em R$)` negativo e descrição indicando pagamento de fatura, como `Pag Fatura Boleto` de `-12164.10`
- **THEN** a transação é preservada e classificada como pagamento de fatura
- **AND** é excluída da soma usada na verificação de fechamento da fatura

#### Scenario: Compra em moeda estrangeira

- **WHEN** uma linha tem `Valor (em US$)` diferente de zero
- **THEN** a transação resultante tem `fx` com o valor em dólar e a cotação, além do valor em reais

### Requirement: Verificação aritmética de fechamento

O sistema SHALL verificar o fechamento por aritmética, de forma independente do resultado do matching. Para extrato, a variação do `Saldo do Dia` entre dias contábeis consecutivos SHALL ser comparada com a soma dos lançamentos daquele dia contábil. Para fatura, a soma de todas as linhas do arquivo, excluindo apenas as classificadas como pagamento de fatura, SHALL ser comparada com o total do cartão no período.

#### Scenario: Extrato fecha em todos os dias

- **WHEN** para cada dia contábil a diferença entre o saldo do dia e o do dia anterior é igual à soma dos lançamentos do dia
- **THEN** o painel de fechamento reporta que todos os dias batem

#### Scenario: Extrato com dia que não fecha

- **WHEN** em algum dia contábil a variação do saldo difere da soma dos lançamentos daquele dia
- **THEN** o painel de fechamento identifica o dia e a diferença
- **AND** reporta a divergência mesmo que todas as linhas do arquivo tenham sido classificadas como casadas

#### Scenario: Fatura fecha com crédito na soma

- **WHEN** o arquivo tem compras somando 13.034,33, um crédito de 98,00 e um pagamento de fatura de 12.164,10, e o total informado é 12.936,33
- **THEN** o painel de fechamento reporta que a fatura fecha, com diferença zero
