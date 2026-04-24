-- CreateTable
CREATE TABLE "bank_return_imports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "bank_return_imports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bank_return_imports_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bank_return_import_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "matchedInstallmentId" TEXT,
    "appliedSettlementId" TEXT,
    "movementTypeCode" TEXT NOT NULL,
    "movementStatus" TEXT NOT NULL,
    "externalRequestCode" TEXT,
    "externalFileId" TEXT,
    "dueDate" DATETIME,
    "movementDate" DATETIME,
    "paymentDate" DATETIME,
    "expectedCreditDate" DATETIME,
    "ourNumber" TEXT,
    "yourNumber" TEXT,
    "barcode" TEXT,
    "contractNumber" TEXT,
    "amount" REAL NOT NULL DEFAULT 0,
    "settledAmount" REAL,
    "discountAmount" REAL,
    "interestAmount" REAL,
    "feeAmount" REAL,
    "rawPayloadJson" TEXT NOT NULL,
    "appliedAt" DATETIME,
    "appliedBy" TEXT,
    "appliedStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "bank_return_import_items_importId_fkey" FOREIGN KEY ("importId") REFERENCES "bank_return_imports" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bank_return_import_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bank_return_import_items_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bank_return_import_items_matchedInstallmentId_fkey" FOREIGN KEY ("matchedInstallmentId") REFERENCES "receivable_installments" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "bank_return_import_items_appliedSettlementId_fkey" FOREIGN KEY ("appliedSettlementId") REFERENCES "installment_settlements" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "bank_return_imports_companyId_createdAt_idx" ON "bank_return_imports"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "bank_return_imports_bankAccountId_createdAt_idx" ON "bank_return_imports"("bankAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "bank_return_import_items_importId_movementStatus_idx" ON "bank_return_import_items"("importId", "movementStatus");

-- CreateIndex
CREATE INDEX "bank_return_import_items_companyId_bankAccountId_movementStatus_idx" ON "bank_return_import_items"("companyId", "bankAccountId", "movementStatus");

-- CreateIndex
CREATE INDEX "bank_return_import_items_matchedInstallmentId_idx" ON "bank_return_import_items"("matchedInstallmentId");
