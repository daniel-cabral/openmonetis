## ADDED Requirements

### Requirement: Seletor de viagem nos relatórios

Os relatórios Tendências por categoria e Estabelecimentos SHALL oferecer o seletor "Viagem" com os
modos "Todos os lançamentos" (padrão), "Sem viagens" e uma entrada por viagem do usuário. O modo
escolhido SHALL ficar no URL e sobreviver a recarregamento.

#### Scenario: Sem viagens

- **WHEN** o usuário escolhe "Sem viagens" em Tendências de mar/2026 a jun/2026
- **THEN** a tabela soma apenas lançamentos sem viagem vinculada

#### Scenario: Viagem específica

- **WHEN** o usuário escolhe "Lisboa"
- **THEN** a tabela soma apenas lançamentos vinculados a "Lisboa"

#### Scenario: Viagem de outro usuário no URL

- **WHEN** o URL traz `viagem=<id>` de uma viagem que não pertence ao usuário
- **THEN** o relatório se comporta como "Todos os lançamentos"

### Requirement: Intervalo cobre a viagem inteira

Em Tendências, escolher uma viagem SHALL ajustar De/Até para o menor e o maior período entre os
lançamentos dela. Em Estabelecimentos, uma viagem específica SHALL ignorar a janela de meses.

#### Scenario: Passagem parcelada estende o intervalo

- **WHEN** "Lisboa" tem parcelas de mar/2026 a dez/2026 e compras em jun/2026
- **THEN** De/Até passa a mar/2026 a dez/2026

#### Scenario: Estabelecimentos mostra a viagem inteira

- **WHEN** a janela é "últimos 3 meses" e o usuário escolhe uma viagem de um ano atrás
- **THEN** a lista mostra os estabelecimentos da viagem, sem corte de período

### Requirement: Relatórios fora do recorte

Uso de cartões e Análise de parcelas NÃO SHALL exibir o seletor de viagem.

#### Scenario: Uso de cartões inalterado

- **WHEN** o usuário abre Uso de cartões
- **THEN** não há seletor de viagem e os números são os mesmos de antes da change
