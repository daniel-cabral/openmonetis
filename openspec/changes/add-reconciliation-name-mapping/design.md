## Context

A change `add-statement-reconciliation` (2.9.0, em produção) entregou o matcher determinístico com
quatro regras — fingerprint, parcela, exata (data ±1 dia e valor idênticos) e centavos (tolerância
de R$ 0,05, só com informação de parcela). A validação com o extrato real do C6 (04/07 a 02/09/2026)
produziu 71 casadas, 35 só no banco, 23 só no app e 7 ambíguas, com fechamento aritmético verde.

A classificação do balde "só no app" apontou que o maior grupo (7 de 23) são despesas fixas que o
usuário já mantém como recorrentes: ele lança no vencimento nominal (dia 15) e o banco debita antes
(dia 11), com valor que oscila mês a mês. O matcher compara data e valor, então não alcança o
lançamento; a linha correspondente vai para "só no banco" exibindo apenas o descriptor cru
(`CASA NOVA LOCADORA LTDA - EPP - Boleto`), e a única ação oferecida é criar um lançamento novo,
que duplicaria o recorrente.

O achado A1 daquela change concluiu que **alargar `DATE_WINDOW_DAYS` não é opção**: o extrato tem
valores repetidos dentro de qualquer janela larga (R$ 215,00 em quatro datas, R$ 2.000,00,
R$ 2.433,97), e ampliar trocaria 7 acertos por ambiguidade nova nas 71 linhas hoje casadas.

Restrições herdadas: nunca aceitar falso-positivo silencioso (D3 da change anterior); escrita só no
"aplicar" (D8); evitar alterar tabelas do upstream (o fork acompanha `felipegcoutinho/openmonetis`).

Recorrência no app não é uma entidade: `condition = "Recorrente"` com `recurrenceCount` materializa
N lançamentos, um por mês, cada um com seu `period`. O "Aluguel de agosto" portanto já existe como
linha de `lancamentos` e já é candidato — o matcher só não o alcança.

## Goals / Non-Goals

**Goals:**

- Reconhecer a linha do banco como o lançamento recorrente que já existe no app, apesar de data e
  valor divergentes, sem alargar nenhuma janela do matcher atual.
- Dar nome legível às linhas do balde "só no banco", aprendendo o de-para uma vez e reaproveitando
  nos meses seguintes.
- Manter o valor do orçamento coerente com o que o banco cobrou, sob decisão explícita do usuário.
- Corrigir os quatro defeitos que a validação da fatura expôs (A3 a A6), que vivem nos mesmos
  arquivos e conflitariam entre si se separados em changes distintas.

**Non-Goals:**

- Sugerir par próximo por valor idêntico (A1) continua fora: cobre o gasto eventual, não o
  recorrente conhecido.
- Matching por semelhança textual. Segue descartado — a decisão D3 da change anterior mediu
  sobreposição praticamente nula entre a escrita do usuário e os descriptors do banco. O de-para
  aqui é memória de uma decisão humana, não heurística de texto.
- Criar uma entidade de série recorrente. O `period` do lançamento já é o conceito de mês do
  orçamento e basta.

## Decisions

### D1 — Tabela própria `import_name_mappings`, não coluna em `import_category_mappings`

A tabela do aprendizado de categoria é do upstream. Acrescentar uma coluna `name` nullable ali seria
menor em linhas, mas cria conflito permanente numa tabela que o upstream pode evoluir, e mistura
duas memórias com ciclos de vida diferentes: a categoria vem de uma escolha em select, o nome de um
texto livre. Tabela nova, aditiva, com `user_id + description_key` como PK — mesma forma e mesma
razão que motivaram `reconciliation_ignores` na change anterior.

*Alternativa descartada:* coluna em `import_category_mappings`.

### D2 — A chave é `normalizeDescriptionKey`, a mesma da categoria

Reusar a normalização já fortalecida na change anterior (derruba prefixo de adquirente e sufixo
numérico de loja) mantém uma única definição de "mesmo lojista" no sistema. Herda o desvio conhecido
e documentado: `DM*hostingercomb SAO PAULO BRA` normaliza para `hostingercomb sao` porque a cidade
tem duas palavras — a chave continua determinística, só não unifica o mesmo lojista em cidades
diferentes. Para o caso alvo (boletos e recorrentes, descriptor estável mês a mês) isso é inócuo.

### D3 — Casar por nome + período, ignorando data e valor

O de-para transforma o problema: uma vez que a chave é conhecida, o par foi decidido por um humano,
e comparar data ou valor só pode fazer a regra falhar. O que resta é identificar **qual mês** —
e `period` é exatamente isso no modelo do app.

A regra exige nome exatamente igual ao aprendido, mesmo `period`, e mesmo sinal. Nada mais. Dois
lançamentos com o mesmo nome no período param a linha como ambígua, como qualquer outra regra.

A regra vale **apenas para destino do tipo conta**. Na fatura o período é a fatura inteira e a
repetição de lojista é a norma, não a exceção: a validação real mostrou "Uber BC" cerca de vinte
vezes, "Lanche BC" outras tantas, "Padaria" dez. Um de-para de nome ali cairia em "2+ candidatos"
quase sempre, transformando linhas que hoje oferecem criação em ambiguidades a desempatar à mão —
custo de implementação sem retorno. A dor concreta que motivou a change é toda de conta corrente.

Período da linha: `invoicePeriod` quando o arquivo é fatura de cartão, período derivado da data da
própria linha quando é extrato — o extrato cobre mais de um mês, então o período não pode vir do
arquivo inteiro.

*Alternativa descartada:* janela de data larga combinada com tolerância percentual de valor. Sem
memória, ela vale para toda linha e reintroduz exatamente o falso-positivo que A1 mostrou ser caro.

### D4 — A regra entra em quinto lugar, depois de centavos

Ordem final: fingerprint, parcela, exata, centavos, **nome+período**, ambíguo, sem candidato. Pôr a
regra nova antes da exata deixaria uma memória antiga sobrepor um casamento forte de data e valor
do mês corrente. Ela pega o que as regras fortes não pegaram, que é precisamente o caso alvo.

### D5 — Divergência de valor é um estado, não um casamento silencioso

Quando a regra casa e os valores diferem, casar sem dizer nada esconderia do usuário que o
orçamento e o extrato discordam — e o fechamento aritmético não pegaria isso, porque ele compara o
arquivo com o saldo do banco, não com o app. A linha vira `matched-amount-divergent`, exibe
`app → arquivo` e exige escolha antes de aplicar. Valores idênticos casam direto, sem cliques.

Quando o lançamento é dividido (`isDivided`), a opção de atualizar é bloqueada com o motivo à
vista: o valor vive distribuído entre as partes por pagador, e mexer só na parte casada deixaria a
soma diferente do valor cobrado. A linha ainda concilia; apenas não se altera o valor. Ratear a
diferença entre as partes seria uma regra de negócio nova que ninguém pediu.

*Alternativa descartada:* atualizar sempre para o valor do extrato. É o comportamento certo na
maioria dos casos, mas escreve em lançamento preexistente sem decisão explícita, o que a change
anterior evitou deliberadamente.

### D6 — O de-para se alimenta só de decisão humana explícita

Dois pontos: confirmar um par manualmente no balde "só no banco" (a ação nova de D9), e digitar um
nome ao criar um lançamento. Aprender a partir de casamento automático realimentaria o sistema com
a própria heurística — um erro de matching viraria memória permanente.

O aprendizado **por criação** vale só quando o destino é conta. Na fatura o nome tende a ser
específico da compra: digitar "Uber - aeroporto" numa linha faria toda corrida do mês seguinte
chegar com esse nome. Na fatura o de-para se alimenta apenas do vínculo manual, que é sempre
deliberado. Um checkbox "lembrar este nome" por linha foi descartado: seriam dezenas de linhas por
fatura e o atrito se repete todo mês.

### D7 — `AppTransaction` ganha `period`; `AppTransaction.name` já existe

O matcher é puro e recebe o que compara. `period` e `isDivided` entram em `AppTransaction`,
`toAppTransaction` passa a mapeá-los, e a action de candidatos passa a selecionar as colunas. `matchReconciliationRows`
recebe um parâmetro novo com o de-para conhecido (chave normalizada → nome) e o período do arquivo
quando houver.

### D8 — O desfazer carrega o valor anterior

A change anterior já resolveu o análogo para fingerprints: só os lançamentos criados recebem
`importBatchId`, e o vínculo do lote com os preexistentes volta no retorno da action. O update de
valor segue o mesmo caminho — o retorno passa a carregar `{ transactionId, previousAmount }`, que a
UI guarda para o desfazer restaurar.


### D9 — Vínculo manual a lançamento existente é pré-requisito, não conveniência

O balde "só no banco" oferece hoje apenas criar, ignorar ou pular; escolher um lançamento existente
só é possível no balde "Ambíguas", e só entre candidatos que o matcher já achou. No primeiro mês o
Aluguel do app não é candidato de nada — logo não existe lugar onde ensinar o primeiro de-para, e
sem ele a regra de D3 nunca dispara. A ação `Vincular a lançamento existente` fecha o ciclo.

Ela vale nos dois tipos de destino. Na fatura não grava de-para (D6), mas concilia: os 13 itens do
balde "só no banco" da fatura real incluem parcelas antigas que provavelmente existem no app com
outro nome. É a mesma UI e o mesmo caminho de escrita; restringir por destino entregaria menos pelo
mesmo trabalho.

A lista mostra os lançamentos do destino no período da linha, **incluindo os já consumidos por
outra linha**, marcados como indisponíveis. Esconder o lançamento que o usuário procura o faria
concluir que não existe e criar um duplicado — exatamente o que a change combate. Busca por texto
livre em todo o histórico foi descartada: convida a vincular com o mês errado, que é o que o
critério de período existe para impedir.

### D10 — Escopo do balde "só no app" depende do tipo de destino

A busca de candidatos usa uma folga de `RANGE_BUFFER_DAYS = 3` além do intervalo de datas do
arquivo, correta para não cortar candidato na borda, mas os candidatos extras vazam para o balde
exibido. No extrato foram 6 linhas de 23. Na fatura, 267: o arquivo carrega parcelas de compras
antigas, então seu intervalo de datas cobre cerca de dez meses e a busca trouxe todo o histórico do
cartão.

O critério certo difere por destino, e a própria tela já enuncia a diferença: no cartão o lançamento
pertence ao período da fatura, não ao mês da compra. Então o balde exibe, para cartão, apenas
lançamentos com `period = invoicePeriod`; para conta, apenas os dentro do intervalo real
`[from, to]` do arquivo. A folga da busca continua valendo para o matching nos dois casos.

Em contrapartida, a busca precisa **crescer** para servir D3: um lançamento de `period` 2026-08 com
data de compra em 28/07 não entraria pelo filtro de datas e a regra de nome+período nunca o veria.
A query passa a trazer lançamentos que satisfaçam o intervalo de datas **ou** um dos períodos
tocados pelo arquivo.

### D11 — Fechamento da fatura é soma líquida, não soma de compras

`checkInvoiceClosure` soma as linhas com `isPurchase !== false`, e `isPurchase` é `valor >= 0`. Na
fatura real isso dá R$ 13.034,33 contra os R$ 12.936,33 informados, acusando divergência de R$ 98,00
numa fatura que fecha exata.

As duas linhas negativas não são a mesma coisa. `Estorno Tarifa` (−98,00) é crédito desta fatura e
pertence à conta; `Pag Fatura Boleto` (−12.164,10) quita a fatura anterior e não pertence.
Verificado pelos dois caminhos:

```
13.034,33 − 98,00 (estorno)                = 12.936,33
   772,23 (soma de tudo) + 12.164,10 (pag) = 12.936,33
```

O fechamento passa a somar todas as linhas menos os pagamentos de fatura. A decisão D4 da change
anterior foi derivada da amostra antes de existir um total real para conferir; classificar "compra"
pelo sinal do valor não sobrevive ao primeiro dado verdadeiro.

### D12 — Três estados de linha, em campo aditivo novo

Distinguir estorno de pagamento exige um terceiro estado: `purchase`, `credit`, `invoice-payment`.
O pagamento é reconhecido pela descrição (`Pag Fatura`) — heurística textual, o único sinal que o
arquivo oferece, e cujo erro é alto e inconfundível: se a descrição mudar, o fechamento acusa uma
divergência do tamanho exato do pagamento, nunca um desvio silencioso.

O estado entra como campo **aditivo opcional** `lineKind` em `ImportedTransaction`; `isPurchase`
permanece como está. Alterar o campo existente quebraria o import de OFX do upstream e ampliaria a
superfície de merge que a change anterior tratou como risco.

### D13 — Linhas que não são compra ganham balde próprio, sem criação

`Pag Fatura Boleto` e `Estorno Tarifa` caem hoje em "só no banco" com a ação de criação disponível.
O pagamento é a mesma transação que o `BANCO C6 S.A. - Boleto` do extrato, que já casou lá: aceitar
a sugestão criaria uma receita de doze mil reais no cartão. Elas passam a um balde informativo, sem
ação — ignorá-las automaticamente esconderia informação útil para conferir a fatura, e deixá-las
onde estão mantém uma armadilha de doze mil reais a um clique.

### D14 — O total da fatura recalcula o fechamento

`handleAdvance` monta a revisão uma vez e nada observa `invoiceTotalInput` depois disso. O campo
segue editável na tela montada e não produz efeito nenhum, o que torna a verificação da fatura
inalcançável na prática — o total costuma ser consultado depois de ver o arquivo. O fechamento passa
a ser derivado por `useMemo` sobre o que já está em memória; nada é rebuscado no servidor.

## Risks / Trade-offs

- **Nome do lançamento é texto livre e pode mudar** → Renomear "Aluguel" para "Aluguel Casa" quebra
  o de-para silenciosamente: a linha deixa de casar e volta para "só no banco". *Mitigação:* a
  degradação é suave (volta ao comportamento de hoje, nunca casa errado) e o campo de nome no balde
  reensina a chave na conciliação seguinte.
- **Dois lançamentos com o mesmo nome no mesmo período** → Vira ambiguidade a resolver à mão todo
  mês enquanto o usuário mantiver nomes duplicados. *Mitigação:* é o comportamento correto por D3
  da change anterior; a alternativa seria escolher um dos dois no escuro.
- **Recorrente lançado no mês seguinte ao do débito** → Banco debita 31/08, usuário lançou no
  período de setembro; a regra não casa. *Mitigação:* fica exatamente como hoje; o achado A1, quando
  implementado, cobre esse caso pelo valor.
- **Update de valor altera dado que o usuário digitou** → Escrita mais invasiva que tudo que a
  conciliação fazia até aqui. *Mitigação:* exige escolha explícita por linha, mostra os dois valores
  antes de aplicar, e o desfazer restaura.
- **A detecção de pagamento de fatura depende de texto** → Se o C6 renomear `Pag Fatura Boleto`, a
  linha volta a entrar na soma e o fechamento acusa divergência. *Mitigação:* a divergência é do
  tamanho exato do pagamento, visível de imediato, e o balde informativo de D13 mostra como cada
  linha foi classificada.
- **A busca de candidatos por data OU período traz mais linhas** → Consulta mais cara e mais
  candidatos no matcher. *Mitigação:* o volume medido é de centenas de linhas por conciliação, não
  milhares; o filtro do balde exibido (D10) impede que isso apareça como ruído para o usuário.
- **Tabela nova aumenta a superfície de merge com o upstream** → *Mitigação:* declaração acrescentada
  ao final de `schema.ts`, como `reconciliation_ignores`, mantendo o conflito restrito a um bloco
  novo no fim do arquivo.

## Migration Plan

1. Migration aditiva criando `import_name_mappings`. Nenhuma alteração em tabela existente.
2. Deploy normal — a tabela nasce vazia e a regra nova não produz candidato nenhum enquanto não
   houver de-para gravado.
3. As correções da fatura (D11 a D14) entram em vigor no primeiro uso, sem migração de dados: o
   fechamento é calculado a cada conciliação e nada dele é persistido. Conciliações já aplicadas
   não são afetadas.
4. Rollback: remover a regra do matcher e reverter o fechamento. Os registros de de-para ficam
   inertes.

## Open Questions

- O de-para deve ser escopado por conta ou cartão de destino? Assumido que não: o descriptor de um
  boleto identifica o credor independentemente da conta que pagou. Revisar se o mesmo descriptor
  aparecer com nomes diferentes em contas diferentes.
- Vale expor uma tela para o usuário ver e editar os de-para aprendidos (nome e categoria)? Fora do
  escopo aqui; a correção pela própria conciliação deve bastar até que o volume incomode.
