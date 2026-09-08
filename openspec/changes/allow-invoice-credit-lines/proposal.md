## Why

Marcar uma fatura como paga criou uma despesa de R$ 6.899,44 que nunca existiu, readonly por nascer
com nota `AUTO_FATURA:`. O caso real, fatura de julho/2026 do C6 Carbon:

```
Compras da fatura ................. 19.484,72
Estorno Tarifa (04/07) ............     −98,00
Inclusao de Pagamento (15/06) .....  −5.222,62
Inclusao de Pagamento (26/06) .....  −2.000,00
Total da fatura ................... 12.164,10   = o boleto pago em 10/07
```

A fatura estava quitada. Mas o app calcula o valor da fatura somando **apenas as compras**
(R$ 19.063,54 nos lançamentos do cartão no período) e desconhece os R$ 7.320,62 de crédito. Ao
quitar, achou um saldo restante de R$ 6.899,44 e o lançou.

A causa está na change `add-reconciliation-name-mapping`: a decisão D13 mandou toda linha não-compra
para um balde informativo **sem ação nenhuma**. Isso é correto para `Pag Fatura Boleto`, que quita a
fatura anterior e não pertence a esta. É errado para `Inclusao de Pagamento` e `Estorno`, que são
crédito **desta** fatura e deveriam abatê-la — a própria change já os separa em `credit` e
`invoice-payment`, mas trata os dois igual na tela.

Com os créditos lançados, o cálculo da quitação dá `11.742,92 − 12.164,10` — negativo, o
`Math.max(0, …)` zera e nenhum complemento nasce. Sem tocar em `sumInvoicePartialPayments`, cujo
abatimento por "reconhecer" um pagamento na conta corrente exigiria casar descrição por texto.

## What Changes

- Linha classificada como `credit` passa a poder virar lançamento de **receita no cartão**,
  abatendo o valor da fatura. Sai do balde informativo e ganha ação de criação, como o balde
  "só no banco".
- O balde informativo passa a conter **apenas** `invoice-payment` — pagamento da fatura anterior,
  que segue sem ação porque já é despesa da conta corrente e lançá-lo duplicaria a saída.
- **BREAKING** em relação à decisão D13 de `add-reconciliation-name-mapping`, que não distinguia os
  dois casos na tela.
- A quitação SHALL anunciar o complemento antes de gravar: valor da fatura, total abatido e o que
  será lançado. O pior desse bug não foi o número errado, foi virar lançamento readonly sem aviso.

## Capabilities

### New Capabilities

<!-- Nenhuma. -->

### Modified Capabilities

- `invoice-closure-correction`: o requisito do balde informativo passa a valer só para pagamento de
  fatura; crédito ganha ação de lançamento.

## Impact

- `src/features/transactions/lib/reconciliation-review.ts` — `isNonPurchaseLine` deixa de agrupar
  os dois tipos; entra um predicado por tipo.
- `src/features/transactions/components/reconciliation/reconciliation-review.tsx` — o balde de
  crédito ganha ação; o informativo encolhe.
- `src/features/transactions/lib/reconciliation-plan.ts` — criação a partir de linha de crédito
  gera receita, não despesa.
- `src/features/invoices/components/invoice-summary-card.tsx` — o anúncio antes de gravar.
- **Não corrige dados já gravados.** Complementos indevidos saem pelo "Desfazer pagamento" da
  fatura, e os créditos passados precisam ser lançados na conciliação seguinte.
