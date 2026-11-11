# statement-reconciliation Specification

## Purpose
TBD - created by archiving change add-statement-reconciliation. Update Purpose after archive.
## Requirements
### Requirement: Parsing de extrato CSV do C6

O sistema SHALL interpretar o CSV de extrato de conta corrente do C6, ignorando o preâmbulo anterior à linha de cabeçalho e extraindo dele agência, conta e intervalo do extrato. Cada linha SHALL produzir uma transação com `date` (Data Lançamento), `postedDate` (Data Contábil), `dayBalance` (Saldo do Dia) e valor com sinal derivado das colunas `Entrada(R$)` e `Saída(R$)`.

#### Scenario: Preâmbulo é descartado e metadados aproveitados

- **WHEN** um CSV de extrato do C6 é carregado, contendo 8 linhas antes do cabeçalho `Data Lançamento,Data Contábil,...`
- **THEN** o parser localiza a linha de cabeçalho e ignora tudo acima dela
- **AND** extrai `accountNumber` da linha `Agência: <a> / Conta: <c>`
- **AND** extrai `period.from` e `period.to` da linha `Extrato de <d1> a <d2>`

#### Scenario: Sinal derivado das colunas de entrada e saída

- **WHEN** uma linha tem `Entrada(R$)` igual a `0.00` e `Saída(R$)` maior que zero
- **THEN** a transação resultante tem `transactionType` igual a `expense`
- **AND** quando a `Entrada(R$)` é maior que zero e a `Saída(R$)` é `0.00`, o `transactionType` é `income`

#### Scenario: Arquivo com BOM

- **WHEN** o arquivo começa com byte order mark
- **THEN** o BOM é removido antes do parsing e o cabeçalho é reconhecido normalmente

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

### Requirement: Perfil de banco e destino do arquivo

O sistema SHALL manter um registro de perfis de banco, cada um com identificador, rótulo e tipo (extrato ou fatura). Ao receber um arquivo, o sistema SHALL sugerir o perfil pela assinatura da linha de cabeçalho, mas a sugestão MUST ser sempre editável pelo usuário antes do parsing definitivo. O sistema SHALL também exigir a confirmação da conta ou cartão de destino, pré-preenchida quando o arquivo trouxer essa informação.

#### Scenario: Perfil detectado é apenas sugestão

- **WHEN** o arquivo contém a assinatura de cabeçalho do extrato do C6
- **THEN** o perfil "C6 — extrato" aparece pré-selecionado
- **AND** o usuário pode trocá-lo por qualquer outro perfil do registro antes de prosseguir

#### Scenario: Formato não reconhecido não é erro fatal

- **WHEN** o arquivo não corresponde a nenhuma assinatura conhecida
- **THEN** o sistema apresenta a lista de perfis disponíveis para escolha manual
- **AND** o parsing só ocorre após o usuário escolher um perfil

#### Scenario: Destino inferido do arquivo

- **WHEN** o arquivo traz identificação de conta, como `Agência: <a> / Conta: <c>` no preâmbulo do extrato do C6
- **THEN** a conta correspondente aparece pré-selecionada como destino
- **AND** o usuário pode alterá-la

#### Scenario: Destino ausente no arquivo

- **WHEN** o perfil escolhido não extrai identificação de conta ou cartão do arquivo
- **THEN** a seleção de destino é obrigatória
- **AND** o parsing definitivo não ocorre enquanto o destino não for informado

### Requirement: Identidade de linha sem identificador do emissor

O sistema SHALL gerar um fingerprint determinístico para cada linha de arquivo que não traga identificador do emissor, usando a posição de ocorrência entre linhas idênticas como desempate. O fingerprint SHALL ser gravado em `lancamentos.ofx_import_fingerprint`, reusando o índice único parcial `(user_id, ofx_import_fingerprint)` existente.

#### Scenario: Reimportação do mesmo arquivo é idempotente

- **WHEN** o usuário concilia um arquivo, aplica as decisões, e em seguida sobe o mesmo arquivo novamente
- **THEN** todas as linhas já aplicadas são classificadas como casadas por fingerprint
- **AND** nenhum lançamento duplicado é criado

#### Scenario: Linhas idênticas no mesmo arquivo recebem fingerprints distintos

- **WHEN** um arquivo contém duas linhas com mesma data, mesma descrição e mesmo valor
- **THEN** cada uma recebe um fingerprint distinto, diferenciado pela ocorrência posicional
- **AND** ambas podem ser aplicadas sem que o índice único rejeite a segunda

### Requirement: Classificação determinística das linhas

O sistema SHALL classificar cada linha do arquivo e cada lançamento do período em um de quatro estados: casada, só no banco, só no app, ou ambígua. As regras SHALL ser avaliadas em ordem, vencendo a primeira que corresponder: fingerprint já gravado; parcela `N/M` correspondente a uma série do app; valor exato com data correspondente a `Data Lançamento` ou `Data Contábil` com folga de ±1 dia e candidato único; valor com tolerância de ±R$ 0,05 apenas quando há informação de parcela. O sistema MUST NOT resolver ambiguidade automaticamente.

#### Scenario: Match por parcela

- **WHEN** uma linha de fatura tem `Parcela` igual a `2/12` e valor `1800.00`
- **AND** existe no app uma série com `installmentCount` igual a 12 e a parcela correspondente ao período da fatura, de mesmo valor
- **THEN** a linha é classificada como casada com aquele lançamento

#### Scenario: Match exato com candidato único

- **WHEN** uma linha tem valor com sinal idêntico ao de exatamente um lançamento, cuja data corresponde à `Data Lançamento` ou à `Data Contábil` dentro de ±1 dia
- **THEN** a linha é classificada como casada com aquele lançamento

#### Scenario: Tolerância de centavos restrita a parcelas

- **WHEN** uma linha de fatura com informação de parcela tem valor `86.59` e o lançamento correspondente tem valor `86.61`
- **THEN** a linha é classificada como casada
- **AND** quando a mesma diferença de centavos ocorre em uma linha sem informação de parcela, a linha NÃO é classificada como casada

#### Scenario: Múltiplos candidatos viram ambiguidade

- **WHEN** uma linha tem dois ou mais lançamentos candidatos com mesmo valor dentro da janela de data
- **THEN** a linha é classificada como ambígua
- **AND** todos os candidatos são apresentados para escolha manual
- **AND** nenhum vínculo é gravado sem escolha do usuário

#### Scenario: Linha sem candidato vira sugestão de criação

- **WHEN** uma linha não corresponde a nenhum lançamento por nenhuma das regras
- **THEN** a linha é classificada como só no banco
- **AND** é apresentada como sugestão de criação com categoria pré-preenchida quando houver de-para aprendido

#### Scenario: Lançamento sem linha correspondente é sinalizado

- **WHEN** existe no app um lançamento dentro do período do arquivo que não corresponde a nenhuma linha
- **THEN** o lançamento é classificado como só no app
- **AND** é apresentado com descrição, data e valor, como balde informativo — o app não tem onde registrar "duplicata", e um controle que não grava nada seria pior que a ausência dele

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

### Requirement: Linhas ignoradas deliberadamente

O sistema SHALL permitir marcar uma linha do arquivo como deliberadamente não lançável, registrando o fingerprint e o motivo em `reconciliation_ignores`. Linhas ignoradas SHALL ser reconhecidas em conciliações seguintes sem voltar a pedir decisão.

#### Scenario: Pagamento de fatura é ignorado

- **WHEN** o usuário marca a linha `Pag Fatura Boleto` como ignorada, informando o motivo
- **THEN** o fingerprint e o motivo são registrados
- **AND** ao conciliar o mesmo arquivo novamente, a linha aparece como ignorada e não como pendente de decisão

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
