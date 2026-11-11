## MODIFIED Requirements

### Requirement: Importação e conciliação lembram a subcategoria

A memória por descrição da importação e da conciliação SHALL guardar e reaplicar a subcategoria
junto com a categoria. As linhas desses fluxos SHALL ter seletor de subcategoria quando a categoria
da linha tem subcategorias, inclusive as linhas ambíguas da conciliação marcadas como "Criar", que
SHALL vir com categoria e subcategoria pré-preenchidas pela memória como as do balde só no banco. Ao
salvar, a memória SHALL gravar a subcategoria atual da linha, inclusive vazia, também para as linhas
criadas na conciliação. Trocar a categoria de uma linha SHALL descartar a subcategoria lembrada.

#### Scenario: Importação reaplica Faxina

- **WHEN** uma importação anterior gravou "FAXINA MARIA" como Moradia/Faxina e chega nova linha "FAXINA MARIA"
- **THEN** a linha vem sugerida com Moradia e Faxina

#### Scenario: Ambígua criada na conciliação reaplica Faxina

- **WHEN** a memória tem "PIX ENVIADO PARA DANIELLE" como Moradia/Faxina e uma linha ambígua com esse descritor é marcada como "Criar"
- **THEN** a linha mostra categoria Moradia e subcategoria Faxina pré-preenchidas e editáveis
- **AND** ao aplicar, o lançamento é criado com Moradia/Faxina e a memória grava o par escolhido
