-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_companies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "interestRate" REAL,
    "interestGracePeriod" INTEGER,
    "penaltyRate" REAL,
    "penaltyValue" REAL,
    "penaltyGracePeriod" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT
);
INSERT INTO "new_companies" ("canceledAt", "canceledBy", "createdAt", "createdBy", "document", "id", "name", "sourceSystem", "sourceTenantId", "status", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "createdAt", "createdBy", "document", "id", "name", "sourceSystem", "sourceTenantId", "status", "updatedAt", "updatedBy" FROM "companies";
DROP TABLE "companies";
ALTER TABLE "new_companies" RENAME TO "companies";
CREATE UNIQUE INDEX "companies_sourceSystem_sourceTenantId_key" ON "companies"("sourceSystem", "sourceTenantId");
CREATE INDEX "companies_name_idx" ON "companies"("name");

CREATE TABLE "new_receivable_installments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "bankAccountLabel" TEXT,
    "bankAssignedAt" DATETIME,
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
    "bankSlipIssuedAt" DATETIME,
    "bankSlipIssuedBy" TEXT,
    "sourceInstallmentKey" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "openAmount" REAL NOT NULL,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "interestRate" REAL,
    "interestGracePeriod" INTEGER,
    "penaltyRate" REAL,
    "penaltyValue" REAL,
    "penaltyGracePeriod" INTEGER,
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
INSERT INTO "new_receivable_installments" ("amount", "bankAccountId", "bankAccountLabel", "bankAssignedAt", "bankAssignedBy", "bankSlipBarcode", "bankSlipDigitableLine", "bankSlipIssuedAt", "bankSlipIssuedBy", "bankSlipMessage", "bankSlipOurNumber", "bankSlipPayloadJson", "bankSlipPdfBase64", "bankSlipProvider", "bankSlipQrCode", "bankSlipResponseJson", "bankSlipStatus", "bankSlipYourNumber", "batchId", "canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "descriptionSnapshot", "dueDate", "id", "installmentCount", "installmentNumber", "openAmount", "paidAmount", "payerDocumentSnapshot", "payerNameSnapshot", "settledAt", "settlementMethod", "sourceInstallmentKey", "status", "titleId", "updatedAt", "updatedBy") SELECT "amount", "bankAccountId", "bankAccountLabel", "bankAssignedAt", "bankAssignedBy", "bankSlipBarcode", "bankSlipDigitableLine", "bankSlipIssuedAt", "bankSlipIssuedBy", "bankSlipMessage", "bankSlipOurNumber", "bankSlipPayloadJson", "bankSlipPdfBase64", "bankSlipProvider", "bankSlipQrCode", "bankSlipResponseJson", "bankSlipStatus", "bankSlipYourNumber", "batchId", "canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "descriptionSnapshot", "dueDate", "id", "installmentCount", "installmentNumber", "openAmount", "paidAmount", "payerDocumentSnapshot", "payerNameSnapshot", "settledAt", "settlementMethod", "sourceInstallmentKey", "status", "titleId", "updatedAt", "updatedBy" FROM "receivable_installments";
DROP TABLE "receivable_installments";
ALTER TABLE "new_receivable_installments" RENAME TO "receivable_installments";
CREATE UNIQUE INDEX "receivable_installments_companyId_sourceInstallmentKey_key" ON "receivable_installments"("companyId", "sourceInstallmentKey");
CREATE INDEX "receivable_installments_companyId_status_dueDate_idx" ON "receivable_installments"("companyId", "status", "dueDate");
CREATE INDEX "receivable_installments_companyId_bankAccountId_status_idx" ON "receivable_installments"("companyId", "bankAccountId", "status");
CREATE INDEX "receivable_installments_titleId_idx" ON "receivable_installments"("titleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
