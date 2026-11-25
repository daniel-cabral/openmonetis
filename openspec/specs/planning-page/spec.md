# planning-page Specification

## Purpose
TBD - created by archiving change planning-page. Update Purpose after archive.

## Requirements

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

### Requirement: Consórcio installment editing
The consórcio dialog SHALL let the user enter the monthly installment, the last installment month and the post-bid mode, SHALL show the installment after the bid in the target-month bid preview, and SHALL warn, without blocking, when the plan has an installment and no mapped category.

#### Scenario: Installment without mapped category
- **WHEN** a consórcio plan has a monthly installment and no category mapped
- **THEN** the dialog shows "Mapeie a categoria onde a parcela cai para ela sair do custo de vida." and still saves

#### Scenario: Preview after the bid
- **WHEN** the plan has an installment, a last installment month and bid history
- **THEN** the bid preview shows the line "Parcela após o lance"
