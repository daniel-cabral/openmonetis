## ADDED Requirements

### Requirement: Cadastro de viagens

O usuário SHALL poder criar, editar e excluir viagens com nome, data de início, data de fim
(inclusivas) e anotação opcional. O sistema NÃO SHALL aceitar viagem cujo intervalo se sobreponha a
outra viagem do mesmo usuário. Excluir uma viagem SHALL desvincular seus lançamentos sem apagá-los.

#### Scenario: Sobreposição rejeitada

- **WHEN** existe "Lisboa" de 12/05 a 22/05 e o usuário cria "Porto" de 20/05 a 25/05
- **THEN** a criação é rejeitada com mensagem indicando o conflito com "Lisboa"

#### Scenario: Exclusão preserva lançamentos

- **WHEN** o usuário exclui "Lisboa", que tem 24 lançamentos vinculados
- **THEN** os 24 lançamentos continuam existindo, sem viagem

### Requirement: Campo Viagem no lançamento

O diálogo de lançamento SHALL exibir o campo "Viagem". Ao criar, o campo SHALL vir preenchido com a
viagem cujo intervalo contém a data da compra, e o usuário SHALL poder limpar ou escolher qualquer
viagem. Transferências e lançamentos `AUTO_FATURA` NÃO SHALL exibir o campo.

#### Scenario: Pré-preenchimento pela data

- **WHEN** o usuário cria um lançamento com data da compra 14/05/2026 e existe "Lisboa" de 12/05 a 22/05
- **THEN** o campo "Viagem" vem com "Lisboa"

#### Scenario: Vínculo manual fora do intervalo

- **WHEN** o usuário lança em 02/03 uma passagem e escolhe "Lisboa"
- **THEN** o lançamento fica vinculado a "Lisboa"

### Requirement: Vínculo vale para a série e a divisão

Vincular ou desvincular um lançamento parcelado, recorrente ou dividido SHALL aplicar o mesmo
`viagem_id` a todas as linhas da série e do grupo de divisão.

#### Scenario: Passagem parcelada

- **WHEN** o usuário vincula a parcela 1/10 da TAP a "Lisboa"
- **THEN** as 10 parcelas ficam vinculadas a "Lisboa"

### Requirement: Sugestões de vínculo

A página da viagem SHALL listar como sugestões os lançamentos sem viagem com data da compra no
intervalo, excluindo transferências e `AUTO_FATURA`, e SHALL permitir vincular os selecionados em
lote. Lançamentos vinculados SHALL poder ser desvinculados.

#### Scenario: Vincular em lote

- **WHEN** o usuário marca "Uber 13/05" e "Pingo Doce 14/05" nas sugestões e confirma
- **THEN** os dois passam a pertencer à viagem e saem das sugestões

### Requirement: Custo líquido da viagem

O total da viagem SHALL ser a soma das despesas vinculadas da pessoa admin menos as receitas
vinculadas da pessoa admin, contando lançamentos pagos e não pagos. A página SHALL exibir custo
líquido, despesas e reembolsos, e quebras por categoria, por cartão/conta e por pessoa.

#### Scenario: Reembolso abate o total

- **WHEN** a viagem tem R$ 9.212,30 em despesas do admin e R$ 800,00 de receita vinculada do admin
- **THEN** o custo líquido exibido é R$ 8.412,30

#### Scenario: Parte de outra pessoa fora do total

- **WHEN** um jantar de R$ 300,00 é dividido entre o admin (R$ 150,00) e Ana (R$ 150,00)
- **THEN** o custo líquido soma R$ 150,00 e a quebra por pessoa mostra Ana com R$ 150,00
