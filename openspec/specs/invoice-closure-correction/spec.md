# invoice-closure-correction Specification

## Purpose
TBD - created by archiving change add-reconciliation-name-mapping. Update Purpose after archive.
## Requirements
### Requirement: Classificação de linha da fatura em três estados

O parser da fatura SHALL classificar cada linha como compra, crédito ou pagamento de fatura, e
SHALL expor essa classificação num campo aditivo próprio, mantendo `isPurchase` inalterado. O
pagamento de fatura SHALL ser reconhecido pela descrição da linha.

#### Scenario: Compra

- **WHEN** a linha `SUPERMERCADOS ABC LOJA` tem valor 67.46
- **THEN** ela é classificada como compra

#### Scenario: Crédito

- **WHEN** a linha `Estorno Tarifa` tem valor -98.00
- **THEN** ela é classificada como crédito, não como pagamento de fatura

#### Scenario: Pagamento de fatura

- **WHEN** a linha `Pag Fatura Boleto` tem valor -12164.10
- **THEN** ela é classificada como pagamento de fatura

#### Scenario: O campo existente permanece intacto

- **WHEN** qualquer linha da fatura é interpretada
- **THEN** `isPurchase` continua sendo verdadeiro para valor maior ou igual a zero e falso caso contrário

### Requirement: Fechamento da fatura por soma líquida

A verificação aritmética da fatura SHALL comparar o total informado com a soma de todas as linhas
do arquivo exceto as classificadas como pagamento de fatura. Créditos SHALL entrar na soma.

#### Scenario: Fatura que fecha

- **WHEN** o arquivo tem compras somando 13.034,33, um crédito de 98,00 e um pagamento de fatura de 12.164,10, e o total informado é 12.936,33
- **THEN** o fechamento é reportado como fechado, com diferença zero

#### Scenario: Crédito ignorado produziria falso alarme

- **WHEN** o mesmo arquivo é avaliado somando apenas as linhas de valor positivo
- **THEN** o resultado seria 13.034,33 e uma divergência de 98,00 — comportamento que esta mudança substitui

#### Scenario: Divergência real é reportada

- **WHEN** a soma líquida do arquivo difere do total informado
- **THEN** o fechamento é reportado como não fechado, com a diferença

### Requirement: Balde informativo para linhas que não são compra

Linhas classificadas como crédito ou pagamento de fatura SHALL ser exibidas num balde próprio,
informativo, e NÃO SHALL oferecer a ação de criar lançamento nem qualquer outra ação de escrita.

#### Scenario: Pagamento de fatura não oferece criação

- **WHEN** a fatura contém `Pag Fatura Boleto` de 12.164,10
- **THEN** a linha aparece no balde informativo e nenhuma ação de criação é oferecida para ela

#### Scenario: Linhas não-compra saem do balde "só no banco"

- **WHEN** a fatura contém um crédito e um pagamento de fatura
- **THEN** nenhuma das duas aparece no balde "só no banco"

### Requirement: Recálculo do fechamento ao informar o total

O fechamento da fatura SHALL ser recalculado quando o total informado mudar, sem exigir novo
carregamento do arquivo.

#### Scenario: Total informado depois de avançar

- **WHEN** o usuário avança para a revisão com o total em branco e depois digita 12.936,33
- **THEN** o painel de fechamento passa a ser exibido com o resultado, sem refazer o upload

#### Scenario: Total corrigido

- **WHEN** o usuário já tem um fechamento exibido e altera o total informado
- **THEN** o fechamento é recalculado com o novo valor

