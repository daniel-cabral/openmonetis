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
Every figure the planner shows SHALL come from engine tools; the planner SHALL propose changes only through a typed proposal.

#### Scenario: Invalid proposal
- **WHEN** the model proposes a change for an unknown plan
- **THEN** the tool returns an error and no apply action is offered

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
