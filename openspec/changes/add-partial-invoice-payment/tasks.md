## 1. Fundação — notas e reconhecimento

- [ ] 1.1 Em `src/shared/lib/accounts/constants.ts`, adicionar `buildPartialInvoicePaymentNote(cardId, period, shortId)` gerando `AUTO_FATURA:<cardId>:<period>:<shortId>` (reutiliza `ACCOUNT_AUTO_INVOICE_NOTE_PREFIX`)
- [ ] 1.2 Adicionar predicado `isPartialInvoicePaymentNote(note, cardId, period)` (nota do prefixo com sufixo além das 2 partes do pagamento cheio)
- [ ] 1.3 Confirmar por teste que `excludeAutoInvoiceEntries()` (`ilike 'AUTO_FATURA:%'`) casa com a nota parcial gerada em 1.1

## 2. Saldo em aberto derivado (queries)

- [ ] 2.1 Escrever teste da query: `paidAmount`/`outstandingAmount` corretos com 0, 1 e N pagamentos parciais
- [ ] 2.2 Em `src/features/dashboard/invoices/invoices-queries.ts`, calcular `paidAmount` (soma dos `AUTO_FATURA:<cardId>:<period>:*`) e `outstandingAmount` (`|total| − paidAmount`) e expor em `DashboardInvoice`
- [ ] 2.3 Atualizar tipos/mapeamentos de `DashboardInvoice` e helpers que constroem o objeto de fatura

## 3. Server action de pagamento parcial

- [ ] 3.1 Escrever testes da action: parcial simples reduz o restante; N parciais somam; parcial que zera vira `pago` + `isSettled`; guard `amount > outstanding`; guard `amount <= 0`; fatura já quitada; ownership de cartão e conta
- [ ] 3.2 Implementar `payInvoicePartialAction` em `src/features/invoices/actions.ts` (Zod: `{cardId, period, amount, paymentAccountId, paymentDate}`) dentro de `db.transaction()`, calculando `outstanding` na transação
- [ ] 3.3 Inserir (`insert`, nunca upsert) a `Despesa` `AUTO_FATURA:<cardId>:<period>:<shortId>` na conta, `cardId` nulo, `payerId` admin, `isSettled: true`
- [ ] 3.4 Se o pagamento zera o saldo, marcar `invoices.paymentStatus = "pago"` (upsert) + `isSettled` nas compras do cartão
- [ ] 3.5 `revalidateForEntity("cards", userId)` e retorno `ActionResult`

## 4. Reconciliação do pagamento cheio

- [ ] 4.1 Escrever teste: quitar fatura com parciais paga só o restante (não em dobro); quitar fatura já coberta não cria lançamento novo
- [ ] 4.2 Ajustar `updateInvoicePaymentStatusAction` para usar o **saldo em aberto** (`total − parciais`) no valor da `Despesa` de fechamento; se `outstanding == 0`, só flipar status
- [ ] 4.3 Auditar `getPaidInvoicePeriods`, `updatePaymentDateAction` e a busca de data de pagamento em `invoices/queries.ts` para lidar com múltiplas notas `AUTO_FATURA:` por fatura

## 5. UI — dialog e controller

- [ ] 5.1 Adicionar estado `paymentAmount` em `use-invoices-widget-controller.ts`, pré-carregado com `outstandingAmount` no `useEffect` de reset
- [ ] 5.2 Rotear no controller: `amount >= outstanding` → `updateInvoicePaymentStatusAction`; `amount < outstanding` → `payInvoicePartialAction`
- [ ] 5.3 No `invoice-payment-dialog.tsx`: campo "Valor a pagar" (input monetário dos formulários de lançamento) com validação `>0` e `<= outstanding`, atalho "Pagar tudo"
- [ ] 5.4 Bloco "Pago: R$X · Restante: R$Y" quando `paidAmount > 0` (oculto se `== 0`); texto do botão adapta (`Pagar R$Y` vs `Pagar parcial R$X`)
- [ ] 5.5 `PaymentSuccess` com copy condicional para pagamento parcial

## 6. UI — lista de faturas

- [ ] 6.1 Em `invoices-widget-view.tsx`, exibir o valor **restante** (com micro-rótulo) para faturas `pendente` com `paidAmount > 0`, mantendo o badge "Em aberto"

## 7. Regressão e verificação

- [ ] 7.1 Teste de regressão: pagamento parcial **não** aparece em renda nem em despesa no dashboard (`period-overview-queries` / `current-period-overview-queries`)
- [ ] 7.2 Rodar `pnpm exec next typegen`, `pnpm exec tsc --noEmit`, `pnpm run lint`
- [ ] 7.3 Verificação end-to-end no app: registrar parcial, ver restante na lista e no dialog, quitar o restante, conferir dashboard sem inflar renda/despesa
- [ ] 7.4 Atualizar `CHANGELOG.md`, `package.json` e badge do `README.md` conforme a política de versionamento
