ALTER TABLE "bank_statement_movements" ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'NOT_REVIEWED';
ALTER TABLE "bank_statement_movements" ADD COLUMN "reviewedAt" DATETIME;
ALTER TABLE "bank_statement_movements" ADD COLUMN "reviewedBy" TEXT;
CREATE INDEX "bank_statement_movements_companyId_bankAccountId_reviewStatus_idx" ON "bank_statement_movements"("companyId", "bankAccountId", "reviewStatus");
