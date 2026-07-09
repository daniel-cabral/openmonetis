## 1. Fundação — notas e reconhecimento

- [x] 1.1 Em `src/shared/lib/accounts/constants.ts`, adicionar `buildPartialInvoicePaymentNote(cardId, period, shortId)` gerando `AUTO_FATURA:<cardId>:<period>:<shortId>` (reutiliza `ACCOUNT_AUTO_INVOICE_NOTE_PREFIX`)
- [x] 1.2 Adicionar predicado `isPartialInvoicePaymentNote(note, cardId, period)` (nota do prefixo com sufixo além das 2 partes do pagamento cheio)
- [x] 1.3 Verificar (por inspeção do padrão `ilike 'AUTO_FATURA:%'`) que a nota parcial gerada em 1.1 é capturada por `excludeAutoInvoiceEntries()`

## 2. Saldo em aberto derivado (queries)

- [x] 2.1 Em `src/features/dashboard/invoices/invoices-queries.ts`, calcular `paidAmount` (soma dos `AUTO_FATURA:<cardId>:<period>:*`) e `outstandingAmount` (`|total| − paidAmount`) e expor em `DashboardInvoice`
- [x] 2.2 Atualizar tipos/mapeamentos de `DashboardInvoice` e helpers que constroem o objeto de fatura

## 3. Server action de pagamento parcial

- [x] 3.1 Implementar `payInvoicePartialAction` em `src/features/invoices/actions.ts` (Zod: `{cardId, period, amount, paymentAccountId, paymentDate}`) dentro de `db.transaction()`, calculando `outstanding` na transação
- [x] 3.2 Inserir (`insert`, nunca upsert) a `Despesa` `AUTO_FATURA:<cardId>:<period>:<shortId>` na conta, `cardId` nulo, `payerId` admin, `isSettled: true`
- [x] 3.3 Guards: `amount > 0`, `amount <= outstanding`, fatura não quitada, ownership de cartão e conta — mensagens genéricas
- [x] 3.4 Se o pagamento zera o saldo, marcar `invoices.paymentStatus = "pago"` (upsert) + `isSettled` nas compras do cartão
- [x] 3.5 `revalidateForEntity("cards", userId)` e retorno `ActionResult`

## 4. Reconciliação do pagamento cheio

- [x] 4.1 Ajustar `updateInvoicePaymentStatusAction` para usar o **saldo em aberto** (`total − parciais`) no valor da `Despesa` de fechamento; se `outstanding == 0`, só flipar status
- [x] 4.2 Auditar `getPaidInvoicePeriods`, `updatePaymentDateAction` e a busca de data de pagamento em `invoices/queries.ts` para lidar com múltiplas notas `AUTO_FATURA:` por fatura (limitação de edição de data em fatura fechada só por parciais documentada)

## 5. UI — dialog e controller

- [x] 5.1 Adicionar estado `paymentAmount` em `use-invoices-widget-controller.ts`, pré-carregado com `outstandingAmount` no `useEffect` de reset
- [x] 5.2 Rotear no controller: `amount >= outstanding` → `updateInvoicePaymentStatusAction`; `amount < outstanding` → `payInvoicePartialAction`
- [x] 5.3 No `invoice-payment-dialog.tsx`: campo "Valor a pagar" (input monetário dos formulários de lançamento) com validação `>0` e `<= outstanding`, atalho "Pagar tudo"
- [x] 5.4 Bloco "Pago: R$X · Restante: R$Y" quando `paidAmount > 0` (oculto se `== 0`); texto do botão adapta (`Pagar R$Y` vs `Pagar parcial R$X`)
- [x] 5.5 `PaymentSuccess` com copy condicional para pagamento parcial

## 6. UI — lista de faturas

- [x] 6.1 Em `invoices-widget-view.tsx`, exibir o valor **restante** (com micro-rótulo) para faturas `pendente` com `paidAmount > 0`, mantendo o badge "Em aberto"

## 7. Verificação

- [x] 7.1 Rodar `pnpm exec next typegen` (ok), `pnpm exec tsc --noEmit` (exit 0), Biome nos arquivos alterados (limpo). Obs: `biome check .` no repo inteiro falha só por CRLF pré-existente do checkout Windows — a CI roda em LF.
- [~] 7.2 Smoke test de `pnpm run build` passou (exit 0, rotas geradas). e2e manual com dados fica a cargo do usuário no ambiente dele.
- [x] 7.3 Atualizar `CHANGELOG.md`, `package.json` e badge do `README.md` para 2.8.0
