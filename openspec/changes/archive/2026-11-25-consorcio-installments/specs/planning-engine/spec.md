## MODIFIED Requirements

### Requirement: Plan types expand into events
Generic goals and consórcio plans SHALL be turned into dated cash-flow events; targets in today's money SHALL be inflated by the plan index forecast. A consórcio plan with a monthly installment SHALL project its installments instead of the flat mapped outflow; without an installment, the mapped outflow is projected as before.

#### Scenario: Consórcio without bid history
- **WHEN** a consórcio plan has no winning bid recorded
- **THEN** no bid event is produced and mapped installments are still projected

#### Scenario: Installment replaces the mapped outflow
- **WHEN** a consórcio plan has a monthly installment and a mapped monthly outflow
- **THEN** only the modeled installments are projected for that plan

## ADDED Requirements

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
