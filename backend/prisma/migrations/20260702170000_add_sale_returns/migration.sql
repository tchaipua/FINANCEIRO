CREATE TABLE "sale_returns" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "branchCode" INTEGER NOT NULL DEFAULT 1,
  "saleId" TEXT NOT NULL,
  "returnNumber" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "customerPartyId" TEXT,
  "customerNameSnapshot" TEXT NOT NULL,
  "customerDocumentSnapshot" TEXT,
  "totalAmount" REAL NOT NULL DEFAULT 0,
  "creditId" TEXT,
  "reason" TEXT NOT NULL,
  "confirmedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  "updatedAt" DATETIME NOT NULL,
  "updatedBy" TEXT,
  "canceledAt" DATETIME,
  "canceledBy" TEXT,
  CONSTRAINT "sale_returns_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sale_returns_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sale_returns_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "customer_credits" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "sale_return_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "branchCode" INTEGER NOT NULL DEFAULT 1,
  "returnId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "saleItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "productNameSnapshot" TEXT NOT NULL,
  "productCodeSnapshot" TEXT,
  "unitCodeSnapshot" TEXT NOT NULL,
  "quantity" REAL NOT NULL,
  "unitPrice" REAL NOT NULL,
  "totalAmount" REAL NOT NULL,
  "tracksInventory" BOOLEAN NOT NULL DEFAULT false,
  "variantKey" TEXT NOT NULL DEFAULT 'GERAL',
  "colorCode" TEXT,
  "colorName" TEXT,
  "sizeCode" TEXT,
  "lotNumber" TEXT,
  "lotExpirationDate" DATETIME,
  "previousStock" REAL,
  "resultingStock" REAL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  "updatedAt" DATETIME NOT NULL,
  "updatedBy" TEXT,
  "canceledAt" DATETIME,
  "canceledBy" TEXT,
  CONSTRAINT "sale_return_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sale_return_items_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "sale_returns" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sale_return_items_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "sale_items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sale_return_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "sale_returns_companyId_branchCode_returnNumber_key" ON "sale_returns" ("companyId", "branchCode", "returnNumber");
CREATE INDEX "sale_returns_companyId_saleId_confirmedAt_idx" ON "sale_returns" ("companyId", "saleId", "confirmedAt");
CREATE INDEX "sale_returns_companyId_customerPartyId_idx" ON "sale_returns" ("companyId", "customerPartyId");
CREATE INDEX "sale_returns_creditId_idx" ON "sale_returns" ("creditId");
CREATE INDEX "sale_return_items_companyId_productId_createdAt_idx" ON "sale_return_items" ("companyId", "productId", "createdAt");
CREATE INDEX "sale_return_items_returnId_idx" ON "sale_return_items" ("returnId");
CREATE INDEX "sale_return_items_saleItemId_idx" ON "sale_return_items" ("saleItemId");
