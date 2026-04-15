-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
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
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "bank_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "bank_accounts_companyId_status_bankName_idx" ON "bank_accounts"("companyId", "status", "bankName");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_companyId_bankCode_branchNumber_branchDigit_accountNumber_accountDigit_key" ON "bank_accounts"("companyId", "bankCode", "branchNumber", "branchDigit", "accountNumber", "accountDigit");
