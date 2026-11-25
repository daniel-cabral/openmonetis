# planning-data Specification

## Purpose
TBD - created by archiving change planning-data. Update Purpose after archive.

## Requirements

### Requirement: Planning persistence
The system SHALL store settings, positions per investment account by as-of date, plans, plan events, monthly winning bids, category-to-plan mappings, the assumption log and planner conversations, through a versioned migration.

#### Scenario: Positions history
- **WHEN** the user saves positions of an account for a new as-of date
- **THEN** older as-of rows remain and the engine uses the latest set

### Requirement: Engine input from transactions
The system SHALL derive income baseline, cost of living, contributions and irregular annual expenses from the admin payer transactions, excluding adjustments, invoice payments, contributions and mapped categories from cost of living.

#### Scenario: Invoice payment
- **WHEN** a card purchase and its automatic invoice payment exist
- **THEN** only the purchase counts in cost of living

### Requirement: Validated and owned mutations
Every planning action SHALL validate input with Zod, act only on records of the current user and revalidate /planning.

#### Scenario: Foreign record
- **WHEN** an action receives an id owned by another user
- **THEN** it fails with "Registro não encontrado." and writes nothing

### Requirement: Assumption log on settings change
Changing the planned contribution or an index forecast SHALL add a dated assumption entry with source user.

#### Scenario: Forecast change
- **WHEN** the user changes the IPCA forecast
- **THEN** one index assumption entry is recorded

### Requirement: Consórcio installment fields
The system SHALL store, per consórcio plan, an optional monthly installment, last installment month and post-bid mode in nullable columns added by a versioned migration, and SHALL reject an installment without a last installment month or a last installment month not after the target month.

#### Scenario: Last installment before the bid
- **WHEN** the user saves a consórcio plan whose last installment month is the target month or earlier
- **THEN** the save fails with "A última parcela deve ser depois do mês alvo." and nothing is written

#### Scenario: Existing plans
- **WHEN** the migration runs on a database with consórcio plans
- **THEN** existing plans keep working with the three fields empty
