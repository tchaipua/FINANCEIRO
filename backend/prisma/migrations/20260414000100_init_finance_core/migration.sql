-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT
);

-- CreateTable
CREATE TABLE "parties" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "externalEntityType" TEXT NOT NULL,
    "externalEntityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "parties_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "receivable_batches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "sourceBatchType" TEXT NOT NULL,
    "sourceBatchId" TEXT NOT NULL,
    "referenceDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PROCESSED',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "payloadSnapshot" TEXT,
    "metadataJson" TEXT,
    "skippedItemsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "receivable_batches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "receivable_titles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "payerPartyId" TEXT,
    "sourceEntityType" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "sourceEntityName" TEXT,
    "classLabel" TEXT,
    "businessKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryCode" TEXT,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "payerNameSnapshot" TEXT NOT NULL,
    "payerDocumentSnapshot" TEXT,
    "payerEmailSnapshot" TEXT,
    "payerPhoneSnapshot" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "receivable_titles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "receivable_titles_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "receivable_batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "receivable_titles_payerPartyId_fkey" FOREIGN KEY ("payerPartyId") REFERENCES "parties" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "receivable_installments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "sourceInstallmentKey" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "openAmount" REAL NOT NULL,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "settlementMethod" TEXT,
    "settledAt" DATETIME,
    "descriptionSnapshot" TEXT NOT NULL,
    "payerNameSnapshot" TEXT NOT NULL,
    "payerDocumentSnapshot" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "receivable_installments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "receivable_installments_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "receivable_batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "receivable_installments_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "receivable_titles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "cashierUserId" TEXT NOT NULL,
    "cashierDisplayName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openingAmount" REAL NOT NULL DEFAULT 0,
    "totalReceivedAmount" REAL NOT NULL DEFAULT 0,
    "expectedClosingAmount" REAL NOT NULL DEFAULT 0,
    "declaredClosingAmount" REAL,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "cash_sessions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "amount" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "cash_movements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cash_movements_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "installment_settlements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "receivedAmount" REAL NOT NULL,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "interestAmount" REAL NOT NULL DEFAULT 0,
    "penaltyAmount" REAL NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL,
    "settledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedBy" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "installment_settlements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "installment_settlements_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "receivable_installments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "installment_settlements_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "companies_name_idx" ON "companies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "companies_sourceSystem_sourceTenantId_key" ON "companies"("sourceSystem", "sourceTenantId");

-- CreateIndex
CREATE INDEX "parties_companyId_name_idx" ON "parties"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "parties_companyId_externalEntityType_externalEntityId_key" ON "parties"("companyId", "externalEntityType", "externalEntityId");

-- CreateIndex
CREATE INDEX "receivable_batches_companyId_createdAt_idx" ON "receivable_batches"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "receivable_batches_sourceSystem_sourceTenantId_idx" ON "receivable_batches"("sourceSystem", "sourceTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_batches_companyId_sourceBatchId_key" ON "receivable_batches"("companyId", "sourceBatchId");

-- CreateIndex
CREATE INDEX "receivable_titles_companyId_sourceEntityType_sourceEntityId_idx" ON "receivable_titles"("companyId", "sourceEntityType", "sourceEntityId");

-- CreateIndex
CREATE INDEX "receivable_titles_batchId_idx" ON "receivable_titles"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_titles_companyId_businessKey_key" ON "receivable_titles"("companyId", "businessKey");

-- CreateIndex
CREATE INDEX "receivable_installments_companyId_status_dueDate_idx" ON "receivable_installments"("companyId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "receivable_installments_titleId_idx" ON "receivable_installments"("titleId");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_installments_companyId_sourceInstallmentKey_key" ON "receivable_installments"("companyId", "sourceInstallmentKey");

-- CreateIndex
CREATE INDEX "cash_sessions_companyId_cashierUserId_status_idx" ON "cash_sessions"("companyId", "cashierUserId", "status");

-- CreateIndex
CREATE INDEX "cash_sessions_companyId_openedAt_idx" ON "cash_sessions"("companyId", "openedAt");

-- CreateIndex
CREATE INDEX "cash_movements_companyId_occurredAt_idx" ON "cash_movements"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "cash_movements_cashSessionId_idx" ON "cash_movements"("cashSessionId");

-- CreateIndex
CREATE INDEX "installment_settlements_companyId_settledAt_idx" ON "installment_settlements"("companyId", "settledAt");

-- CreateIndex
CREATE INDEX "installment_settlements_installmentId_idx" ON "installment_settlements"("installmentId");

-- CreateIndex
CREATE INDEX "installment_settlements_cashSessionId_idx" ON "installment_settlements"("cashSessionId");

