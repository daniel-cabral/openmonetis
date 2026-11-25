## ADDED Requirements

### Requirement: Consórcio installment editing
The consórcio dialog SHALL let the user enter the monthly installment, the last installment month and the post-bid mode, SHALL show the installment after the bid in the target-month bid preview, and SHALL warn, without blocking, when the plan has an installment and no mapped category.

#### Scenario: Installment without mapped category
- **WHEN** a consórcio plan has a monthly installment and no category mapped
- **THEN** the dialog shows "Mapeie a categoria onde a parcela cai para ela sair do custo de vida." and still saves

#### Scenario: Preview after the bid
- **WHEN** the plan has an installment, a last installment month and bid history
- **THEN** the bid preview shows the line "Parcela após o lance"
