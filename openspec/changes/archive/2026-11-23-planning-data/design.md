## Context

Builder decisions the spec left open ("Left to the builder"), recorded so `planning-page` and
`planning-planner` use the same contracts. The spec stays the source of truth for behaviour.

## Decisions

- **D1 Reserve is not a row.** Plan zero is synthesized from `planejamento_ajustes.meses_reserva`;
  it cannot be deleted because it does not exist as a plan. The page renders it as priority 0.
- **D2 Earmark flag lives on `contas`** (`pote_reservado`), as the spec suggests, instead of a new
  holding entity. Only accounts with `tipo_conta = "Conta Investimento"` can be pots or hold
  positions (`INVESTMENT_ACCOUNT_TYPE`).
- **D3 Money columns stay numeric(12,2).** Type-specific plan fields are nullable columns, not
  jsonb, so the money rule holds. Zod inputs and engine values are integer cents; conversion at
  the db boundary only (`toCents` / `centsToDecimal`).
- **D4 Classification of a transaction row** (admin payer only, by `periodo`), first match wins:
  1. transfer (`tipo_transacao = "Transferência"` or `transfer_id` set): `contribution` when the
     account type is `INVESTMENT_ACCOUNT_TYPE` and amount > 0, else `ignored`;
  2. note starts with `ACCOUNT_AUTO_INVOICE_NOTE_PREFIX`, name is `INVOICE_ADJUSTMENT_NAME` or
     `ACCOUNT_BALANCE_ADJUSTMENT_NAME`, or category is `INITIAL_BALANCE_CATEGORY_NAME`: `ignored`;
  3. category `"Investimentos"`: Despesa → `contribution`, Receita → `ignored` (redemption);
  4. Receita: category `"Rendimentos"` → `ignored` (yield lives in positions); note starts with
     `REFUND_NOTE_PREFIX` → `cost` (reduces cost); else `income`;
  5. Despesa: mapped category → `mapped`; irregular category → `irregular`; else `cost`.
- **D5 Irregular annual expenses:** over the last 12 complete months, a category is irregular when
  its `cost` rows fall in 1 or 2 distinct months and its 12-month total is at least
  `IRREGULAR_MIN_SHARE = 0.25` of the mean monthly cost. Its amounts are removed from the
  baseline and re-applied in their calendar months.
- **D6 Baselines** use the last `meses_base` (default 6) complete months, excluding the current
  one. Income and cost stay flat (nominal) over the horizon; only plan targets are inflated.
  Conservative by construction.
- **D7 Mapped categories** become `EnginePlan.mappedMonthlyOutflow` (average over the baseline
  months). Goal plans pay them toward the target; consórcio plans carry them through the horizon
  (engine Tasks 3 and 5).
- **D8 Positions replace by as-of:** saving positions for an account and as-of date deletes rows of
  that account with the same as-of and inserts the new set; older as-of rows remain as history.
  The engine uses the latest as-of per account.
- **D9 Assumption log idempotency:** `planejamento_premissas.proposta_id` (nullable, unique per user)
  lets `planning-planner` refuse applying the same proposal twice.
- **D10 Funding preferences** in the spec (surplus, pot, patrimony) reduce to `potAccountIds`: surplus
  and patrimony feed the same general pool in the engine, so separate flags would change nothing.
