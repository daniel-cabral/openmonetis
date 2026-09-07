## 1. Persistência do de-para

- [x] 1.1 Adicionar `importNameMappings` ao final de `src/db/schema.ts` (`user_id` FK cascade, `description_key` text, `name` text, `updated_at` timestamp default now; PK `user_id + description_key`) — **acrescentar no fim do arquivo**, sem tocar em declaração existente, para manter o conflito com o upstream restrito a um bloco novo
- [x] 1.2 Gerar a migration com `pnpm run db:generate` e conferir que é puramente aditiva
- [x] 1.3 `src/features/transactions/actions/name-memory-action.ts` — `fetchNameMappings(descriptions)` espelhando `category-memory-action.ts`: normaliza com `normalizeDescriptionKey`, filtra por `userId`, devolve mapa chave → nome

## 2. Parser e fechamento da fatura

- [x] 2.1 Acrescentar `lineKind?: "purchase" | "credit" | "invoice-payment"` a `ImportedTransaction` em `src/shared/lib/import/types.ts` — campo aditivo opcional, **sem tocar em `isPurchase`**, que continua como está para não quebrar o import de OFX do upstream
- [x] 2.2 `c6-invoice-csv.ts` — preencher `lineKind`: valor positivo é `purchase`; valor negativo cuja descrição casa `Pag Fatura` é `invoice-payment`; os demais negativos são `credit`
- [x] 2.3 `closure.ts` — `checkInvoiceClosure` passa a somar todas as linhas exceto `lineKind === "invoice-payment"`, em vez de filtrar por `isPurchase`
- [x] 2.4 Testes do fechamento com os números reais da fatura de 2026-08: compras 13.034,33 + crédito −98,00 + pagamento −12.164,10, total informado 12.936,33 → fecha com diferença zero; e um caso com total adulterado provando que a divergência é reportada
- [x] 2.5 Teste provando que a classificação distingue `Estorno Tarifa` de `Pag Fatura Boleto`, e que `isPurchase` continua com o comportamento antigo

## 3. Matcher

- [x] 3.1 Acrescentar `period: string` e `isDivided: boolean` a `AppTransaction`; mapear em `toAppTransaction` e selecionar as colunas `periodo` e `dividido` em `reconciliation-candidates-action.ts`
- [x] 3.2 Ampliar a busca de candidatos: trazer lançamentos que satisfaçam o intervalo de datas com folga **ou** um dos períodos tocados pelo arquivo — sem isso um lançamento do período 2026-08 com data de compra em 28/07 nunca chega ao matcher
- [x] 3.3 Acrescentar `"name-period"` a `MatchRule` e os parâmetros novos de `matchReconciliationRows`: `nameMappings` (chave → nome) e o tipo de destino. **Sem `invoicePeriod`** — a regra vale só para conta, onde o período vem sempre de `derivePeriodFromDate(row.date)`; o `invoicePeriod` é usado no filtro do balde (4.4), não no matcher
- [x] 3.4 Implementar a regra, **apenas para destino conta**: candidatos são lançamentos com `name` igual ao aprendido, `period` igual ao período da linha (`derivePeriodFromDate(row.date)`) e mesmo `transactionType`. Data e valor não entram
- [x] 3.5 Registrar a regra em `MATCH_RULES` na quinta posição, depois de `cents` — antes da `exact` faria memória antiga sobrepor casamento forte do mês corrente
- [x] 3.6 Estender `RowClassification`: o status `matched` passa a poder carregar `amountDivergence: { appAmount: number; rowAmount: number } | null`, preenchido só pela regra nova quando os valores diferem
- [x] 3.7 Testes do matcher: recorrente com data e valor divergentes casa; regra exata tem precedência; dois lançamentos de mesmo nome no período viram ambíguo; sinal diferente não casa; período diferente não casa; chave sem de-para não produz candidato; destino cartão não dispara a regra; valores idênticos não marcam divergência
- [x] 3.8 Teste de não-regressão da ampliação de 3.2: o pool maior de candidatos também alimenta as regras `fingerprint` e `installment`, que não filtram por data. Provar que um candidato trazido apenas pelo critério de período não cria ambiguidade nova numa linha que casava por regra forte antes da mudança

## 4. Revisão (UI)

- [x] 4.1 `reconciliation-page.tsx` — buscar os de-para de nome junto dos de categoria no mesmo `Promise.all` e passar para `matchReconciliationRows`
- [x] 4.2 Derivar o fechamento por `useMemo` sobre o que já está em memória, de modo que digitar o total da fatura depois de avançar recalcule o painel sem refazer o upload
- [x] 4.3 Balde informativo para `lineKind` diferente de `purchase`, sem nenhuma ação — e remover essas linhas do balde "só no banco"
- [x] 4.4 Filtrar o balde "só no app" por escopo: intervalo real `[from, to]` do arquivo quando o destino é conta, `period = invoicePeriod` quando é cartão
- [x] 4.5 Campo de nome por linha no balde "só no banco", pré-preenchido com o nome aprendido quando houver e com o descriptor quando não. A decisão da linha SHALL carregar **dois campos separados**: o `descriptor` bruto do arquivo (imutável, chave do de-para) e o `name` editável (nome do lançamento). Ver 5.0
- [x] 4.6 Ação `Vincular a lançamento existente` no balde "só no banco", nos dois tipos de destino: lista os lançamentos do destino no período da linha, com os já consumidos visíveis e desabilitados
- [x] 4.7 Decisão por linha nas casadas com divergência de valor: exibir `app → arquivo` e dois controles (manter / atualizar), sem escolha padrão; quando `isDivided`, "atualizar" fica indisponível com o motivo à vista
- [x] 4.8 Bloquear o botão "Aplicar" enquanto houver linha divergente sem escolha ou linha marcada para criação com nome vazio, com a razão visível na tela

## 5. Aplicação

- [x] 5.0 **Separar descriptor de nome em toda a cadeia.** Hoje `ReconciliationCreation` tem um único campo `description`, usado como nome do lançamento. Com 4.5 o nome passa a ser editável, e se a chave do de-para for derivada dele, a chave vira o texto que o usuário digitou (`Aluguel`) em vez do descriptor do banco (`CASA NOVA LOCADORA LTDA - EPP - Boleto`) — o de-para nunca reconheceria o mês seguinte e a change ficaria quebrada em silêncio. Acrescentar um campo `descriptor` (texto bruto do arquivo) ao lado de `name`, e propagá-lo por toda a cadeia: UI → `ReconciliationRowDecision["create"]` → `ReconciliationCreation` → schema/payload da action → `buildReconciliationPlan`. A chave do de-para SHALL ser `normalizeDescriptionKey(descriptor)`, nunca do nome
- [x] 5.1 `reconciliation-plan.ts` — `name` do insert passa a vir do campo `name` da decisão da linha; `creation.descriptor` fica reservado à chave do de-para
- [x] 5.2 `reconciliation-plan.ts` — vínculos manuais produzem `fingerprintUpdates` como as confirmações
- [x] 5.3 `reconciliation-plan.ts` — produzir `nameMappings` a partir dos vínculos manuais (qualquer destino) e das criações com nome digitado (**só quando o destino é conta**), colapsando chaves repetidas num registro só; e `amountUpdates` a partir das escolhas de atualizar
- [x] 5.4 `reconciliation-action.ts` — upsert em `import_name_mappings` e `UPDATE lancamentos SET valor` dentro da mesma `db.transaction()`, com guard de ownership por `userId`
- [x] 5.5 O retorno da action passa a carregar `{ transactionId, previousAmount }` dos valores atualizados; a action de desfazer restaura esses valores além de limpar os fingerprints do lote
- [x] 5.6 Testes do plano: **o de-para é chaveado pelo `descriptor` bruto e não pelo nome digitado** (teste explícito com nome editado diferente do descriptor); nome digitado vira `name` do insert e alimenta o de-para em conta mas não em cartão; vínculo manual alimenta o de-para em conta e concilia sem aprender em cartão; casamento automático não alimenta; escolha "manter" não gera `amountUpdate`; lançamento dividido não gera `amountUpdate`; chaves repetidas colapsam

## 6. Fechamento

- [ ] 6.1 Rodar `pnpm exec next typegen`, `pnpm exec tsc --noEmit`, `pnpm run test` e `pnpm exec biome check --formatter-enabled=false .` — **nunca** `pnpm run lint` nem `biome check .` sem a flag, por causa do ruído pré-existente de CRLF
- [ ] 6.2 Atualizar `CHANGELOG.md`, `package.json` e o badge do `README.md` conforme a regra 6 do `AGENTS.md`
- [ ] 6.3 Validar com o extrato real: ensinar o de-para dos quatro recorrentes de agosto (Aluguel, Condomínio, Órigo, Rodobens) pelo vínculo manual e confirmar que, numa segunda conciliação, eles saem do balde "só no banco"
- [ ] 6.4 Validar com a fatura real: o fechamento de 2026-08 deve fechar exato contra 12.936,33, o balde "só no app" deve cair de 267 para as linhas do período 2026-08, e `Pag Fatura Boleto` não deve mais oferecer criação
