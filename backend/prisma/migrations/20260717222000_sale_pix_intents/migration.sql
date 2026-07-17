CREATE TABLE "sale_pix_intents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "bankAccountId" TEXT,
    "bankAccountLabel" TEXT,
    "txid" TEXT NOT NULL,
    "pixCopyPaste" TEXT,
    "providerPayloadJson" TEXT,
    "providerResponseJson" TEXT,
    "paidAt" DATETIME,
    "appliedSaleId" TEXT,
    "appliedAt" DATETIME,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "sale_pix_intents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "sale_pix_intents_companyId_branchCode_operationId_key" ON "sale_pix_intents"("companyId", "branchCode", "operationId");
CREATE UNIQUE INDEX "sale_pix_intents_companyId_txid_key" ON "sale_pix_intents"("companyId", "txid");
CREATE UNIQUE INDEX "sale_pix_intents_appliedSaleId_key" ON "sale_pix_intents"("appliedSaleId");
CREATE INDEX "sale_pix_intents_companyId_branchCode_status_createdAt_idx" ON "sale_pix_intents"("companyId", "branchCode", "status", "createdAt");
