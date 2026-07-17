# API SPEC

## Convencoes gerais

- Base URL: `/api/v1`
- Formato: JSON
- Autenticacao: `x-api-key` de integracao
- Escopo: cada chamada deve ser resolvida para uma `companyId`
- Idempotencia: obrigatoria nos endpoints de importacao

## Health

### GET `/health`

Uso:

- validar que a API esta viva

## Companies

### POST `/companies`

Uso:

- cadastrar empresa dona da operacao financeira

## Integration clients

### POST `/integration-clients`

Uso:

- registrar um sistema externo autorizado

### POST `/integration-clients/:id/rotate-key`

Uso:

- girar chave tecnica de integracao

## Products

### GET `/products`

Uso:

- listar produtos da empresa financeira do tenant informado

Query string esperada:

- `sourceSystem`
- `sourceTenantId`
- `sourceBranchCode` opcional; quando informado, o backend aplica o escopo da filial atual
- `status` opcional: `ACTIVE | INACTIVE | ALL`
- `search` opcional

### GET `/products/:productId`

Uso:

- carregar o cadastro completo do produto informado

### POST `/products`

Uso:

- criar o cadastro base de produto compartilhado no `Financeiro`
- respeitar os parametros de estoque da filial atual via `x-source-branch-code`

### PATCH `/products/:productId`

Uso:

- atualizar o cadastro do produto informado
- manter grade, lote e quantidade conforme configuracao da filial

### POST `/products/:productId/activate`

Uso:

- reativar produto inativo

### POST `/products/:productId/inactivate`

Uso:

- inativar produto com soft delete

Campos de estoque aceitos no produto:

- `tracksInventory`
- `allowFraction`
- `usesColorSize`
- `usesLotControl`
- `currentStock`
- `minimumStock`

Regras:

- `internalCode` e numerico e deve conter somente digitos
- produto com `internalCode = 1` e reservado como produto generico para venda avulsa; na venda exige descricao, custo e preco de venda informados no item
- `internalCode`, `sku` e `barcode` nao podem repetir valor entre si no mesmo produto
- um valor usado em `internalCode`, `sku` ou `barcode` de um produto nao pode ser reutilizado em nenhum desses tres campos de outro produto da mesma empresa
- filial `TRADITIONAL` ignora `usesColorSize` e `usesLotControl`
- filial `COLOR_SIZE` permite `usesColorSize` por produto
- filial `LOT` permite `usesLotControl` por produto
- filial `INTEGER_ONLY` rejeita quantidade decimal
- filial `DECIMAL_ALLOWED` grava produto com quantidade fracionada permitida
- filial `PRODUCT_DEFINED` usa `allowFraction` do produto

### GET `/products/stock-movements`

Uso:

- listar o historico de movimentacoes de estoque da empresa financeira do tenant informado
- alimentar a tela `Histórico Movimentação do Estoque`
- a tela e somente consulta, sem cadastro direto de movimentacao

Query string esperada:

- `sourceSystem`
- `sourceTenantId`
- `sourceBranchCode` opcional
- `movementType` opcional: `ENTRY | EXIT | ALL`
- `search` opcional
- `productId` opcional; abre a consulta restrita ao produto selecionado no grid de estoque

Regras:

- consultar `stock_movements`
- retornar movimentacoes mais recentes primeiro
- nao alterar saldo e nao criar registros
- correcoes futuras devem ocorrer por novas movimentacoes de ajuste/estorno

### POST `/products/:productId/stock-movements`

Uso:

- registrar entrada ou saída manual de estoque por produto e filial
- atualizar `products.currentStock` e `product_stock_balances`
- criar novo registro append-only em `stock_movements`

Body:

- `sourceSystem`, `sourceTenantId` e `requestedBy`
- `operationId` obrigatório e idempotente
- `movementType`: `ENTRY | EXIT`
- `quantity` maior que zero
- `notes` obrigatório
- `colorName + sizeCode` quando o produto usa grade
- `lotNumber` e `lotExpirationDate` quando o produto usa lote/validade

Regras:

- saldo e histórico são gravados na mesma transação
- saída respeita quantidade inteira/fracionada e bloqueio de estoque negativo
- não altera nem apaga movimentos anteriores
- o histórico continua ordenado por `occurredAt DESC, createdAt DESC`

## Sales

### GET `/sales`

Uso:

- listar vendas confirmadas da empresa financeira do tenant informado
- filtrar por canal de venda, situacao e busca textual

Query string esperada:

- `sourceSystem`
- `sourceTenantId`
- `sourceBranchCode` opcional
- `saleChannel` opcional: `GENERAL | SCHOOL_STORE | CANTEEN | SERVICE | ALL`
- `status` opcional
- `search` opcional
- `saleNumber` opcional: busca direta pelo número/documento da venda; quando informado, não depende do período selecionado
- `productSearch` opcional: busca por nome ou código do produto vendido
- `customerSearch` opcional: busca por nome ou CPF/CNPJ do cliente quando existir snapshot na venda

### GET `/sales/:saleId`

Uso:

- carregar detalhes da venda, itens e pagamentos

### POST `/sales`

Uso:

- confirmar venda de produtos com validacao de estoque, caixa e contas a receber
- gerar `sales`, `sale_items` e `sale_payments`
- gerar `stock_movements` de saida para produtos com controle de estoque
- registrar `cash_movements` para pagamentos imediatos
- gerar `receivable_titles` e `receivable_installments` quando houver boleto, prazo ou parcelado

Formas de pagamento aceitas:

- `CASH`
- `PIX`
- `DEBIT_CARD`
- `CREDIT_CARD`
- `BOLETO`
- `TERM`
- `INSTALLMENT`

Regras:

- pagamentos imediatos exigem caixa aberto para o operador
- boleto, prazo e parcelado exigem cliente/pagador informado
- soma dos pagamentos deve bater com o total da venda
- filial com quantidade inteira rejeita quantidade fracionada
- produto com cor/numero exige cor e numero na venda
- produto com lote exige lote na venda
- produto generico (`internalCode = 1`) usa a descricao enviada no item como snapshot do item vendido e grava `unitCost`
- estoque negativo so e permitido quando a regra efetiva da filial/produto permitir
- filial com `allowSaleUnitPriceEdit = false` rejeita preco unitario diferente do produto, exceto produto generico
- filial com `allowSaleItemDiscount = false` rejeita desconto por item
- no fluxo `VP`, a confirmação envia explicitamente o cliente selecionado e uma cobrança `TERM` de uma parcela; após sucesso, a tela limpa carrinho, pesquisas, pagamento e cliente
- venda, recebível, baixa de estoque e histórico com `previousStock` e `resultingStock` são persistidos na mesma transação; qualquer falha mantém a tela preenchida e deve ser exibida ao operador
- venda confirmada nao apaga historico; cancelamento futuro deve gerar estorno operacional

### POST `/sales/:saleId/cancel`

Uso:

- cancelar uma venda confirmada sem apagar historico fisico
- cancelar movimentos de caixa vinculados a venda
- devolver produtos ao estoque com nova movimentacao `SALE_CANCEL`
- cancelar recebiveis gerados pela venda quando existirem

Regras:

- exige `sourceSystem` e `sourceTenantId`
- registra `canceledAt/canceledBy` nos registros originais
- o historico de estoque recebe nova entrada de retorno, preservando a saida original
- quando houver recebiveis/baixas vinculadas, os registros financeiros ficam cancelados logicamente para preservar trilha
- venda com NFC-e autorizada deve ter o documento fiscal cancelado na SEFAZ antes do cancelamento operacional

Body resumido:

```json
{
  "sourceSystem": "ESCOLA",
  "sourceTenantId": "tenant_uuid",
  "cashierUserId": "user_123",
  "requestedBy": "CAIXA 01",
  "reason": "CANCELAMENTO AUTORIZADO"
}
```

## Customers

### GET `/customers`

Uso:

- listar o cadastro de clientes/pagadores da empresa e filial atuais
- em empresas com `sourceSystem = ESCOLA`, retornar pagadores sincronizados com tipo `ALUNO` ou `RESPONSAVEL` e clientes legados que estejam vinculados a títulos a receber
- não transformar snapshots sem `payerPartyId`, como `CONSUMIDOR FINAL`, em cadastro de cliente
- a seleção de cliente da venda a prazo (`VP`) deve consultar este endpoint, solicitar antes a sincronização da Escola quando estiver embarcada, carregar os clientes ativos ao abrir, filtrar enquanto o operador digita e preservar `externalEntityType + externalEntityId` ao concluir a venda

### POST `/customers/sync`

Uso:

- sincronizar de forma idempotente os pagadores atuais da Escola antes da existência de títulos ou parcelas

Regras:

- habilitado somente para `sourceSystem = ESCOLA`
- cria ou atualiza `parties` pela chave `companyId + branchCode + externalEntityType + externalEntityId`
- registros escolares ausentes na carga completa são inativados logicamente

### POST `/customers`

Uso:

- cadastrar cliente diretamente no Financeiro para empresas não escolares

Regra:

- bloqueado quando `sourceSystem = ESCOLA`

### PATCH `/customers/:customerId`

- atualiza somente clientes de cadastro local

### POST `/customers/:customerId/activate`

- reativa logicamente um cliente local

### POST `/customers/:customerId/inactivate`

- inativa logicamente um cliente local, preservando histórico e snapshots financeiros

## NFC-e

### GET `/fiscal-documents/nfce/profile`

- consulta o perfil NFC-e por `sourceSystem`, `sourceTenantId`, filial e ambiente

### PUT `/fiscal-documents/nfce/profile`

- cria ou atualiza o perfil fiscal da empresa/filial
- somente aceita certificado ativo do mesmo CNPJ, empresa, filial e ambiente
- `autoIssueOnSale` habilita a emissão após a confirmação da venda

### GET `/fiscal-documents/nfce/sales/:saleId`

- consulta documento, chave, protocolo, status e tentativas da NFC-e vinculada à venda

### POST `/fiscal-documents/nfce/sales/:saleId/issue`

- solicita emissão ou recuperação idempotente da NFC-e da venda
- reutiliza a mesma numeração e consulta a chave já assinada antes de repetir autorização

Regras da emissão automática:

- a venda é confirmada antes da comunicação com a SEFAZ; rejeição fiscal não duplica nem desfaz a venda
- aceita `CASH=01`, `CREDIT_CARD=03`, `DEBIT_CARD=04`, `TERM/INSTALLMENT=05`, `BOLETO=15` e `PIX=17`
- cartões são informados como integração não integrada quando não houver dados de adquirente
- PIX pendente não emite; a emissão ocorre após a confirmação do pagamento
- ausência de perfil ativo retorna `NOT_CONFIGURED`; falhas fiscais retornam `ERROR` com tentativa auditada
- produção rejeita produto sem NCM fiscal válido

### GET `/sales/:saleId/return-context`

Uso:

- carregar uma venda confirmada com os itens e as quantidades ainda disponíveis para devolução
- alimentar a tela `PRINCIPAL_FINANCEIRO_DEVOLUCAO_MERCADORIAS`

Query string esperada:

- `sourceSystem`
- `sourceTenantId`
- `sourceBranchCode` opcional

Resposta:

- dados da venda
- itens da venda com `returnedQuantity` e `availableReturnQuantity`

### POST `/sales/:saleId/returns`

Uso:

- registrar devolução parcial ou total de mercadorias de uma venda confirmada
- devolver os produtos ao estoque com movimento `SALE_RETURN`
- gerar crédito do cliente para uso futuro em baixa de parcelas

Regras:

- não cancela a venda original
- exige motivo da devolução
- bloqueia quantidade maior que a quantidade vendida ainda disponível para devolução
- produto com controle de estoque volta ao saldo por filial/variação e gera `stock_movements.movementType = ENTRY`
- crédito gerado usa `customer_credits.sourceType = SALE_RETURN`
- não lança dinheiro no caixa, pois crédito de devolução não é entrada nova de caixa
- quando a venda original não possui CPF/CNPJ de cliente válido, a devolução deve receber `customer.name` e `customer.document` válidos para gerar o crédito identificado

Body resumido:

```json
{
  "sourceSystem": "ESCOLA",
  "sourceTenantId": "tenant_uuid",
  "sourceBranchCode": 1,
  "requestedBy": "OPERADOR",
  "reason": "DEVOLUÇÃO AUTORIZADA",
  "customer": {
    "name": "CLIENTE DEVOLUÇÃO",
    "document": "52998224725"
  },
  "items": [
    {
      "saleItemId": "uuid_do_item_da_venda",
      "quantity": 1
    }
  ]
}
```

## Company branches

### GET `/companies/:id/branches`

Uso:

- listar filiais e seus parametros de estoque e venda

### POST `/companies/:id/branches`

Uso:

- criar filial com parametros operacionais

Body resumido:

```json
{
  "branchCode": 2,
  "name": "FILIAL CENTRO",
  "inventoryControlType": "COLOR_SIZE",
  "quantityPrecision": "PRODUCT_DEFINED",
  "allowSaleUnitPriceEdit": true,
  "allowSaleItemDiscount": true
}
```

### PATCH `/companies/:id/branches/:branchId`

Uso:

- atualizar nome, regras de estoque, regra de quantidade e parametros comerciais da filial

## Fiscal Certificates

### GET `/fiscal-certificates`

Uso:

- listar os certificados fiscais da empresa financeira informada

Query string esperada:

- `sourceSystem`
- `sourceTenantId`
- `status` opcional: `ACTIVE | INACTIVE | ALL`

### POST `/fiscal-certificates`

Uso:

- cadastrar um certificado fiscal A1
- gravar PFX e senha criptografados no Financeiro

Body esperado:

```json
{
  "sourceSystem": "ESCOLA",
  "sourceTenantId": "TENANT_001",
  "companyName": "ESCOLA MODELO",
  "requestedBy": "CAIXA 01",
  "aliasName": "CERTIFICADO PRINCIPAL",
  "authorStateCode": "35",
  "environment": "PRODUCTION",
  "purpose": "NFE_DFE",
  "isDefault": true,
  "pfxBase64": "BASE64_DO_PFX",
  "certificatePassword": "SENHA_DO_PFX"
}
```

### PATCH `/fiscal-certificates/:certificateId`

Uso:

- atualizar metadados do certificado
- opcionalmente substituir o PFX e a senha

### POST `/fiscal-certificates/:certificateId/set-default`

Uso:

- definir o certificado padrão por ambiente e finalidade

### POST `/fiscal-certificates/:certificateId/sync-dfe`

Uso:

- consultar a SEFAZ no serviço de distribuição DF-e
- importar notas completas no contas a pagar quando o XML integral estiver disponível

Body esperado:

```json
{
  "sourceSystem": "ESCOLA",
  "sourceTenantId": "TENANT_001",
  "requestedBy": "CAIXA 01",
  "maxBatches": 5
}
```

## Payables

### GET `/payables/invoice-imports`

Uso:

- listar as notas de entrada importadas no contas a pagar

Query string esperada:

- `sourceSystem`
- `sourceTenantId`
- `status` opcional: `PENDING_APPROVAL | APPROVED | ALL`
- `search` opcional

### GET `/payables/invoice-imports/:importId`

Uso:

- carregar a nota importada para conferencia e aprovacao

### POST `/payables/invoice-imports/from-xml`

Uso:

- importar uma NF-e de entrada a partir do XML

Body esperado:

```json
{
  "sourceSystem": "ESCOLA",
  "sourceTenantId": "TENANT_001",
  "companyName": "ESCOLA MODELO",
  "requestedBy": "CAIXA 01",
  "xmlContent": "<nfeProc>...</nfeProc>"
}
```

### POST `/payables/invoice-imports/:importId/approve`

Uso:

- aprovar a nota importada
- gerar duplicatas do contas a pagar
- gerar entrada de estoque quando houver item controlado

Body esperado:

```json
{
  "sourceSystem": "ESCOLA",
  "sourceTenantId": "TENANT_001",
  "requestedBy": "CAIXA 01",
  "approvalNotes": "ENTRADA CONFERIDA",
  "items": [
    {
      "itemId": "uuid-do-item",
      "action": "LINK_EXISTING",
      "productId": "uuid-do-produto"
    },
    {
      "itemId": "uuid-do-item-2",
      "action": "CREATE_PRODUCT",
      "productName": "CANETA AZUL",
      "internalCode": "00045",
      "barcode": "7890000000001",
      "unitCode": "UN",
      "tracksInventory": true,
      "minimumStock": 5
    }
  ]
}
```

Regra atual:

- o XML da nota importada fica gravado em campo `blob` no proprio registro da nota dentro do `Financeiro`
- quando a nota vem da SEFAZ, o sistema guarda o `certificateId` e o `NSU` da distribuicao

## Receivables

### POST `/receivables/import`

Uso:

- receber cargas de contas a receber vindas das verticais

Body inicial esperado:

```json
{
  "sourceSystem": "ESCOLA",
  "sourceTenantId": "TENANT_001",
  "sourceBatchType": "MENSALIDADE",
  "sourceBatchId": "batch_123",
  "items": [
    {
      "sourceEntityType": "ALUNO",
      "sourceEntityId": "student_123",
      "businessKey": "ESCOLA:TENANT_001:ALUNO:student_123:MENSALIDADE:2026-04",
      "payer": {
        "externalEntityType": "RESPONSAVEL",
        "externalEntityId": "guardian_456",
        "name": "MARIA SILVA",
        "document": "12345678900",
        "email": "maria@teste.com"
      },
      "description": "MENSALIDADE 04/2026",
      "issueDate": "2026-04-01",
      "installments": [
        {
          "installmentNumber": 1,
          "installmentCount": 3,
          "dueDate": "2026-04-10",
          "amount": 850.0,
          "sourceInstallmentKey": "ESCOLA:student_123:2026-04:1"
        }
      ]
    }
  ]
}
```

## Resposta esperada

```json
{
  "batchId": "uuid",
  "importedTitles": 1,
  "importedInstallments": 1,
  "duplicates": 0,
  "errors": 0
}
```

## Regra de integracao com Escola

- a `Escola` continua dona da regra de quem paga
- o `Financeiro` recebe o pagador ja resolvido
- o `Financeiro` persiste o snapshot do pagador

### GET `/receivables/installments`

Uso:

- listar parcelas de uma vertical para operacao de caixa e baixa

Query string esperada:

- `sourceSystem`
- `sourceTenantId`
- `status` opcional: `OPEN | PAID | OVERDUE | ALL`
- `studentName` opcional
- `payerName` opcional
- `search` opcional

### GET `/receivables/installments/open`

Uso:

- alias legado para listar somente parcelas em aberto

### POST `/receivables/installments/:installmentId/settle-cash`

Uso:

- registrar baixa em dinheiro de uma parcela

Regra obrigatoria:

- so pode executar se existir `cash_session` aberta para `sourceSystem + sourceTenantId + cashierUserId`

Body esperado:

```json
{
  "sourceSystem": "ESCOLA",
  "sourceTenantId": "TENANT_001",
  "cashierUserId": "user_123",
  "cashierDisplayName": "CAIXA 01",
  "discountAmount": 0,
  "interestAmount": 0,
  "penaltyAmount": 0,
  "notes": "RECEBIMENTO NO BALCAO"
}
```

## Cash sessions

### POST `/cash-sessions/open`

Uso:

- abrir caixa por usuario operacional

### GET `/cash-sessions/current`

Uso:

- consultar o caixa aberto do usuario operacional

Query string esperada:

- `sourceSystem`
- `sourceTenantId`
- `cashierUserId`

### POST `/cash-sessions/close-current`

Uso:

- fechar o caixa aberto do usuario operacional

Regra obrigatoria:

- o fechamento devolve o resumo esperado do caixa com base em abertura e recebimentos em dinheiro

### POST `/cash-sessions/movements/:movementId/cancel`

Uso:

- cancelar movimento manual de caixa ou estornar baixa/recebimento exibido no detalhe do caixa

Regras:

- exige `sourceSystem` e `sourceTenantId`
- venda deve ser cancelada pelo endpoint `/sales/:saleId/cancel`
- recebimento de parcela chama a regra de estorno de baixa, reabrindo saldo do cliente
- movimento manual de entrada/saida/ajuste permanece ativo e gera novo lançamento oposto vinculado ao original por `referenceType = CASH_MOVEMENT_CANCEL`
- entrada manual cancelada gera uma saida manual de cancelamento
- saida manual cancelada gera uma entrada manual de cancelamento
- ajuste manual cancelado gera ajuste inverso
- o fechamento esperado do caixa e ajustado pelo lançamento oposto, preservando a trilha dos dois movimentos

Body resumido:

```json
{
  "sourceSystem": "ESCOLA",
  "sourceTenantId": "tenant_uuid",
  "cashierUserId": "user_123",
  "requestedBy": "SUPERVISOR",
  "reason": "LANÇAMENTO INCORRETO"
}
```

## PIX pré-venda

### `POST /sales/pix-intents`

Emite uma cobrança PIX antes da autorização de cartão. Exige tenant, filial, `operationId` idempotente e valor.

### `POST /sales/pix-intents/:intentId/status`

Consulta o Sicoob. Somente a confirmação bancária altera a intenção para `PAID`.

### `POST /sales/pix-intents/:intentId/cancel`

Cancela uma cobrança ainda não paga nem aplicada.

### Aplicação na venda

- `POST /sales` recebe `pixIntentId` quando houver PIX pré-confirmado.
- a intenção deve ser `PAID`, do mesmo tenant/filial e ter o mesmo valor da forma PIX.
- a intenção é consumida uma única vez e muda para `APPLIED` na mesma transação da venda.
- em pagamento misto, a ordem obrigatória é PIX confirmado, cartão aprovado no SuperTEF e confirmação transacional da venda.

## PIX para baixa de recebíveis

### `POST /receivables/pix-intents`

Emite uma cobrança PIX Sicoob para um grupo de parcelas abertas. Exige conta Sicoob ativa, `settlementGroupId`, IDs das parcelas e valor.

### `POST /receivables/pix-intents/:intentId/status`

Consulta o Sicoob e altera a intenção para `PAID` somente após confirmação bancária.

### `POST /receivables/pix-intents/:intentId/cancel`

Cancela uma cobrança ainda não paga nem aplicada.

### Aplicação na baixa

- `POST /receivables/installments/:installmentId/settle-manual` exige `receivablePixIntentId` para `paymentMethod=PIX`.
- a intenção deve pertencer ao mesmo tenant, filial, conta, grupo e conjunto de parcelas.
- a soma das baixas não pode superar o valor PIX confirmado.
- sem confirmação `PAID`, nenhuma parcela ou caixa é alterado.

## SuperTEF

Todos os endpoints abaixo exigem:

- `sourceSystem`
- `sourceTenantId`
- `sourceBranchCode`
- contexto integrador com `userRole = ADMIN`

### GET `/supertef/configuration`

Consulta a configuração da empresa/filial. O token nunca é devolvido; a resposta contém somente `tokenConfigured`, `tokenHint` e `tokenFingerprint`.

### PUT `/supertef/configuration`

Cria ou atualiza a configuração protegida.

Campos próprios:

- `clientKey`
- `accessToken`, obrigatório somente no primeiro cadastro ou na troca
- `environment`: `HOMOLOGATION | PRODUCTION`
- `active`
- `printReceipt`
- `operationTimeoutSeconds`: 30 a 300
- `pollIntervalSeconds`: 2 a 15

O token é criptografado com AES-256-GCM antes da persistência.

### POST `/supertef/test-connection`

Testa o token por `GET https://api.supertef.com.br/api/pos`, registra sucesso/falha e não grava dados secretos na auditoria.

### GET `/supertef/terminals`

Lista as POS sincronizadas da empresa/filial.

### POST `/supertef/terminals/sync`

Sincroniza as POS ativadas no SuperTEF. Os campos externos `chave` e `token` não são persistidos.

### PATCH `/supertef/terminals/:terminalId/status`

Altera a situação operacional local entre:

- `ACTIVE`
- `OUT_OF_SERVICE`

A máquina permanece no histórico e nos vínculos; o roteamento operacional deve ignorar POS fora de serviço.

### GET `/supertef/checkouts`

Lista checkouts ativos com POS preferencial e alternativas ordenadas.

### POST `/supertef/checkouts`

Cria checkout e prioridades de POS.

### PATCH `/supertef/checkouts/:checkoutId`

Atualiza identificação e prioridades. A primeira POS é a preferencial.

### POST `/supertef/checkouts/:checkoutId/inactivate`

Inativa logicamente checkout e rotas, sem exclusão física.

### GET `/supertef/audit`

Lista a trilha append-only da configuração, conexão, POS e roteamento.

### GET `/supertef/payments`

Lista os pagamentos da empresa/filial atual, mais recentes primeiro.

### POST `/supertef/payments`

Solicita pagamento no endpoint oficial `POST /pagamentos`.

Campos próprios:

- `operationId`: identificador idempotente
- `terminalId` ou `checkoutId`
- `purpose`: `MANUAL | SALE | RECEIVABLE`
- `businessReference`: referência funcional da venda ou grupo de baixas
- `transactionType`: `DEBIT | CREDIT`
- `installmentCount`: débito é sempre normalizado para 1
- `amount`
- `orderId`
- `description`

Regras:

- primeira versão liberada somente para configuração `HOMOLOGATION`
- débito envia `transaction_type = 1`
- crédito envia `transaction_type = 2`
- uma POS aceita somente uma cobrança simultânea
- checkout usa a primeira POS ativa e livre conforme a prioridade configurada
- toda solicitação e mudança de situação gera auditoria append-only
- `SALE` e `RECEIVABLE` são enviados exclusivamente para a POS `EMULADOR 3120` durante a homologação
- venda e baixa somente aceitam pagamento `PAID`, do mesmo tenant, filial, valor e modalidade
- um pagamento não pode ser aplicado em mais de uma venda ou grupo de recebimentos

### Integração operacional

- `POST /sales` exige `payments[].superTefPaymentId` para `CREDIT_CARD` e `DEBIT_CARD`
- `POST /receivables/installments/:installmentId/settle-manual` exige `superTefPaymentId` para cartão
- estoque, caixa, venda e parcela são alterados somente depois da aprovação
- várias parcelas do mesmo recebimento compartilham um pagamento e um `settlementGroupId`

### POST `/supertef/payments/:paymentId/refresh`

Consulta `GET /pagamentos/by-uniqueid/:paymentUniqueId`.

Regras:

- polling recomendado conforme `pollIntervalSeconds`, padrão 4 segundos
- status SuperTEF `4` finaliza como `PAID`
- status SuperTEF `5` finaliza como `REJECTED`
- estados intermediários mantêm a POS bloqueada

## DDA bancário

### GET `/banks/:bankId/dda/open`

Consulta os DDAs abertos no Sicoob, sincroniza o espelho local e devolve todo o histórico da conta.

Regras:

- grava por `companyId + branchCode + bankAccountId`
- a chave externa da conta evita duplicidade
- nova sincronização atualiza os dados bancários, mas preserva `CLOSED` e `CANCELED`
- ausência temporária no retorno bancário não fecha nem exclui o registro local

### POST `/banks/:bankId/dda/:ddaId/close`

Marca o DDA como `CLOSED` somente no Financeiro. Exige `paymentDate`, grava a data do pagamento e não envia baixa ao banco.

### POST `/banks/:bankId/dda/:ddaId/cancel`

Marca o DDA como `CANCELED` somente no Financeiro. Não envia cancelamento ao banco.

As duas mutações exigem escopo da empresa, aceitam observação e geram auditoria append-only.
