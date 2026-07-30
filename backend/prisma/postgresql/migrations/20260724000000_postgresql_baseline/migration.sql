-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "interestRate" DOUBLE PRECISION,
    "interestGracePeriod" INTEGER,
    "penaltyRate" DOUBLE PRECISION,
    "penaltyValue" DOUBLE PRECISION,
    "penaltyGracePeriod" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "s3_configurations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "endpoint" TEXT,
    "region" TEXT NOT NULL DEFAULT 'us-east-1',
    "bucket" TEXT NOT NULL,
    "basePrefix" TEXT NOT NULL,
    "capacityGb" DOUBLE PRECISION,
    "imagesFolder" TEXT,
    "sourceScope" TEXT,
    "accessKeyEncrypted" TEXT NOT NULL,
    "secretKeyEncrypted" TEXT NOT NULL,
    "forcePathStyle" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "s3_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "s3_audit_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadataJson" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "s3_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_integration_configurations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpTimeout" INTEGER,
    "smtpAuthenticate" BOOLEAN,
    "smtpSecure" BOOLEAN,
    "smtpAuthType" TEXT,
    "smtpEmail" TEXT,
    "smtpPasswordEncrypted" TEXT,
    "smtpSourceScope" TEXT,
    "telegramEnabled" BOOLEAN,
    "telegramBotTokenEncrypted" TEXT,
    "telegramBotUsername" TEXT,
    "telegramSourceScope" TEXT,
    "storageDefaultAcl" TEXT,
    "storageDefaultExpiration" INTEGER,
    "storageSourceScope" TEXT,
    "lastSyncedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "source_integration_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_integration_audit_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadataJson" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "source_integration_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_branches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "inventoryControlType" TEXT NOT NULL DEFAULT 'TRADITIONAL',
    "quantityPrecision" TEXT NOT NULL DEFAULT 'INTEGER_ONLY',
    "stockControlMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT',
    "stockIntegerQuantityMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT',
    "stockLotControlMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT',
    "stockExpirationControlMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT',
    "stockGridControlMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT',
    "stockNegativeControlMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT',
    "allowSaleUnitPriceEdit" BOOLEAN NOT NULL DEFAULT true,
    "allowSaleItemDiscount" BOOLEAN NOT NULL DEFAULT true,
    "fiscalLegalName" TEXT,
    "fiscalTradeName" TEXT,
    "fiscalDocument" TEXT,
    "stateRegistration" TEXT,
    "municipalRegistration" TEXT,
    "taxRegimeCode" TEXT,
    "fiscalStreet" TEXT,
    "fiscalNumber" TEXT,
    "fiscalComplement" TEXT,
    "fiscalNeighborhood" TEXT,
    "fiscalCity" TEXT,
    "fiscalCityCode" TEXT,
    "fiscalState" TEXT,
    "fiscalStateCode" TEXT,
    "fiscalPostalCode" TEXT,
    "fiscalCountryCode" TEXT DEFAULT '1058',
    "fiscalCountryName" TEXT DEFAULT 'BRASIL',
    "fiscalPhone" TEXT,
    "fiscalEmail" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "company_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screen_parameters" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "parametersJson" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "screen_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "documentType" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "print_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_template_versions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "layoutJson" TEXT NOT NULL,
    "sampleDataJson" TEXT,
    "publishedAt" TIMESTAMPTZ(3),
    "publishedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "print_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printer_profiles" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "printerName" TEXT NOT NULL,
    "printerType" TEXT NOT NULL,
    "connectionType" TEXT NOT NULL DEFAULT 'WINDOWS',
    "language" TEXT NOT NULL DEFAULT 'WINDOWS_DRIVER',
    "paperWidthMm" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "paperHeightMm" DOUBLE PRECISION,
    "columns" INTEGER NOT NULL DEFAULT 40,
    "dpi" INTEGER NOT NULL DEFAULT 203,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "cutterEnabled" BOOLEAN NOT NULL DEFAULT false,
    "settingsJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "printer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_template_bindings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "sourceSystem" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersionId" TEXT,
    "printerProfileId" TEXT,
    "autoPrint" BOOLEAN NOT NULL DEFAULT false,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "print_template_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "businessEntityType" TEXT NOT NULL,
    "businessEntityId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "printerProfileId" TEXT,
    "payloadJson" TEXT NOT NULL,
    "renderedFormat" TEXT NOT NULL,
    "renderedContent" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedBy" TEXT,
    "dispatchedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "errorMessage" TEXT,
    "localPrinterName" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_audit_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "metadataJson" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "print_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supertef_configurations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "provider" TEXT NOT NULL DEFAULT 'SUPERTEF',
    "status" TEXT NOT NULL DEFAULT 'INACTIVE',
    "environment" TEXT NOT NULL DEFAULT 'HOMOLOGATION',
    "clientKey" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "tokenFingerprint" TEXT NOT NULL,
    "tokenHint" TEXT NOT NULL,
    "printReceipt" BOOLEAN NOT NULL DEFAULT true,
    "operationTimeoutSeconds" INTEGER NOT NULL DEFAULT 120,
    "pollIntervalSeconds" INTEGER NOT NULL DEFAULT 4,
    "lastConnectionTestAt" TIMESTAMPTZ(3),
    "lastConnectionStatus" TEXT,
    "lastConnectionMessage" TEXT,
    "lastPosSyncAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "supertef_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supertef_terminals" (
    "id" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "providerPosId" INTEGER NOT NULL,
    "operationalStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "providerStatus" INTEGER,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "bank" TEXT,
    "providerClientId" INTEGER,
    "providerCreatedAt" TIMESTAMPTZ(3),
    "providerUpdatedAt" TIMESTAMPTZ(3),
    "activatedAt" TIMESTAMPTZ(3),
    "lastSeenAt" TIMESTAMPTZ(3),
    "lastSyncedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "supertef_terminals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supertef_checkouts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "supertef_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supertef_checkout_routes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "checkoutId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "supertef_checkout_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supertef_audit_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "metadataJson" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "supertef_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supertef_payments" (
    "id" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "terminalId" TEXT NOT NULL,
    "checkoutId" TEXT,
    "operationId" TEXT NOT NULL,
    "providerPaymentUniqueId" TEXT,
    "providerPaymentStatus" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING_SEND',
    "transactionType" TEXT NOT NULL,
    "installmentType" INTEGER NOT NULL DEFAULT 1,
    "installmentCount" INTEGER NOT NULL DEFAULT 1,
    "amount" DOUBLE PRECISION NOT NULL,
    "orderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'MANUAL',
    "businessReference" TEXT,
    "printReceipt" BOOLEAN NOT NULL DEFAULT true,
    "paymentMessage" TEXT,
    "paymentOrderJson" TEXT,
    "paymentDataJson" TEXT,
    "terminalLockKey" TEXT,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPolledAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "appliedEntityType" TEXT,
    "appliedEntityId" TEXT,
    "appliedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "supertef_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "name" TEXT NOT NULL,
    "internalCode" TEXT,
    "sku" TEXT,
    "barcode" TEXT,
    "unitCode" TEXT NOT NULL DEFAULT 'UN',
    "productType" TEXT NOT NULL DEFAULT 'GOODS',
    "tracksInventory" BOOLEAN NOT NULL DEFAULT true,
    "allowFraction" BOOLEAN NOT NULL DEFAULT false,
    "usesColorSize" BOOLEAN NOT NULL DEFAULT false,
    "usesLotControl" BOOLEAN NOT NULL DEFAULT false,
    "usesExpirationControl" BOOLEAN NOT NULL DEFAULT false,
    "allowsNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "currentStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minimumStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchasePrice" DOUBLE PRECISION,
    "salePrice" DOUBLE PRECISION,
    "ncmCode" TEXT,
    "cestCode" TEXT,
    "fiscalDescription" TEXT,
    "gtinCode" TEXT,
    "taxableGtinCode" TEXT,
    "taxableUnitCode" TEXT,
    "taxableConversionFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "exTipiCode" TEXT,
    "fiscalOriginCode" TEXT,
    "defaultCfopCode" TEXT,
    "icmsCsosnCode" TEXT,
    "icmsCstCode" TEXT,
    "icmsRate" DOUBLE PRECISION,
    "pisCstCode" TEXT,
    "pisRate" DOUBLE PRECISION,
    "cofinsCstCode" TEXT,
    "cofinsRate" DOUBLE PRECISION,
    "ipiCstCode" TEXT,
    "ipiFrameworkCode" TEXT,
    "ipiRate" DOUBLE PRECISION,
    "fiscalBenefitCode" TEXT,
    "approximateTaxRate" DOUBLE PRECISION,
    "ibsCbsCstCode" TEXT,
    "ibsCbsClassCode" TEXT,
    "fiscalNotes" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_stock_balances" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 0,
    "productId" TEXT NOT NULL,
    "variantKey" TEXT NOT NULL DEFAULT 'GERAL',
    "colorCode" TEXT,
    "colorName" TEXT,
    "sizeCode" TEXT,
    "lotNumber" TEXT,
    "lotExpirationDate" TIMESTAMPTZ(3),
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reservedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "product_stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_certificates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "certificateType" TEXT NOT NULL DEFAULT 'A1',
    "environment" TEXT NOT NULL DEFAULT 'PRODUCTION',
    "purpose" TEXT NOT NULL DEFAULT 'NFE_DFE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "aliasName" TEXT NOT NULL,
    "authorStateCode" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "holderDocument" TEXT NOT NULL,
    "serialNumber" TEXT,
    "thumbprint" TEXT,
    "validFrom" TIMESTAMPTZ(3),
    "validTo" TIMESTAMPTZ(3),
    "pfxEncryptedBase64" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "lastNsu" TEXT,
    "lastMaxNsu" TEXT,
    "lastSyncAt" TIMESTAMPTZ(3),
    "lastSyncStatus" TEXT,
    "lastSyncMessage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "fiscal_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "partyId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "document" TEXT,
    "stateRegistration" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payable_invoice_imports" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "supplierId" TEXT,
    "fiscalCertificateId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "importType" TEXT NOT NULL DEFAULT 'XML_UPLOAD',
    "documentModel" TEXT NOT NULL,
    "accessKey" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "series" TEXT,
    "operationNature" TEXT,
    "issueDate" TIMESTAMPTZ(3) NOT NULL,
    "entryDate" TIMESTAMPTZ(3),
    "totalProductsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalInvoiceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "xmlHash" TEXT NOT NULL,
    "xmlContentBlob" BYTEA NOT NULL,
    "distributionNsu" TEXT,
    "parsedSnapshotJson" TEXT,
    "approvalNotes" TEXT,
    "cancellationReason" TEXT,
    "approvedAt" TIMESTAMPTZ(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "payable_invoice_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payable_invoice_import_items" (
    "id" TEXT NOT NULL,
    "invoiceImportId" TEXT NOT NULL,
    "productId" TEXT,
    "lineNumber" INTEGER NOT NULL,
    "approvalAction" TEXT,
    "supplierItemCode" TEXT,
    "barcode" TEXT,
    "description" TEXT NOT NULL,
    "ncmCode" TEXT,
    "cfopCode" TEXT,
    "unitCode" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tracksInventory" BOOLEAN NOT NULL DEFAULT true,
    "draftProductName" TEXT,
    "draftInternalCode" TEXT,
    "draftSku" TEXT,
    "draftBarcode" TEXT,
    "draftUnitCode" TEXT,
    "draftProductType" TEXT,
    "draftTracksInventory" BOOLEAN,
    "draftAllowFraction" BOOLEAN,
    "draftUsesLotControl" BOOLEAN,
    "draftUsesExpirationControl" BOOLEAN,
    "draftUsesColorSize" BOOLEAN,
    "draftAllowsNegativeStock" BOOLEAN,
    "draftMinimumStock" DOUBLE PRECISION,
    "draftNotes" TEXT,
    "productCheckedAt" TIMESTAMPTZ(3),
    "productCheckedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "payable_invoice_import_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payable_invoice_import_installments" (
    "id" TEXT NOT NULL,
    "invoiceImportId" TEXT NOT NULL,
    "installmentLabel" TEXT,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" TIMESTAMPTZ(3) NOT NULL,
    "originalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "additionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "paymentMethod" TEXT,
    "settledAt" TIMESTAMPTZ(3),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "payable_invoice_import_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payable_titles" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "supplierId" TEXT,
    "sourceDocumentType" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "documentNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "issueDate" TIMESTAMPTZ(3) NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supplierNameSnapshot" TEXT NOT NULL,
    "supplierDocumentSnapshot" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "payable_titles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payable_installments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "titleId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "dueDate" TIMESTAMPTZ(3) NOT NULL,
    "originalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "additionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "paymentMethod" TEXT,
    "settledAt" TIMESTAMPTZ(3),
    "notes" TEXT,
    "descriptionSnapshot" TEXT NOT NULL,
    "supplierNameSnapshot" TEXT NOT NULL,
    "supplierDocumentSnapshot" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "payable_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "productId" TEXT NOT NULL,
    "sourceImportId" TEXT,
    "sourceImportItemId" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'PAYABLE_IMPORT',
    "sourceId" TEXT,
    "sourceItemId" TEXT,
    "movementType" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "previousStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "resultingStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION,
    "notes" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "saleNumber" TEXT NOT NULL,
    "saleChannel" TEXT NOT NULL DEFAULT 'GENERAL',
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "customerPartyId" TEXT,
    "customerNameSnapshot" TEXT NOT NULL,
    "customerDocumentSnapshot" TEXT,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "sourceEntityName" TEXT,
    "subtotalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receivableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentSummary" TEXT,
    "receivableBatchId" TEXT,
    "receivableTitleId" TEXT,
    "notes" TEXT,
    "confirmedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productNameSnapshot" TEXT NOT NULL,
    "productCodeSnapshot" TEXT,
    "unitCodeSnapshot" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "tracksInventory" BOOLEAN NOT NULL DEFAULT false,
    "allowFraction" BOOLEAN NOT NULL DEFAULT false,
    "usesColorSize" BOOLEAN NOT NULL DEFAULT false,
    "usesLotControl" BOOLEAN NOT NULL DEFAULT false,
    "usesExpirationControl" BOOLEAN NOT NULL DEFAULT false,
    "allowsNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "variantKey" TEXT NOT NULL DEFAULT 'GERAL',
    "colorCode" TEXT,
    "colorName" TEXT,
    "sizeCode" TEXT,
    "lotNumber" TEXT,
    "lotExpirationDate" TIMESTAMPTZ(3),
    "previousStock" DOUBLE PRECISION,
    "resultingStock" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_payments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "saleId" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMPTZ(3),
    "installmentCount" INTEGER,
    "cardInstallmentCount" INTEGER,
    "cashSessionId" TEXT,
    "bankAccountId" TEXT,
    "bankAccountLabel" TEXT,
    "receivableInstallmentId" TEXT,
    "superTefPaymentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_pix_intents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "bankAccountId" TEXT,
    "bankAccountLabel" TEXT,
    "txid" TEXT NOT NULL,
    "pixCopyPaste" TEXT,
    "providerPayloadJson" TEXT,
    "providerResponseJson" TEXT,
    "paidAt" TIMESTAMPTZ(3),
    "appliedSaleId" TEXT,
    "appliedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "sale_pix_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receivable_pix_intents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "settlementGroupId" TEXT NOT NULL,
    "installmentIdsJson" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "bankAccountId" TEXT NOT NULL,
    "bankAccountLabel" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "pixCopyPaste" TEXT,
    "providerPayloadJson" TEXT,
    "providerResponseJson" TEXT,
    "paidAt" TIMESTAMPTZ(3),
    "appliedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "receivable_pix_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfce_profiles" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "certificateId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "environment" TEXT NOT NULL DEFAULT 'HOMOLOGATION',
    "autoIssueOnSale" BOOLEAN NOT NULL DEFAULT false,
    "series" INTEGER NOT NULL DEFAULT 1,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "stateCode" TEXT NOT NULL,
    "cityCode" TEXT NOT NULL,
    "stateRegistration" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "taxRegimeCode" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "complement" TEXT,
    "neighborhood" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "phone" TEXT,
    "defaultCfopCode" TEXT NOT NULL DEFAULT '5102',
    "defaultOriginCode" TEXT NOT NULL DEFAULT '0',
    "defaultIcmsCst" TEXT NOT NULL DEFAULT '00',
    "defaultIcmsRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defaultPisCst" TEXT NOT NULL DEFAULT '08',
    "defaultCofinsCst" TEXT NOT NULL DEFAULT '08',
    "ibsCbsCst" TEXT NOT NULL DEFAULT '000',
    "ibsCbsClassCode" TEXT NOT NULL DEFAULT '000001',
    "ibsStateRate" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "ibsMunicipalRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cbsRate" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "additionalInformation" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "nfce_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfe_profiles" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "certificateId" TEXT NOT NULL,
    "defaultOperationNatureId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "environment" TEXT NOT NULL DEFAULT 'HOMOLOGATION',
    "autoIssueOnSale" BOOLEAN NOT NULL DEFAULT false,
    "series" INTEGER NOT NULL DEFAULT 1,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "emissionType" TEXT NOT NULL DEFAULT 'NORMAL',
    "danfeLayout" TEXT NOT NULL DEFAULT 'PORTRAIT',
    "softwareVersion" TEXT NOT NULL DEFAULT 'MSINFOR FIN 1.0',
    "schemaVersion" TEXT NOT NULL DEFAULT 'PL_010E_V1.02+PL_010D_V1.03',
    "cbenefCatalogVersion" TEXT NOT NULL DEFAULT '20260626',
    "sendEmailToRecipient" BOOLEAN NOT NULL DEFAULT false,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "smtpAuthenticate" BOOLEAN NOT NULL DEFAULT true,
    "smtpUsername" TEXT,
    "smtpPasswordEncrypted" TEXT,
    "smtpFromEmail" TEXT,
    "smtpFromName" TEXT,
    "smtpTimeoutSeconds" INTEGER NOT NULL DEFAULT 60,
    "homologationEmailRecipient" TEXT,
    "additionalInformation" TEXT,
    "technicalResponsibleCnpj" TEXT,
    "technicalResponsibleName" TEXT,
    "technicalResponsibleEmail" TEXT,
    "technicalResponsiblePhone" TEXT,
    "csrtId" TEXT,
    "csrtHash" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "nfe_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfse_profiles" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "certificateId" TEXT NOT NULL,
    "defaultServiceItemId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "environment" TEXT NOT NULL DEFAULT 'HOMOLOGATION',
    "autoIssueOnSale" BOOLEAN NOT NULL DEFAULT false,
    "series" INTEGER NOT NULL DEFAULT 1,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "softwareVersion" TEXT NOT NULL DEFAULT 'MSINFOR FIN 1.0',
    "schemaVersion" TEXT NOT NULL DEFAULT '1.01',
    "simpleNationalOption" INTEGER NOT NULL DEFAULT 3,
    "simpleNationalTaxRegime" INTEGER DEFAULT 1,
    "specialTaxRegime" INTEGER NOT NULL DEFAULT 0,
    "sendEmailToRecipient" BOOLEAN NOT NULL DEFAULT false,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "smtpAuthenticate" BOOLEAN NOT NULL DEFAULT true,
    "smtpUsername" TEXT,
    "smtpPasswordEncrypted" TEXT,
    "smtpFromEmail" TEXT,
    "smtpFromName" TEXT,
    "smtpTimeoutSeconds" INTEGER NOT NULL DEFAULT 60,
    "homologationEmailRecipient" TEXT,
    "lastMunicipalCheckAt" TIMESTAMPTZ(3),
    "lastMunicipalCheckStatus" TEXT,
    "lastMunicipalCheckMessage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "nfse_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfse_service_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "internalCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cnaeCode" TEXT,
    "nationalTaxCode" TEXT NOT NULL,
    "municipalTaxCode" TEXT,
    "nbsCode" TEXT,
    "serviceCityCode" TEXT NOT NULL,
    "issTaxationCode" TEXT NOT NULL DEFAULT '1',
    "issWithholdingCode" TEXT NOT NULL DEFAULT '1',
    "issRate" DOUBLE PRECISION,
    "pisCofinsCst" TEXT NOT NULL DEFAULT '00',
    "pisRate" DOUBLE PRECISION,
    "cofinsRate" DOUBLE PRECISION,
    "simpleNationalTotalTaxRate" DOUBLE PRECISION,
    "ibsCbsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ibsCbsCst" TEXT,
    "ibsCbsClassCode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "nfse_service_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfse_service_descriptions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "serviceItemId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "nfse_service_descriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfse_documents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "profileId" TEXT NOT NULL,
    "serviceItemId" TEXT,
    "takerPartyId" TEXT NOT NULL,
    "receivableTitleId" TEXT,
    "saleId" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "receivablePlanJson" TEXT,
    "environment" TEXT NOT NULL,
    "series" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "dpsId" TEXT NOT NULL,
    "accessKey" TEXT,
    "nationalNfseNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "statusCode" TEXT,
    "statusMessage" TEXT,
    "competenceDate" TIMESTAMPTZ(3) NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL,
    "serviceCityCode" TEXT NOT NULL,
    "grossAmount" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deductionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "issuerSnapshotJson" TEXT NOT NULL,
    "takerSnapshotJson" TEXT NOT NULL,
    "serviceSnapshotJson" TEXT NOT NULL,
    "taxSnapshotJson" TEXT NOT NULL,
    "signedDpsXml" TEXT,
    "requestJson" TEXT,
    "responseJson" TEXT,
    "authorizedXml" TEXT,
    "danfseFileName" TEXT,
    "danfsePdfBlob" BYTEA,
    "danfseDownloadedAt" TIMESTAMPTZ(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "emailSentAt" TIMESTAMPTZ(3),
    "emailError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "nfse_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfse_document_attempts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "nfseDocumentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "operation" TEXT NOT NULL DEFAULT 'ISSUE',
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "statusCode" TEXT,
    "statusMessage" TEXT,
    "requestJson" TEXT,
    "responseJson" TEXT,
    "errorMessage" TEXT,
    "attemptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "nfse_document_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfse_email_deliveries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "nfseDocumentId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "messageId" TEXT,
    "attemptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),
    "errorMessage" TEXT,
    "attachmentsJson" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "nfse_email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfse_municipal_parameters" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "environment" TEXT NOT NULL,
    "municipalityCode" TEXT NOT NULL,
    "nationalTaxCode" TEXT,
    "competence" TEXT,
    "parameterType" TEXT NOT NULL,
    "requestPath" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "responseJson" TEXT,
    "errorMessage" TEXT,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "nfse_municipal_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_operation_natures" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "documentModel" TEXT NOT NULL DEFAULT '55',
    "operationType" TEXT NOT NULL DEFAULT 'OUTBOUND',
    "destinationType" TEXT NOT NULL DEFAULT 'INTERNAL',
    "purposeCode" TEXT NOT NULL DEFAULT '1',
    "cfopCode" TEXT NOT NULL,
    "finalConsumer" BOOLEAN NOT NULL DEFAULT true,
    "presenceIndicator" TEXT NOT NULL DEFAULT '1',
    "intermediaryIndicator" TEXT,
    "freightMode" TEXT NOT NULL DEFAULT '9',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "additionalInformation" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "fiscal_operation_natures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_tax_rules" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "operationNatureId" TEXT NOT NULL,
    "productId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "originCode" TEXT NOT NULL DEFAULT '0',
    "icmsCsosnCode" TEXT,
    "icmsCstCode" TEXT,
    "icmsBaseMode" TEXT,
    "icmsRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "icmsBaseReductionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "icmsStRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fcpRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difalDestinationRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difalInterstateRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fiscalBenefitCode" TEXT,
    "fiscalBenefitRequired" BOOLEAN NOT NULL DEFAULT false,
    "fiscalBenefitLegalBasis" TEXT,
    "pisCstCode" TEXT NOT NULL DEFAULT '49',
    "pisRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cofinsCstCode" TEXT NOT NULL DEFAULT '49',
    "cofinsRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ipiCstCode" TEXT,
    "ipiFrameworkCode" TEXT,
    "ipiRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ibsCbsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ibsCbsCstCode" TEXT,
    "ibsCbsClassCode" TEXT,
    "ibsStateRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ibsMunicipalRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cbsRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "selectiveTaxCode" TEXT,
    "selectiveTaxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMPTZ(3),
    "validTo" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "fiscal_tax_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_benefit_codes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "stateCode" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "catalogVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT NOT NULL,
    "legalBasis" TEXT,
    "observations" TEXT,
    "simpleNationalEligible" BOOLEAN NOT NULL DEFAULT false,
    "cstCodesJson" TEXT,
    "validFrom" TIMESTAMPTZ(3),
    "validTo" TIMESTAMPTZ(3),
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "fiscal_benefit_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_documents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "saleId" TEXT,
    "receivableTitleId" TEXT,
    "sourceSystem" TEXT,
    "sourceTenantId" TEXT,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "idempotencyKey" TEXT,
    "receivablePlanJson" TEXT,
    "profileId" TEXT,
    "nfeProfileId" TEXT,
    "operationNatureId" TEXT,
    "recipientPartyId" TEXT,
    "certificateId" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '65',
    "environment" TEXT NOT NULL,
    "series" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "randomCode" TEXT,
    "accessKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "statusCode" TEXT,
    "statusMessage" TEXT,
    "protocol" TEXT,
    "receivedAt" TIMESTAMPTZ(3),
    "issuedAt" TIMESTAMPTZ(3) NOT NULL,
    "qrCodeUrl" TEXT,
    "operationNatureSnapshot" TEXT,
    "issuerSnapshotJson" TEXT,
    "recipientSnapshotJson" TEXT,
    "totalsSnapshotJson" TEXT,
    "paymentSnapshotJson" TEXT,
    "schemaVersion" TEXT,
    "danfeFileName" TEXT,
    "danfePdfBlob" BYTEA,
    "danfeGeneratedAt" TIMESTAMPTZ(3),
    "signedXml" TEXT,
    "responseXml" TEXT,
    "processedXml" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "fiscal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_document_attempts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalDocumentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "statusCode" TEXT,
    "statusMessage" TEXT,
    "signedXml" TEXT,
    "responseXml" TEXT,
    "processedXml" TEXT,
    "errorMessage" TEXT,
    "attemptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "fiscal_document_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_document_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalDocumentId" TEXT NOT NULL,
    "productId" TEXT,
    "lineNumber" INTEGER NOT NULL,
    "productCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ncmCode" TEXT NOT NULL,
    "cestCode" TEXT,
    "cfopCode" TEXT NOT NULL,
    "unitCode" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "grossAmount" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "originCode" TEXT NOT NULL,
    "icmsCode" TEXT NOT NULL,
    "pisCstCode" TEXT NOT NULL,
    "cofinsCstCode" TEXT NOT NULL,
    "fiscalBenefitCode" TEXT,
    "taxDetailsJson" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "fiscal_document_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_document_installments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalDocumentId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "dueDate" TIMESTAMPTZ(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "fiscal_document_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_document_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "fiscalDocumentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "statusCode" TEXT,
    "statusMessage" TEXT,
    "protocol" TEXT,
    "eventAt" TIMESTAMPTZ(3) NOT NULL,
    "justification" TEXT,
    "correctionText" TEXT,
    "signedXml" TEXT,
    "responseXml" TEXT,
    "processedXml" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "fiscal_document_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_document_email_deliveries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "fiscalDocumentId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "messageId" TEXT,
    "attemptedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),
    "errorMessage" TEXT,
    "attachmentsJson" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "fiscal_document_email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_number_inutilizations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "nfeProfileId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '55',
    "series" INTEGER NOT NULL,
    "startNumber" INTEGER NOT NULL,
    "endNumber" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "statusCode" TEXT,
    "statusMessage" TEXT,
    "protocol" TEXT,
    "justification" TEXT NOT NULL,
    "signedXml" TEXT,
    "responseXml" TEXT,
    "processedXml" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "fiscal_number_inutilizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_audit_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "metadataJson" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "fiscal_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_returns" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "saleId" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "customerPartyId" TEXT,
    "customerNameSnapshot" TEXT NOT NULL,
    "customerDocumentSnapshot" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creditId" TEXT,
    "reason" TEXT NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_return_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "returnId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productNameSnapshot" TEXT NOT NULL,
    "productCodeSnapshot" TEXT,
    "unitCodeSnapshot" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "tracksInventory" BOOLEAN NOT NULL DEFAULT false,
    "variantKey" TEXT NOT NULL DEFAULT 'GERAL',
    "colorCode" TEXT,
    "colorName" TEXT,
    "sizeCode" TEXT,
    "lotNumber" TEXT,
    "lotExpirationDate" TIMESTAMPTZ(3),
    "previousStock" DOUBLE PRECISION,
    "resultingStock" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "sale_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "branchNumber" TEXT NOT NULL,
    "branchDigit" TEXT NOT NULL DEFAULT '',
    "accountNumber" TEXT NOT NULL,
    "accountDigit" TEXT NOT NULL DEFAULT '',
    "walletCode" TEXT,
    "agreementCode" TEXT,
    "pixKey" TEXT,
    "beneficiaryName" TEXT,
    "beneficiaryDocument" TEXT,
    "billingProvider" TEXT,
    "billingEnvironment" TEXT,
    "billingApiClientId" TEXT,
    "billingApiClientSecret" TEXT,
    "billingCertificateBase64" TEXT,
    "billingCertificatePassword" TEXT,
    "billingBeneficiaryCode" TEXT,
    "billingWalletVariation" TEXT,
    "billingContractNumber" TEXT,
    "billingModalityCode" TEXT,
    "billingDocumentSpeciesCode" TEXT,
    "billingAcceptanceCode" TEXT,
    "billingIssueTypeCode" TEXT,
    "billingDistributionTypeCode" TEXT,
    "billingNextBoletoNumber" INTEGER,
    "billingRegisterPixCode" INTEGER,
    "billingInstructionLine1" TEXT,
    "billingInstructionLine2" TEXT,
    "billingDefaultFinePercent" DOUBLE PRECISION,
    "billingDefaultInterestPercent" DOUBLE PRECISION,
    "billingDefaultDiscountPercent" DOUBLE PRECISION,
    "billingProtestDays" INTEGER,
    "billingNegativeDays" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_dda_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "bankAccountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "dueDate" TEXT,
    "issueDate" TEXT,
    "beneficiaryName" TEXT NOT NULL,
    "beneficiaryDocument" TEXT,
    "payerName" TEXT,
    "payerDocument" TEXT,
    "documentNumber" TEXT,
    "digitableLine" TEXT,
    "barcode" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "bankStatus" TEXT,
    "rawPayloadJson" TEXT,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusChangedAt" TIMESTAMPTZ(3),
    "statusChangedBy" TEXT,
    "paidAt" TIMESTAMPTZ(3),
    "localNotes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "bank_dda_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_dda_audit_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "bankDdaRecordId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "metadataJson" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "bank_dda_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parties" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "externalEntityType" TEXT NOT NULL,
    "externalEntityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "documentNormalized" TEXT,
    "stateRegistration" TEXT,
    "municipalRegistration" TEXT,
    "stateRegistrationIndicator" TEXT DEFAULT '9',
    "email" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "street" TEXT,
    "addressNumber" TEXT,
    "addressComplement" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "cityCode" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "countryCode" TEXT DEFAULT '1058',
    "countryName" TEXT DEFAULT 'BRASIL',
    "mergedIntoPartyId" TEXT,
    "mergedAt" TIMESTAMPTZ(3),
    "mergedBy" TEXT,
    "mergeReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_roles" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "roleType" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "party_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_external_references" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "externalEntityType" TEXT NOT NULL,
    "externalEntityId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "party_external_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_audit_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "metadataJson" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "party_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receivable_batches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "sourceBatchType" TEXT NOT NULL,
    "sourceBatchId" TEXT NOT NULL,
    "referenceDate" TIMESTAMPTZ(3),
    "status" TEXT NOT NULL DEFAULT 'PROCESSED',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "payloadSnapshot" TEXT,
    "metadataJson" TEXT,
    "skippedItemsJson" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "receivable_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receivable_titles" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "batchId" TEXT NOT NULL,
    "payerPartyId" TEXT,
    "sourceEntityType" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "sourceEntityName" TEXT,
    "classLabel" TEXT,
    "businessKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryCode" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payerNameSnapshot" TEXT NOT NULL,
    "payerDocumentSnapshot" TEXT,
    "payerEmailSnapshot" TEXT,
    "payerPhoneSnapshot" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "receivable_titles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receivable_installments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "batchId" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "bankAccountLabel" TEXT,
    "bankAssignedAt" TIMESTAMPTZ(3),
    "bankAssignedBy" TEXT,
    "bankSlipStatus" TEXT,
    "bankSlipMessage" TEXT,
    "bankSlipProvider" TEXT,
    "bankSlipOurNumber" TEXT,
    "bankSlipYourNumber" TEXT,
    "bankSlipDigitableLine" TEXT,
    "bankSlipBarcode" TEXT,
    "bankSlipQrCode" TEXT,
    "bankSlipPdfBase64" TEXT,
    "bankSlipPayloadJson" TEXT,
    "bankSlipResponseJson" TEXT,
    "bankSlipIssuedAt" TIMESTAMPTZ(3),
    "bankSlipIssuedBy" TEXT,
    "batchRemovedAt" TIMESTAMPTZ(3),
    "batchRemovedBy" TEXT,
    "batchRemovedReason" TEXT,
    "sourceInstallmentKey" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "dueDate" TIMESTAMPTZ(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "openAmount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interestRate" DOUBLE PRECISION,
    "interestGracePeriod" INTEGER,
    "penaltyRate" DOUBLE PRECISION,
    "penaltyValue" DOUBLE PRECISION,
    "penaltyGracePeriod" INTEGER,
    "bankMovementGroupId" TEXT,
    "bankMovementStatus" TEXT,
    "bankMovementCreatedAt" TIMESTAMPTZ(3),
    "bankMovementConvertedAt" TIMESTAMPTZ(3),
    "bankMovementConvertedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "settlementMethod" TEXT,
    "settledAt" TIMESTAMPTZ(3),
    "descriptionSnapshot" TEXT NOT NULL,
    "payerNameSnapshot" TEXT NOT NULL,
    "payerDocumentSnapshot" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "receivable_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "cashierUserId" TEXT NOT NULL,
    "cashierDisplayName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalReceivedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedClosingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "declaredClosingAmount" DOUBLE PRECISION,
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ(3),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "cashSessionId" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "bankAccountId" TEXT,
    "bankAccountLabel" TEXT,
    "bankMovementGroupId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment_settlements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "installmentId" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "settlementGroupId" TEXT,
    "receivedAmount" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interestAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "penaltyAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "bankAccountLabel" TEXT,
    "bankMovementGroupId" TEXT,
    "superTefPaymentId" TEXT,
    "receivablePixIntentId" TEXT,
    "settledAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "installment_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_credits" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "partyId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerDocument" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "originalAmount" DOUBLE PRECISION NOT NULL,
    "availableAmount" DOUBLE PRECISION NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "customer_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_credit_movements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "creditId" TEXT NOT NULL,
    "cashSessionId" TEXT,
    "movementType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "customer_credit_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_return_imports" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "bankAccountId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "importedItemCount" INTEGER NOT NULL DEFAULT 0,
    "matchedItemCount" INTEGER NOT NULL DEFAULT 0,
    "liquidatedItemCount" INTEGER NOT NULL DEFAULT 0,
    "bankClosedItemCount" INTEGER NOT NULL DEFAULT 0,
    "readyToApplyCount" INTEGER NOT NULL DEFAULT 0,
    "appliedItemCount" INTEGER NOT NULL DEFAULT 0,
    "unmatchedItemCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'IMPORTED',
    "requestSnapshotJson" TEXT,
    "summaryJson" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "bank_return_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_return_import_items" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "bankAccountId" TEXT NOT NULL,
    "matchedInstallmentId" TEXT,
    "appliedSettlementId" TEXT,
    "movementTypeCode" TEXT NOT NULL,
    "movementStatus" TEXT NOT NULL,
    "externalRequestCode" TEXT,
    "externalFileId" TEXT,
    "dueDate" TIMESTAMPTZ(3),
    "movementDate" TIMESTAMPTZ(3),
    "paymentDate" TIMESTAMPTZ(3),
    "expectedCreditDate" TIMESTAMPTZ(3),
    "ourNumber" TEXT,
    "yourNumber" TEXT,
    "barcode" TEXT,
    "contractNumber" TEXT,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "settledAmount" DOUBLE PRECISION,
    "discountAmount" DOUBLE PRECISION,
    "interestAmount" DOUBLE PRECISION,
    "feeAmount" DOUBLE PRECISION,
    "rawPayloadJson" TEXT NOT NULL,
    "appliedAt" TIMESTAMPTZ(3),
    "appliedBy" TEXT,
    "appliedStatus" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "bank_return_import_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_imports" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "bankAccountId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "pulledAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedMovementCount" INTEGER NOT NULL DEFAULT 0,
    "createdMovementCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateMovementCount" INTEGER NOT NULL DEFAULT 0,
    "creditAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "debitAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentBalance" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'IMPORTED',
    "requestSnapshotJson" TEXT,
    "summaryJson" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "bank_statement_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_movements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "bankAccountId" TEXT NOT NULL,
    "firstImportId" TEXT NOT NULL,
    "lastImportId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "description" TEXT NOT NULL,
    "documentNumber" TEXT,
    "movementType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceAfter" DOUBLE PRECISION,
    "reconciliationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewStatus" TEXT NOT NULL DEFAULT 'NOT_REVIEWED',
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewedBy" TEXT,
    "rawPayloadJson" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,

    CONSTRAINT "bank_statement_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "companies_name_idx" ON "companies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "companies_sourceSystem_sourceTenantId_key" ON "companies"("sourceSystem", "sourceTenantId");

-- CreateIndex
CREATE INDEX "s3_configurations_companyId_branchCode_status_canceledAt_idx" ON "s3_configurations"("companyId", "branchCode", "status", "canceledAt");

-- CreateIndex
CREATE UNIQUE INDEX "s3_configurations_companyId_branchCode_key" ON "s3_configurations"("companyId", "branchCode");

-- CreateIndex
CREATE INDEX "s3_audit_events_companyId_branchCode_occurredAt_idx" ON "s3_audit_events"("companyId", "branchCode", "occurredAt");

-- CreateIndex
CREATE INDEX "s3_audit_events_companyId_branchCode_entityType_entityId_idx" ON "s3_audit_events"("companyId", "branchCode", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "source_integration_configurations_companyId_branchCode_stat_idx" ON "source_integration_configurations"("companyId", "branchCode", "status", "canceledAt");

-- CreateIndex
CREATE UNIQUE INDEX "source_integration_configurations_companyId_branchCode_key" ON "source_integration_configurations"("companyId", "branchCode");

-- CreateIndex
CREATE INDEX "source_integration_audit_events_companyId_branchCode_occurr_idx" ON "source_integration_audit_events"("companyId", "branchCode", "occurredAt");

-- CreateIndex
CREATE INDEX "company_branches_companyId_isActive_name_idx" ON "company_branches"("companyId", "isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "company_branches_companyId_branchCode_key" ON "company_branches"("companyId", "branchCode");

-- CreateIndex
CREATE INDEX "screen_parameters_companyId_branchId_screenId_canceledAt_idx" ON "screen_parameters"("companyId", "branchId", "screenId", "canceledAt");

-- CreateIndex
CREATE UNIQUE INDEX "screen_parameters_companyId_branchId_screenId_key" ON "screen_parameters"("companyId", "branchId", "screenId");

-- CreateIndex
CREATE INDEX "print_templates_companyId_branchCode_documentType_status_ca_idx" ON "print_templates"("companyId", "branchCode", "documentType", "status", "canceledAt");

-- CreateIndex
CREATE UNIQUE INDEX "print_templates_companyId_branchCode_code_key" ON "print_templates"("companyId", "branchCode", "code");

-- CreateIndex
CREATE INDEX "print_template_versions_companyId_branchCode_status_publish_idx" ON "print_template_versions"("companyId", "branchCode", "status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "print_template_versions_templateId_version_key" ON "print_template_versions"("templateId", "version");

-- CreateIndex
CREATE INDEX "printer_profiles_companyId_branchCode_status_canceledAt_idx" ON "printer_profiles"("companyId", "branchCode", "status", "canceledAt");

-- CreateIndex
CREATE UNIQUE INDEX "printer_profiles_companyId_branchCode_name_key" ON "printer_profiles"("companyId", "branchCode", "name");

-- CreateIndex
CREATE INDEX "print_template_bindings_companyId_branchCode_status_cancele_idx" ON "print_template_bindings"("companyId", "branchCode", "status", "canceledAt");

-- CreateIndex
CREATE UNIQUE INDEX "print_template_bindings_companyId_branchCode_sourceSystem_e_key" ON "print_template_bindings"("companyId", "branchCode", "sourceSystem", "eventType");

-- CreateIndex
CREATE INDEX "print_jobs_companyId_branchCode_eventType_status_requestedA_idx" ON "print_jobs"("companyId", "branchCode", "eventType", "status", "requestedAt");

-- CreateIndex
CREATE INDEX "print_jobs_companyId_businessEntityType_businessEntityId_idx" ON "print_jobs"("companyId", "businessEntityType", "businessEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "print_jobs_companyId_branchCode_idempotencyKey_key" ON "print_jobs"("companyId", "branchCode", "idempotencyKey");

-- CreateIndex
CREATE INDEX "print_audit_events_companyId_branchCode_entityType_entityId_idx" ON "print_audit_events"("companyId", "branchCode", "entityType", "entityId", "occurredAt");

-- CreateIndex
CREATE INDEX "supertef_configurations_companyId_branchCode_status_cancele_idx" ON "supertef_configurations"("companyId", "branchCode", "status", "canceledAt");

-- CreateIndex
CREATE UNIQUE INDEX "supertef_configurations_companyId_branchCode_provider_key" ON "supertef_configurations"("companyId", "branchCode", "provider");

-- CreateIndex
CREATE INDEX "supertef_terminals_companyId_branchCode_operationalStatus_c_idx" ON "supertef_terminals"("companyId", "branchCode", "operationalStatus", "canceledAt");

-- CreateIndex
CREATE UNIQUE INDEX "supertef_terminals_configurationId_providerPosId_key" ON "supertef_terminals"("configurationId", "providerPosId");

-- CreateIndex
CREATE INDEX "supertef_checkouts_companyId_branchCode_status_canceledAt_idx" ON "supertef_checkouts"("companyId", "branchCode", "status", "canceledAt");

-- CreateIndex
CREATE UNIQUE INDEX "supertef_checkouts_companyId_branchCode_code_key" ON "supertef_checkouts"("companyId", "branchCode", "code");

-- CreateIndex
CREATE INDEX "supertef_checkout_routes_companyId_branchCode_checkoutId_st_idx" ON "supertef_checkout_routes"("companyId", "branchCode", "checkoutId", "status", "priority");

-- CreateIndex
CREATE INDEX "supertef_checkout_routes_companyId_branchCode_terminalId_st_idx" ON "supertef_checkout_routes"("companyId", "branchCode", "terminalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "supertef_checkout_routes_checkoutId_terminalId_key" ON "supertef_checkout_routes"("checkoutId", "terminalId");

-- CreateIndex
CREATE INDEX "supertef_audit_events_companyId_branchCode_occurredAt_idx" ON "supertef_audit_events"("companyId", "branchCode", "occurredAt");

-- CreateIndex
CREATE INDEX "supertef_audit_events_companyId_branchCode_entityType_entit_idx" ON "supertef_audit_events"("companyId", "branchCode", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "supertef_payments_terminalLockKey_key" ON "supertef_payments"("terminalLockKey");

-- CreateIndex
CREATE INDEX "supertef_payments_companyId_branchCode_status_requestedAt_idx" ON "supertef_payments"("companyId", "branchCode", "status", "requestedAt");

-- CreateIndex
CREATE INDEX "supertef_payments_companyId_branchCode_terminalId_status_idx" ON "supertef_payments"("companyId", "branchCode", "terminalId", "status");

-- CreateIndex
CREATE INDEX "supertef_payments_companyId_branchCode_purpose_businessRefe_idx" ON "supertef_payments"("companyId", "branchCode", "purpose", "businessReference");

-- CreateIndex
CREATE INDEX "supertef_payments_companyId_branchCode_appliedEntityType_ap_idx" ON "supertef_payments"("companyId", "branchCode", "appliedEntityType", "appliedEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "supertef_payments_companyId_branchCode_operationId_key" ON "supertef_payments"("companyId", "branchCode", "operationId");

-- CreateIndex
CREATE UNIQUE INDEX "supertef_payments_configurationId_providerPaymentUniqueId_key" ON "supertef_payments"("configurationId", "providerPaymentUniqueId");

-- CreateIndex
CREATE INDEX "products_companyId_status_name_idx" ON "products"("companyId", "status", "name");

-- CreateIndex
CREATE INDEX "products_companyId_productType_tracksInventory_idx" ON "products"("companyId", "productType", "tracksInventory");

-- CreateIndex
CREATE UNIQUE INDEX "products_companyId_branchCode_internalCode_key" ON "products"("companyId", "branchCode", "internalCode");

-- CreateIndex
CREATE UNIQUE INDEX "products_companyId_branchCode_sku_key" ON "products"("companyId", "branchCode", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_companyId_branchCode_barcode_key" ON "products"("companyId", "branchCode", "barcode");

-- CreateIndex
CREATE INDEX "product_stock_balances_companyId_branchCode_productId_idx" ON "product_stock_balances"("companyId", "branchCode", "productId");

-- CreateIndex
CREATE INDEX "product_stock_balances_companyId_productId_lotNumber_idx" ON "product_stock_balances"("companyId", "productId", "lotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "product_stock_balances_companyId_productId_branchCode_varia_key" ON "product_stock_balances"("companyId", "productId", "branchCode", "variantKey");

-- CreateIndex
CREATE INDEX "fiscal_certificates_companyId_status_environment_purpose_al_idx" ON "fiscal_certificates"("companyId", "status", "environment", "purpose", "aliasName");

-- CreateIndex
CREATE INDEX "suppliers_companyId_status_legalName_idx" ON "suppliers"("companyId", "status", "legalName");

-- CreateIndex
CREATE INDEX "suppliers_partyId_idx" ON "suppliers"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_companyId_branchCode_document_key" ON "suppliers"("companyId", "branchCode", "document");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_companyId_branchCode_partyId_key" ON "suppliers"("companyId", "branchCode", "partyId");

-- CreateIndex
CREATE INDEX "payable_invoice_imports_companyId_status_issueDate_idx" ON "payable_invoice_imports"("companyId", "status", "issueDate");

-- CreateIndex
CREATE INDEX "payable_invoice_imports_companyId_invoiceNumber_series_idx" ON "payable_invoice_imports"("companyId", "invoiceNumber", "series");

-- CreateIndex
CREATE INDEX "payable_invoice_imports_fiscalCertificateId_distributionNsu_idx" ON "payable_invoice_imports"("fiscalCertificateId", "distributionNsu");

-- CreateIndex
CREATE UNIQUE INDEX "payable_invoice_imports_companyId_branchCode_accessKey_key" ON "payable_invoice_imports"("companyId", "branchCode", "accessKey");

-- CreateIndex
CREATE UNIQUE INDEX "payable_invoice_imports_companyId_branchCode_xmlHash_key" ON "payable_invoice_imports"("companyId", "branchCode", "xmlHash");

-- CreateIndex
CREATE INDEX "payable_invoice_import_items_productId_idx" ON "payable_invoice_import_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "payable_invoice_import_items_invoiceImportId_lineNumber_key" ON "payable_invoice_import_items"("invoiceImportId", "lineNumber");

-- CreateIndex
CREATE INDEX "payable_invoice_import_installments_dueDate_idx" ON "payable_invoice_import_installments"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "payable_invoice_import_installments_invoiceImportId_install_key" ON "payable_invoice_import_installments"("invoiceImportId", "installmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "payable_titles_sourceDocumentId_key" ON "payable_titles"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "payable_titles_companyId_status_issueDate_idx" ON "payable_titles"("companyId", "status", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "payable_titles_companyId_branchCode_sourceDocumentType_sour_key" ON "payable_titles"("companyId", "branchCode", "sourceDocumentType", "sourceDocumentId");

-- CreateIndex
CREATE INDEX "payable_installments_companyId_status_dueDate_idx" ON "payable_installments"("companyId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "payable_installments_titleId_installmentNumber_key" ON "payable_installments"("titleId", "installmentNumber");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_occurredAt_idx" ON "stock_movements"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_productId_occurredAt_idx" ON "stock_movements"("productId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_sourceImportId_idx" ON "stock_movements"("sourceImportId");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_sourceType_sourceId_idx" ON "stock_movements"("companyId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "sales_companyId_branchCode_status_confirmedAt_idx" ON "sales"("companyId", "branchCode", "status", "confirmedAt");

-- CreateIndex
CREATE INDEX "sales_companyId_saleChannel_confirmedAt_idx" ON "sales"("companyId", "saleChannel", "confirmedAt");

-- CreateIndex
CREATE INDEX "sales_companyId_customerPartyId_idx" ON "sales"("companyId", "customerPartyId");

-- CreateIndex
CREATE INDEX "sales_receivableTitleId_idx" ON "sales"("receivableTitleId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_companyId_branchCode_saleNumber_key" ON "sales"("companyId", "branchCode", "saleNumber");

-- CreateIndex
CREATE INDEX "sale_items_companyId_productId_createdAt_idx" ON "sale_items"("companyId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "sale_items_saleId_idx" ON "sale_items"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "sale_items_saleId_lineNumber_key" ON "sale_items"("saleId", "lineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "sale_payments_superTefPaymentId_key" ON "sale_payments"("superTefPaymentId");

-- CreateIndex
CREATE INDEX "sale_payments_companyId_paymentMethod_createdAt_idx" ON "sale_payments"("companyId", "paymentMethod", "createdAt");

-- CreateIndex
CREATE INDEX "sale_payments_saleId_idx" ON "sale_payments"("saleId");

-- CreateIndex
CREATE INDEX "sale_payments_cashSessionId_idx" ON "sale_payments"("cashSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "sale_pix_intents_appliedSaleId_key" ON "sale_pix_intents"("appliedSaleId");

-- CreateIndex
CREATE INDEX "sale_pix_intents_companyId_branchCode_status_createdAt_idx" ON "sale_pix_intents"("companyId", "branchCode", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sale_pix_intents_companyId_branchCode_operationId_key" ON "sale_pix_intents"("companyId", "branchCode", "operationId");

-- CreateIndex
CREATE UNIQUE INDEX "sale_pix_intents_companyId_txid_key" ON "sale_pix_intents"("companyId", "txid");

-- CreateIndex
CREATE INDEX "receivable_pix_intents_companyId_branchCode_status_createdA_idx" ON "receivable_pix_intents"("companyId", "branchCode", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_pix_intents_companyId_branchCode_operationId_key" ON "receivable_pix_intents"("companyId", "branchCode", "operationId");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_pix_intents_companyId_txid_key" ON "receivable_pix_intents"("companyId", "txid");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_pix_intents_companyId_settlementGroupId_key" ON "receivable_pix_intents"("companyId", "settlementGroupId");

-- CreateIndex
CREATE INDEX "nfce_profiles_companyId_branchCode_status_autoIssueOnSale_idx" ON "nfce_profiles"("companyId", "branchCode", "status", "autoIssueOnSale");

-- CreateIndex
CREATE UNIQUE INDEX "nfce_profiles_companyId_branchCode_environment_key" ON "nfce_profiles"("companyId", "branchCode", "environment");

-- CreateIndex
CREATE INDEX "nfe_profiles_companyId_branchCode_status_autoIssueOnSale_idx" ON "nfe_profiles"("companyId", "branchCode", "status", "autoIssueOnSale");

-- CreateIndex
CREATE UNIQUE INDEX "nfe_profiles_companyId_branchCode_environment_series_key" ON "nfe_profiles"("companyId", "branchCode", "environment", "series");

-- CreateIndex
CREATE INDEX "nfse_profiles_companyId_branchCode_status_autoIssueOnSale_idx" ON "nfse_profiles"("companyId", "branchCode", "status", "autoIssueOnSale");

-- CreateIndex
CREATE UNIQUE INDEX "nfse_profiles_companyId_branchCode_environment_series_key" ON "nfse_profiles"("companyId", "branchCode", "environment", "series");

-- CreateIndex
CREATE INDEX "nfse_service_items_companyId_branchCode_status_nationalTaxC_idx" ON "nfse_service_items"("companyId", "branchCode", "status", "nationalTaxCode");

-- CreateIndex
CREATE UNIQUE INDEX "nfse_service_items_companyId_branchCode_internalCode_key" ON "nfse_service_items"("companyId", "branchCode", "internalCode");

-- CreateIndex
CREATE INDEX "nfse_service_descriptions_companyId_branchCode_serviceItemI_idx" ON "nfse_service_descriptions"("companyId", "branchCode", "serviceItemId", "status", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "nfse_service_descriptions_serviceItemId_text_key" ON "nfse_service_descriptions"("serviceItemId", "text");

-- CreateIndex
CREATE UNIQUE INDEX "nfse_documents_accessKey_key" ON "nfse_documents"("accessKey");

-- CreateIndex
CREATE INDEX "nfse_documents_companyId_branchCode_status_issuedAt_idx" ON "nfse_documents"("companyId", "branchCode", "status", "issuedAt");

-- CreateIndex
CREATE INDEX "nfse_documents_companyId_takerPartyId_issuedAt_idx" ON "nfse_documents"("companyId", "takerPartyId", "issuedAt");

-- CreateIndex
CREATE INDEX "nfse_documents_receivableTitleId_idx" ON "nfse_documents"("receivableTitleId");

-- CreateIndex
CREATE INDEX "nfse_documents_saleId_idx" ON "nfse_documents"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "nfse_documents_companyId_branchCode_environment_series_numb_key" ON "nfse_documents"("companyId", "branchCode", "environment", "series", "number");

-- CreateIndex
CREATE UNIQUE INDEX "nfse_documents_companyId_branchCode_environment_dpsId_key" ON "nfse_documents"("companyId", "branchCode", "environment", "dpsId");

-- CreateIndex
CREATE UNIQUE INDEX "nfse_documents_companyId_branchCode_idempotencyKey_key" ON "nfse_documents"("companyId", "branchCode", "idempotencyKey");

-- CreateIndex
CREATE INDEX "nfse_document_attempts_companyId_attemptedAt_idx" ON "nfse_document_attempts"("companyId", "attemptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "nfse_document_attempts_nfseDocumentId_attemptNumber_key" ON "nfse_document_attempts"("nfseDocumentId", "attemptNumber");

-- CreateIndex
CREATE INDEX "nfse_email_deliveries_companyId_branchCode_recipientEmail_a_idx" ON "nfse_email_deliveries"("companyId", "branchCode", "recipientEmail", "attemptedAt");

-- CreateIndex
CREATE INDEX "nfse_email_deliveries_nfseDocumentId_status_attemptedAt_idx" ON "nfse_email_deliveries"("nfseDocumentId", "status", "attemptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "nfse_municipal_parameters_cacheKey_key" ON "nfse_municipal_parameters"("cacheKey");

-- CreateIndex
CREATE INDEX "nfse_municipal_parameters_companyId_branchCode_environment__idx" ON "nfse_municipal_parameters"("companyId", "branchCode", "environment", "municipalityCode", "fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "nfse_municipal_parameters_companyId_branchCode_environment__key" ON "nfse_municipal_parameters"("companyId", "branchCode", "environment", "municipalityCode", "nationalTaxCode", "competence", "parameterType");

-- CreateIndex
CREATE INDEX "fiscal_operation_natures_companyId_branchCode_status_docume_idx" ON "fiscal_operation_natures"("companyId", "branchCode", "status", "documentModel");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_operation_natures_companyId_branchCode_code_key" ON "fiscal_operation_natures"("companyId", "branchCode", "code");

-- CreateIndex
CREATE INDEX "fiscal_tax_rules_companyId_branchCode_operationNatureId_sta_idx" ON "fiscal_tax_rules"("companyId", "branchCode", "operationNatureId", "status", "priority");

-- CreateIndex
CREATE INDEX "fiscal_tax_rules_companyId_branchCode_productId_idx" ON "fiscal_tax_rules"("companyId", "branchCode", "productId");

-- CreateIndex
CREATE INDEX "fiscal_benefit_codes_companyId_branchCode_stateCode_status__idx" ON "fiscal_benefit_codes"("companyId", "branchCode", "stateCode", "status", "code");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_benefit_codes_companyId_branchCode_stateCode_code_ca_key" ON "fiscal_benefit_codes"("companyId", "branchCode", "stateCode", "code", "catalogVersion");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_saleId_key" ON "fiscal_documents"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_accessKey_key" ON "fiscal_documents"("accessKey");

-- CreateIndex
CREATE INDEX "fiscal_documents_companyId_branchCode_status_issuedAt_idx" ON "fiscal_documents"("companyId", "branchCode", "status", "issuedAt");

-- CreateIndex
CREATE INDEX "fiscal_documents_companyId_branchCode_sourceEntityType_sour_idx" ON "fiscal_documents"("companyId", "branchCode", "sourceEntityType", "sourceEntityId");

-- CreateIndex
CREATE INDEX "fiscal_documents_receivableTitleId_idx" ON "fiscal_documents"("receivableTitleId");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_companyId_branchCode_model_series_number_key" ON "fiscal_documents"("companyId", "branchCode", "model", "series", "number");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_companyId_branchCode_idempotencyKey_key" ON "fiscal_documents"("companyId", "branchCode", "idempotencyKey");

-- CreateIndex
CREATE INDEX "fiscal_document_attempts_companyId_attemptedAt_idx" ON "fiscal_document_attempts"("companyId", "attemptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_document_attempts_fiscalDocumentId_attemptNumber_key" ON "fiscal_document_attempts"("fiscalDocumentId", "attemptNumber");

-- CreateIndex
CREATE INDEX "fiscal_document_items_companyId_fiscalDocumentId_idx" ON "fiscal_document_items"("companyId", "fiscalDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_document_items_fiscalDocumentId_lineNumber_key" ON "fiscal_document_items"("fiscalDocumentId", "lineNumber");

-- CreateIndex
CREATE INDEX "fiscal_document_installments_companyId_dueDate_idx" ON "fiscal_document_installments"("companyId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_document_installments_fiscalDocumentId_installmentNu_key" ON "fiscal_document_installments"("fiscalDocumentId", "installmentNumber");

-- CreateIndex
CREATE INDEX "fiscal_document_events_companyId_branchCode_eventType_event_idx" ON "fiscal_document_events"("companyId", "branchCode", "eventType", "eventAt");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_document_events_fiscalDocumentId_eventType_sequence_key" ON "fiscal_document_events"("fiscalDocumentId", "eventType", "sequence");

-- CreateIndex
CREATE INDEX "fiscal_document_email_deliveries_companyId_branchCode_recip_idx" ON "fiscal_document_email_deliveries"("companyId", "branchCode", "recipientEmail", "attemptedAt");

-- CreateIndex
CREATE INDEX "fiscal_document_email_deliveries_fiscalDocumentId_status_at_idx" ON "fiscal_document_email_deliveries"("fiscalDocumentId", "status", "attemptedAt");

-- CreateIndex
CREATE INDEX "fiscal_number_inutilizations_companyId_branchCode_status_cr_idx" ON "fiscal_number_inutilizations"("companyId", "branchCode", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_number_inutilizations_companyId_branchCode_environme_key" ON "fiscal_number_inutilizations"("companyId", "branchCode", "environment", "model", "series", "year", "startNumber", "endNumber");

-- CreateIndex
CREATE INDEX "fiscal_audit_events_companyId_branchCode_entityType_entityI_idx" ON "fiscal_audit_events"("companyId", "branchCode", "entityType", "entityId", "occurredAt");

-- CreateIndex
CREATE INDEX "sale_returns_companyId_saleId_confirmedAt_idx" ON "sale_returns"("companyId", "saleId", "confirmedAt");

-- CreateIndex
CREATE INDEX "sale_returns_companyId_customerPartyId_idx" ON "sale_returns"("companyId", "customerPartyId");

-- CreateIndex
CREATE INDEX "sale_returns_creditId_idx" ON "sale_returns"("creditId");

-- CreateIndex
CREATE UNIQUE INDEX "sale_returns_companyId_branchCode_returnNumber_key" ON "sale_returns"("companyId", "branchCode", "returnNumber");

-- CreateIndex
CREATE INDEX "sale_return_items_companyId_productId_createdAt_idx" ON "sale_return_items"("companyId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "sale_return_items_returnId_idx" ON "sale_return_items"("returnId");

-- CreateIndex
CREATE INDEX "sale_return_items_saleItemId_idx" ON "sale_return_items"("saleItemId");

-- CreateIndex
CREATE INDEX "bank_accounts_companyId_status_bankName_idx" ON "bank_accounts"("companyId", "status", "bankName");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_companyId_branchCode_bankCode_branchNumber_br_key" ON "bank_accounts"("companyId", "branchCode", "bankCode", "branchNumber", "branchDigit", "accountNumber", "accountDigit");

-- CreateIndex
CREATE INDEX "bank_dda_records_companyId_branchCode_status_dueDate_idx" ON "bank_dda_records"("companyId", "branchCode", "status", "dueDate");

-- CreateIndex
CREATE INDEX "bank_dda_records_companyId_bankAccountId_lastSeenAt_idx" ON "bank_dda_records"("companyId", "bankAccountId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "bank_dda_records_bankAccountId_externalId_key" ON "bank_dda_records"("bankAccountId", "externalId");

-- CreateIndex
CREATE INDEX "bank_dda_audit_events_companyId_branchCode_occurredAt_idx" ON "bank_dda_audit_events"("companyId", "branchCode", "occurredAt");

-- CreateIndex
CREATE INDEX "bank_dda_audit_events_companyId_bankDdaRecordId_occurredAt_idx" ON "bank_dda_audit_events"("companyId", "bankDdaRecordId", "occurredAt");

-- CreateIndex
CREATE INDEX "parties_companyId_name_idx" ON "parties"("companyId", "name");

-- CreateIndex
CREATE INDEX "parties_companyId_documentNormalized_canceledAt_idx" ON "parties"("companyId", "documentNormalized", "canceledAt");

-- CreateIndex
CREATE UNIQUE INDEX "parties_companyId_branchCode_externalEntityType_externalEnt_key" ON "parties"("companyId", "branchCode", "externalEntityType", "externalEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "parties_companyId_documentNormalized_key" ON "parties"("companyId", "documentNormalized");

-- CreateIndex
CREATE INDEX "party_roles_companyId_branchCode_roleType_canceledAt_idx" ON "party_roles"("companyId", "branchCode", "roleType", "canceledAt");

-- CreateIndex
CREATE INDEX "party_roles_partyId_canceledAt_idx" ON "party_roles"("partyId", "canceledAt");

-- CreateIndex
CREATE UNIQUE INDEX "party_roles_companyId_partyId_branchCode_roleType_key" ON "party_roles"("companyId", "partyId", "branchCode", "roleType");

-- CreateIndex
CREATE INDEX "party_external_references_companyId_branchCode_externalEnti_idx" ON "party_external_references"("companyId", "branchCode", "externalEntityType", "canceledAt");

-- CreateIndex
CREATE INDEX "party_external_references_partyId_canceledAt_idx" ON "party_external_references"("partyId", "canceledAt");

-- CreateIndex
CREATE UNIQUE INDEX "party_external_references_companyId_sourceSystem_sourceTena_key" ON "party_external_references"("companyId", "sourceSystem", "sourceTenantId", "externalEntityType", "externalEntityId");

-- CreateIndex
CREATE INDEX "party_audit_events_companyId_branchCode_occurredAt_idx" ON "party_audit_events"("companyId", "branchCode", "occurredAt");

-- CreateIndex
CREATE INDEX "party_audit_events_partyId_occurredAt_idx" ON "party_audit_events"("partyId", "occurredAt");

-- CreateIndex
CREATE INDEX "receivable_batches_companyId_createdAt_idx" ON "receivable_batches"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "receivable_batches_sourceSystem_sourceTenantId_idx" ON "receivable_batches"("sourceSystem", "sourceTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_batches_companyId_branchCode_sourceBatchId_key" ON "receivable_batches"("companyId", "branchCode", "sourceBatchId");

-- CreateIndex
CREATE INDEX "receivable_titles_companyId_sourceEntityType_sourceEntityId_idx" ON "receivable_titles"("companyId", "sourceEntityType", "sourceEntityId");

-- CreateIndex
CREATE INDEX "receivable_titles_batchId_idx" ON "receivable_titles"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_titles_companyId_branchCode_businessKey_key" ON "receivable_titles"("companyId", "branchCode", "businessKey");

-- CreateIndex
CREATE INDEX "receivable_installments_companyId_status_dueDate_idx" ON "receivable_installments"("companyId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "receivable_installments_companyId_bankAccountId_status_idx" ON "receivable_installments"("companyId", "bankAccountId", "status");

-- CreateIndex
CREATE INDEX "receivable_installments_companyId_bankAccountId_bankMovemen_idx" ON "receivable_installments"("companyId", "bankAccountId", "bankMovementStatus");

-- CreateIndex
CREATE INDEX "receivable_installments_companyId_bankMovementGroupId_idx" ON "receivable_installments"("companyId", "bankMovementGroupId");

-- CreateIndex
CREATE INDEX "receivable_installments_titleId_idx" ON "receivable_installments"("titleId");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_installments_companyId_branchCode_sourceInstallm_key" ON "receivable_installments"("companyId", "branchCode", "sourceInstallmentKey");

-- CreateIndex
CREATE INDEX "cash_sessions_companyId_cashierUserId_status_idx" ON "cash_sessions"("companyId", "cashierUserId", "status");

-- CreateIndex
CREATE INDEX "cash_sessions_companyId_openedAt_idx" ON "cash_sessions"("companyId", "openedAt");

-- CreateIndex
CREATE INDEX "cash_movements_companyId_occurredAt_idx" ON "cash_movements"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "cash_movements_companyId_bankAccountId_bankMovementGroupId_idx" ON "cash_movements"("companyId", "bankAccountId", "bankMovementGroupId");

-- CreateIndex
CREATE INDEX "cash_movements_cashSessionId_idx" ON "cash_movements"("cashSessionId");

-- CreateIndex
CREATE INDEX "installment_settlements_companyId_settledAt_idx" ON "installment_settlements"("companyId", "settledAt");

-- CreateIndex
CREATE INDEX "installment_settlements_companyId_settlementGroupId_idx" ON "installment_settlements"("companyId", "settlementGroupId");

-- CreateIndex
CREATE INDEX "installment_settlements_companyId_bankAccountId_bankMovemen_idx" ON "installment_settlements"("companyId", "bankAccountId", "bankMovementGroupId");

-- CreateIndex
CREATE INDEX "installment_settlements_installmentId_idx" ON "installment_settlements"("installmentId");

-- CreateIndex
CREATE INDEX "installment_settlements_cashSessionId_idx" ON "installment_settlements"("cashSessionId");

-- CreateIndex
CREATE INDEX "installment_settlements_superTefPaymentId_idx" ON "installment_settlements"("superTefPaymentId");

-- CreateIndex
CREATE INDEX "installment_settlements_receivablePixIntentId_idx" ON "installment_settlements"("receivablePixIntentId");

-- CreateIndex
CREATE INDEX "customer_credits_companyId_status_customerName_idx" ON "customer_credits"("companyId", "status", "customerName");

-- CreateIndex
CREATE INDEX "customer_credits_companyId_customerDocument_idx" ON "customer_credits"("companyId", "customerDocument");

-- CreateIndex
CREATE INDEX "customer_credit_movements_companyId_movementType_occurredAt_idx" ON "customer_credit_movements"("companyId", "movementType", "occurredAt");

-- CreateIndex
CREATE INDEX "customer_credit_movements_creditId_occurredAt_idx" ON "customer_credit_movements"("creditId", "occurredAt");

-- CreateIndex
CREATE INDEX "customer_credit_movements_cashSessionId_idx" ON "customer_credit_movements"("cashSessionId");

-- CreateIndex
CREATE INDEX "bank_return_imports_companyId_createdAt_idx" ON "bank_return_imports"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "bank_return_imports_bankAccountId_createdAt_idx" ON "bank_return_imports"("bankAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "bank_return_import_items_importId_movementStatus_idx" ON "bank_return_import_items"("importId", "movementStatus");

-- CreateIndex
CREATE INDEX "bank_return_import_items_companyId_bankAccountId_movementSt_idx" ON "bank_return_import_items"("companyId", "bankAccountId", "movementStatus");

-- CreateIndex
CREATE INDEX "bank_return_import_items_matchedInstallmentId_idx" ON "bank_return_import_items"("matchedInstallmentId");

-- CreateIndex
CREATE INDEX "bank_statement_imports_companyId_createdAt_idx" ON "bank_statement_imports"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "bank_statement_imports_bankAccountId_pulledAt_idx" ON "bank_statement_imports"("bankAccountId", "pulledAt");

-- CreateIndex
CREATE INDEX "bank_statement_imports_companyId_bankAccountId_periodStart__idx" ON "bank_statement_imports"("companyId", "bankAccountId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "bank_statement_movements_companyId_bankAccountId_occurredAt_idx" ON "bank_statement_movements"("companyId", "bankAccountId", "occurredAt");

-- CreateIndex
CREATE INDEX "bank_statement_movements_companyId_bankAccountId_reconcilia_idx" ON "bank_statement_movements"("companyId", "bankAccountId", "reconciliationStatus");

-- CreateIndex
CREATE INDEX "bank_statement_movements_companyId_bankAccountId_reviewStat_idx" ON "bank_statement_movements"("companyId", "bankAccountId", "reviewStatus");

-- CreateIndex
CREATE INDEX "bank_statement_movements_firstImportId_idx" ON "bank_statement_movements"("firstImportId");

-- CreateIndex
CREATE INDEX "bank_statement_movements_lastImportId_idx" ON "bank_statement_movements"("lastImportId");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_movements_companyId_bankAccountId_externalId_key" ON "bank_statement_movements"("companyId", "bankAccountId", "externalId");

-- AddForeignKey
ALTER TABLE "s3_configurations" ADD CONSTRAINT "s3_configurations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "s3_audit_events" ADD CONSTRAINT "s3_audit_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_integration_configurations" ADD CONSTRAINT "source_integration_configurations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_integration_audit_events" ADD CONSTRAINT "source_integration_audit_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_branches" ADD CONSTRAINT "company_branches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screen_parameters" ADD CONSTRAINT "screen_parameters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screen_parameters" ADD CONSTRAINT "screen_parameters_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "company_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_templates" ADD CONSTRAINT "print_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_template_versions" ADD CONSTRAINT "print_template_versions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_template_versions" ADD CONSTRAINT "print_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "print_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printer_profiles" ADD CONSTRAINT "printer_profiles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_template_bindings" ADD CONSTRAINT "print_template_bindings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_template_bindings" ADD CONSTRAINT "print_template_bindings_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "print_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_template_bindings" ADD CONSTRAINT "print_template_bindings_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "print_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_template_bindings" ADD CONSTRAINT "print_template_bindings_printerProfileId_fkey" FOREIGN KEY ("printerProfileId") REFERENCES "printer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "print_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "print_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_printerProfileId_fkey" FOREIGN KEY ("printerProfileId") REFERENCES "printer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_audit_events" ADD CONSTRAINT "print_audit_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supertef_configurations" ADD CONSTRAINT "supertef_configurations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supertef_terminals" ADD CONSTRAINT "supertef_terminals_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "supertef_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supertef_terminals" ADD CONSTRAINT "supertef_terminals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supertef_checkouts" ADD CONSTRAINT "supertef_checkouts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supertef_checkout_routes" ADD CONSTRAINT "supertef_checkout_routes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supertef_checkout_routes" ADD CONSTRAINT "supertef_checkout_routes_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "supertef_checkouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supertef_checkout_routes" ADD CONSTRAINT "supertef_checkout_routes_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "supertef_terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supertef_audit_events" ADD CONSTRAINT "supertef_audit_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supertef_payments" ADD CONSTRAINT "supertef_payments_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "supertef_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supertef_payments" ADD CONSTRAINT "supertef_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supertef_payments" ADD CONSTRAINT "supertef_payments_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "supertef_terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supertef_payments" ADD CONSTRAINT "supertef_payments_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "supertef_checkouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stock_balances" ADD CONSTRAINT "product_stock_balances_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stock_balances" ADD CONSTRAINT "product_stock_balances_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_certificates" ADD CONSTRAINT "fiscal_certificates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_invoice_imports" ADD CONSTRAINT "payable_invoice_imports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_invoice_imports" ADD CONSTRAINT "payable_invoice_imports_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_invoice_imports" ADD CONSTRAINT "payable_invoice_imports_fiscalCertificateId_fkey" FOREIGN KEY ("fiscalCertificateId") REFERENCES "fiscal_certificates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_invoice_import_items" ADD CONSTRAINT "payable_invoice_import_items_invoiceImportId_fkey" FOREIGN KEY ("invoiceImportId") REFERENCES "payable_invoice_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_invoice_import_items" ADD CONSTRAINT "payable_invoice_import_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_invoice_import_installments" ADD CONSTRAINT "payable_invoice_import_installments_invoiceImportId_fkey" FOREIGN KEY ("invoiceImportId") REFERENCES "payable_invoice_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_titles" ADD CONSTRAINT "payable_titles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_titles" ADD CONSTRAINT "payable_titles_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_titles" ADD CONSTRAINT "payable_titles_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "payable_invoice_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_installments" ADD CONSTRAINT "payable_installments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_installments" ADD CONSTRAINT "payable_installments_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "payable_titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sourceImportId_fkey" FOREIGN KEY ("sourceImportId") REFERENCES "payable_invoice_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sourceImportItemId_fkey" FOREIGN KEY ("sourceImportItemId") REFERENCES "payable_invoice_import_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customerPartyId_fkey" FOREIGN KEY ("customerPartyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_receivableTitleId_fkey" FOREIGN KEY ("receivableTitleId") REFERENCES "receivable_titles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_superTefPaymentId_fkey" FOREIGN KEY ("superTefPaymentId") REFERENCES "supertef_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_pix_intents" ADD CONSTRAINT "sale_pix_intents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_pix_intents" ADD CONSTRAINT "receivable_pix_intents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfce_profiles" ADD CONSTRAINT "nfce_profiles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfce_profiles" ADD CONSTRAINT "nfce_profiles_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "fiscal_certificates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfe_profiles" ADD CONSTRAINT "nfe_profiles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfe_profiles" ADD CONSTRAINT "nfe_profiles_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "fiscal_certificates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfe_profiles" ADD CONSTRAINT "nfe_profiles_defaultOperationNatureId_fkey" FOREIGN KEY ("defaultOperationNatureId") REFERENCES "fiscal_operation_natures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfse_profiles" ADD CONSTRAINT "nfse_profiles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfse_profiles" ADD CONSTRAINT "nfse_profiles_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "fiscal_certificates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfse_profiles" ADD CONSTRAINT "nfse_profiles_defaultServiceItemId_fkey" FOREIGN KEY ("defaultServiceItemId") REFERENCES "nfse_service_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfse_service_items" ADD CONSTRAINT "nfse_service_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfse_service_descriptions" ADD CONSTRAINT "nfse_service_descriptions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfse_service_descriptions" ADD CONSTRAINT "nfse_service_descriptions_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "nfse_service_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfse_documents" ADD CONSTRAINT "nfse_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfse_documents" ADD CONSTRAINT "nfse_documents_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "nfse_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfse_documents" ADD CONSTRAINT "nfse_documents_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "nfse_service_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfse_documents" ADD CONSTRAINT "nfse_documents_takerPartyId_fkey" FOREIGN KEY ("takerPartyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfse_documents" ADD CONSTRAINT "nfse_documents_receivableTitleId_fkey" FOREIGN KEY ("receivableTitleId") REFERENCES "receivable_titles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfse_documents" ADD CONSTRAINT "nfse_documents_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfse_document_attempts" ADD CONSTRAINT "nfse_document_attempts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfse_document_attempts" ADD CONSTRAINT "nfse_document_attempts_nfseDocumentId_fkey" FOREIGN KEY ("nfseDocumentId") REFERENCES "nfse_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfse_email_deliveries" ADD CONSTRAINT "nfse_email_deliveries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfse_email_deliveries" ADD CONSTRAINT "nfse_email_deliveries_nfseDocumentId_fkey" FOREIGN KEY ("nfseDocumentId") REFERENCES "nfse_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfse_municipal_parameters" ADD CONSTRAINT "nfse_municipal_parameters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_operation_natures" ADD CONSTRAINT "fiscal_operation_natures_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_tax_rules" ADD CONSTRAINT "fiscal_tax_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_tax_rules" ADD CONSTRAINT "fiscal_tax_rules_operationNatureId_fkey" FOREIGN KEY ("operationNatureId") REFERENCES "fiscal_operation_natures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_tax_rules" ADD CONSTRAINT "fiscal_tax_rules_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_benefit_codes" ADD CONSTRAINT "fiscal_benefit_codes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_receivableTitleId_fkey" FOREIGN KEY ("receivableTitleId") REFERENCES "receivable_titles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "nfce_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_nfeProfileId_fkey" FOREIGN KEY ("nfeProfileId") REFERENCES "nfe_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_operationNatureId_fkey" FOREIGN KEY ("operationNatureId") REFERENCES "fiscal_operation_natures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_recipientPartyId_fkey" FOREIGN KEY ("recipientPartyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "fiscal_certificates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_document_attempts" ADD CONSTRAINT "fiscal_document_attempts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_document_attempts" ADD CONSTRAINT "fiscal_document_attempts_fiscalDocumentId_fkey" FOREIGN KEY ("fiscalDocumentId") REFERENCES "fiscal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_document_items" ADD CONSTRAINT "fiscal_document_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_document_items" ADD CONSTRAINT "fiscal_document_items_fiscalDocumentId_fkey" FOREIGN KEY ("fiscalDocumentId") REFERENCES "fiscal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_document_items" ADD CONSTRAINT "fiscal_document_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_document_installments" ADD CONSTRAINT "fiscal_document_installments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_document_installments" ADD CONSTRAINT "fiscal_document_installments_fiscalDocumentId_fkey" FOREIGN KEY ("fiscalDocumentId") REFERENCES "fiscal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_document_events" ADD CONSTRAINT "fiscal_document_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_document_events" ADD CONSTRAINT "fiscal_document_events_fiscalDocumentId_fkey" FOREIGN KEY ("fiscalDocumentId") REFERENCES "fiscal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_document_email_deliveries" ADD CONSTRAINT "fiscal_document_email_deliveries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_document_email_deliveries" ADD CONSTRAINT "fiscal_document_email_deliveries_fiscalDocumentId_fkey" FOREIGN KEY ("fiscalDocumentId") REFERENCES "fiscal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_number_inutilizations" ADD CONSTRAINT "fiscal_number_inutilizations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_number_inutilizations" ADD CONSTRAINT "fiscal_number_inutilizations_nfeProfileId_fkey" FOREIGN KEY ("nfeProfileId") REFERENCES "nfe_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_audit_events" ADD CONSTRAINT "fiscal_audit_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "customer_credits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "sale_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_dda_records" ADD CONSTRAINT "bank_dda_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_dda_records" ADD CONSTRAINT "bank_dda_records_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_dda_audit_events" ADD CONSTRAINT "bank_dda_audit_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_dda_audit_events" ADD CONSTRAINT "bank_dda_audit_events_bankDdaRecordId_fkey" FOREIGN KEY ("bankDdaRecordId") REFERENCES "bank_dda_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_roles" ADD CONSTRAINT "party_roles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_roles" ADD CONSTRAINT "party_roles_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_external_references" ADD CONSTRAINT "party_external_references_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_external_references" ADD CONSTRAINT "party_external_references_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_audit_events" ADD CONSTRAINT "party_audit_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_audit_events" ADD CONSTRAINT "party_audit_events_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_batches" ADD CONSTRAINT "receivable_batches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_titles" ADD CONSTRAINT "receivable_titles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_titles" ADD CONSTRAINT "receivable_titles_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "receivable_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_titles" ADD CONSTRAINT "receivable_titles_payerPartyId_fkey" FOREIGN KEY ("payerPartyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_installments" ADD CONSTRAINT "receivable_installments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_installments" ADD CONSTRAINT "receivable_installments_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "receivable_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_installments" ADD CONSTRAINT "receivable_installments_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "receivable_titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_settlements" ADD CONSTRAINT "installment_settlements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_settlements" ADD CONSTRAINT "installment_settlements_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "receivable_installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_settlements" ADD CONSTRAINT "installment_settlements_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_settlements" ADD CONSTRAINT "installment_settlements_superTefPaymentId_fkey" FOREIGN KEY ("superTefPaymentId") REFERENCES "supertef_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_settlements" ADD CONSTRAINT "installment_settlements_receivablePixIntentId_fkey" FOREIGN KEY ("receivablePixIntentId") REFERENCES "receivable_pix_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credits" ADD CONSTRAINT "customer_credits_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_movements" ADD CONSTRAINT "customer_credit_movements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_credit_movements" ADD CONSTRAINT "customer_credit_movements_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "customer_credits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_return_imports" ADD CONSTRAINT "bank_return_imports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_return_imports" ADD CONSTRAINT "bank_return_imports_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_return_import_items" ADD CONSTRAINT "bank_return_import_items_importId_fkey" FOREIGN KEY ("importId") REFERENCES "bank_return_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_return_import_items" ADD CONSTRAINT "bank_return_import_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_return_import_items" ADD CONSTRAINT "bank_return_import_items_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_return_import_items" ADD CONSTRAINT "bank_return_import_items_matchedInstallmentId_fkey" FOREIGN KEY ("matchedInstallmentId") REFERENCES "receivable_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_return_import_items" ADD CONSTRAINT "bank_return_import_items_appliedSettlementId_fkey" FOREIGN KEY ("appliedSettlementId") REFERENCES "installment_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_movements" ADD CONSTRAINT "bank_statement_movements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_movements" ADD CONSTRAINT "bank_statement_movements_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_movements" ADD CONSTRAINT "bank_statement_movements_firstImportId_fkey" FOREIGN KEY ("firstImportId") REFERENCES "bank_statement_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_movements" ADD CONSTRAINT "bank_statement_movements_lastImportId_fkey" FOREIGN KEY ("lastImportId") REFERENCES "bank_statement_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

