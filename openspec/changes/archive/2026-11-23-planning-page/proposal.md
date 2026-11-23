## Why

With the engine and the data layer in place, the user still has no screen. The approved layout
(option C, preview at `src/app/preview-planning?v=c`) puts KPIs on top, the planner docked left
and the liquidity chart above the plans table on the right. This change ships that page with a
placeholder where the chat will go, plus the monthly check-in that keeps upkeep under 30 minutes.

## What Changes

- Route `/planning` (thin page) and navbar item "Planejamento".
- Layout C: header with "Check-in de <mês>" and "Ajustes"; KPI row (total patrimony with
  staleness, liquid today, reserve floor, first unfunded month + plan that gives way); left 2/5
  placeholder panel for the planner; right 3/5 liquidity chart (base area, pessimistic dashed
  line, required step line) above the plans table (priority, type, non-negotiable tag, coverage
  progress, status badge), reserve as row zero.
- Plan dialogs per type (generic goal, consórcio) with manual events and category mapping.
- Monthly check-in dialog: contributions of the month assigned to buckets (prefilling position
  lines), balance update per investment account (with earmark toggle and staleness), winning bid
  % per consórcio plan.
- Settings dialog (planned contribution, reserve months, index forecasts, horizon, stress values),
  stress card showing each toggle's effect, drift banner, assumption log card.
- Remove the temporary `src/app/preview-planning/`.
- Projection runs on the client from `snapshot.input` (pure engine), so later previews are cheap.

## Capabilities

### New Capabilities

- `planning-page`: planning screen, plan editing and monthly check-in.

### Modified Capabilities

<!-- None. -->

## Impact

- New: `src/app/(dashboard)/planning/page.tsx`, `src/features/planning/components/**`,
  `src/features/planning/lib/{view-model,plan-form,check-in,labels}.ts`.
- Modified: `src/shared/components/navigation/navbar/nav-items.tsx`.
- Removed: `src/app/preview-planning/`.
- `CHANGELOG.md`, `package.json`, README badge: next minor version.
- Depends on `planning-engine` and `planning-data`.
