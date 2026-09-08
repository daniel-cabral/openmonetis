## 1. Janela

- [x] 1.1 `DATE_WINDOW_DAYS` de 1 para 2, com a tabela da medição no comentário da constante
- [x] 1.2 Ajustar os dois testes que fixavam distâncias calibradas para ±1, preservando a intenção de cada um (um candidato dentro da janela, um fora)
- [x] 1.3 Teste novo fixando o teto: candidato a dois dias casa, a três não

## 2. Fechamento

- [x] 2.1 `pnpm exec tsc --noEmit`, `pnpm exec vitest run --maxWorkers=4`, `pnpm exec biome check --formatter-enabled=false .`
- [x] 2.2 Atualizar `CHANGELOG.md`, `package.json` e o badge do `README.md` (2.11.0 → 2.11.1)
- [ ] 2.3 Validar na instância: conciliar o extrato e confirmar que as linhas de borda que ficavam em "só no banco" passam a casar
