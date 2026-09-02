## 1. Pré-requisitos e fixtures

- [x] 1.1 Conferir por inspeção que `drizzle/0034_superb_blonde_phantom.sql` existe e que `src/db/schema.ts` já declara `ofxImportFingerprint` com o índice único parcial — confirmado (schema.ts linhas 685 e 740-744). A aplicação da migration no ambiente real é a task 11.0, não bloqueia código
- [x] 1.2 Mover `.examples/extrato.csv` e `.examples/cartao-Fatura_2026-08-15.csv` para fixtures de teste com valores e descrições mascarados, preservando estrutura, defasagens de data, linhas negativas e o caso `86,59 / 86,61`
- [x] 1.3 Adicionar `.examples/` ao `.gitignore` — já feito, linha 141

## 2. Contrato de tipos

- [x] 2.1 Em `src/shared/lib/import/types.ts`, adicionar a `ImportedTransaction` os campos opcionais `postedDate`, `dayBalance`, `installment`, `cardLast4`, `holderName`, `fx` e `isPurchase` — todos aditivos, sem alterar campo existente
- [x] 2.2 Verificar por `tsc --noEmit` que `ofx-parser.ts` e `xls-parser.ts` continuam compilando sem alteração

## 3. Parsers do C6

- [x] 3.1 `src/shared/lib/import/parsers/c6-statement-csv.ts` — pular preâmbulo até a linha de cabeçalho, remover BOM, extrair `accountNumber` de `Agência: <a> / Conta: <c>` e `period` de `Extrato de <d1> a <d2>`
- [x] 3.2 No mesmo parser, mapear cada linha: `date` = Data Lançamento, `postedDate` = Data Contábil, `dayBalance` = Saldo do Dia, sinal derivado de `Entrada(R$)`/`Saída(R$)`, descrição combinando `Título` e `Descrição` sem duplicar quando forem iguais
- [x] 3.3 `src/shared/lib/import/parsers/c6-invoice-csv.ts` — separador `;`, mapear `Data de Compra`, `cardLast4`, `holderName`, `categoryRaw`, `fx` e `installment` a partir de `Parcela` (`N/M` ou `Única`)
- [x] 3.4 No parser de fatura, marcar `isPurchase: false` para linhas de valor negativo (`Pag Fatura Boleto`, `Estorno`) preservando-as no resultado
- [x] 3.5 `src/shared/lib/import/parsers/registry.ts` — registro explícito de perfis `{ id, label, kind: "statement" | "invoice", matches(headerSample), parse(content) }`, exportando a lista completa para a UI oferecer como opção
- [x] 3.6 `src/shared/lib/import/parsers/detect.ts` — percorrer o registro e devolver o perfil detectado (ou nenhum) **junto com** a lista de perfis disponíveis; detecção é sugestão, não decisão final
- [x] 3.7 Testes dos parsers contra as fixtures: contagem de linhas, defasagem de datas presente, `Parcela` interpretada, negativos marcados, BOM tratado, perfil correto detectado, e arquivo desconhecido devolvendo lista de perfis sem erro fatal

## 4. Identidade de linha

- [x] 4.1 `src/shared/lib/reconciliation/fingerprint.ts` — construir fingerprint de linha de CSV sem `FITID`, com ocorrência posicional calculada dentro do grupo de linhas idênticas, na ordem do arquivo
- [x] 4.2 Testes: linhas idênticas no mesmo arquivo recebem fingerprints distintos; o mesmo arquivo processado duas vezes gera exatamente os mesmos fingerprints

## 5. Normalizador de descriptor

- [x] 5.1 Em `src/features/transactions/lib/import-utils.ts`, fortalecer `normalizeDescriptionKey` para derrubar prefixo de adquirente (`PG *`, `MP *`, `DM*`, `B91*` e variantes `XXX*`) e sufixo numérico de loja
- [x] 5.2 Testes cobrindo os casos reais: `PG *ABC SUPERMERCADOS CONTAGEM BRA`, `DM*hostingercomb SAO PAULO BRA`, `MERCADOLIVRE*MERCADOL`, `DROGASIL2919`, `223 LIV CTBA 23439130`
- [x] 5.3 Verificar que `category-memory-action.ts` e `import-page.tsx`, que consomem a função, continuam funcionando

## 6. Motor de matching

- [x] 6.1 `src/shared/lib/reconciliation/matcher.ts` — implementar as regras na ordem da spec, cada uma como função isolada e testável: fingerprint já gravado, parcela, exato, tolerância de centavos
- [x] 6.2 Garantir que a regra de tolerância de ±R$ 0,05 só se aplica quando há `installment`
- [x] 6.3 Comparar data contra `date` e `postedDate` com folga ±1 dia
- [x] 6.4 Produzir ambiguidade com a lista de candidatos quando houver 2+; nunca escolher automaticamente
- [x] 6.5 Calcular o lado inverso: lançamentos do período sem linha correspondente vão para o balde "só no app"
- [x] 6.6 Testes por regra, incluindo: o caso `86,59 / 86,61` casa com parcela e não casa sem; linha com 2 candidatos vira ambígua; lançamento órfão é detectado

## 7. Verificação aritmética

- [x] 7.1 `src/shared/lib/reconciliation/closure.ts` — para extrato, agrupar por `Data Contábil` e comparar `saldo[d] − saldo[d−1]` com a soma dos lançamentos do dia
- [x] 7.2 Para fatura, somar apenas linhas com `isPurchase` e comparar com o total do cartão no período
- [x] 7.3 Teste com a fixture de extrato provando que todos os dias fecham; teste com um dia adulterado provando que a divergência é reportada com o dia e o valor

## 8. Persistência

- [x] 8.1 Adicionar a tabela `reconciliationIgnores` em `src/db/schema.ts` (`user_id`, `fingerprint`, `reason`, `created_at`; chave primária `user_id + fingerprint`) — **acrescentar ao final do arquivo**, sem tocar em nenhuma declaração existente, para manter o conflito com o upstream restrito a um bloco novo no fim
- [x] 8.2 Gerar a migration com `pnpm run db:generate` e conferir que ela é puramente aditiva
- [x] 8.3 `src/features/transactions/actions/reconciliation-action.ts` — action de aplicação em lote dentro de `db.transaction()`: criar lançamentos novos, gravar `ofx_import_fingerprint` nos lançamentos casados preexistentes, gravar ignorados, alimentar `import_category_mappings`
- [x] 8.4 Todas as escritas sob o mesmo `importBatchId`, com `revalidateForEntity` após a mutação — só os lançamentos **criados** recebem o `importBatchId`; os preexistentes ficam sem, senão o desfazer os apagaria junto. O vínculo do lote com eles volta no retorno da action (`reconciled`), que a UI guarda para o desfazer
- [x] 8.5 Action de desfazer: remover lançamentos criados no lote e limpar os fingerprints gravados em lançamentos preexistentes do mesmo lote
- [x] 8.6 Guards de ownership por `userId` em toda leitura e escrita

## 9. UI

- [x] 9.1 `src/app/(dashboard)/transactions/reconciliation/page.tsx` — rota fina no padrão do projeto
- [x] 9.2 Componente de upload reaproveitando `upload-zone` onde couber
- [x] 9.3 Passo de confirmação de origem: select de **perfil de banco** (pré-selecionado pelo detectado, sempre editável) e select de **conta ou cartão de destino** (pré-preenchido quando o arquivo trouxer a informação, obrigatório quando não trouxer) — nenhum parsing final antes dessa confirmação
- [x] 9.4 Tela de resumo: contagem por balde e painel de fechamento aritmético
- [x] 9.5 Tela de revisão com os quatro baldes e as ações por linha (confirmar, criar, ignorar, escolher candidato). O balde "só no app" ficou **informativo**: o app não tem onde registrar "duplicata", e um controle que não grava nada seria pior que a ausência dele — decisão tomada na implementação e refletida no `spec.md`
- [x] 9.6 Botão de aplicar como única escrita, com toast de desfazer no padrão do import atual
- [x] 9.7 Adicionar a entrada na navegação

## 10. Fechamento

- [x] 10.1 Remover `src/shared/lib/reconciliation/smoke.test.ts` (provisório, só existia para o runner não sair com erro antes do primeiro teste real)
- [x] 10.2 Rodar `pnpm exec next typegen`, `pnpm exec tsc --noEmit`, `pnpm run test` e `pnpm exec biome check --formatter-enabled=false .`
- [x] 10.3 Atualizar `CHANGELOG.md`, `package.json` e o badge do `README.md` conforme a regra 6 do `AGENTS.md`

## 11. Validação com dados reais (manual, fora do workflow)

- [ ] 11.0 Aplicar as migrations no ambiente (`pnpm run db:migrate`) e confirmar que a coluna `ofx_import_fingerprint`, seu índice único parcial e a tabela `reconciliation_ignores` existem
- [ ] 11.1 Conciliar de ponta a ponta os dois arquivos reais do C6 no ambiente e registrar o resultado: quantas casaram por qual regra, quantas ambíguas, se o fechamento bateu
- [ ] 11.2 Calibrar a janela de data da fatura com base nesse resultado e resolver as questões em aberto do `design.md`
