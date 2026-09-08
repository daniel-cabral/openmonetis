## ADDED Requirements

### Requirement: Quitação abate todo pagamento de fatura do período

Ao quitar uma fatura, o sistema SHALL calcular o saldo restante abatendo todos os pagamentos já
feitos para aquele cartão e período, incluindo os que não foram registrados pelo fluxo de fatura —
adiantamentos lançados na conta corrente e reconhecidos como pagamento de fatura. Quando o saldo
restante for zero ou negativo, o sistema NÃO SHALL criar lançamento de complemento.

#### Scenario: Adiantamento fora do fluxo de fatura é abatido

- **WHEN** a fatura soma R$ 19.063,54, houve um pagamento de R$ 12.164,10 pelo fluxo de fatura e dois adiantamentos de R$ 5.222,62 e R$ 2.000,00 lançados na conta corrente como pagamento de fatura do mesmo período
- **THEN** o saldo restante é zero e nenhum lançamento de complemento é criado

#### Scenario: Saldo restante real gera complemento

- **WHEN** a fatura soma R$ 19.063,54 e o único pagamento do período é de R$ 12.164,10
- **THEN** o sistema cria um lançamento de complemento de R$ 6.899,44

#### Scenario: Pagamento maior que a fatura não vira lançamento negativo

- **WHEN** os pagamentos do período somam mais que o valor da fatura
- **THEN** nenhum lançamento de complemento é criado, e a quitação é registrada sem erro

### Requirement: Complemento é anunciado antes de gravar

A tela de quitação SHALL exibir o valor da fatura, o total já pago e o complemento que será lançado,
antes de a gravação acontecer. O usuário SHALL poder cancelar diante desses números.

#### Scenario: Usuário vê o complemento antes de confirmar

- **WHEN** o usuário aciona a quitação de uma fatura com saldo restante
- **THEN** a tela mostra o valor da fatura, o total abatido e o complemento a lançar, e só grava após confirmação

#### Scenario: Sem complemento, a quitação não anuncia lançamento

- **WHEN** o saldo restante é zero
- **THEN** a tela informa que a fatura já está coberta pelos pagamentos e nenhum lançamento é anunciado
