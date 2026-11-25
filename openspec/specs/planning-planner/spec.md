# planning-planner Specification

## Purpose
TBD - created by archiving change planning-planner. Update Purpose after archive.

## Requirements

### Requirement: Docked planner chat
The planning page SHALL embed a streaming chat persisted per conversation, using the configured LLM provider, with a notice that financial data is sent to that provider.

#### Scenario: Reload
- **WHEN** the user reloads the page
- **THEN** the latest conversation is shown with its messages

### Requirement: Deterministic figures
Every figure the planner shows SHALL come from a tool: plan figures from the engine tools, any other arithmetic from the financial calculator tool, never computed by the model; the planner SHALL propose changes only through a typed proposal.

#### Scenario: Invalid proposal
- **WHEN** the model proposes a change for an unknown plan
- **THEN** the tool returns an error and no apply action is offered

#### Scenario: Calculation outside the projection
- **WHEN** the planner computes an installment, a term, a present value or the capital for a passive income
- **THEN** the figure comes from the financial calculator and is marked as outside the projection

### Requirement: Approved changes only
A proposal SHALL change data only when the user clicks Aplicar, in one transaction, recorded in the assumption log with source planner, at most once per proposal.

#### Scenario: Double apply
- **WHEN** the same proposal is applied twice
- **THEN** the second attempt returns "Proposta já aplicada." and writes nothing

### Requirement: Web search degrades gracefully
Web search SHALL be offered only for providers that support it.

#### Scenario: Local model
- **WHEN** the selected model is an Ollama model
- **THEN** the chat works without a web search tool

### Requirement: Drift discussion
The drift banner SHALL offer to discuss with the planner, prefilling the composer with the diagnosis without sending it.

#### Scenario: Prefill
- **WHEN** the user clicks "Discutir com o planejador"
- **THEN** the composer contains the diagnosis and nothing is sent

### Requirement: Hypothetical scenarios
The projection and lever tools SHALL accept an optional hypothetical scenario (winning bid per consórcio plan, added, removed or edited positions, ad-hoc cash inflows and outflows) that is applied only to that call and never persisted.

#### Scenario: Hypothetical winning bid
- **WHEN** the planner projects with a winning bid of 66% for a consórcio plan with margin 3
- **THEN** the bid in the target month uses 69% in every scenario and no data changes

#### Scenario: Unknown reference
- **WHEN** the scenario names a plan or position that does not exist
- **THEN** the tool returns an error to the model and projects nothing

### Requirement: Declared assumptions and missing data
The planner SHALL ask for user-specific data a hypothesis needs (at most 2 questions at a time) instead of refusing, SHALL list the assumptions used in every numeric answer, separating plan projection from calculations outside the projection, and MAY offer, at the end of a simulation, to adjust the plans through a proposal.

#### Scenario: Missing group term
- **WHEN** the user asks for the post-bid installment and the remaining term of the group is unknown
- **THEN** the planner asks for the term before answering

### Requirement: External indicators as scenario assumptions
When web search is available, an external indicator (projected IPCA, Selic, consórcio market) MAY be used as a scenario assumption, citing source and date, and SHALL NOT be recorded without the user's confirmation.

#### Scenario: Projected IPCA from the web
- **WHEN** the planner uses a projected IPCA found on the web in a simulation
- **THEN** the answer cites source and date and nothing is recorded
