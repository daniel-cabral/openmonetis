## ADDED Requirements

### Requirement: Consórcio installments in planner context and proposals
The planner context SHALL include the consórcio installment fields and flag plans with an installment and no mapped category; proposals and hypothetical changes SHALL accept the installment fields in reais.

#### Scenario: Unmapped installment
- **WHEN** a consórcio plan has an installment and no mapped category
- **THEN** the context marks the plan with installmentUnmapped true

#### Scenario: Hypothetical installment
- **WHEN** the planner projects with an update-plan change setting a monthly installment of R$ 2.000
- **THEN** the projection includes that installment and nothing is saved
