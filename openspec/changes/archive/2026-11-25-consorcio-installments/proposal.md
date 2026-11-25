## Por quê

No motor o consórcio só tem o lance (saída única no mês alvo) e uma linha plana com a média das
categorias mapeadas por todo o horizonte, sem parar na contemplação. A projeção não mostra a parcela
até o lance nem o saldo remanescente depois dele (redução de parcela ou de prazo), que é justamente a
pergunta que motivou o projeto.

Design aprovado: `docs/superpowers/specs/2026-11-24-planner-scenarios-design.md` (seção "Change B" e
"Grilling" 8-15). Depende da change A (`planner-scenarios`) entregue.

## O que muda

- Três campos opcionais no consórcio: `monthlyInstallment` (parcela atual em valor de hoje),
  `lastInstallmentMonth` (YYYY-MM da última parcela) e `postBidMode` (`reduce-installment` padrão ou
  `reduce-term`). Sem parcela, o comportamento atual se mantém.
- DB: colunas anuláveis `parcela_mensal numeric(12,2)`, `ultima_parcela text`, `modo_pos_lance text` em
  `planejamento_planos`, migration gerada pelo `drizzle-kit generate`.
- Motor: com parcela, a linha plana mapeada dá lugar à parcela corrigida pelo índice do plano até o mês
  alvo, ao lance e, depois, ao saldo remanescente (saldo = parcela no alvo × meses restantes − lance
  total) pago com parcela reduzida ou prazo reduzido.
- Validação: `lastInstallmentMonth` deve ser depois do mês alvo; parcela exige o mês da última parcela.
- Tela do plano: campos novos, linha "Parcela após o lance" na prévia e aviso quando há parcela sem
  categoria mapeada (risco de contar a parcela duas vezes). O contexto do planejador recebe a mesma
  sinalização e os campos novos; o cenário da A aceita os campos via `changes`/`update-plan`.

## Capacidades

### Modificadas

- `planning-engine`: parcelas do consórcio antes e depois do lance.
- `planning-data`: persistência dos campos novos.
- `planning-page`: edição dos campos, prévia pós-lance e aviso de mapeamento.
- `planning-planner`: campos e aviso no contexto e nas propostas.

## Impacto

- Alterados: `src/db/schema.ts`, `drizzle/00xx_*.sql` (gerado), `lib/engine/{types,plan-types/consorcio}.ts`,
  `lib/{schemas,mappers,writes,plan-form,consorcio-preview}.ts`, `lib/planner/{llm-input,context,describe-change,system-prompt}.ts`,
  `components/plan-dialog/{consorcio-fields,plan-dialog}.tsx`, `CHANGELOG.md` ([Não lançado]), `README.md`.
- Deploy aplica a migration via `drizzle-kit migrate` no entrypoint. Sem bump de versão, sem tag.
