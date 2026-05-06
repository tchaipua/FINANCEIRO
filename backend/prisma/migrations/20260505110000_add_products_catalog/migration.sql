CREATE TABLE "products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "name" TEXT NOT NULL,
    "internalCode" TEXT,
    "sku" TEXT,
    "barcode" TEXT,
    "unitCode" TEXT NOT NULL DEFAULT 'UN',
    "productType" TEXT NOT NULL DEFAULT 'GOODS',
    "tracksInventory" BOOLEAN NOT NULL DEFAULT true,
    "allowFraction" BOOLEAN NOT NULL DEFAULT false,
    "currentStock" REAL NOT NULL DEFAULT 0,
    "minimumStock" REAL NOT NULL DEFAULT 0,
    "purchasePrice" REAL,
    "salePrice" REAL,
    "ncmCode" TEXT,
    "cestCode" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "products_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "products_companyId_internalCode_key" ON "products"("companyId", "internalCode");
CREATE UNIQUE INDEX "products_companyId_sku_key" ON "products"("companyId", "sku");
CREATE UNIQUE INDEX "products_companyId_barcode_key" ON "products"("companyId", "barcode");
CREATE INDEX "products_companyId_status_name_idx" ON "products"("companyId", "status", "name");
CREATE INDEX "products_companyId_productType_tracksInventory_idx" ON "products"("companyId", "productType", "tracksInventory");
