-- CreateTable
CREATE TABLE "supertef_payments" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "amount" REAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "printReceipt" BOOLEAN NOT NULL DEFAULT true,
    "paymentMessage" TEXT,
    "paymentOrderJson" TEXT,
    "paymentDataJson" TEXT,
    "terminalLockKey" TEXT,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPolledAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "supertef_payments_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "supertef_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "supertef_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "supertef_payments_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "supertef_terminals" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "supertef_payments_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "supertef_checkouts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "supertef_payments_terminalLockKey_key" ON "supertef_payments"("terminalLockKey");
CREATE UNIQUE INDEX "supertef_payments_companyId_branchCode_operationId_key" ON "supertef_payments"("companyId", "branchCode", "operationId");
CREATE UNIQUE INDEX "supertef_payments_configurationId_providerPaymentUniqueId_key" ON "supertef_payments"("configurationId", "providerPaymentUniqueId");
CREATE INDEX "supertef_payments_companyId_branchCode_status_requestedAt_idx" ON "supertef_payments"("companyId", "branchCode", "status", "requestedAt");
CREATE INDEX "supertef_payments_companyId_branchCode_terminalId_status_idx" ON "supertef_payments"("companyId", "branchCode", "terminalId", "status");
