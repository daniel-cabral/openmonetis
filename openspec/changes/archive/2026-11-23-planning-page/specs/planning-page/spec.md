## ADDED Requirements

### Requirement: Planning page layout
The /planning page SHALL show KPIs (total patrimony with staleness, liquid today, reserve floor, first unfunded month and the plan that gives way), a liquidity chart (base area, pessimistic dashed line, required step line) and the plans table with the reserve as row zero.

#### Scenario: New user
- **WHEN** the user has no investment account, plan or settings
- **THEN** the page renders empty states and zero values without errors

### Requirement: Plan editing per type
The user SHALL create, edit, reorder and delete generic goal and consórcio plans, with manual events and category mapping; consórcio shows the bid on both bases.

#### Scenario: Undecided bid base
- **WHEN** a consórcio plan uses base "both"
- **THEN** the dialog shows the bid range on the letter value and on the outstanding balance

### Requirement: Monthly check-in
The check-in SHALL let the user assign contributions of the month to buckets, update positions per investment account and record the winning bid % per consórcio plan.

#### Scenario: Unassigned contribution
- **WHEN** a contribution is not assigned
- **THEN** it is added to daily liquidity in the prefilled lines

### Requirement: Stress, drift and assumptions
The page SHALL show each stress toggle effect, drift signals and the assumption log.

#### Scenario: Reserve below floor
- **WHEN** liquid today is below the reserve floor
- **THEN** the drift banner states the shortfall
