## ADDED Requirements

### Requirement: De-para aprendido de descriptor para nome de lançamento

O sistema SHALL manter, por usuário, um de-para entre a chave normalizada do descriptor do arquivo
bancário e o nome de um lançamento, usando a mesma normalização (`normalizeDescriptionKey`) já
aplicada ao aprendizado de categoria. O de-para SHALL ser gravado apenas na aplicação da
conciliação, junto das demais escritas, e nunca durante a revisão.

#### Scenario: Aprende ao confirmar um par manualmente

- **WHEN** o usuário confirma, no balde "só no banco", que a linha `CASA NOVA LOCADORA LTDA - EPP - Boleto` corresponde ao lançamento existente chamado `Aluguel`, e aplica a conciliação
- **THEN** o sistema grava o de-para da chave normalizada desse descriptor para o nome `Aluguel`

#### Scenario: Aprende ao criar lançamento com nome próprio

- **WHEN** o usuário cria um lançamento a partir de uma linha do banco e substitui o nome sugerido pelo nome próprio `Aluguel`, e aplica a conciliação
- **THEN** o sistema grava o de-para da chave normalizada do descriptor dessa linha para o nome `Aluguel`

#### Scenario: A chave é o descriptor do arquivo, nunca o nome digitado

- **WHEN** o usuário cria um lançamento a partir da linha `CASA NOVA LOCADORA LTDA - EPP - Boleto` e digita o nome `Aluguel`
- **THEN** o de-para é gravado sob a chave normalizada de `CASA NOVA LOCADORA LTDA - EPP - Boleto`, e não sob a de `Aluguel`

#### Scenario: Descriptor já conhecido é reaprendido com o nome mais recente

- **WHEN** existe de-para da chave para `Aluguel` e o usuário aplica uma conciliação em que a mesma chave é associada ao nome `Aluguel Sala Comercial`
- **THEN** o sistema substitui o nome gravado para essa chave, mantendo um único registro por usuário e chave

#### Scenario: Criação em fatura de cartão não alimenta o de-para

- **WHEN** o destino é um cartão e o usuário cria um lançamento digitando o nome `Uber - aeroporto`
- **THEN** o sistema não grava de-para para a chave desse descriptor

#### Scenario: Nenhum aprendizado sem decisão do usuário

- **WHEN** uma linha casa por qualquer regra do matcher sem que o usuário tenha confirmado um par manualmente nem digitado um nome
- **THEN** o sistema não grava nenhum de-para de nome para essa linha

### Requirement: Casamento por nome e período

O matcher SHALL oferecer uma regra que casa uma linha do arquivo com um lançamento do app quando a
chave normalizada do descriptor tem de-para conhecido, o nome do lançamento é exatamente o nome
aprendido, o período do lançamento é o período da linha e o sinal da transação (despesa ou
receita) é o mesmo. A regra SHALL ignorar data e valor, SHALL ser avaliada depois das regras de
fingerprint, parcela, exata e centavos e antes da classificação como ambígua, e SHALL valer
apenas quando o destino for uma conta.

#### Scenario: Recorrente com data e valor divergentes é reconhecido

- **WHEN** a linha `CASA NOVA LOCADORA LTDA - EPP - Boleto` de 11/08 no valor de R$ 2.356,51 tem de-para para `Aluguel` e existe no app um lançamento `Aluguel` do período 2026-08, lançado em 15/08 no valor de R$ 2.300,00
- **THEN** a linha casa com esse lançamento

#### Scenario: Regra mais forte tem precedência

- **WHEN** uma linha casaria tanto pela regra exata quanto pela regra de nome e período, com lançamentos diferentes
- **THEN** o casamento pela regra exata prevalece e a regra de nome e período não é avaliada para essa linha

#### Scenario: Dois lançamentos com o mesmo nome no período param a linha

- **WHEN** a chave tem de-para para `Aluguel` e existem dois lançamentos `Aluguel` no período da linha
- **THEN** a linha é classificada como ambígua com os dois candidatos, sem casamento automático

#### Scenario: Sinal diferente não casa

- **WHEN** a chave tem de-para para `Aluguel`, a linha do arquivo é uma receita e o lançamento `Aluguel` do período é uma despesa
- **THEN** a linha não casa por essa regra

#### Scenario: Lançamento em período diferente do da linha não casa

- **WHEN** a chave tem de-para para `Aluguel`, a linha é de 31/08 (período 2026-08) e o único lançamento `Aluguel` está no período 2026-09
- **THEN** a linha não casa por essa regra e segue para a classificação seguinte

#### Scenario: Destino cartão não usa a regra

- **WHEN** o destino da conciliação é um cartão e a chave normalizada do descriptor tem de-para gravado
- **THEN** a regra de nome e período não produz candidato para nenhuma linha desse arquivo

#### Scenario: Descriptor sem de-para não usa a regra

- **WHEN** a chave normalizada do descriptor não tem de-para gravado
- **THEN** a regra de nome e período não produz candidato para essa linha, qualquer que seja a semelhança de nome

### Requirement: Resolução de divergência de valor

O sistema SHALL apresentar como casada com divergência toda linha que a regra de nome e período
casou com valor diferente do valor do lançamento, exibindo o valor do app e o valor do arquivo, e
SHALL exigir uma escolha do usuário entre manter o valor lançado e atualizá-lo para o valor do
arquivo. Nenhum valor SHALL ser alterado sem essa escolha.

#### Scenario: Valores idênticos não pedem decisão

- **WHEN** a linha casa pela regra de nome e período e o valor do arquivo é igual ao do lançamento
- **THEN** a linha aparece como casada comum, sem pedir decisão

#### Scenario: Usuário atualiza o valor

- **WHEN** a linha está casada com divergência (app R$ 2.300,00, arquivo R$ 2.356,51), o usuário escolhe atualizar e aplica a conciliação
- **THEN** o lançamento passa a valer R$ 2.356,51 e recebe o fingerprint da linha

#### Scenario: Usuário mantém o valor lançado

- **WHEN** a linha está casada com divergência e o usuário escolhe manter, e aplica a conciliação
- **THEN** o lançamento mantém R$ 2.300,00 e recebe o fingerprint da linha

#### Scenario: Lançamento dividido não permite atualizar o valor

- **WHEN** a linha está casada com divergência e o lançamento correspondente é dividido entre pagadores
- **THEN** a opção de atualizar o valor é apresentada indisponível com o motivo, e a linha concilia mantendo o valor lançado

#### Scenario: Aplicar exige decisão em toda linha divergente

- **WHEN** existe ao menos uma linha casada com divergência sem escolha registrada
- **THEN** a aplicação não é permitida até que a escolha seja feita

#### Scenario: Desfazer restaura o valor anterior

- **WHEN** o usuário desfaz um lote em que atualizou o valor de um lançamento de R$ 2.300,00 para R$ 2.356,51
- **THEN** o lançamento volta a valer R$ 2.300,00 e perde o fingerprint gravado pelo lote

### Requirement: Nome editável no balde "só no banco"

O balde "só no banco" SHALL oferecer, por linha, um campo de nome do lançamento a criar,
pré-preenchido com o nome aprendido para a chave do descriptor quando houver e com o descriptor do
arquivo quando não houver. O lançamento criado SHALL usar o conteúdo desse campo como nome.

#### Scenario: Nome sugerido pelo de-para conhecido

- **WHEN** a linha `CASA NOVA LOCADORA LTDA - EPP - Boleto` cai no balde "só no banco" e a chave tem de-para para `Aluguel`
- **THEN** o campo de nome vem preenchido com `Aluguel`

#### Scenario: Nome sugerido pelo descriptor quando não há de-para

- **WHEN** a linha cai no balde "só no banco" e a chave não tem de-para
- **THEN** o campo de nome vem preenchido com o descriptor do arquivo

#### Scenario: Nome vazio bloqueia a criação

- **WHEN** o usuário apaga o conteúdo do campo de nome de uma linha marcada para criação
- **THEN** a aplicação não é permitida até que a linha tenha nome

### Requirement: Vínculo manual a lançamento existente

O balde "só no banco" SHALL oferecer, por linha, a ação de vincular a linha a um lançamento que já
existe, em qualquer tipo de destino. A lista de escolha SHALL conter os lançamentos do destino no
período da linha, inclusive os já consumidos por outra linha da mesma conciliação, e estes SHALL ser
apresentados como indisponíveis. Vincular SHALL gravar o fingerprint da linha no lançamento
escolhido, sem criar lançamento novo.

#### Scenario: Vínculo concilia sem criar lançamento

- **WHEN** o usuário vincula a linha `CASA NOVA LOCADORA LTDA - EPP - Boleto` ao lançamento `Aluguel` do período e aplica
- **THEN** o lançamento `Aluguel` recebe o fingerprint da linha e nenhum lançamento é criado

#### Scenario: Lançamento já consumido aparece indisponível

- **WHEN** o lançamento `Aluguel` do período já foi casado com outra linha da mesma conciliação
- **THEN** ele aparece na lista marcado como indisponível, e não pode ser escolhido

#### Scenario: Vínculo em fatura concilia sem aprender

- **WHEN** o destino é um cartão e o usuário vincula uma linha a um lançamento existente
- **THEN** a linha concilia e nenhum de-para de nome é gravado

### Requirement: Escopo do balde "só no app"

O balde "só no app" SHALL exibir, quando o destino for uma conta, apenas lançamentos cuja data
esteja dentro do intervalo real do arquivo, e, quando o destino for um cartão, apenas lançamentos
cujo período seja o período da fatura. A folga de busca aplicada para o matching SHALL permanecer
inalterada e não SHALL influenciar o que é exibido.

#### Scenario: Candidato fora do intervalo do extrato não é exibido

- **WHEN** o extrato cobre de 04/07 a 02/09 e existe um lançamento não casado em 03/07, trazido pela folga da busca
- **THEN** ele não aparece no balde "só no app"

#### Scenario: Lançamento de fatura anterior não é exibido

- **WHEN** a fatura tem período 2026-08, seu intervalo de datas alcança compras de novembro, e existe um lançamento não casado do período 2026-06
- **THEN** ele não aparece no balde "só no app"

#### Scenario: Candidato de período tocado continua alcançável pelo matching

- **WHEN** existe um lançamento do período 2026-08 com data de compra em 28/07, fora do intervalo de datas do arquivo
- **THEN** ele é buscado como candidato e pode casar pelas regras do matcher
