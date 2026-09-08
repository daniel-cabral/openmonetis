## MODIFIED Requirements

### Requirement: Classificação determinística das linhas

O sistema SHALL classificar cada linha do arquivo aplicando regras em ordem fixa, parando na
primeira que produzir candidato: fingerprint já gravado, parcela, valor exato dentro da janela de
data, tolerância de centavos com informação de parcela, e nome aprendido com período. A janela de
data SHALL ser de ±2 dias, aplicada tanto à data de lançamento quanto à data contábil. Uma regra que
produzir dois ou mais candidatos SHALL parar a linha como ambígua, sem nunca escolher
automaticamente.

#### Scenario: Casa dentro da janela de dois dias

- **WHEN** a linha é de 10/07 e existe lançamento de mesmo valor em 12/07
- **THEN** a linha casa com esse lançamento

#### Scenario: Não casa além de dois dias

- **WHEN** a linha é de 10/07 e o único lançamento de mesmo valor está em 13/07
- **THEN** a regra de valor exato não produz candidato para essa linha

#### Scenario: Dois candidatos na janela param a linha

- **WHEN** a linha tem dois lançamentos de mesmo valor dentro da janela
- **THEN** a linha é classificada como ambígua, com os dois candidatos listados
