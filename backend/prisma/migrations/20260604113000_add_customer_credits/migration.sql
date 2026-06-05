CREATE TABLE "customer_credits" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "branchCode" INTEGER NOT NULL DEFAULT 1,
  "partyId" TEXT,
  "customerName" TEXT NOT NULL,
  "customerDocument" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "originalAmount" REAL NOT NULL,
  "availableAmount" REAL NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
  "sourceReference" TEXT,
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  "updatedAt" DATETIME NOT NULL,
  "updatedBy" TEXT,
  "canceledAt" DATETIME,
  "canceledBy" TEXT,
  CONSTRAINT "customer_credits_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "customer_credit_movements" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "branchCode" INTEGER NOT NULL DEFAULT 1,
  "creditId" TEXT NOT NULL,
  "cashSessionId" TEXT,
  "movementType" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "notes" TEXT,
  "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  "updatedAt" DATETIME NOT NULL,
  "updatedBy" TEXT,
  "canceledAt" DATETIME,
  "canceledBy" TEXT,
  CONSTRAINT "customer_credit_movements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_credit_movements_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "customer_credits" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "customer_credits_companyId_status_customerName_idx" ON "customer_credits"("companyId", "status", "customerName");
CREATE INDEX "customer_credits_companyId_customerDocument_idx" ON "customer_credits"("companyId", "customerDocument");
CREATE INDEX "customer_credit_movements_companyId_movementType_occurredAt_idx" ON "customer_credit_movements"("companyId", "movementType", "occurredAt");
CREATE INDEX "customer_credit_movements_creditId_occurredAt_idx" ON "customer_credit_movements"("creditId", "occurredAt");
CREATE INDEX "customer_credit_movements_cashSessionId_idx" ON "customer_credit_movements"("cashSessionId");
