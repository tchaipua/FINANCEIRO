# ARCHITECTURE

## Estado alvo inicial

O `Financeiro` sera um monolito modular em `NestJS` com `Prisma`, preparado para crescer por dominio sem virar um conjunto de modulos acoplados por vertical.

## Estrutura inicial do repositorio

- `backend/`
  - `src/common`
  - `src/modules`
  - `prisma/schema.prisma`
- `DOCUMENTACAO/AI/`

## Modulos iniciais recomendados

- `health`
- `companies`
- `integration-clients`
- `integration-events`
- `financial-parties`
- `receivable-batches`
- `receivable-titles`
- `receivable-installments`
- `audit`

## Papel de cada modulo

### `companies`

Representa a empresa dona da operacao financeira.

### `integration-clients`

Representa um sistema externo autorizado a integrar com o `Financeiro`.

Exemplos:

- escola
- petshop
- loja
- oficina

### `financial-parties`

Cadastro financeiro generico para pagador, sacado, responsavel financeiro e favorecido.

### `receivable-batches`

Agrupa cargas ou lotes de importacao vindos das verticais.

### `receivable-titles`

Representa o titulo financeiro principal.

### `receivable-installments`

Representa cada parcela individual do titulo.

### `integration-events`

Guarda requisicoes externas, idempotencia, hash de payload e status de processamento.

## Contrato com as verticais

Cada vertical resolve sua regra de negocio local e envia para o `Financeiro` um payload canonicamente financeiro.

Exemplo:

- `sourceSystem`
- `sourceTenantId`
- `sourceEntityType`
- `sourceEntityId`
- `payer`
- `amount`
- `installmentCount`
- `dueDates`
- `description`

## Regra de evolucao

Primeiro monolito modular.
So considerar microservicos depois que houver pressao real de escala, fiscal, bancos e cobranca em paralelo.
