## Why

The engine from `planning-engine` needs real inputs: positions per investment account, plans,
consórcio bid history, cash-flow baselines read from transactions, and a place to keep the
assumption log and the planner conversations. None of that exists in the database today.

## What Changes

- Schema (one versioned migration via `pnpm run db:generate`, never `db:push`):
  - `contas.pote_reservado` flag (earmarked pot, e.g. travel) on existing accounts;
  - `planejamento_ajustes` (per-user settings: planned monthly contribution, reserve months,
    baseline months, IPCA/INCC forecasts, horizon override, stress values, planner model);
  - `planejamento_posicoes` (positions per investment account: amount, liquidity daily |
    maturity month | locked, optional real return, as-of date; history kept by as-of);
  - `planejamento_planos`, `planejamento_eventos`, `planejamento_lances` (winning bid % per
    month), `planejamento_categorias` (category-to-plan mapping);
  - `planejamento_premissas` (assumption log), `planejamento_conversas` and
    `planejamento_mensagens` (planner thread, used by `planning-planner`).
- Pure helpers that classify transactions (income, cost of living, contribution, mapped,
  irregular, ignored), compute baselines and detect irregular annual expenses.
- `fetchPlanningSnapshot(userId)` building `EngineInput` plus the view data the page needs.
- Server actions with Zod, `userId` ownership checks and `revalidateForEntity("planning")`:
  settings, positions replace, earmark flag, plan CRUD and reorder, plan events, winning bid,
  category mappings, assumptions. Transaction-scoped write helpers reused by the planner.

## Capabilities

### New Capabilities

- `planning-data`: persistence and input assembly for financial planning.

### Modified Capabilities

<!-- None. Account balances and the dashboard are untouched: positions are a separate table. -->

## Impact

- `src/db/schema.ts`: new tables, one column on `contas`; `drizzle/00xx_*.sql` + `drizzle/meta`.
- New: `src/features/planning/{queries.ts,actions.ts,actions/*,lib/*}`.
- `src/shared/lib/actions/helpers.ts`: entity `planning` → `/planning`.
- No UI. No version bump. Depends on `planning-engine` types.
- Design notes: `design.md` in this folder.
