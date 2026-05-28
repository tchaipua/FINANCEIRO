-- CreateTable
CREATE TABLE "bank_statement_imports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "bankAccountId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "pulledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedMovementCount" INTEGER NOT NULL DEFAULT 0,
    "createdMovementCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateMovementCount" INTEGER NOT NULL DEFAULT 0,
    "creditAmount" REAL NOT NULL DEFAULT 0,
    "debitAmount" REAL NOT NULL DEFAULT 0,
    "currentBalance" REAL,
    "status" TEXT NOT NULL DEFAULT 'IMPORTED',
    "requestSnapshotJson" TEXT,
    "summaryJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "bank_statement_imports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bank_statement_imports_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bank_statement_movements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "bankAccountId" TEXT NOT NULL,
    "firstImportId" TEXT NOT NULL,
    "lastImportId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "documentNumber" TEXT,
    "movementType" TEXT NOT NULL,
    "amount" REAL NOT NULL DEFAULT 0,
    "balanceAfter" REAL,
    "reconciliationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "rawPayloadJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "bank_statement_movements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bank_statement_movements_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bank_statement_movements_firstImportId_fkey" FOREIGN KEY ("firstImportId") REFERENCES "bank_statement_imports" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bank_statement_movements_lastImportId_fkey" FOREIGN KEY ("lastImportId") REFERENCES "bank_statement_imports" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "bank_statement_imports_companyId_createdAt_idx" ON "bank_statement_imports"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "bank_statement_imports_bankAccountId_pulledAt_idx" ON "bank_statement_imports"("bankAccountId", "pulledAt");

-- CreateIndex
CREATE INDEX "bank_statement_imports_companyId_bankAccountId_periodStart_periodEnd_idx" ON "bank_statement_imports"("companyId", "bankAccountId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_movements_companyId_bankAccountId_externalId_key" ON "bank_statement_movements"("companyId", "bankAccountId", "externalId");

-- CreateIndex
CREATE INDEX "bank_statement_movements_companyId_bankAccountId_occurredAt_idx" ON "bank_statement_movements"("companyId", "bankAccountId", "occurredAt");

-- CreateIndex
CREATE INDEX "bank_statement_movements_companyId_bankAccountId_reconciliationStatus_idx" ON "bank_statement_movements"("companyId", "bankAccountId", "reconciliationStatus");

-- CreateIndex
CREATE INDEX "bank_statement_movements_firstImportId_idx" ON "bank_statement_movements"("firstImportId");

-- CreateIndex
CREATE INDEX "bank_statement_movements_lastImportId_idx" ON "bank_statement_movements"("lastImportId");
