## ADDED Requirements

### Requirement: Consórcio installment fields
The system SHALL store, per consórcio plan, an optional monthly installment, last installment month and post-bid mode in nullable columns added by a versioned migration, and SHALL reject an installment without a last installment month or a last installment month not after the target month.

#### Scenario: Last installment before the bid
- **WHEN** the user saves a consórcio plan whose last installment month is the target month or earlier
- **THEN** the save fails with "A última parcela deve ser depois do mês alvo." and nothing is written

#### Scenario: Existing plans
- **WHEN** the migration runs on a database with consórcio plans
- **THEN** existing plans keep working with the three fields empty
