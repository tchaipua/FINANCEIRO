ALTER TABLE "sale_items"
  ADD COLUMN "inventoryDisposition" TEXT NOT NULL DEFAULT 'IMMEDIATE',
  ADD COLUMN "reservedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "consumedQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE "sale_stock_consumptions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "saleId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "sourceUsageId" TEXT NOT NULL,
    "notes" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "sale_stock_consumptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_stock_consumption_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "consumptionId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "previousStock" DOUBLE PRECISION NOT NULL,
    "resultingStock" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "sale_stock_consumption_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sale_stock_consumptions_companyId_sourceSystem_sourceTenantId_sourceUsageId_key" ON "sale_stock_consumptions"("companyId", "sourceSystem", "sourceTenantId", "sourceUsageId");
CREATE INDEX "sale_stock_consumptions_companyId_branchCode_saleId_occurredAt_idx" ON "sale_stock_consumptions"("companyId", "branchCode", "saleId", "occurredAt");
CREATE INDEX "sale_stock_consumption_items_companyId_branchCode_productId_createdAt_idx" ON "sale_stock_consumption_items"("companyId", "branchCode", "productId", "createdAt");
CREATE INDEX "sale_stock_consumption_items_consumptionId_idx" ON "sale_stock_consumption_items"("consumptionId");
CREATE INDEX "sale_stock_consumption_items_saleItemId_idx" ON "sale_stock_consumption_items"("saleItemId");

ALTER TABLE "sale_stock_consumptions" ADD CONSTRAINT "sale_stock_consumptions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_stock_consumptions" ADD CONSTRAINT "sale_stock_consumptions_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_stock_consumption_items" ADD CONSTRAINT "sale_stock_consumption_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_stock_consumption_items" ADD CONSTRAINT "sale_stock_consumption_items_consumptionId_fkey" FOREIGN KEY ("consumptionId") REFERENCES "sale_stock_consumptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_stock_consumption_items" ADD CONSTRAINT "sale_stock_consumption_items_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_stock_consumption_items" ADD CONSTRAINT "sale_stock_consumption_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
