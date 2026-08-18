ALTER TABLE "cash_sessions" ADD COLUMN "closeReason" TEXT;
ALTER TABLE "cash_sessions" ADD COLUMN "closedBy" TEXT;

CREATE TABLE "cash_operator_policies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "cashierUserId" TEXT NOT NULL,
    "cashierDisplayName" TEXT NOT NULL,
    "closingMode" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "cash_operator_policies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "cash_operator_policies_companyId_branchCode_cashierUserId_key" ON "cash_operator_policies"("companyId", "branchCode", "cashierUserId");
CREATE INDEX "cash_operator_policies_companyId_branchCode_closingMode_idx" ON "cash_operator_policies"("companyId", "branchCode", "closingMode");
