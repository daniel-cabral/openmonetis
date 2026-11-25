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
Generic goals and consórcio plans SHALL be turned into dated cash-flow events; targets in today's money SHALL be inflated by the plan index forecast. A consórcio plan with a monthly installment SHALL project its installments instead of the flat mapped outflow; without an installment, the mapped outflow is projected as before.

#### Scenario: Consórcio without bid history
- **WHEN** a consórcio plan has no winning bid recorded
- **THEN** no bid event is produced and mapped installments are still projected

#### Scenario: Installment replaces the mapped outflow
- **WHEN** a consórcio plan has a monthly installment and a mapped monthly outflow
- **THEN** only the modeled installments are projected for that plan

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

### Requirement: Consórcio installments around the bid
For a consórcio plan with a monthly installment (today's money) and a last installment month after the target month, the engine SHALL project the installment corrected by the plan index every month up to and including the target month, the bid in the target month, and after it the remaining balance (installment at the target month times the months left, minus the total bid including the embedded part, floored at zero) paid either with a reduced installment over the same months (reduce-installment, default) or with the same installment over fewer months (reduce-term), also corrected by the index. Each scenario derives its post-bid installments from its own bid amount. Without bid history, the installment runs unchanged to the last installment month.

#### Scenario: Reduce installment
- **WHEN** the installment is R$ 2.000, 21 months remain after the target month and the total bid is R$ 30.000
- **THEN** each of the 21 post-bid months carries R$ 571,43

#### Scenario: Reduce term
- **WHEN** the same plan uses reduce-term
- **THEN** R$ 2.000 is projected for the 6 months after the target month and nothing after

#### Scenario: Bid covers the balance
- **WHEN** the total bid is larger than the remaining balance
- **THEN** no installment is projected after the target month
