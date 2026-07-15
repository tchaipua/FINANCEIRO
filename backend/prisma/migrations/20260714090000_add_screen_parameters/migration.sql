CREATE TABLE "screen_parameters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "parametersJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "screen_parameters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "screen_parameters_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "company_branches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "screen_parameters_companyId_branchId_screenId_key" ON "screen_parameters"("companyId", "branchId", "screenId");
CREATE INDEX "screen_parameters_companyId_branchId_screenId_canceledAt_idx" ON "screen_parameters"("companyId", "branchId", "screenId", "canceledAt");

INSERT INTO "screen_parameters" (
    "id",
    "companyId",
    "branchId",
    "screenId",
    "parametersJson",
    "createdAt",
    "createdBy",
    "updatedAt",
    "updatedBy"
)
SELECT
    lower(hex(randomblob(16))),
    "companyId",
    "id",
    'PRINCIPAL_FINANCEIRO_VENDAS',
    '{"allowSaleUnitPriceEdit":' || CASE WHEN "allowSaleUnitPriceEdit" THEN 'true' ELSE 'false' END || ',"allowSaleItemDiscount":' || CASE WHEN "allowSaleItemDiscount" THEN 'true' ELSE 'false' END || ',"groupSameProduct":true}',
    CURRENT_TIMESTAMP,
    'MIGRATION',
    CURRENT_TIMESTAMP,
    'MIGRATION'
FROM "company_branches"
WHERE "canceledAt" IS NULL;
