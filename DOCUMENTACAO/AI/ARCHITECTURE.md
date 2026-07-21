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
- `products`
- `fiscal-certificates`
- `fiscal-documents` (NF-e, NFC-e e NFS-e Nacional)
- `payables`
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

Cadastro mestre de identidade por empresa. CPF/CNPJ normalizado resolve uma
única `Party`; cliente, pagador, fornecedor, destinatário e tomador são papéis
por filial. IDs das verticais são aliases externos e não criam outra pessoa.

### `products`

Cadastro base compartilhado de produtos, preparado para estoque, notas de entrada e vendas futuras, sem acoplar regras de uma vertical especifica ao core de recebiveis.

### `fiscal-certificates`

Cadastro multi-certificado por empresa para automacao fiscal, com armazenamento criptografado do PFX e da senha e uso em consultas DF-e na SEFAZ.

### `fiscal-documents`

Motor fiscal centralizado no `Financeiro`. NF-e/NFC-e compartilham a base
SEFAZ; a NFS-e Nacional possui agregado, XML DPS, APIs e artefatos próprios.
Todos permanecem isolados por empresa e filial e reutilizam `Party` como a
identidade fiscal do destinatário/tomador. Não existe cadastro fiscal paralelo.

### `payables`

Modulo operacional de contas a pagar, notas de entrada, fornecedores, aprovacao de XML e geracao de duplicatas com reflexo em estoque.

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

O mesmo principio vale para `products`, `estoque` e `vendas`: primeiro modular dentro do produto `Financeiro`, depois separar apenas se houver pressao real.
