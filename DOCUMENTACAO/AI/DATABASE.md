# DATABASE

## Banco oficial

- producao: `PostgreSQL`
- desenvolvimento local temporario: `SQLite`, somente para destravar o inicio

## Regra de modelagem

O schema oficial deve nascer pensando em `PostgreSQL`, mesmo que o ambiente local use `SQLite` no primeiro momento.

## Entidades iniciais

### `companies`

Empresa do ecossistema que usa o `Financeiro`.

Campos minimos:

- `id`
- `name`
- `document`
- `externalSystem`
- `externalTenantId`
- `status`
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`
- `canceledAt`
- `canceledBy`

### `integration_clients`

Cliente de integracao autorizado.

Campos minimos:

- `id`
- `companyId`
- `systemCode`
- `apiKeyHash`
- `isActive`
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`
- `canceledAt`
- `canceledBy`

### `financial_parties`

Cadastro financeiro generico.

Campos minimos:

- `id`
- `companyId`
- `personType`
- `name`
- `document`
- `email`
- `phone`
- `externalSystem`
- `externalEntityType`
- `externalEntityId`
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`
- `canceledAt`
- `canceledBy`

### `receivable_batches`

Lote de importacao.

Campos minimos:

- `id`
- `companyId`
- `integrationClientId`
- `sourceSystem`
- `sourceTenantId`
- `sourceBatchType`
- `sourceBatchId`
- `referenceDate`
- `status`
- `itemCount`
- `processedCount`
- `errorCount`
- `payloadSnapshot`
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`
- `canceledAt`
- `canceledBy`

### `receivable_titles`

Titulo financeiro de contas a receber.

Campos minimos:

- `id`
- `companyId`
- `batchId`
- `payerId`
- `sourceSystem`
- `sourceTenantId`
- `sourceEntityType`
- `sourceEntityId`
- `businessKey`
- `description`
- `categoryCode`
- `totalAmount`
- `issueDate`
- `status`
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`
- `canceledAt`
- `canceledBy`

### `receivable_installments`

Parcela do titulo.

Campos minimos:

- `id`
- `companyId`
- `titleId`
- `installmentNumber`
- `installmentCount`
- `dueDate`
- `amount`
- `openAmount`
- `status`
- `payerNameSnapshot`
- `payerDocumentSnapshot`
- `descriptionSnapshot`
- `sourceInstallmentKey`
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`
- `canceledAt`
- `canceledBy`

### `cash_sessions`

Sessao de caixa aberta por usuario operacional da vertical.

Campos minimos:

- `id`
- `companyId`
- `sourceSystem`
- `sourceTenantId`
- `cashierUserId`
- `cashierDisplayName`
- `status`
- `openingAmount`
- `totalReceivedAmount`
- `expectedClosingAmount`
- `declaredClosingAmount`
- `openedAt`
- `closedAt`
- `notes`
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`
- `canceledAt`
- `canceledBy`

### `cash_movements`

Movimentacoes financeiras de um caixa aberto.

Campos minimos:

- `id`
- `companyId`
- `cashSessionId`
- `movementType`
- `direction`
- `paymentMethod`
- `amount`
- `description`
- `occurredAt`
- `referenceType`
- `referenceId`
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`
- `canceledAt`
- `canceledBy`

### `receivable_settlements`

Baixas registradas nas parcelas.

Campos minimos:

- `id`
- `companyId`
- `installmentId`
- `cashSessionId`
- `paymentMethod`
- `originalOpenAmount`
- `discountAmount`
- `interestAmount`
- `penaltyAmount`
- `receivedAmount`
- `settledAt`
- `receivedByUserId`
- `receivedByNameSnapshot`
- `notes`
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`
- `canceledAt`
- `canceledBy`

## Regras obrigatorias

- toda tabela de negocio deve carregar `companyId`
- integracao deve ser idempotente
- dados de pagador devem ser salvos em snapshot no titulo e na parcela quando necessario
- nunca depender apenas de ID da vertical como chave universal
- nao pode existir delete fisico em negocio
- baixa em dinheiro exige caixa aberto por usuario operacional
