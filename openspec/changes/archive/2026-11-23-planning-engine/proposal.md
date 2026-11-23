## Why

Planning today happens outside the app, in ad hoc chats over CSV exports. The approved design
(`docs/superpowers/specs/2026-11-23-financial-planning-design.md`) moves it into OpenMonetis and
forbids the LLM from producing numbers: every figure must come from deterministic code. That code
has to exist, and be trusted, before any table, page or chat is built on it.

## What Changes

- New pure module `src/features/planning/lib/engine/` (no db, no React, no Next imports):
  - month-by-month projection over a horizon (default: furthest plan month + 12) in three parallel
    scenarios (pessimistic, base, optimistic), each taking the matching end of every range;
  - position buckets by liquidity (daily, maturity month, locked), nominal growth from expected
    real return plus the IPCA forecast, matured money reinvested as daily liquidity;
  - priority waterfall: emergency reserve floor first (N months of cost of living), then plans in
    priority order; earmarked pots usable only by plans that name them; the first failing claim
    "gives way" and lower priorities keep claiming;
  - plan types turning fields into events: generic goal (today's money inflated by IPCA or INCC,
    mapped-category outflows paid toward the target) and consórcio (winning % + margin, range from
    recent history, letter or outstanding-balance base or both, embedded-bid toggle; no FGTS);
  - plan health (on-track, at-risk, off-track) and first unfunded month for base and pessimistic;
  - stress toggles (contribution cap, income loss for N months, bid at range max, plan cost +X%)
    and their isolated effect on minimum slack and first unfunded month;
  - funding levers (expense cut, redirect pot, contribution change, shift a flexible plan inside
    its window) with coverage of each plan's shortfall;
  - drift signals (plan at risk/off track, reserve below floor, contribution below plan for two
    consecutive months).
- Unit tests with synthetic round values only.

## Capabilities

### New Capabilities

- `planning-engine`: deterministic projection, waterfall, plan types, stress, levers and drift.

### Modified Capabilities

<!-- None. -->

## Impact

- New: `src/features/planning/lib/engine/*.ts` and colocated `*.test.ts`.
- No schema, route, UI or dependency change. No version bump (nothing user-visible).
- Consumers: `planning-data` (builds `EngineInput`), `planning-page` (runs `runProjection` on the
  client), `planning-planner` (tools call `runProjection`, `simulateLever`, `stressEffects`).
