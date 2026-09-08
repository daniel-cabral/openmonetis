## MODIFIED Requirements

### Requirement: Resolução de divergência de valor

O arquivo do banco SHALL ser a autoridade sobre o valor. Sempre que uma linha casar com um
lançamento de valor diferente, por qualquer regra de casamento ou por vínculo manual, o sistema
SHALL alinhar o valor do lançamento ao do arquivo ao aplicar, e SHALL exibir a divergência
(`app → arquivo`) na revisão antes disso. Nenhuma escolha do usuário SHALL ser exigida, e a
divergência NÃO SHALL bloquear a aplicação. Lançamento dividido SHALL ficar com o valor inalterado,
com o motivo visível na linha.

#### Scenario: Valores idênticos não produzem alinhamento

- **WHEN** a linha casa e o valor do arquivo é igual ao do lançamento
- **THEN** a linha aparece como casada comum e nenhum valor é alterado

#### Scenario: Valor é alinhado ao do arquivo

- **WHEN** a linha casa com um lançamento de R$ 2.300,00 e o arquivo traz R$ 2.356,51, e o usuário aplica a conciliação
- **THEN** o lançamento passa a valer R$ 2.356,51 e recebe o fingerprint da linha

#### Scenario: Vínculo manual também alinha o valor

- **WHEN** o usuário vincula à mão a linha ao lançamento `Unimed Mãe`, cujo valor lançado é uma estimativa diferente da do arquivo, e aplica
- **THEN** o lançamento passa a valer o valor do arquivo, e não a estimativa

#### Scenario: Divergência de centavos vinda da tolerância de parcela

- **WHEN** uma linha de fatura de R$ 86,59 casa pela tolerância de centavos com um lançamento de R$ 86,61
- **THEN** a divergência é reportada e o lançamento passa a valer R$ 86,59

#### Scenario: Lançamento dividido não tem o valor alterado

- **WHEN** a linha casa com divergência e o lançamento correspondente é dividido entre pagadores
- **THEN** a linha concilia mantendo o valor lançado, e a razão é exibida na própria linha

#### Scenario: Divergência não bloqueia a aplicação

- **WHEN** existem linhas casadas com divergência de valor
- **THEN** a aplicação continua permitida, e o único bloqueio possível é criação com nome vazio

#### Scenario: Desfazer restaura o valor anterior

- **WHEN** o usuário desfaz um lote em que o valor de um lançamento foi alinhado de R$ 2.300,00 para R$ 2.356,51
- **THEN** o lançamento volta a valer R$ 2.300,00 e perde o fingerprint gravado pelo lote
