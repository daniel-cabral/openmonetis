## Why

Hoje o app só permite pagar uma fatura de cartão de forma **tudo-ou-nada**: o fluxo de pagamento quita 100% da fatura do período. Quem precisa abater apenas parte da fatura improvisa lançando uma `Receita` no cartão — o que abate o total da fatura (efeito colateral do sinal positivo em `SUM(amount)`), mas **conta integralmente como renda** no dashboard, como se o usuário tivesse recebido dinheiro. Não existe pagamento parcial nem estado de saldo em aberto.

## What Changes

- Nova Server Action `payInvoicePartialAction` que registra o pagamento de um valor arbitrário de uma fatura (1 ou N vezes por período), como uma `Despesa` na conta com nota no prefixo `AUTO_FATURA:` — já excluída de renda **e** despesa por `excludeAutoInvoiceEntries()`.
- Saldo em aberto **derivado** (`|total do cartão| − soma dos pagamentos parciais`), sem armazenar valor pago em coluna nova. **Sem mudança de schema.**
- Reconciliação do fluxo de pagamento cheio (`updateInvoicePaymentStatusAction`): ao quitar, passa a pagar apenas o **saldo restante**, não o total bruto — evitando pagar em dobro quando já houve parciais.
- UI: campo "Valor a pagar" no dialog de pagamento existente (pré-preenchido com o saldo em aberto, editável para baixo), bloco "Pago / Restante" e exibição do restante na lista de faturas.
- **Sem novo status**: a fatura continua `pendente` (label "Em aberto") até quitar 100%; a UI apenas mostra o valor restante.

## Capabilities

### New Capabilities
- `invoice-payment`: comportamento de pagamento de fatura de cartão, incluindo pagamento cheio (quitação), pagamento parcial de valor arbitrário, cálculo do saldo em aberto derivado, e a garantia de que pagamentos não contam como renda nem como despesa.

### Modified Capabilities
<!-- Nenhuma: não há specs existentes em openspec/specs/. -->

## Impact

- **Código:**
  - `src/features/invoices/actions.ts` — nova action `payInvoicePartialAction` + reconciliação do fluxo cheio.
  - `src/shared/lib/accounts/constants.ts` — helper `buildPartialInvoicePaymentNote` + predicado de reconhecimento (reutiliza o prefixo `AUTO_FATURA:`).
  - `src/features/dashboard/invoices/invoices-queries.ts` — campos derivados `paidAmount` e `outstandingAmount` em `DashboardInvoice`.
  - `src/features/dashboard/components/invoices/invoice-payment-dialog.tsx` — campo de valor + bloco de saldo.
  - `src/features/dashboard/invoices/use-invoices-widget-controller.ts` — estado `paymentAmount` + roteamento entre as duas actions.
  - `src/features/dashboard/components/invoices/invoices-widget-view.tsx` — restante na lista.
- **Schema/DB:** nenhum (modelo derivado sobre `transactions`).
- **Regressão a proteger:** pagamento parcial não pode aparecer em renda nem em despesa no dashboard (`excludeAutoInvoiceEntries`).
- **Dados legados:** as `Receita`-adiantamento antigas não são migradas automaticamente; o usuário limpa manualmente pela UI (decisão de escopo).
