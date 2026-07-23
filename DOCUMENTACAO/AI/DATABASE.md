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

## Estoque por filial

### `company_branches`

Cada filial financeira define como o estoque sera tratado naquela operacao.

Campos de parametrizacao:

- `inventoryControlType`: `TRADITIONAL`, `COLOR_SIZE` ou `LOT`
- `quantityPrecision`: `INTEGER_ONLY`, `DECIMAL_ALLOWED` ou `PRODUCT_DEFINED`
- `allowSaleUnitPriceEdit`: define se a venda pode alterar o preco unitario do produto
- `allowSaleItemDiscount`: define se a venda pode informar desconto por produto

Regras:

- `TRADITIONAL`: o cadastro de produto nao exibe opcoes de grade ou lote
- `COLOR_SIZE`: o cadastro de produto pode marcar que aquele produto trata cor/numero
- `LOT`: o cadastro de produto pode marcar que aquele produto trata lote
- `INTEGER_ONLY`: quantidades devem ser inteiras e a tela nao precisa destacar decimais
- `DECIMAL_ALLOWED`: a filial aceita quantidade fracionada
- `PRODUCT_DEFINED`: cada produto define se aceita quantidade fracionada
- quando `allowSaleUnitPriceEdit = false`, a venda deve usar o preco cadastrado do produto; produto generico (`internalCode = 1`) continua aceitando preco informado
- quando `allowSaleItemDiscount = false`, a tela de vendas nao exibe desconto unitario e o backend rejeita desconto por item

### `products`

Produtos seguem a configuracao da filial atual.

Campos principais de estoque:

- `branchCode`
- `tracksInventory`
- `allowFraction`
- `usesColorSize`
- `usesLotControl`
- `currentStock`
- `minimumStock`

### `product_stock_balances`

Tabela de saldo por produto, empresa, filial e variacao/lote.

Regras:

- `branchCode = 0` representa o estoque geral da empresa
- `branchCode >= 1` representa o saldo separado da filial
- `variantKey` identifica a combinacao operacional usada no saldo, como grade ou lote
- campos opcionais como `colorCode`, `colorName`, `sizeCode`, `lotNumber` e `lotExpirationDate` preparam o estoque para grade e lote sem acoplar a uma vertical especifica

### `stock_movements`

Tabela historica das movimentacoes que alteram saldo de estoque.

Regras:

- deve ser tratada como historico append-only
- nao deve existir tela de cadastro direto para movimentacao
- a tela de historico apenas lista o resultado gerado por fluxos operacionais do estoque
- os programas de entrada e saída manual são fluxos operacionais auditados; eles sempre criam um novo movimento e nunca editam diretamente a tabela histórica
- correcoes devem ser feitas por nova movimentacao de ajuste ou estorno, nunca por edicao fisica do historico
- cada registro deve guardar produto, filial, tipo de movimento, quantidade, saldo anterior, saldo resultante, origem/documento quando houver, usuario e data

### `sale_items`

Tabela dos itens confirmados em vendas.

Regras:

- `productNameSnapshot` guarda o nome usado na venda; para produto generico (`products.internalCode = 1`), recebe a descricao informada pelo operador
- `unitCost` guarda o custo unitario informado ou herdado do produto, quando houver
- `unitPrice` guarda o preco de venda unitario confirmado

### `nfce_profiles`, `fiscal_documents` e `fiscal_document_attempts`

Estrutura fiscal da NFC-e por empresa e filial.

Regras:

- `nfce_profiles` guarda ambiente, certificado, dados do emitente, tributação padrão, série e próxima numeração
- o perfil e o certificado pertencem à mesma empresa, filial, ambiente e CNPJ
- `fiscal_documents` possui vínculo único com a venda e preserva chave, XML assinado/processado, protocolo, status e código aleatório
- `fiscal_document_attempts` registra cada autorização, consulta, rejeição ou falha sem apagar o histórico
- a alocação da numeração e a criação do documento são transacionais e idempotentes
- todos os registros respeitam auditoria e cancelamento lógico

### `sale_returns` e `sale_return_items`

Tabelas de devolucao de mercadorias vinculadas a uma venda confirmada.

Regras:

- devolucao nao cancela a venda original
- `sale_returns` guarda o documento da devolucao, motivo, cliente snapshot, valor total e credito gerado
- `sale_return_items` guarda os itens devolvidos e a quantidade parcial ou total por item da venda
- a soma devolvida por `saleItemId` nunca pode ultrapassar a quantidade vendida
- produtos com controle de estoque geram entrada em `stock_movements` com `sourceType = SALE_RETURN`
- a devolucao gera credito em `customer_credits` com `sourceType = SALE_RETURN`, sem movimento de caixa
- quando a venda original nao possui documento valido do cliente, a devolucao deve receber identificacao do cliente para que `sale_returns` e `customer_credits` guardem nome/documento do titular do credito

## Cadastro mestre de pessoas e papéis

O modelo `parties` é a identidade única da pessoa por empresa. Cliente,
pagador, fornecedor, destinatário e tomador são papéis da mesma pessoa, não
cadastros independentes.

Regras:

- empresas com `sourceSystem = ESCOLA` recebem clientes exclusivamente por sincronização do cadastro escolar
- CPF/CNPJ normalizado é único por `companyId`, independentemente da filial e aceita CNPJ alfanumérico
- `party_roles` registra os papéis por filial, com cancelamento lógico independente da identidade
- `party_external_references` preserva todos os IDs de origem, inclusive `PERSON:<personId>`, aluno e responsável
- `party_audit_events` registra criação, sincronização, ativação, inativação e consolidação
- `suppliers.partyId` transforma o fornecedor em papel operacional da mesma pessoa
- na Escola, aparecem os clientes sincronizados (`ALUNO | RESPONSAVEL`) vinculados à identidade central
- snapshots sem vínculo com `parties`, como `CONSUMIDOR FINAL`, permanecem apenas no histórico financeiro e não viram cliente
- empresas das demais origens cadastram clientes diretamente no Financeiro com `externalEntityType = FINANCEIRO_CLIENTE`
- toda consulta respeita `companyId`; a visibilidade da filial é definida pelo papel ativo em `party_roles`
- inativar cliente ou fornecedor inativa somente o papel; a pessoa permanece para os demais usos
- duplicidades legadas são mantidas como registros mesclados/cancelados e todas as referências passam a apontar para a pessoa canônica
- não existe exclusão física
- títulos e parcelas mantêm seus snapshots históricos mesmo após atualização ou inativação do cliente

## Intenções PIX de venda

### `sale_pix_intents`

Registra a cobrança PIX antes da confirmação da venda.

- isolamento por `companyId`, `branchCode`, `sourceSystem` e `sourceTenantId`
- `operationId` garante idempotência da emissão
- estados principais: `CREATED`, `ISSUED`, `PAID`, `APPLIED`, `CANCELED` e `ERROR`
- `appliedSaleId` é único e impede reutilização do PIX
- QR Code, `txid`, conta emissora, respostas do provedor e campos de auditoria ficam preservados
- não há exclusão física; cancelamento usa estado e campos `canceledAt/canceledBy`

### `receivable_pix_intents`

Registra o PIX automático usado na baixa de parcelas.

- guarda tenant, filial, conta Sicoob, `txid`, QR Code, valor e `settlementGroupId`
- `installmentIdsJson` limita quais parcelas podem consumir o pagamento
- estados: `CREATED`, `ISSUED`, `PAID`, `APPLIED`, `CANCELED` e `ERROR`
- `installment_settlements.receivablePixIntentId` preserva o vínculo auditável
- o valor acumulado das liquidações vinculadas não pode superar o pagamento confirmado

## Integração SuperTEF

### `supertef_configurations`

Configuração única por `companyId + branchCode + provider`.

Regras:

- o token da Software House fica somente em `accessTokenEncrypted`, usando AES-256-GCM
- a API e o frontend nunca devolvem o token descriptografado
- `tokenFingerprint` e `tokenHint` permitem identificar troca de credencial sem expor o segredo
- ambiente, impressão, timeout, intervalo de consulta e situação ativa pertencem à empresa/filial
- testes de conexão e sincronizações guardam data, situação e mensagem sem conteúdo secreto

### `supertef_terminals`

Espelho operacional das POS retornadas pelo SuperTEF.

Regras:

- identificação externa única por configuração e `providerPosId`
- os campos externos `chave` e `token` não são persistidos
- `operationalStatus` é local e pode marcar a máquina como `OUT_OF_SERVICE`
- máquina não é apagada quando para de funcionar

### `supertef_checkouts` e `supertef_checkout_routes`

Cadastro dos pontos de venda físicos e suas prioridades.

Regras:

- a primeira rota ativa é a POS preferencial
- as demais rotas são alternativas ordenadas
- um checkout pode compartilhar alternativas com outros checkouts
- rotas removidas e checkouts inativados usam cancelamento lógico
- o futuro despachante de pagamentos deve ignorar POS fora de serviço e permitir somente uma cobrança simultânea por POS

### `supertef_audit_events`

Trilha append-only de toda mutação do módulo.

Regras:

- registra empresa, filial, usuário, ação, entidade, data e snapshots seguros
- nunca armazena token, chave de ativação da POS ou outro segredo
- eventos não são editados nem excluídos

### `supertef_payments`

Registro auditável das solicitações de débito e crédito enviadas ao SuperTEF.

Regras:

- toda operação pertence a `companyId + branchCode`
- `operationId` é idempotente dentro da empresa/filial
- `terminalLockKey` impede mais de uma cobrança simultânea na mesma POS
- a trava é liberada somente quando o provedor retorna pagamento pago, rejeitado ou quando o envio falha
- `providerPaymentUniqueId`, situação, pedido, valor e retorno operacional são preservados
- token e chave de ativação da POS nunca são armazenados no pagamento
- pagamento original não é apagado; estorno futuro deve criar operação própria e preservar o histórico
- `purpose` distingue teste manual, venda e recebimento
- `appliedEntityType + appliedEntityId + appliedAt` impedem reutilização
- `sale_payments.superTefPaymentId` vincula uma autorização à venda
- `installment_settlements.superTefPaymentId` permite uma autorização por grupo de parcelas

### `bank_dda_records`

Espelho persistente dos títulos DDA consultados por conta bancária.

Regras:

- isolamento por empresa, filial e conta
- unicidade por `bankAccountId + externalId`
- situação local `OPEN | CLOSED | CANCELED`
- `paidAt` registra a data informada na baixa local
- `bankStatus` preserva separadamente o estado recebido do banco
- baixa e cancelamento são locais e não representam operação bancária
- registros não são excluídos fisicamente

### `bank_dda_audit_events`

Trilha append-only de sincronização, baixa local e cancelamento local dos DDAs, com usuário, data e snapshots anterior/posterior.

## NF-e modelo 55

### Campos fiscais da filial em `company_branches`

A identidade do emitente pertence à filial:

- `fiscalLegalName`, `fiscalTradeName` e `fiscalDocument`;
- `stateRegistration`, `municipalRegistration` e `taxRegimeCode`;
- `fiscalStreet`, `fiscalNumber`, `fiscalComplement` e
  `fiscalNeighborhood`;
- `fiscalCity`, `fiscalCityCode`, `fiscalState`, `fiscalStateCode` e
  `fiscalPostalCode`;
- `fiscalCountryCode`, `fiscalCountryName`, `fiscalPhone` e `fiscalEmail`.

`fiscalDocument` é texto normalizado, não número, para preservar zeros e
aceitar o CNPJ alfanumérico oficial.

### Campos fiscais em `products`

O produto mantém os dados necessários à tributação e ao XML:

- `fiscalDescription`;
- `ncmCode`, `cestCode`, `gtinCode` e `taxableGtinCode`;
- `unitCode`, `taxableUnitCode` e `taxableConversionFactor`;
- `exTipiCode`, `fiscalOriginCode` e `defaultCfopCode`;
- `icmsCsosnCode`, `icmsCstCode`, `pisCstCode`, `cofinsCstCode` e
  `ipiCstCode`;
- `fiscalBenefitCode`;
- `approximateTaxRate` e `fiscalNotes`.

NCM e unidade tributável são obrigatórios para a emissão. CEST, GTIN e
`cBenef` são preenchidos somente quando a mercadoria/regra exigir.

### Dados fiscais do destinatário em `parties`

Além de documento e nome, o cadastro guarda:

- inscrição estadual e indicador de IE;
- inscrição municipal;
- endereço completo;
- município/UF e código IBGE;
- país e código do país;
- e-mail fiscal.

CPF e CNPJ permanecem como texto. CNPJ aceita 12 posições-base alfanuméricas
mais dois dígitos verificadores.

### `nfe_profiles`

Perfil isolado por `companyId + branchCode + environment + series`.

Guarda:

- certificado A1 e natureza de operação padrão;
- ambiente, série e próxima numeração;
- emissão automática;
- envio automático de DANFE/XML;
- configuração SMTP por filial/ambiente, com senha AES-256-GCM e sem
  reexposição pela API;
- destinatário fixo de e-mail em homologação, separado do e-mail fiscal do
  cliente;
- layout do DANFE;
- versões de schema e catálogo `cBenef`;
- responsável técnico e CSRT, quando aplicáveis.

### `fiscal_operation_natures`

Naturezas de operação/CFOP da filial. Possuem soft delete e podem ser
referenciadas pelo perfil, regras e documentos emitidos.

### `fiscal_tax_rules`

Regras tributárias por natureza e, opcionalmente, produto. A prioridade permite
regra específica antes da regra padrão da operação.

### `fiscal_benefit_codes`

Espelho local controlado dos códigos `cBenef` por UF e versão de catálogo.
Não se grava o valor artificial `SEM CBENEF`; ausência de benefício é `NULL`.

### Extensão de `fiscal_documents`

O mesmo agregado fiscal suporta modelos 55 e 65. Para NF-e, preserva:

- perfil e natureza utilizados;
- destinatário;
- snapshots de emitente, destinatário, totais e pagamentos;
- chave, protocolo, XML assinado, resposta e XML processado;
- nome/conteúdo do DANFE;
- status, rejeições, tentativas e auditoria.

A emissão manual permite `saleId` nulo e identifica a origem com
`sourceSystem`, `sourceTenantId`, `sourceEntityType`, `sourceEntityId` e
`idempotencyKey`. A escolha opcional de cobrança fica preservada em
`receivablePlanJson`; após autorização, `receivableTitleId` vincula o documento
ao título efetivamente criado.

### `fiscal_document_items`

Snapshot imutável dos itens e da tributação enviada à SEFAZ. Alterações
posteriores no produto não reescrevem a nota.

### `fiscal_document_installments`

Duplicatas da venda a prazo, com número, vencimento e valor.

### `fiscal_document_events`

Histórico append-only de cancelamento e Carta de Correção.

### `fiscal_document_email_deliveries`

Histórico append-only das tentativas de envio do DANFE e XML. Guarda
destinatário, assunto, anexos, situação, identificador retornado pelo provedor,
datas e erro, sem guardar a senha SMTP.

### `fiscal_number_inutilizations`

Faixas inutilizadas por empresa, filial, ambiente, modelo, série e ano.

### `fiscal_audit_events`

Auditoria append-only de parâmetros, numeração, emissão, reconciliação e
eventos. Senha do certificado e conteúdo secreto nunca entram nos snapshots.

## NFS-e Nacional

### `nfse_profiles`

Perfil por `companyId + branchCode + environment + series`. Mantém certificado
A1, série/próximo número da DPS, versão 1.01, opção e apuração no Simples,
regime especial, serviço padrão, automação e SMTP criptografado. A inscrição
municipal continua na filial fiscal compartilhada com NF-e/NFC-e.

### `nfse_service_items`

Catálogo de serviços com código interno, CNAE, código de tributação
nacional/municipal, NBS, município da prestação, ISSQN, retenção, PIS/COFINS e
campos preparados para IBS/CBS. `branchCode=0` identifica serviço compartilhado
entre todas as filiais da mesma empresa; os demais códigos mantêm o serviço
exclusivo da filial. Exclusão é sempre lógica.

### `nfse_service_descriptions`

Descrições reutilizáveis vinculadas ao mesmo serviço fiscal, sem repetir CNAE,
NBS, códigos tributários ou configuração do ISS. `sortOrder=0` identifica a
descrição padrão preservada também em `nfse_service_items.description` por
compatibilidade. A tabela carrega `companyId`, `branchCode`, soft delete e
metadados de auditoria; ao compartilhar o serviço, as descrições acompanham o
mesmo escopo.

### `nfse_documents`

Agregado independente da NF-e, pois DPS/NFS-e têm numeração, XML, API e ciclo
próprios. Preserva snapshots do emitente, tomador, serviço e tributos, vínculo
opcional com venda/título, chave/id da DPS, XML assinado, XML autorizado e
DANFSe oficial. `receivablePlanJson` preserva as parcelas solicitadas na
emissão manual até a autorização. O tomador obrigatório aponta para `Party`;
quando houver título, é o mesmo `payerParty` da duplicata.

### Histórico e parametrização

- `nfse_document_attempts`: tentativas append-only e retornos da API nacional;
- `nfse_email_deliveries`: envios de XML/DANFSe, sem senha SMTP;
- `nfse_municipal_parameters`: cache auditável de convênio, alíquota, regimes e
  retenções consultados nas APIs oficiais.

Chaves únicas impedem duplicidade por filial/ambiente/série/número, DPS e chave
de idempotência. Nenhum documento fiscal é apagado fisicamente.

## Controle S3

### `s3_configurations`

Configuração S3 exclusiva do Financeiro por `companyId` e `branchCode`. As chaves de acesso são armazenadas criptografadas, e o acesso é limitado à `basePrefix` obrigatória.

### `s3_audit_events`

Trilha append-only das configurações e exclusões de arquivos S3. Registra empresa, filial, ator, ação, resumo e metadados não sensíveis; nunca registra a credencial.

### `source_integration_configurations`

Espelho técnico das configurações compartilhadas pela empresa/filial do sistema de origem, exclusivo por `companyId` e `branchCode`. Armazena SMTP, Telegram e metadados de armazenamento, com senhas e tokens criptografados. O campo de escopo registra se cada configuração veio da filial ou foi herdada da empresa.

### `source_integration_audit_events`

Trilha append-only de cada sincronização das configurações de origem. Registra origem, empresa, filial, ator e somente indicadores não sensíveis; nunca registra senha SMTP, token ou credenciais S3.

## Impressão configurável

- `print_templates`: identidade do modelo por empresa, filial, código, tipo de documento e mídia; usa soft delete;
- `print_template_versions`: versões imutáveis do layout e dados de exemplo, com publicação e arquivamento;
- `printer_profiles`: nome físico do Windows, linguagem, mídia, colunas, DPI, cópias e guilhotina;
- `print_template_bindings`: vínculo único por empresa, filial, sistema de origem e evento;
- `print_jobs`: snapshot do payload, conteúdo renderizado, hash, idempotência, impressora, situação e retorno local;
- `print_audit_events`: trilha append-only de todas as configurações, publicações e tentativas.

Todas as tabelas carregam `companyId` e `branchCode`. Modelos de negócio respeitam cancelamento lógico; auditoria e histórico de impressão não são apagados.

Pacotes `.msreport.json` não criam uma tabela paralela. A importação validada reutiliza `print_templates` e sempre acrescenta uma nova linha em `print_template_versions`; importação, publicação e exportação são registradas em `print_audit_events`. O pacote não persiste nem transporta `companyId`, `sourceTenantId`, `branchCode`, credenciais ou IDs internos do banco.
