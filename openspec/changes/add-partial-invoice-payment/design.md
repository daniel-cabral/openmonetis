## Context

O modelo de fatura é minimalista: `invoices = { paymentStatus (pendente/pago), period, cardId, userId }` — **sem campo de valor**. O total da fatura é sempre derivado de `SUM(transactions.amount)` do cartão+período (compras são `Despesa` negativa; `Receita` positiva soma).

O pagamento cheio (`updateInvoicePaymentStatusAction`) já é, na prática, um lançamento `Despesa` na conta com nota `AUTO_FATURA:<cardId>:<period>`, mais o flip de `paymentStatus` para `pago` e a marcação das compras como `isSettled`. Essa nota é reconhecida por `excludeAutoInvoiceEntries()` (`not(ilike(note, 'AUTO_FATURA:%'))`), que remove o lançamento dos cálculos de **renda e despesa** do dashboard.

O design completo do brainstorm está em `docs/superpowers/specs/2026-07-09-pagamento-parcial-fatura-design.md` (artefato local, não versionado — `docs/` está no `.gitignore`).

## Goals / Non-Goals

**Goals:**
- Pagar um valor arbitrário de uma fatura, 1 ou N vezes por período.
- O pagamento sai de uma conta (saldo da conta correto) e **não** conta como renda nem como despesa.
- Saldo em aberto derivado, sem denormalização e sem mudança de schema.
- UI não-invasiva: quem paga a fatura inteira continua clicando "Confirmar" como hoje.

**Non-Goals:**
- Migração automática dos lançamentos `Receita`-adiantamento antigos (usuário limpa manualmente).
- Novo status de fatura (`parcial`) — mantém-se `pendente`/`pago`.
- Adiantamento antes do fechamento da fatura ou saldo credor (pagar mais que o devido é bloqueado).

## Decisions

### D1 — Pagamento parcial como lançamento `AUTO_FATURA:` na conta (vs coluna `amountPaid`, vs tabela dedicada)

Cada pagamento parcial é uma `Despesa` na conta com nota `AUTO_FATURA:<cardId>:<period>:<shortId>`. O **mesmo prefixo** do pagamento cheio garante exclusão automática de renda/despesa; o **sufixo único** permite N pagamentos sem colidir com a nota exata do pagamento cheio (lookups por `eq(note, buildInvoicePaymentNote(...))` continuam válidos).

- **Alternativa A (coluna `amountPaid` em `invoices`):** rejeitada — denormaliza (verdade dividida entre coluna e lançamentos, risco de drift), exige migração de schema e ainda precisa do lançamento na conta.
- **Alternativa B (tabela `invoicePayments`):** rejeitada — superfície demais (tabela, relations, queries); a fatura nem sempre existe como linha antes de paga. O app já modela dinheiro como `transactions`.

**Nota de ILIKE:** `AUTO_FATURA:%` não casaria com um prefixo `AUTO_FATURA_PARCIAL:` (na posição do `:` literal o candidato teria `_`). Por isso reutilizamos o prefixo exato `AUTO_FATURA:` com sufixo, nunca um prefixo novo.

### D2 — Saldo em aberto derivado

```
paidAmount(cardId, period)        = SUM(|amount|) dos AUTO_FATURA:<cardId>:<period>:* na conta
outstandingAmount(cardId, period) = |SUM(amount) das compras do cartão| − paidAmount
```

Nunca armazenado. Cancelar um parcial = apagar o lançamento pela UI de lançamentos; o saldo recalcula sozinho.

### D3 — Reconciliação do pagamento cheio

`updateInvoicePaymentStatusAction` passa a criar a `Despesa` de fechamento pelo **saldo em aberto** (`total − parciais`), não pelo total bruto. Se `outstanding == 0`, só marca `pago` sem criar lançamento. Regra única: toda quitação paga exatamente o que falta.

### D4 — Roteamento no cliente

O dialog mantém a UI "burra"; o controller decide a action pelo valor:
- `amount >= outstanding` → `updateInvoicePaymentStatusAction` (quita).
- `amount <  outstanding` → `payInvoicePartialAction` (parcial).

Campo "Valor a pagar" pré-preenchido com `outstandingAmount` → caso cheio inalterado.

## Risks / Trade-offs

- **Corrida entre dois pagamentos simultâneos ultrapassando o total** → `outstanding` é lido **dentro** da `db.transaction()` e o guard `amount <= outstanding` é reavaliado ali; servidor é a fonte da verdade.
- **Regressão: parcial contando como despesa** → travada por teste que verifica exclusão via `excludeAutoInvoiceEntries`; depende do prefixo exato `AUTO_FATURA:` (documentado em D1).
- **Lookups existentes assumirem uma única nota `AUTO_FATURA:` por fatura** → auditar `getPaidInvoicePeriods`, `updatePaymentDateAction` e a busca de data de pagamento em `invoices/queries.ts`; a nota exata do pagamento cheio (2 partes) permanece única, os parciais têm sufixo — mas qualquer código que faça `ilike 'AUTO_FATURA:%'` para "achar o pagamento" precisa lidar com múltiplas linhas.
- **Dados legados inflando renda** → fora de escopo; mitigado por orientação de limpeza manual.
- **Cartões compartilhados (multi-pessoa) — LIMITAÇÃO CONHECIDA, fora de escopo:** `outstandingAmount`, o teto do pagamento parcial e o "Restante" usam o **total bruto** da fatura (soma de todas as pessoas), enquanto a quitação (`updateInvoicePaymentStatusAction`, pré-existente) cobra apenas a **cota do admin**. Em cartão compartilhado isso diverge (o admin poderia pagar mais que a própria cota, e uma fatura marcada `pago` pode exibir `outstandingAmount > 0`). Aceito porque o usuário não utiliza cartões compartilhados; em single-payer bruto == cota e não há divergência. Se multi-pessoa passar a ser usado, alinhar o total (filtrar por `adminPayerId`) entre query, guard e quitação.
- **Corrida entre pagamentos concorrentes** → mitigado com `SELECT ... FOR UPDATE` na linha do cartão (`cards`) dentro de ambas as transações (parcial e quitação), serializando pagamentos da mesma fatura.
- **Reversão de status ao apagar um parcial** → o saldo é derivado e recalcula sozinho, mas `paymentStatus` é flag e só reverte via "desfazer pagamento" (consistente com o pagamento cheio pré-existente); documentado no spec.
