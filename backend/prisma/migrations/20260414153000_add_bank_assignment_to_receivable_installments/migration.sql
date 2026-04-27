ALTER TABLE "receivable_installments" ADD COLUMN "bankAccountId" TEXT;
ALTER TABLE "receivable_installments" ADD COLUMN "bankAccountLabel" TEXT;
ALTER TABLE "receivable_installments" ADD COLUMN "bankAssignedAt" DATETIME;
ALTER TABLE "receivable_installments" ADD COLUMN "bankAssignedBy" TEXT;

CREATE INDEX "receivable_installments_companyId_bankAccountId_status_idx"
ON "receivable_installments"("companyId", "bankAccountId", "status");
