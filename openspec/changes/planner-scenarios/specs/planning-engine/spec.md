## ADDED Requirements

### Requirement: Ad-hoc cash events
The engine SHALL accept ad-hoc cash inflows and outflows outside any plan, added to or subtracted from general liquidity in their month in every scenario, before plan claims; an outflow MAY take general liquidity below the reserve floor, shown as negative slack.

#### Scenario: Outflow below the floor
- **WHEN** an ad-hoc outflow is larger than the slack of its month
- **THEN** the slack of that month is negative and the reserve is flagged as breached
