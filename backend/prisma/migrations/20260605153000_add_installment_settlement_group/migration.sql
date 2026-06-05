-- Agrupa baixas manuais realizadas em lote para consulta e estorno conjunto.
ALTER TABLE "installment_settlements" ADD COLUMN "settlementGroupId" TEXT;

CREATE INDEX "installment_settlements_companyId_settlementGroupId_idx"
ON "installment_settlements"("companyId", "settlementGroupId");
