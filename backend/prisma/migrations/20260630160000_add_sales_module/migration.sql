PRAGMA foreign_keys=OFF;

CREATE TABLE "new_stock_movements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "productId" TEXT NOT NULL,
    "sourceImportId" TEXT,
    "sourceImportItemId" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'PAYABLE_IMPORT',
    "sourceId" TEXT,
    "sourceItemId" TEXT,
    "movementType" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 0,
    "previousStock" REAL NOT NULL DEFAULT 0,
    "resultingStock" REAL NOT NULL DEFAULT 0,
    "unitCost" REAL,
    "notes" TEXT,
    "occurredAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "stock_movements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_movements_sourceImportId_fkey" FOREIGN KEY ("sourceImportId") REFERENCES "payable_invoice_imports" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_movements_sourceImportItemId_fkey" FOREIGN KEY ("sourceImportItemId") REFERENCES "payable_invoice_import_items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_stock_movements" (
    "id",
    "companyId",
    "branchCode",
    "productId",
    "sourceImportId",
    "sourceImportItemId",
    "sourceType",
    "sourceId",
    "sourceItemId",
    "movementType",
    "quantity",
    "previousStock",
    "resultingStock",
    "unitCost",
    "notes",
    "occurredAt",
    "createdAt",
    "createdBy",
    "updatedAt",
    "updatedBy",
    "canceledAt",
    "canceledBy"
)
SELECT
    "id",
    "companyId",
    "branchCode",
    "productId",
    "sourceImportId",
    "sourceImportItemId",
    'PAYABLE_IMPORT',
    "sourceImportId",
    "sourceImportItemId",
    "movementType",
    "quantity",
    "previousStock",
    "resultingStock",
    "unitCost",
    "notes",
    "occurredAt",
    "createdAt",
    "createdBy",
    "updatedAt",
    "updatedBy",
    "canceledAt",
    "canceledBy"
FROM "stock_movements";

DROP TABLE "stock_movements";
ALTER TABLE "new_stock_movements" RENAME TO "stock_movements";

CREATE INDEX "stock_movements_companyId_occurredAt_idx" ON "stock_movements"("companyId", "occurredAt");
CREATE INDEX "stock_movements_productId_occurredAt_idx" ON "stock_movements"("productId", "occurredAt");
CREATE INDEX "stock_movements_sourceImportId_idx" ON "stock_movements"("sourceImportId");
CREATE INDEX "stock_movements_companyId_sourceType_sourceId_idx" ON "stock_movements"("companyId", "sourceType", "sourceId");

CREATE TABLE "sales" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "saleNumber" TEXT NOT NULL,
    "saleChannel" TEXT NOT NULL DEFAULT 'GENERAL',
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "customerPartyId" TEXT,
    "customerNameSnapshot" TEXT NOT NULL,
    "customerDocumentSnapshot" TEXT,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "sourceEntityName" TEXT,
    "subtotalAmount" REAL NOT NULL DEFAULT 0,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "receivableAmount" REAL NOT NULL DEFAULT 0,
    "paymentSummary" TEXT,
    "receivableBatchId" TEXT,
    "receivableTitleId" TEXT,
    "notes" TEXT,
    "confirmedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "sales_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sales_customerPartyId_fkey" FOREIGN KEY ("customerPartyId") REFERENCES "parties" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "sales_receivableTitleId_fkey" FOREIGN KEY ("receivableTitleId") REFERENCES "receivable_titles" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "sales_companyId_branchCode_saleNumber_key" ON "sales"("companyId", "branchCode", "saleNumber");
CREATE INDEX "sales_companyId_branchCode_status_confirmedAt_idx" ON "sales"("companyId", "branchCode", "status", "confirmedAt");
CREATE INDEX "sales_companyId_saleChannel_confirmedAt_idx" ON "sales"("companyId", "saleChannel", "confirmedAt");
CREATE INDEX "sales_companyId_customerPartyId_idx" ON "sales"("companyId", "customerPartyId");
CREATE INDEX "sales_receivableTitleId_idx" ON "sales"("receivableTitleId");

CREATE TABLE "sale_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productNameSnapshot" TEXT NOT NULL,
    "productCodeSnapshot" TEXT,
    "unitCodeSnapshot" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unitPrice" REAL NOT NULL,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "totalAmount" REAL NOT NULL,
    "tracksInventory" BOOLEAN NOT NULL DEFAULT false,
    "allowFraction" BOOLEAN NOT NULL DEFAULT false,
    "usesColorSize" BOOLEAN NOT NULL DEFAULT false,
    "usesLotControl" BOOLEAN NOT NULL DEFAULT false,
    "usesExpirationControl" BOOLEAN NOT NULL DEFAULT false,
    "allowsNegativeStock" BOOLEAN NOT NULL DEFAULT false,
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
    CONSTRAINT "sale_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "sale_items_saleId_lineNumber_key" ON "sale_items"("saleId", "lineNumber");
CREATE INDEX "sale_items_companyId_productId_createdAt_idx" ON "sale_items"("companyId", "productId", "createdAt");
CREATE INDEX "sale_items_saleId_idx" ON "sale_items"("saleId");

CREATE TABLE "sale_payments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "saleId" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "dueDate" DATETIME,
    "installmentCount" INTEGER,
    "cardInstallmentCount" INTEGER,
    "cashSessionId" TEXT,
    "bankAccountId" TEXT,
    "bankAccountLabel" TEXT,
    "receivableInstallmentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "sale_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "sale_payments_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "sale_payments_companyId_paymentMethod_createdAt_idx" ON "sale_payments"("companyId", "paymentMethod", "createdAt");
CREATE INDEX "sale_payments_saleId_idx" ON "sale_payments"("saleId");
CREATE INDEX "sale_payments_cashSessionId_idx" ON "sale_payments"("cashSessionId");

PRAGMA foreign_keys=ON;
