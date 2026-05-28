-- Create open bank movement grouping fields for manual PIX settlements.
ALTER TABLE "receivable_installments" ADD COLUMN "bankMovementGroupId" TEXT;
ALTER TABLE "receivable_installments" ADD COLUMN "bankMovementStatus" TEXT;
ALTER TABLE "receivable_installments" ADD COLUMN "bankMovementCreatedAt" DATETIME;
ALTER TABLE "receivable_installments" ADD COLUMN "bankMovementConvertedAt" DATETIME;
ALTER TABLE "receivable_installments" ADD COLUMN "bankMovementConvertedBy" TEXT;

ALTER TABLE "cash_movements" ADD COLUMN "bankAccountId" TEXT;
ALTER TABLE "cash_movements" ADD COLUMN "bankAccountLabel" TEXT;
ALTER TABLE "cash_movements" ADD COLUMN "bankMovementGroupId" TEXT;

ALTER TABLE "installment_settlements" ADD COLUMN "bankAccountId" TEXT;
ALTER TABLE "installment_settlements" ADD COLUMN "bankAccountLabel" TEXT;
ALTER TABLE "installment_settlements" ADD COLUMN "bankMovementGroupId" TEXT;

CREATE INDEX "receivable_installments_companyId_bankAccountId_bankMovementStatus_idx"
  ON "receivable_installments"("companyId", "bankAccountId", "bankMovementStatus");

CREATE INDEX "receivable_installments_companyId_bankMovementGroupId_idx"
  ON "receivable_installments"("companyId", "bankMovementGroupId");

CREATE INDEX "cash_movements_companyId_bankAccountId_bankMovementGroupId_idx"
  ON "cash_movements"("companyId", "bankAccountId", "bankMovementGroupId");

CREATE INDEX "installment_settlements_companyId_bankAccountId_bankMovementGroupId_idx"
  ON "installment_settlements"("companyId", "bankAccountId", "bankMovementGroupId");
