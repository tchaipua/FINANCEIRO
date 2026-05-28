ALTER TABLE "receivable_installments" ADD COLUMN "batchRemovedAt" DATETIME;
ALTER TABLE "receivable_installments" ADD COLUMN "batchRemovedBy" TEXT;
ALTER TABLE "receivable_installments" ADD COLUMN "batchRemovedReason" TEXT;

CREATE INDEX "receivable_installments_batchId_batchRemovedAt_idx"
ON "receivable_installments"("batchId", "batchRemovedAt");
