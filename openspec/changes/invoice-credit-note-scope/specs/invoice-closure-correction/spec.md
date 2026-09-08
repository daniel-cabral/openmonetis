## MODIFIED Requirements

### Requirement: Balde informativo para linhas que não são compra

Linhas classificadas como pagamento de fatura SHALL ser exibidas num balde informativo e NÃO SHALL
oferecer ação de escrita: elas quitam a fatura anterior, já constam como despesa da conta corrente,
e lançá-las duplicaria a saída. Linhas classificadas como crédito SHALL oferecer criação de
lançamento de receita no cartão, porque abatem o valor desta fatura. O lançamento criado a partir de
uma linha de crédito SHALL ser excluído de renda e despesa nos relatórios, e NÃO SHALL ser contado
como pagamento no cálculo da quitação.

#### Scenario: Pagamento da fatura anterior não oferece criação

- **WHEN** a fatura contém `Pag Fatura Boleto` de R$ 12.164,10
- **THEN** a linha aparece no balde informativo e nenhuma ação de escrita é oferecida para ela

#### Scenario: Adiantamento vira crédito no cartão, fora dos relatórios

- **WHEN** a fatura contém `Inclusao de Pagamento` de R$ 5.222,62 e o usuário escolhe criar o lançamento
- **THEN** é criado um lançamento de receita no cartão, no período da fatura
- **AND** esse lançamento não é contado como receita nos relatórios, orçamentos e insights

#### Scenario: Crédito não é contado como pagamento na quitação

- **WHEN** existe um crédito de R$ 5.222,62 lançado no cartão e a quitação calcula o saldo restante
- **THEN** o crédito é considerado uma única vez, por já reduzir o total da fatura, e não é somado de novo como pagamento

#### Scenario: Desfazer pagamento preserva os créditos

- **WHEN** o usuário desfaz o pagamento de uma fatura que tem créditos lançados
- **THEN** o complemento da quitação é removido e os lançamentos de crédito permanecem

#### Scenario: Crédito não lançado não altera nada

- **WHEN** o usuário deixa a linha de crédito em "Pular"
- **THEN** nenhum lançamento é criado e o valor da fatura no app permanece como está
