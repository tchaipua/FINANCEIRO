CREATE TABLE "receivable_pix_intents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "settlementGroupId" TEXT NOT NULL,
    "installmentIdsJson" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "bankAccountId" TEXT NOT NULL,
    "bankAccountLabel" TEXT NOT NULL,
    "txid" TEXT NOT NULL,
    "pixCopyPaste" TEXT,
    "providerPayloadJson" TEXT,
    "providerResponseJson" TEXT,
    "paidAt" DATETIME,
    "appliedAt" DATETIME,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "receivable_pix_intents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "receivable_pix_intents_companyId_branchCode_operationId_key" ON "receivable_pix_intents"("companyId", "branchCode", "operationId");
CREATE UNIQUE INDEX "receivable_pix_intents_companyId_txid_key" ON "receivable_pix_intents"("companyId", "txid");
CREATE UNIQUE INDEX "receivable_pix_intents_companyId_settlementGroupId_key" ON "receivable_pix_intents"("companyId", "settlementGroupId");
CREATE INDEX "receivable_pix_intents_companyId_branchCode_status_createdAt_idx" ON "receivable_pix_intents"("companyId", "branchCode", "status", "createdAt");

ALTER TABLE "installment_settlements" ADD COLUMN "receivablePixIntentId" TEXT REFERENCES "receivable_pix_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "installment_settlements_receivablePixIntentId_idx" ON "installment_settlements"("receivablePixIntentId");
