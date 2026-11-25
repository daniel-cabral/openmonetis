## Por quê

O planejador recusa qualquer "e se" que as ferramentas não cobrem: o prompt proíbe calcular e as
ferramentas não aceitam premissas comuns (lance vencedor hipotético, posições, entrada ou saída
avulsa). Caso real: "sem embutido e com lance vencedor de 66%, quanto preciso em caixa para a parcela
remanescente ser paga com renda passiva?" teve como resposta "não sei".

Design aprovado: `docs/superpowers/specs/2026-11-24-planner-scenarios-design.md` (seção "Change A" e
"Grilling"). Esta é a change A; a B (`consorcio-installments`) vem depois.

## O que muda

- Cenário hipotético (`scenario`) em `run_projection` e `simulate_lever`: lance vencedor por plano,
  posições adicionadas/removidas/editadas e entradas/saídas avulsas no caixa. Nunca grava; não existe
  em `propose_change`.
- Motor: `EngineInput.adhocEvents` (entradas/saídas fora de plano, somadas ao caixa geral no mês).
- Calculadora financeira determinística (`lib/finance.ts`) exposta como ferramenta `finance_calc`:
  parcela, prazo, valor presente e capital para renda (perpetuidade ou consumo em N meses). Saída
  sempre marcada `outsideProjection`.
- Prompt: números só de ferramentas, aritmética só via `finance_calc`; perguntar o dado faltante (no
  máximo 2 perguntas) em vez de recusar; declarar premissas; separar projeção de cálculo fora da
  projeção; oferecer ajuste via `propose_change` ao fim. Glossário de `marginPp` corrigido.
- Contexto do planejador expõe as posições com id (necessário para editar/remover no cenário).
- Política de busca: indicador externo pode virar premissa de cenário, com fonte e data.
- `PLANNER_MAX_STEPS` de 8 para 12.

## Capacidades

### Modificadas

- `planning-planner`: cenários hipotéticos, calculadora e premissas declaradas.
- `planning-engine`: entradas/saídas avulsas fora de plano.

## Impacto

- Novos: `src/features/planning/lib/finance.ts`, `src/features/planning/lib/planner/scenario.ts` (e testes).
- Alterados: `lib/engine/{types,project}.ts`, `lib/planner/{llm-input,tools,llm-format,context,system-prompt,stream}.ts`,
  `src/shared/lib/ai/web-search.ts`, `CHANGELOG.md` ([Não lançado]), `README.md` (linha do Planejamento).
- Sem migration, sem bump de versão, sem tag.
