## Why

Categorias são planas. Dentro de Moradia entram aluguel, condomínio, faxina e IPTU, e hoje não há
como saber quanto foi para cada um sem abrir lançamento por lançamento. O usuário quer o detalhe
sem perder Moradia como a unidade que dashboard, orçamentos e relatórios já usam.

## What Changes

- Categoria passa a ter subcategorias opcionais (um nível só), geridas no diálogo da categoria.
- Lançamento ganha `subcategoria_id` opcional, que SHALL pertencer à categoria do lançamento.
- Diálogo de lançamento ganha seletor "Subcategoria (opcional)" depois da categoria.
- Página da categoria ganha o bloco "Por subcategoria" no card do cabeçalho; clicar numa linha
  filtra a lista de lançamentos da página.
- Barra de seleção em massa ganha "Definir subcategoria", para reclassificar lançamentos antigos.
- Memória de categoria da importação e da conciliação passa a lembrar a subcategoria.
- Nenhum total por categoria muda em lugar nenhum.

## Capabilities

### New Capabilities

- `subcategories`: subcategorias de categoria, atribuição a lançamentos, detalhamento na página da
  categoria, reclassificação em massa e memória na importação.

### Modified Capabilities

<!-- Nenhuma. -->

## Impact

- `src/db/schema.ts` + migração Drizzle: tabela `subcategorias`, colunas em `lancamentos` e
  `import_category_mappings`.
- `src/features/categories/`: diálogo (gestão), página de detalhe (bloco por subcategoria), queries.
- `src/features/transactions/`: diálogo, actions de escrita (helper único de validação), bulk bar,
  filtro da lista, importação e conciliação.
- Fora de escopo: orçamento por subcategoria, subcategoria em dashboard/insights/relatórios, inbox,
  e o `onDelete: cascade` pré-existente de `lancamentos.categoria_id`.

Design completo e decisões: `openspec/changes/add-subcategories/design.md`.
Preview aprovado (opção A + filtro): `src/app/preview-subcategorias/` (temporário).
