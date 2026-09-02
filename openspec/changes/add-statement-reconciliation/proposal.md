## Why

Hoje todo lançamento é digitado à mão, copiado do app do banco, **sem nenhuma conferência contra a fonte**. O resultado previsível já acontece: entradas esquecidas e entradas duplicadas, tanto na conta corrente quanto na fatura do cartão. O app tem import de OFX/XLS, mas ele só *cria* lançamentos — não compara o que já existe com o que o banco diz, e sua proteção contra duplicata (`buildOfxFingerprintPayload`) retorna `null` quando não há `FITID`, ou seja, não cobre CSV nem lançamento manual.

O C6 — único banco em uso — exporta CSV de extrato e de fatura sem identificador nenhum, mas com dois presentes: o extrato traz `Saldo do Dia` (que permite provar o fechamento por aritmética, independente de qualquer heurística) e a fatura traz o campo `Parcela` no formato `N/M` (que identifica a parcela sem adivinhação).

## What Changes

- Novos parsers de CSV do C6 (extrato e fatura) em `src/shared/lib/import/parsers/`, atrás do contrato `ImportStatement` já existente, num registro de perfis de banco com detecção por assinatura de cabeçalho — detecção sugere, usuário confirma.
- Campos opcionais novos em `ImportedTransaction`: `postedDate` (Data Contábil), `dayBalance` (Saldo do Dia), `installment {current,total}`, `cardLast4`, `holderName`, `fx {amount,rate}`.
- Motor de conciliação determinístico que classifica cada linha do arquivo e cada lançamento do período em quatro baldes: **casada**, **só no banco**, **só no app**, **ambígua**. Ambiguidade nunca é resolvida automaticamente.
- Verificação aritmética independente do matching: no extrato, `saldo[d] − saldo[d−1]` contra a soma dos lançamentos por `Data Contábil`; na fatura, soma das compras (excluindo pagamentos e estornos) contra o total. Transforma "acho que conciliei" em "está provado que fechou".
- Identidade de linha de CSV reusando a coluna `lancamentos.ofx_import_fingerprint` (criada pela migration `0034` do upstream, com índice único parcial `user_id + fingerprint`), gerada por ocorrência posicional no lugar do `FITID` ausente. Reimportar o mesmo arquivo passa a ser idempotente.
- **Conciliar grava o fingerprint no lançamento manual existente** — sem tabela de vínculo. Efeito colateral desejado: o índice único do upstream passa a proteger contra duplicata também os lançamentos digitados à mão, que hoje não têm proteção nenhuma.
- Nova tabela mínima `reconciliation_ignores` para linhas do banco deliberadamente não lançadas (ex.: `Pag Fatura Boleto`, que já existe como transferência).
- `normalizeDescriptionKey` fortalecido para derrubar prefixo de adquirente (`PG *`, `MP *`, `DM*`, `B91*`) e sufixo numérico de loja, tornando `import_category_mappings` utilizável com descriptors reais do C6.
- Nova rota `/transactions/reconciliation`, irmã de `/transactions/import`.

## Capabilities

### New Capabilities
- `statement-reconciliation`: conciliação de arquivo de extrato ou fatura contra os lançamentos já existentes — parsing por banco, identidade de linha sem identificador do emissor, classificação determinística em baldes, verificação aritmética de fechamento, aprendizado de categoria por descriptor, e aplicação das decisões em lote com desfazer.

### Modified Capabilities
<!-- Nenhuma. O único spec existente (openspec/specs/invoice-payment) não tem requisito alterado por esta change. -->

## Impact

- **Código novo:**
  - `src/shared/lib/import/parsers/` — `c6-statement-csv.ts`, `c6-invoice-csv.ts`, `registry.ts`, `detect.ts`.
  - `src/shared/lib/reconciliation/` — fingerprint de linha, motor de matching, verificação aritmética.
  - `src/features/transactions/components/reconciliation/` — tela de upload, resumo e revisão em baldes.
  - `src/app/(dashboard)/transactions/reconciliation/page.tsx` — rota fina.
- **Código do upstream tocado (superfície de conflito a manter mínima):**
  - `src/shared/lib/import/types.ts` — campos opcionais aditivos em `ImportedTransaction`.
  - `src/features/transactions/lib/import-utils.ts` — `normalizeDescriptionKey` mais forte.
- **Schema/DB:** nova tabela `reconciliation_ignores`. A coluna `ofx_import_fingerprint` é **reusada**, não alterada — nenhuma mudança na tabela `lancamentos`.
- **Regressão a proteger:** o import OFX existente continua funcionando; fortalecer `normalizeDescriptionKey` muda a chave de `import_category_mappings`, mas a tabela está vazia no ambiente alvo, então não há backfill.
- **Fora de escopo (viram changes separadas):** melhorias no inbox/pré-lançamentos (backlog de 76 pendentes, notificações duplicadas do próprio banco, ruído de marketing) — causa diferente; e separação de gastos por portador — `cardLast4` e `holderName` ficam apenas persistidos como metadado, sem uso nesta change.
