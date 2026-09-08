## Why

A change `allow-invoice-credit-lines` (2.11.2) deixou o crédito da fatura — adiantamento e estorno —
virar lançamento de receita no cartão, para que a fatura no app reflita o valor real. O efeito sobre
a fatura está certo, mas o lançamento criado **entra nos relatórios como receita**.

Cerca de dez consultas (orçamentos, dashboard, insights, relatórios, análise de parcelas) excluem os
movimentos de fatura por `note NOT LIKE 'AUTO_FATURA:%'`. Um lançamento criado pela conciliação não
tem essa nota. Na fatura real de julho/2026 isso somaria **R$ 7.320,62 de receita inexistente** no
mês — trocando o complemento indevido por uma distorção de tamanho parecido em outro lugar.

Crédito de fatura não é renda: é movimento entre conta e cartão, da mesma natureza do pagamento.

A nota não pode ser nenhuma das duas que existem:

- `AUTO_FATURA:<cardId>:<period>` (complemento da quitação) — o "Desfazer pagamento" apaga por
  igualdade exata e levaria os créditos junto.
- `AUTO_FATURA:<cardId>:<period>:<shortId>` (pagamento parcial) — `sumInvoicePartialPayments` soma
  tudo sob esse prefixo, e como o crédito já reduz o total da fatura ao ser receita no cartão, ele
  seria abatido **duas vezes** no cálculo da quitação.

## What Changes

- Nota própria para crédito de fatura, sob o prefixo `AUTO_FATURA:` para herdar a exclusão dos
  relatórios, mas distinguível das outras duas: preservada pelo desfazer e fora da soma de
  pagamentos.
- `buildReconciliationPlan` grava essa nota ao criar lançamento a partir de linha `credit` com
  destino cartão.
- `sumInvoicePartialPayments` passa a somar apenas as notas de pagamento, ignorando as de crédito.
- O "Desfazer pagamento" continua removendo apenas o complemento.

## Capabilities

### New Capabilities

<!-- Nenhuma. -->

### Modified Capabilities

- `invoice-closure-correction`: o requisito do crédito passa a exigir que o lançamento criado seja
  excluído de renda e despesa nos relatórios.

## Impact

- `src/shared/lib/accounts/constants.ts` — construtor da nota de crédito.
- `src/features/transactions/lib/reconciliation-plan.ts` — grava a nota na criação a partir de
  linha `credit`.
- `src/features/invoices/actions.ts` — `sumInvoicePartialPayments` deixa de contar créditos.
- Nenhuma mudança nas ~10 queries de relatório: elas já filtram pelo prefixo `AUTO_FATURA:`.
- **Nenhum dado a refazer**: a 2.11.2 subiu há minutos e nenhuma conciliação de fatura foi aplicada
  desde então, então não existe crédito gravado sem a nota.
