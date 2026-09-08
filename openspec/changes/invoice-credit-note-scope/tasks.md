## 1. Nota de crédito

- [x] 1.1 Teste: a nota de crédito começa com `AUTO_FATURA:` (para herdar a exclusão dos relatórios), é diferente da nota do complemento (para o desfazer não apagá-la) e não casa com o prefixo de pagamento parcial
- [x] 1.2 `constants.ts` — construtor da nota de crédito e o predicado que a distingue das notas de pagamento

## 2. Criação grava a nota

- [x] 2.1 Teste do plano: criação a partir de linha `credit` com destino cartão grava a nota de crédito; criação normal segue sem nota
- [x] 2.2 `reconciliation-plan.ts` — gravar a nota

## 3. Quitação ignora crédito

- [x] 3.1 Teste: `sumInvoicePartialPayments` soma o pagamento parcial e ignora o crédito
- [x] 3.2 `actions.ts` — restringir a soma às notas de pagamento
- [ ] 3.3 Teste: desfazer pagamento remove o complemento e preserva os créditos

## 4. Fechamento

- [x] 4.1 `pnpm exec tsc --noEmit`, `pnpm exec vitest run --maxWorkers=4`, `pnpm exec biome check --formatter-enabled=false .`
- [x] 4.2 Atualizar `CHANGELOG.md`, `package.json` e o badge do `README.md`
- [ ] 4.3 Validar com a fatura de julho/2026: criar os três créditos e conferir que a receita do mês no dashboard não muda
