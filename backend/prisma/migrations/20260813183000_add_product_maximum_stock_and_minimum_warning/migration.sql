ALTER TABLE "company_branches"
ADD COLUMN "notifyMinimumStockOnMovement" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "products"
ADD COLUMN "maximumStock" REAL NOT NULL DEFAULT 0;
