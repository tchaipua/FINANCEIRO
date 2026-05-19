-- CreateTable
CREATE TABLE "product_stock_balances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 0,
    "productId" TEXT NOT NULL,
    "variantKey" TEXT NOT NULL DEFAULT 'GERAL',
    "colorCode" TEXT,
    "colorName" TEXT,
    "sizeCode" TEXT,
    "lotNumber" TEXT,
    "lotExpirationDate" DATETIME,
    "quantity" REAL NOT NULL DEFAULT 0,
    "reservedQuantity" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "product_stock_balances_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "product_stock_balances_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_company_branches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "inventoryControlType" TEXT NOT NULL DEFAULT 'TRADITIONAL',
    "quantityPrecision" TEXT NOT NULL DEFAULT 'INTEGER_ONLY',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "company_branches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_company_branches" ("branchCode", "canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "id", "isActive", "isDefault", "name", "updatedAt", "updatedBy") SELECT "branchCode", "canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "id", "isActive", "isDefault", "name", "updatedAt", "updatedBy" FROM "company_branches";
DROP TABLE "company_branches";
ALTER TABLE "new_company_branches" RENAME TO "company_branches";
CREATE INDEX "company_branches_companyId_isActive_name_idx" ON "company_branches"("companyId", "isActive", "name");
CREATE UNIQUE INDEX "company_branches_companyId_branchCode_key" ON "company_branches"("companyId", "branchCode");
CREATE TABLE "new_products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "name" TEXT NOT NULL,
    "internalCode" TEXT,
    "sku" TEXT,
    "barcode" TEXT,
    "unitCode" TEXT NOT NULL DEFAULT 'UN',
    "productType" TEXT NOT NULL DEFAULT 'GOODS',
    "tracksInventory" BOOLEAN NOT NULL DEFAULT true,
    "allowFraction" BOOLEAN NOT NULL DEFAULT false,
    "usesColorSize" BOOLEAN NOT NULL DEFAULT false,
    "usesLotControl" BOOLEAN NOT NULL DEFAULT false,
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
INSERT INTO "new_products" ("allowFraction", "barcode", "branchCode", "canceledAt", "canceledBy", "cestCode", "companyId", "createdAt", "createdBy", "currentStock", "id", "internalCode", "minimumStock", "name", "ncmCode", "notes", "productType", "purchasePrice", "salePrice", "sku", "status", "tracksInventory", "unitCode", "updatedAt", "updatedBy") SELECT "allowFraction", "barcode", "branchCode", "canceledAt", "canceledBy", "cestCode", "companyId", "createdAt", "createdBy", "currentStock", "id", "internalCode", "minimumStock", "name", "ncmCode", "notes", "productType", "purchasePrice", "salePrice", "sku", "status", "tracksInventory", "unitCode", "updatedAt", "updatedBy" FROM "products";
DROP TABLE "products";
ALTER TABLE "new_products" RENAME TO "products";
CREATE INDEX "products_companyId_status_name_idx" ON "products"("companyId", "status", "name");
CREATE INDEX "products_companyId_productType_tracksInventory_idx" ON "products"("companyId", "productType", "tracksInventory");
CREATE UNIQUE INDEX "products_companyId_branchCode_internalCode_key" ON "products"("companyId", "branchCode", "internalCode");
CREATE UNIQUE INDEX "products_companyId_branchCode_sku_key" ON "products"("companyId", "branchCode", "sku");
CREATE UNIQUE INDEX "products_companyId_branchCode_barcode_key" ON "products"("companyId", "branchCode", "barcode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "product_stock_balances_companyId_branchCode_productId_idx" ON "product_stock_balances"("companyId", "branchCode", "productId");

-- CreateIndex
CREATE INDEX "product_stock_balances_companyId_productId_lotNumber_idx" ON "product_stock_balances"("companyId", "productId", "lotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "product_stock_balances_companyId_productId_branchCode_variantKey_key" ON "product_stock_balances"("companyId", "productId", "branchCode", "variantKey");

