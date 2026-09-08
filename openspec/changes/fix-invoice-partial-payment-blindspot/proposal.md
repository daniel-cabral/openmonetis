## Why

Marcar uma fatura como paga criou um lançamento de despesa de R$ 6.899,44 que nunca existiu, e
como ele nasce com nota `AUTO_FATURA:` fica readonly — o usuário não consegue nem apagar.

O caso real, fatura de julho/2026 do C6 Carbon:

| | |
|---|---|
| Compras da fatura | R$ 19.484,72 |
| Estorno de tarifa | −R$ 98,00 |
| Adiantamento em 15/06 (`Inclusao de Pagamento`) | −R$ 5.222,62 |
| Adiantamento em 26/06 (`Inclusao de Pagamento`) | −R$ 2.000,00 |
| **Total da fatura** | **R$ 12.164,10** |
| Boleto pago em 10/07 | R$ 12.164,10 |

A fatura estava quitada. Mas `sumInvoicePartialPayments` só soma lançamentos cuja nota começa com
o prefixo `AUTO_FATURA:<cardId>:<period>` — isto é, apenas pagamentos feitos **pelo próprio fluxo
de fatura**. Os dois adiantamentos entraram no app como despesas da conta corrente (via conciliação
do extrato, onde aparecem como `PGTO FAT CARTAO C6`) e nunca foram vinculados à fatura. Ficaram
invisíveis.

Com isso a quitação calculou `19.063,54 − 12.164,10 = 6.899,44` de saldo restante e lançou a
diferença. Se os adiantamentos tivessem sido abatidos o cálculo daria `−323,18`, o
`Math.max(0, …)` zeraria e **nenhum lançamento seria criado**.

O prejuízo é duplo: distorce o saldo da conta e o lançamento resultante não pode ser removido pela
tela de lançamentos, só desfazendo o pagamento da fatura — o que o usuário não descobre sozinho.

## What Changes

- `sumInvoicePartialPayments` passa a considerar também os pagamentos de fatura que chegaram por
  fora do fluxo: lançamentos da conta vinculada ao cartão, no período, reconhecidos como pagamento
  de fatura.
- Quando o saldo restante calculado for zero ou negativo, nenhum lançamento de complemento é criado
  — comportamento que já existe via `Math.max(0, …)` e passa a ter teste.
- A tela de quitação SHALL exibir o que está sendo abatido e o valor do complemento **antes** de
  gravar, para que um número errado não vire lançamento silencioso.

## Capabilities

### New Capabilities

<!-- Nenhuma. -->

### Modified Capabilities

- `invoice-payment`: o cálculo do saldo restante na quitação passa a abater todo pagamento de
  fatura do período, não só os registrados pelo fluxo de fatura.

## Impact

- `src/features/invoices/actions.ts` — `sumInvoicePartialPayments` e os dois pontos que a usam
  (`updateInvoicePaymentStatusAction`, `payInvoicePartialAction`).
- `src/features/invoices/components/invoice-summary-card.tsx` — a confirmação antes de gravar.
- **Não corrige dados já gravados.** Faturas quitadas antes desta change podem ter complemento
  indevido; a remoção é pelo "Desfazer pagamento" da própria fatura.
- Depende da classificação `credit` / `invoice-payment` introduzida em
  `add-reconciliation-name-mapping`, que já distingue pagamento de fatura de crédito comum.
