## Context

O ambiente alvo tem 1 conta (`C6bank PF`), 1 cartão (`C6 Carbon`, fecha dia 08 / vence dia 15), 1 pessoa e ~16 categorias. Todo lançamento é digitado à mão e categorizado à mão; `import_category_mappings` está vazia.

Dois arquivos reais do C6 foram analisados antes deste design (`.examples/extrato.csv` e `.examples/cartao-Fatura_2026-08-15.csv`). O que eles determinam:

**Extrato** — CSV com BOM, separador `,`, 8 linhas de preâmbulo antes do cabeçalho (traz `Agência: 1 / Conta: 14447134` e o intervalo do extrato). Colunas: `Data Lançamento`, `Data Contábil`, `Título`, `Descrição`, `Entrada(R$)`, `Saída(R$)`, `Saldo do Dia(R$)`. Sem identificador de transação. Medições na amostra de 113 linhas:
- defasagem `Data Lançamento → Data Contábil`: −1 a +2 dias (95 linhas com defasagem zero);
- `Saldo do Dia` é único por `Data Contábil` e a variação fecha exata com a soma dos lançamentos do dia em **34 de 34 dias**;
- **18 das 113 linhas (16%)** têm valor idêntico a outra dentro de ±3 dias, ou seja, não se resolvem por data+valor sozinhas.

**Fatura** — CSV sem BOM, separador `;`. Colunas: `Data de Compra`, `Nome no Cartão`, `Final do Cartão`, `Categoria`, `Descrição`, `Parcela`, `Valor (em US$)`, `Cotação (em R$)`, `Valor (em R$)`. Sem identificador. Particularidades:
- `Data de Compra` é a data **original**, não a da fatura — a fatura de ago/2026 contém compra de 14/01/2025;
- `Parcela` vem explícito como `N/M` ou `Única`;
- 4 finais de cartão (`1160`, `8008`, `8104`, `8737`) e 2 portadores numa **única** fatura;
- valores negativos existem (`Pag Fatura Boleto` −12.164,10, `Estorno Tarifa` −98,00), logo a soma bruta do arquivo não é o valor da fatura;
- a `Categoria` do C6 é ruidosa (`SEU BISTRO CAFE` → "Relacionados a Automotivo").

**Restrição decisiva**, medida cruzando a fatura com os lançamentos reais: o usuário escreve nomes semânticos (`Daniel - mouse novo`, `Suplementos (Whey + Pré-Treino)`) e o banco manda descriptors (`MERCADOLIVRE*MERCADOL`, `ADRENALINA NUTRICAO ES`). **Não há sobreposição textual.** Além disso existe divergência de arredondamento de parcela: `LOJA SPACE BC` 86,59 no C6 contra 86,61 no app.

O upstream (release 2.7.13) acabou de introduzir `lancamentos.ofx_import_fingerprint` com índice único parcial `(user_id, ofx_import_fingerprint) WHERE NOT NULL`. O construtor dele exige `FITID` e retorna `null` sem ele, mas a coluna é genérica.

## Goals / Non-Goals

**Goals:**
- Detectar, contra a fonte do banco, lançamento faltando e lançamento duplicado — nos dois sentidos (banco→app e app→banco).
- Provar o fechamento por aritmética, não só por matching.
- Tornar reimportação do mesmo arquivo idempotente.
- Estender a proteção contra duplicata aos lançamentos digitados à mão.
- Popular `import_category_mappings` a partir dos matches, sem trabalho adicional do usuário.
- Deixar um ponto de extensão barato para outros bancos, sem construir framework.

**Non-Goals:**
- Substituir a digitação manual. O fluxo continua híbrido: casa o que dá, o resto vira sugestão.
- Resolver ambiguidade automaticamente. Em app financeiro, falso-positivo silencioso é pior que trabalho manual.
- Melhorias no inbox/pré-lançamentos. Causa diferente, change separada.
- Separação de gastos por portador (`payerId` por `cardLast4`). Metadado é persistido; uso fica para depois.
- Suporte a outros bancos agora. A costura existe; implementação, não.

## Decisions

### D1 — Reusar `ofx_import_fingerprint` em vez de coluna nova

A coluna do upstream é genérica apesar do nome, e já vem com o índice único parcial que dá idempotência de graça. Fingerprint de linha de CSV usa **ocorrência posicional** no lugar do `FITID`:

- extrato: `[banco, conta, data lançamento, data contábil, título, descrição, valor com sinal, ocorrência]`
- fatura: `[banco, cartão, data compra, final, descrição, parcela N/M, valor com sinal, ocorrência]`

A ocorrência é calculada dentro do grupo de linhas idênticas, na ordem do arquivo — estável enquanto a ordenação do banco for estável.

*Alternativa descartada:* coluna própria `statement_fingerprint`. Duplicaria o índice único e criaria dois conceitos para a mesma coisa. *Alternativa descartada:* renomear a coluna para algo neutro — custo de merge permanente com o upstream por ganho puramente cosmético.

### D2 — Conciliar = gravar o fingerprint no lançamento existente, sem tabela de vínculo

Confirmar um match faz `update lancamentos set ofx_import_fingerprint = <fp>`. O vínculo fica implícito e único por construção, o lançamento fica marcado como conciliado, e o índice único do upstream passa a barrar duplicata futura sobre um lançamento que nasceu manual.

*Alternativa descartada:* tabela `reconciliation_links (fingerprint, transaction_id)`. Precisaria de unicidade própria, de sincronização com a coluna existente, e de limpeza em cascata — tudo para representar o que uma coluna já representa.

### D3 — Matcher determinístico ordenado, nunca por score

Regras em ordem, primeira que bate vence:

1. **Já conciliado** — fingerprint da linha bate com `ofx_import_fingerprint` de algum lançamento.
2. **Parcela** (fatura) — `Parcela N/M` casa com série do app (`installmentCount = M`, parcela correspondente ao período) + valor. Sinal mais forte disponível: `M` restringe brutalmente o espaço de busca.
3. **Exato** — valor com sinal idêntico e data batendo em `Data Lançamento` **ou** `Data Contábil` (folga ±1 dia), com **candidato único**.
4. **Centavos** — igual à 3 com tolerância ±R$ 0,05, **apenas quando há informação de parcela**. É onde o arredondamento aparece; em lançamento à vista a tolerância só criaria falso-positivo.
5. **Ambíguo** — 2+ candidatos. Lista os candidatos e para.
6. **Sem candidato** — vira sugestão de criação, com categoria pré-preenchida.

O arquivo entrega **as duas datas**, então a janela não é chute: comparo contra ambas e uso ±1 dia só como folga, coerente com a defasagem medida de −1 a +2.

*Alternativa descartada:* score fuzzy com limiar. O componente textual contribuiria ~zero (não há sobreposição entre a escrita do usuário e a do banco), sobrando um score que só produz falso-positivo silencioso.

### D4 — Verificação aritmética como critério de conclusão

Independente do matcher: no extrato, `saldo[d] − saldo[d−1]` contra a soma dos lançamentos por `Data Contábil`; na fatura, soma das compras (excluindo negativos) contra o total do cartão no período. Um dia que não fecha significa que falta ou sobra algo, **mesmo que o matcher esteja satisfeito**. É o único sinal do conjunto que não é heurística.

### D5 — Aprendizado de categoria reusando `import_category_mappings`

A tabela existe, está vazia, e a preocupação é idêntica. O que falta é a normalização: a atual (`toLowerCase().trim().replace(/\s+/g," ")`) não agrupa nada contra descriptors reais. O normalizador novo derruba prefixo de adquirente e sufixo numérico de loja:

```
PG *ABC SUPERMERCADOS CONTAGEM BRA     ->  abc supermercados
DM*HOSTINGERCOMB   SAO PAULO   BRA     ->  hostingercomb
MERCADOLIVRE*MERCADOL                  ->  mercadolivre
DROGASIL2919                           ->  drogasil
```

Duas decisões dentro dessa regra. Em torno do `*` fica o **segmento mais longo**, não o da direita: em `PG *` e `DM*` o lojista está à direita, mas em `MERCADOLIVRE*MERCADOL` está à esquerda e o da direita é um fragmento truncado que não agrupa nada. O sufixo de praça só cai quando o marcador de país (`BRA`/`BR`) está presente, e a cidade é delimitada pela corrida de espaços com que o C6 a separa do lojista; quando essa corrida não existe no arquivo, resta descartar o último token, que resolve cidade de uma palavra e não resolve cidade de duas.

A tabela se popula **a partir dos matches**: ao casar uma linha com um lançamento já categorizado à mão, grava-se `descriptor → categoria`. A categoria aprendida entra sempre pré-preenchida e editável, nunca aplicada em silêncio — `descriptor → categoria` não é 1:1 (`MERCADOLIVRE*MERCADOL` pode ser Compras ou Presentes). A `Categoria` que o C6 manda é terceiro recurso, atrás do aprendido, por ser comprovadamente ruidosa.

*Alternativa descartada:* tabela fork-local `statement_descriptor_mappings`. Evitaria tocar código do upstream, mas fragmentaria o mesmo conhecimento em duas tabelas e deixaria o import OFX existente sem o benefício.

### D6 — Rota própria, não extensão da tela de import

`/transactions/reconciliation`, irmã de `/transactions/import`. O import cria a partir do arquivo; a conciliação compara e decide — output diferente, tela diferente. `import-page.tsx` já tem 434 linhas.

### D7 — Perfil de banco como código registrado, detecção como sugestão

Cada banco é **um arquivo de código**, não um perfil declarativo. Config em JSON (delimitador, mapa de colunas, formato de data) não expressa o que os arquivos reais exigem: o preâmbulo de 8 linhas do C6, a semântica do campo `Parcela`, o significado de valor negativo na fatura. Isso é lógica, não parâmetro.

O que os arquivos compartilham é a *interface*, registrada explicitamente em `parsers/registry.ts`:

```ts
{ id, label, kind: "statement" | "invoice", matches(headerSample), parse(content) }
```

`detect.ts` percorre o registro e devolve o perfil sugerido **junto com a lista completa**. A detecção nunca é a palavra final: a UI mostra o perfil detectado pré-selecionado e editável. Motivo — com mais bancos, assinaturas de cabeçalho podem empatar ou mudar entre versões do arquivo, e um parser silenciosamente errado produz conciliação errada, que é pior que pedir um clique.

Pelo mesmo motivo a **conta/cartão de destino é confirmada explicitamente**. Hoje ela sai do preâmbulo do C6, mas isso é peculiaridade do C6; outro banco não terá. O valor extraído é pré-preenchimento, não decisão.

Outro banco = mais um arquivo e mais uma entrada no registro. Sem framework de plugin, sem abstração especulativa.

*Alternativa descartada:* perfis declarativos em config, editáveis pelo usuário. Move complexidade de código para dados sem eliminá-la, e o usuário passaria a depurar mapeamento de coluna em vez de conciliar.

### D8 — Escrita só no "aplicar"

Upload, matching e verificação são puros. Nenhuma linha do banco vira lançamento, e nenhum fingerprint é gravado, antes da confirmação explícita. A aplicação usa `importBatchId` e reaproveita o desfazer que o import já tem.

## Risks / Trade-offs

- **Ocorrência posicional depende da ordenação do arquivo** → Se o C6 mudar a ordem entre exportações, linhas idênticas trocam de fingerprint e reimportar pode duplicar. Mitigação: a ocorrência só desempata linhas *idênticas* em todos os campos; o caso é raro (zero na fatura analisada) e a verificação aritmética detecta a duplicata resultante.
- **Fortalecer `normalizeDescriptionKey` muda a chave de uma tabela do upstream** → No ambiente alvo a tabela está vazia, então não há backfill. Em instalação com dados, mapeamentos antigos deixariam de casar (degradam para "sem sugestão", não para sugestão errada). Mitigação: comportamento é degradação suave, não corrupção.
- **Tocar dois arquivos do upstream cria superfície de merge permanente** → `types.ts` (campos aditivos opcionais) e `import-utils.ts` (uma função). Mitigação: manter as mudanças pequenas e localizadas; nenhuma altera assinatura existente.
- **16% das linhas do extrato são ambíguas por data+valor** → Trabalho manual real a cada conciliação. Mitigação: é o preço deliberado de não aceitar falso-positivo; o volume medido (~18 desempates em 2 meses) é administrável, e o aprendizado de descriptor tende a reduzir isso ao longo do tempo.
- **A fatura mistura compras, pagamentos e estornos** → Somar o arquivo inteiro dá número errado (R$ 772,23 na amostra, contra ~R$ 13 mil de compras). Mitigação: separar por sinal antes de qualquer verificação; tratar explicitamente `Pag Fatura Boleto` e `Estorno`.
- **A migration 0034 do upstream precisa estar aplicada** → Sem a coluna `ofx_import_fingerprint`, nada disso funciona. Mitigação: o `docker-entrypoint.sh` aplica migrations no boot; verificar antes de implementar.

## Migration Plan

1. Migration aditiva criando `reconciliation_ignores`. Nenhuma alteração em tabela existente.
2. Deploy normal — a feature nasce atrás de uma rota nova; nada muda para quem não a acessa.
3. Rollback: remover a rota. Os fingerprints gravados em lançamentos manuais são inertes se a feature sumir (a coluna já existia e já era nullable).

## Achados da validação com dados reais (extrato C6, 04/07 a 02/09/2026)

Resultado da conciliação real: **71 casadas / 35 só no banco / 23 só no app / 7 ambíguas**,
fechamento aritmético verde em 34 de 34 dias. `71 + 35 + 7 = 113` = total de linhas do arquivo,
sem linha perdida ou duplicada. 63% casaram só por data+valor, confirmando D3.

Classificação do balde "só no app" (23), que era a pergunta em aberto:

| Causa | Qtd |
|---|---|
| Data divergente — valor idêntico a uma linha do balde "só no banco", 2 a 4 dias fora da janela | 7 |
| Fora do intervalo real do arquivo — vazamento do `RANGE_BUFFER_DAYS = 3` | 6 |
| Sem contrapartida no extrato (valor diferente ou pago por outra conta) | 6 |
| Lançamentos de R$ 0,00 — dado sujo preexistente do app | 3 |
| Duplicata criada à mão — a dor original da feature | 1 |

Padrão por trás dos 7: as despesas fixas de agosto (Aluguel, Condomínio, Órigo, Rodobens) foram
lançadas no app no dia 15, o vencimento nominal, e o banco debitou no dia 11. Em julho as mesmas
quatro casaram, então é divergência de lançamento do usuário, não do parser.

### A1 — Não ampliar `DATE_WINDOW_DAYS`; sugerir par próximo no balde

Ir de ±1 para ±4 dias casaria os 7, mas o extrato tem valores repetidos dentro dessa distância
(Ludmila R$ 215,00 em quatro datas, Aline R$ 2.000,00, SANTANDER R$ 2.433,97). Ampliar a janela
troca 7 acertos por ambiguidade nova nas linhas hoje casadas — o oposto da intenção de D3, que é
nunca aceitar falso-positivo.

O caminho é outro: manter ±1 no matching automático e, **depois** da classificação, procurar para
cada item "só no app" uma linha do balde "só no banco" com valor exatamente igual dentro de uma
janela larga (±7 dias) e oferecer esse par como **decisão manual** na tela. Não altera nenhuma
regra do matcher, não infla ambiguidade, e resolve o maior grupo do balde.

Isso muda a decisão de 9.5 (balde "só no app" informativo): com um par sugerido existe algo a
gravar, então o balde ganha ação.

### A2 — O balde "só no app" deve ser filtrado pelo intervalo do arquivo

`fetchReconciliationCandidatesAction` busca candidatos com folga de `RANGE_BUFFER_DAYS = 3` além
do intervalo do arquivo, o que é correto para não cortar candidato na borda. Mas esses candidatos
extras vazam para o balde "só no app" quando não casam, e o usuário não tem o que fazer com eles:
são lançamentos de um período que o arquivo não cobre. Foram 6 de 23 linhas — 26% do balde é ruído.

Correção: a folga continua valendo para o matching; o balde exibido filtra para o intervalo real
`[from, to]` do arquivo.

## Achados da validação com dados reais (fatura C6, período 2026-08)

Conciliação real da fatura de 15/08 com total informado de R$ 12.936,33: **79 casadas / 13 só no
banco / 267 só no app / 6 ambíguas**. `79 + 13 + 6 = 98` = total de linhas do arquivo, sem perda.
Cerca de 20 casamentos vieram pela regra de parcela e um por tolerância de centavos
(`AVENTURA JURASSICA`), exercitando os caminhos que o extrato não toca.

### A3 — O fechamento da fatura soma o conjunto errado de linhas

`checkInvoiceClosure` soma as linhas com `isPurchase !== false`, e `isPurchase` é `valor >= 0`
(`c6-invoice-csv.ts:44`). Isso dá R$ 13.034,33 contra os R$ 12.936,33 reais e reportaria uma
divergência de R$ 98,00 numa fatura que fecha exata.

As duas linhas negativas do arquivo não são a mesma coisa: `Estorno Tarifa` (−98,00) é crédito
**desta** fatura e deve entrar na conta; `Pag Fatura Boleto` (−12.164,10) quita a fatura anterior e
não deve. Confirmado pelos dois caminhos:

```
13.034,33 − 98,00 (estorno)                 = 12.936,33
   772,23 (soma de tudo) + 12.164,10 (pag)  = 12.936,33
```

A regra correta é **soma de todas as linhas, menos os pagamentos de fatura**. A decisão D4 foi
derivada da amostra antes de existir um total real para conferir; o critério de "compra" por sinal
do valor não sobrevive ao primeiro dado verdadeiro.

### A4 — O total da fatura não recalcula o fechamento

`handleAdvance` monta a revisão uma vez e nada observa `invoiceTotalInput` depois disso. O campo
continua editável na tela montada, mas digitar o total ali não produz fechamento nenhum — só
funciona quem preenche antes de avançar. Na prática torna a verificação da fatura inalcançável,
já que o total costuma ser consultado depois de ver o arquivo.

### A5 — O balde "só no app" da fatura é 96% ruído, ampliando A2

267 linhas. A fatura de agosto carrega parcelas de compras antigas (`FORMULA BIKE` 26/11,
`BRASTEMP` 14/01, `DM*HOSTINGERCOMB` 11/03), então o intervalo de datas do arquivo cobre cerca de
dez meses, e a busca de candidatos — que filtra por `purchaseDate` — trouxe todo o histórico do
cartão. Quase tudo são lançamentos de maio, junho e julho, pertencentes a faturas anteriores.

No cartão o lançamento pertence ao **período da fatura**, não ao mês da compra — a própria tela diz
isso. O balde exibido deveria seguir a mesma definição e filtrar por `period = invoicePeriod`.

### A6 — Linhas que não são compra oferecem "Criar lançamento"

`Pag Fatura Boleto` (+R$ 12.164,10 na exibição) e `Estorno Tarifa` (+R$ 98,00) caem no balde "só no
banco" com a ação de criação disponível. O pagamento é a mesma transação que o
`BANCO C6 S.A. - Boleto` do extrato, que já casou lá: aceitar a sugestão criaria uma receita de
doze mil reais no cartão. Essas linhas precisam de um balde próprio, informativo, sem criação.

### Onde essas correções vivem

A3, A4, A5 e A6 foram levadas para a change `add-reconciliation-name-mapping`, junto de A1 e A2 —
todas tocam o mesmo conjunto de arquivos, e separá-las em changes distintas criaria conflito entre
elas sem ganho de revisão.

## Open Questions

- Qual a tolerância de janela ideal para a fatura? A `Data de Compra` da fatura é a data real da compra, então deve casar exato com o que o usuário lançou — mas ele pode ter lançado no dia em que *viu* a notificação, não no da compra. A ser calibrado na primeira conciliação real com a fatura de agosto.
- `reconciliation_ignores` precisa de escopo por conta/cartão, ou o fingerprint (que já embute banco e conta) basta como chave? Assumido que basta até prova em contrário.
