ALTER TABLE "supertef_payments" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "supertef_payments" ADD COLUMN "businessReference" TEXT;
ALTER TABLE "supertef_payments" ADD COLUMN "appliedEntityType" TEXT;
ALTER TABLE "supertef_payments" ADD COLUMN "appliedEntityId" TEXT;
ALTER TABLE "supertef_payments" ADD COLUMN "appliedAt" DATETIME;

ALTER TABLE "sale_payments" ADD COLUMN "superTefPaymentId" TEXT;
ALTER TABLE "installment_settlements" ADD COLUMN "superTefPaymentId" TEXT;

CREATE UNIQUE INDEX "sale_payments_superTefPaymentId_key"
ON "sale_payments"("superTefPaymentId");

CREATE INDEX "installment_settlements_superTefPaymentId_idx"
ON "installment_settlements"("superTefPaymentId");

CREATE INDEX "supertef_payments_companyId_branchCode_purpose_businessReference_idx"
ON "supertef_payments"("companyId", "branchCode", "purpose", "businessReference");

CREATE INDEX "supertef_payments_companyId_branchCode_appliedEntityType_appliedEntityId_idx"
ON "supertef_payments"("companyId", "branchCode", "appliedEntityType", "appliedEntityId");
