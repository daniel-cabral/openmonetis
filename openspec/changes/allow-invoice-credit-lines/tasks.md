## 1. Separar crédito de pagamento de fatura

- [x] 1.1 Teste: `isInvoicePaymentLine` é verdadeiro só para `lineKind === "invoice-payment"`; `isCreditLine` só para `credit`; ambos falsos para compra e para extrato (`lineKind` ausente)
- [x] 1.2 Substituir `isNonPurchaseLine` pelos dois predicados em `reconciliation-review.ts`

## 2. Crédito vira receita no cartão

- [x] 2.1 Teste do plano: **desnecessário** — o parser já marca linha negativa como `income` (`c6-invoice-csv.ts:42`), e a criação do balde "só no banco" respeita o sinal da linha. Nada a mudar no plano
- [x] 2.2 `reconciliation-plan.ts` — **nenhuma mudança necessária**, pelo motivo acima
- [x] 2.3 Crédito passa a cair no balde "só no banco", que já tem a ação de criação; o balde informativo encolhe para só `invoice-payment` e ganha rótulo explícito ("Pagamento da fatura anterior")

## 3. Anúncio na quitação

- [x] 3.1 O complemento zero já não gera lançamento (`Math.max(0, …)` em `actions.ts`); a tela passa a informar
- [x] 3.2 `invoice-summary-card.tsx` — o texto acima do botão passa a dizer o valor da fatura, quanto já foi abatido e a despesa que será lançada; quando não há saldo, avisa que nada será lançado

## 4. Fechamento

- [x] 4.1 `pnpm exec tsc --noEmit`, `pnpm exec vitest run --maxWorkers=4`, `pnpm exec biome check --formatter-enabled=false .`
- [ ] 4.2 Atualizar `CHANGELOG.md`, `package.json` e o badge do `README.md`
- [ ] 4.3 Validar com a fatura de julho/2026: lançar os dois adiantamentos e o estorno, e confirmar que a quitação deixa de propor complemento
