## 1. Matcher

- [x] 1.1 `matcher.ts` — `amountDivergenceOf` deixa de filtrar por `rule === "name-period"` e passa a reportar divergência para qualquer regra
- [x] 1.2 Teste: linha casada por `cents` (86,59 no arquivo contra 86,61 no app) reporta `amountDivergence`

## 2. Autoridade do valor num único lugar

- [x] 2.1 `reconciliation-review.ts` — `resolveAmountUpdate({ candidate, rowAmount, rowTransactionType })`, devolvendo `null` quando os valores já batem ou o lançamento é dividido
- [x] 2.2 Testes do helper: alinha quando difere, não alinha quando igual, não alinha dividido, alinha diferença de centavos

## 3. Vínculo manual

- [x] 3.1 `ReconciliationRowDecision["link"]` ganha `amountUpdate` opcional
- [x] 3.2 `buildReconciliationApplyPayload` empurra o `amountUpdate` do link para `payload.amountUpdates`
- [x] 3.3 A UI monta o `amountUpdate` do link a partir do candidato escolhido
- [x] 3.4 Teste de regressão: link com valor divergente produz `amountUpdates` (o caso `Unimed Mãe`)

## 4. A escolha sai de cena

- [x] 4.1 Remover `divergenceChoiceByFingerprint` e os dois botões; no lugar, aviso de que o valor será alinhado
- [x] 4.2 `evaluateApplyBlock` perde `unresolvedDivergentCount`; só criação sem nome bloqueia
- [x] 4.3 Atualizar os testes de `evaluateApplyBlock`
- [x] 4.4 O ramo `confirm` divergente passa a usar `resolveAmountUpdate` em vez da escolha

## 5. Fechamento

- [x] 5.1 `pnpm exec tsc --noEmit`, `pnpm exec vitest run --maxWorkers=4`, `pnpm exec biome check --formatter-enabled=false .`
- [x] 5.2 Atualizar `CHANGELOG.md`, `package.json` e o badge do `README.md` — 2.10.0 → **2.11.0**, minor e não patch: além da correção, o comportamento acordado muda (a escolha por linha deixa de existir). O teste de coerência passa a derivar a versão do `package.json` em vez de fixá-la
- [ ] 5.3 Validar na instância: vincular à mão uma linha a um recorrente de valor diferente e confirmar que o lançamento passa a valer o valor do extrato
