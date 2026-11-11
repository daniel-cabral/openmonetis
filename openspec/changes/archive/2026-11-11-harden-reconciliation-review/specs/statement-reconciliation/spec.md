## ADDED Requirements

### Requirement: Aviso de casamento suspeito

O sistema SHALL marcar como suspeita, na revisão, toda linha casada (por qualquer regra, inclusive
fingerprint) cujo lançamento do app tenha data anterior ao início do arquivo (menor `date` ou
`postedDate` das linhas), quando o destino é conta, ou que tenha sido casada por fingerprint com valor
diferente do valor da linha. A regra de data NÃO SHALL valer para fatura, cujas parcelas trazem a
data da compra original. Diferença de valor em casamento por outra regra (conta estimada, como a
Cemig) NÃO SHALL ser tratada como suspeita. Linhas
suspeitas SHALL aparecer num balde próprio, "Precisa da sua decisão (N)", acima de "Casadas", com o
motivo em português e a decisão pré-selecionada em "Manter casamento". O aviso NÃO SHALL bloquear o
Aplicar.

#### Scenario: Fernanda casada com Terapia anterior ao arquivo

- **WHEN** o extrato cobre 12/10 a 11/11 e a linha "Pix enviado para FERNANDA M FERNANDES" de 26/10, R$ 275,00, casa por nome e período com "Terapia - Fernanda" de 11/10
- **THEN** a linha aparece em "Precisa da sua decisão" com o motivo "Casou com “Terapia - Fernanda” de 11/10, antes do início do arquivo (12/10). O débito desse lançamento pode ter sido outro."
- **AND** a contagem de "Casadas" não inclui essa linha

#### Scenario: Colégio com valor divergente casado por fingerprint

- **WHEN** a linha "COLEGIO SANTO AGOSTINHO DIVINO" de 15/10, R$ 1.560,85, casa por fingerprint com "Mensalidade Colégio Santo Agostinho" de R$ 1.643,00
- **THEN** a linha aparece em "Precisa da sua decisão" com o motivo "Valor diferente: o lançamento “Mensalidade Colégio Santo Agostinho” tem R$ 1.643,00. Manter alinha o valor ao do arquivo."
- **AND** a linha tem um controle de decisão, que antes não existia para casamento com valor divergente

#### Scenario: Parcela antiga na fatura não é suspeita

- **WHEN** uma linha de fatura com data de compra 14/01/2025 casa por parcela, com o mesmo valor, com um lançamento do período da fatura
- **THEN** a linha fica em "Casadas", sem aviso

#### Scenario: Conta estimada com valor diferente não é suspeita

- **WHEN** a linha da CEMIG de 16/10, R$ 106,28, casa por nome e período com o lançamento de R$ 110,00
- **THEN** a linha fica em "Casadas", sem aviso, com o texto de que o valor será alinhado

#### Scenario: Casamento comum não gera aviso

- **WHEN** uma linha de 15/10 casa por valor exato com um lançamento de 15/10 de mesmo valor
- **THEN** a linha fica em "Casadas", sem aviso

### Requirement: Desfazer casamento na revisão

Toda linha casada SHALL oferecer as decisões "Manter casamento", "Criar lançamento novo", "Vincular a
outro lançamento" e "Pular": no balde de suspeitas por um seletor, e nas demais casadas por um botão
"Desfazer casamento" que abre as mesmas opções. Escolher qualquer opção diferente de "Manter" numa
linha casada por fingerprint SHALL limpar, ao aplicar, esse fingerprint do lançamento antigo, antes de
criar ou vincular. O lançamento antigo NÃO SHALL ter valor nem status de pagamento alterados. Nenhuma
correção de casamento SHALL exigir SQL.

#### Scenario: Colégio desfeito vira lançamento novo

- **WHEN** o usuário escolhe "Criar lançamento novo" na linha do Colégio casada por fingerprint e aplica
- **THEN** o fingerprint sai da "Mensalidade Colégio Santo Agostinho", que continua paga com R$ 1.643,00
- **AND** um lançamento de R$ 1.560,85 é criado com o fingerprint da linha, sem ser recusado pelo índice único

#### Scenario: Fernanda vinculada ao lançamento certo

- **WHEN** o usuário escolhe "Vincular a outro lançamento" na linha da Fernanda e aponta outro lançamento
- **THEN** a linha concilia com o lançamento escolhido
- **AND** "Terapia - Fernanda" de 11/10 fica como estava

#### Scenario: Só desfazer já é uma decisão aplicável

- **WHEN** a única decisão da revisão é "Pular" numa linha casada por fingerprint
- **THEN** o Aplicar fica habilitado e, ao aplicar, só o fingerprint do lançamento antigo é limpo

### Requirement: Saldo previsto antes de aplicar

A revisão SHALL mostrar, numa barra fixa junto do Aplicar, o saldo do app previsto após aplicar
contra o saldo final do arquivo, com a diferença. Para extrato, o saldo previsto SHALL usar a regra do
card da conta (saldo inicial mais lançamentos pagos da pessoa administradora) limitada aos lançamentos
com data até o último dia do arquivo, somada ao efeito das decisões atuais: criações, alinhamentos de
valor e confirmações que tornam pago um lançamento pendente. Linhas em Pular ou Ignorar NÃO SHALL
afetar a previsão. O saldo final do arquivo SHALL ser o Saldo do Dia do último dia contábil.
Lançamentos pagos com data depois do fim do arquivo SHALL ser listados à parte, com nome, data e
valor. Para fatura, o total da fatura no app após aplicar SHALL ser comparado ao total informado. A
previsão SHALL ser recalculada a cada decisão, aparecer em verde ("Bate") quando a diferença é zero e
em âmbar caso contrário, e NÃO SHALL bloquear o Aplicar.

#### Scenario: Mensalidade paga depois do fim do arquivo

- **WHEN** o extrato termina em 11/11 com saldo final R$ 843,44 e o app tem "Mensalidade Colégio Santo Agostinho" de R$ 1.643,00 marcada como paga em 22/11
- **THEN** a mensalidade aparece em "pagos depois do fim do arquivo" com data 22/11 e valor -R$ 1.643,00
- **AND** ela não entra no saldo previsto, que exclui datas posteriores a 11/11

#### Scenario: Fernanda mantida mostra a diferença antes do Aplicar

- **WHEN** o card da conta mostra -R$ 524,56, a mensalidade de 22/11 está paga, o saldo final do extrato é R$ 843,44 e a linha da Fernanda segue em "Manter casamento"
- **THEN** a barra mostra saldo do app após aplicar R$ 1.118,44 contra R$ 843,44 e "Diferença de R$ 275,00" em âmbar

#### Scenario: Desfazer Fernanda fecha o saldo

- **WHEN** no cenário anterior o usuário troca a linha da Fernanda para "Criar lançamento novo"
- **THEN** a barra passa a mostrar R$ 843,44 contra R$ 843,44 e "Bate" em verde, sem novo upload

#### Scenario: Total da fatura previsto

- **WHEN** a revisão de uma fatura tem total informado e o usuário marca linhas para criar ou mantém casamentos com valor alinhado
- **THEN** a barra mostra o total da fatura no app após aplicar contra o total informado, com a diferença

### Requirement: Criação em lote no balde só no banco

O cabeçalho do balde "Só no banco" SHALL ter o botão "Marcar todas como Criar", que muda para "Criar"
apenas as linhas que estão em "Pular", preservando as demais decisões.

#### Scenario: Marcar todas como Criar

- **WHEN** o balde tem 22 linhas, 20 em Pular, 1 em Vincular e 1 em Ignorar, e o usuário aciona "Marcar todas como Criar"
- **THEN** as 20 linhas passam a Criar e as outras duas mantêm a decisão

### Requirement: Indicador de pago não conciliado no extrato da conta

A tela de extrato da conta SHALL mostrar, ao lado do status de pago, um ícone discreto com a dica
"Pago, mas não conciliado com o extrato" em todo lançamento pago sem fingerprint de conciliação cuja
data seja igual ou posterior à do primeiro lançamento conciliado da conta. O indicador NÃO SHALL
aparecer na fatura de cartão.

#### Scenario: Mensalidade marcada como paga por engano

- **WHEN** a conta tem lançamentos conciliados desde 01/09 e "Mensalidade Colégio Santo Agostinho" de 22/11 está paga sem fingerprint
- **THEN** a linha da mensalidade mostra o indicador com a dica "Pago, mas não conciliado com o extrato"

#### Scenario: Histórico anterior à primeira conciliação fica limpo

- **WHEN** um lançamento pago sem fingerprint tem data anterior ao primeiro lançamento conciliado da conta
- **THEN** a linha não mostra o indicador

## MODIFIED Requirements

### Requirement: Aprendizado de categoria por descriptor

O sistema SHALL registrar em `import_category_mappings` o par descriptor normalizado e categoria sempre que uma linha for casada com um lançamento que já tem categoria, e também sempre que uma linha virar lançamento criado na conciliação (do balde só no banco, de uma ambígua ou de um casamento desfeito) com categoria escolhida, gravando junto a subcategoria da criação. A normalização SHALL remover prefixo de adquirente e sufixo numérico de loja. A categoria sugerida MUST ser apresentada pré-preenchida e editável, e MUST NOT ser aplicada sem confirmação do usuário.

#### Scenario: Match alimenta o de-para

- **WHEN** a linha `ADRENALINA NUTRICAO ES` é casada com um lançamento cuja categoria é `Saúde`
- **THEN** o par entre o descriptor normalizado e a categoria `Saúde` é gravado

#### Scenario: Criação com categoria alimenta o de-para

- **WHEN** a linha "Pix enviado para DOARE" do balde só no banco é criada com a categoria `Doações`
- **THEN** o par entre o descriptor normalizado e `Doações` é gravado, com a subcategoria escolhida ou vazia
- **AND** uma criação sem categoria não grava nada no de-para

#### Scenario: Normalização de descriptor

- **WHEN** o descriptor é `PG *ABC SUPERMERCADOS CONTAGEM BRA`
- **THEN** a chave normalizada descarta o prefixo de adquirente `PG *` e o sufixo de praça
- **AND** `DROGASIL2919` normaliza para a mesma chave que `DROGASIL` seguido de outro número de loja

#### Scenario: Sugestão nunca é aplicada em silêncio

- **WHEN** uma linha só no banco tem categoria sugerida pelo de-para aprendido
- **THEN** a categoria aparece pré-preenchida no formulário de criação
- **AND** o lançamento só é criado após confirmação explícita do usuário

#### Scenario: Categoria do emissor é o último recurso

- **WHEN** uma linha de fatura tem `Categoria` preenchida pelo C6 e não há de-para aprendido para o descriptor
- **THEN** a categoria do C6 é usada como sugestão
- **AND** quando existe de-para aprendido, ele tem precedência sobre a categoria do C6

### Requirement: Aplicação em lote com desfazer

O sistema MUST NOT gravar nenhum lançamento, fingerprint, de-para ou registro de ignorados antes da confirmação explícita do usuário. A aplicação SHALL ocorrer em lote, identificada por um `importBatchId`, e SHALL poder ser desfeita. O desfazer SHALL também devolver o fingerprint aos lançamentos dos quais um casamento desfeito o retirou, e voltar a pendente o lançamento que a confirmação tornou pago.

#### Scenario: Revisão não grava nada

- **WHEN** o usuário sobe um arquivo, vê o resumo e navega pelos baldes sem confirmar
- **THEN** nenhuma escrita ocorre no banco

#### Scenario: Desfazer reverte o lote

- **WHEN** o usuário aplica as decisões e em seguida aciona o desfazer
- **THEN** os lançamentos criados naquele lote são removidos
- **AND** os fingerprints gravados em lançamentos preexistentes naquele lote são limpos

#### Scenario: Desfazer devolve o fingerprint do casamento desfeito

- **WHEN** o usuário desfez o casamento do Colégio, aplicou e em seguida aciona o desfazer
- **THEN** o lançamento criado é removido e a "Mensalidade Colégio Santo Agostinho" volta a ter o fingerprint da linha

#### Scenario: Desfazer volta a pendente o que a confirmação pagou

- **WHEN** uma linha de R$ 210,00 confirmou um lançamento da Danielle que estava pendente e o usuário aciona o desfazer
- **THEN** o lançamento da Danielle volta a pendente
- **AND** um lançamento que já estava pago antes da aplicação continua pago
