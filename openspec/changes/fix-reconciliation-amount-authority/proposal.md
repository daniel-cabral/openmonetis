## Why

Ao conciliar o `Unimed Mãe` pelo vínculo manual, o lançamento ficou com o valor que estava no app —
uma estimativa de recorrente — em vez do valor real do extrato. O uso real distorceu o orçamento em
várias linhas de uma vez.

A causa é de desenho, não de implementação. A change `add-reconciliation-name-mapping` tratou
divergência de valor apenas no caminho da regra `name-period`: `matcher.ts` só preenche
`amountDivergence` quando `decision.rule === "name-period"`, e a UI só monta `amountUpdate` no ramo
`confirm`. O vínculo manual monta `{ action, transactionId, descriptor, name }` sem nenhum campo de
valor, então **nunca** atualiza — silenciosamente. A regra `cents`, que tolera R$ 0,05 em linhas com
parcela, tem o mesmo furo em escala menor.

O vínculo manual é o caminho de primeiro uso: é ali que o de-para é ensinado. Deixá-lo sem
autoridade sobre o valor significa que a primeira conciliação de cada credor grava o valor errado.

## What Changes

- **BREAKING** (de comportamento): a decisão por linha entre "manter o valor do app" e "atualizar
  para o do arquivo" deixa de existir. O arquivo do banco passa a ser sempre a autoridade sobre o
  valor, porque o lançamento pode ser estimativa e o extrato é fato.
- `amountDivergence` passa a ser reportado para **qualquer** regra de casamento, não só
  `name-period` — cobre `cents` e o caso do lançamento editado depois de conciliado.
- O vínculo manual passa a carregar `amountUpdate`, alinhando o valor do lançamento ao do arquivo.
- A tela deixa de perguntar e passa a **avisar**: mostra `app → arquivo` e informa que o valor será
  alinhado ao aplicar, com o desfazer restaurando o anterior.
- Divergência de valor deixa de bloquear o "Aplicar". O único bloqueio que resta é criação sem nome.
- Lançamento dividido continua intocado, agora com o motivo explicado na própria linha.

## Capabilities

### New Capabilities

<!-- Nenhuma. -->

### Modified Capabilities

- `reconciliation-name-mapping`: o requisito **Resolução de divergência de valor** deixa de exigir
  escolha do usuário e passa a alinhar o valor automaticamente, em qualquer caminho de casamento —
  incluindo o vínculo manual, que antes não era coberto.

## Impact

- `src/shared/lib/reconciliation/matcher.ts` — `amountDivergenceOf` perde o filtro por regra.
- `src/features/transactions/lib/reconciliation-review.ts` — `resolveAmountUpdate` novo (autoridade
  do valor num único lugar), `ReconciliationRowDecision["link"]` ganha `amountUpdate`,
  `evaluateApplyBlock` perde o parâmetro de divergência pendente.
- `src/features/transactions/components/reconciliation/reconciliation-review.tsx` — o estado de
  escolha some; os dois botões viram aviso.
- Nada muda no banco, na action de aplicação nem no desfazer: `amountUpdates` e `previousAmount` já
  existiam e continuam iguais.
- **Não corrige dados já gravados.** Os lançamentos conciliados antes desta change mantêm o valor
  estimado e precisam de ajuste manual.
