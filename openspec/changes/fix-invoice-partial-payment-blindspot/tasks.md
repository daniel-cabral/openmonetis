## 1. Reproduzir

- [ ] 1.1 Teste que reproduz o caso real: fatura de R$ 19.063,54, pagamento de R$ 12.164,10 pelo fluxo e adiantamentos de R$ 5.222,62 e R$ 2.000,00 na conta corrente — hoje gera complemento de R$ 6.899,44, deve gerar zero

## 2. Cálculo

- [ ] 2.1 `sumInvoicePartialPayments` passa a somar também os pagamentos de fatura do período que estão na conta vinculada ao cartão, além dos que têm a nota `AUTO_FATURA:`
- [ ] 2.2 Garantir que a soma não conte o mesmo lançamento duas vezes quando ele tem a nota e está na conta
- [ ] 2.3 Teste do saldo restante negativo: pagamentos acima do valor da fatura não criam lançamento nem quebram a quitação

## 3. Anúncio antes de gravar

- [ ] 3.1 `invoice-summary-card.tsx` — exibir valor da fatura, total abatido e complemento a lançar, com confirmação
- [ ] 3.2 Quando o complemento for zero, informar que a fatura já está coberta

## 4. Fechamento

- [ ] 4.1 `pnpm exec tsc --noEmit`, `pnpm exec vitest run --maxWorkers=4`, `pnpm exec biome check --formatter-enabled=false .`
- [ ] 4.2 Atualizar `CHANGELOG.md`, `package.json` e o badge do `README.md`
- [ ] 4.3 Validar na instância com a fatura de julho/2026, que é o caso real
