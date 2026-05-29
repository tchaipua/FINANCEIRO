ALTER TABLE "company_branches" ADD COLUMN "stockControlMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT';
ALTER TABLE "company_branches" ADD COLUMN "stockIntegerQuantityMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT';
ALTER TABLE "company_branches" ADD COLUMN "stockLotControlMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT';
ALTER TABLE "company_branches" ADD COLUMN "stockExpirationControlMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT';
ALTER TABLE "company_branches" ADD COLUMN "stockGridControlMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT';
ALTER TABLE "company_branches" ADD COLUMN "stockNegativeControlMode" TEXT NOT NULL DEFAULT 'BY_PRODUCT';

UPDATE "company_branches"
SET
  "stockIntegerQuantityMode" = CASE
    WHEN "quantityPrecision" = 'DECIMAL_ALLOWED' THEN 'NO'
    WHEN "quantityPrecision" = 'PRODUCT_DEFINED' THEN 'BY_PRODUCT'
    ELSE 'YES'
  END,
  "stockLotControlMode" = CASE
    WHEN "inventoryControlType" = 'LOT' THEN 'BY_PRODUCT'
    ELSE 'NO'
  END,
  "stockExpirationControlMode" = CASE
    WHEN "inventoryControlType" = 'LOT' THEN 'BY_PRODUCT'
    ELSE 'NO'
  END,
  "stockGridControlMode" = CASE
    WHEN "inventoryControlType" = 'COLOR_SIZE' THEN 'BY_PRODUCT'
    ELSE 'NO'
  END,
  "stockNegativeControlMode" = 'NO';

ALTER TABLE "products" ADD COLUMN "usesExpirationControl" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "products" ADD COLUMN "allowsNegativeStock" BOOLEAN NOT NULL DEFAULT false;
