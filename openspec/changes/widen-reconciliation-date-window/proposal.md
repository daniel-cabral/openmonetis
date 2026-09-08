## Why

A janela de data do matcher era de ±1 dia, escolhida na change original a partir da defasagem
observada entre `Data Lançamento` e `Data Contábil` do extrato. No uso real ela deixa linhas órfãs
na borda: o débito cai dois dias depois do que o usuário lançou e nada casa.

Antes de mexer, o efeito foi medido sobre um mês real — 58 linhas do extrato contra 63 lançamentos
do app — contando quantas linhas casariam com candidato único, quantas ficariam ambíguas e quantas
não achariam par:

| janela | casa sozinho | ambíguo | sem par |
|---|---|---|---|
| ±1 | 47 | 6 | 5 |
| **±2** | **47** | 11 | **0** |
| ±3 | 46 | 12 | 0 |
| ±5 | 44 | 14 | 0 |
| ±7 | 42 | 16 | 0 |

±2 é o teto útil: mantém os mesmos 47 casamentos automáticos e zera as órfãs de borda, ao custo de
5 desempates manuais. De ±3 em diante a janela piora nos **dois** sentidos ao mesmo tempo — casa
menos e gera mais ambiguidade — porque valores repetidos no mês passam a se cruzar.

## What Changes

- `DATE_WINDOW_DAYS` passa de 1 para 2, com a medição registrada no próprio código para que a
  constante não seja alargada de novo por intuição.
- Teste fixando o teto: um candidato a dois dias casa, um a três não.

## Capabilities

### New Capabilities

<!-- Nenhuma. -->

### Modified Capabilities

- `statement-reconciliation`: o requisito **Classificação determinística das linhas** passa a
  descrever folga de ±2 dias em vez de ±1.

## Impact

- `src/shared/lib/reconciliation/matcher.ts` — uma constante e o comentário que a justifica.
- Nenhuma mudança de banco, action ou UI.
- **Não resolve** recorrente de data fixa distante do débito (Aluguel, Colégio, Apoio Aline, que
  ficam a 4-5 dias). Esse caso é do de-para de nome, que ignora data — alargar a janela até lá
  degradaria o matching de todo o resto.
