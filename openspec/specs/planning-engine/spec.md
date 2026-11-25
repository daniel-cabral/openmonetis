# planning-engine Specification

## Purpose
TBD - created by archiving change planning-engine. Update Purpose after archive.

## Requirements

### Requirement: Three-scenario monthly projection
The engine SHALL project, for each month from the current month to the horizon end, total patrimony, liquid available, required by plans, reserve floor and slack, in pessimistic, base and optimistic series.

#### Scenario: Range inputs
- **WHEN** a plan outflow has min, base and max amounts
- **THEN** the pessimistic series uses max, the base series uses base and the optimistic series uses min

### Requirement: Reserve floor and priority waterfall
The engine SHALL keep the reserve floor (reserve months times cost of living) out of reach of plans and SHALL let active plans claim liquidity in priority order, with earmarked pots usable only by plans that name them.

#### Scenario: Lower priority gives way
- **WHEN** available liquidity above the floor cannot pay every claim of a month
- **THEN** the first failing claim is reported as the plan that gives way and lower priorities that still fit are paid

### Requirement: Plan health
The engine SHALL classify each active plan as on-track (funded in base and pessimistic), at-risk (base only) or off-track (base unfunded) and report the first unfunded month for base and pessimistic.

#### Scenario: At risk
- **WHEN** the base amount fits but the pessimistic amount does not
- **THEN** the plan is at-risk and the pessimistic first unfunded month is that month

### Requirement: Plan types expand into events
Generic goals and consórcio plans SHALL be turned into dated cash-flow events; targets in today's money SHALL be inflated by the plan index forecast.

#### Scenario: Consórcio without bid history
- **WHEN** a consórcio plan has no winning bid recorded
- **THEN** no bid event is produced and mapped installments are still projected

### Requirement: Stress toggles and levers
The engine SHALL report each stress toggle's isolated effect on minimum slack and first unfunded month, and each lever's coverage of plan shortfalls.

#### Scenario: Shift outside window
- **WHEN** a shift lever targets a month outside the plan window
- **THEN** the lever is rejected and the input is unchanged

### Requirement: Ad-hoc cash events
The engine SHALL accept ad-hoc cash inflows and outflows outside any plan, added to or subtracted from general liquidity in their month in every scenario, before plan claims; an outflow MAY take general liquidity below the reserve floor, shown as negative slack.

#### Scenario: Outflow below the floor
- **WHEN** an ad-hoc outflow is larger than the slack of its month
- **THEN** the slack of that month is negative and the reserve is flagged as breached
