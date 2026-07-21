-- Descrições reutilizáveis do mesmo serviço fiscal NFS-e.
CREATE TABLE "nfse_service_descriptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "serviceItemId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "nfse_service_descriptions_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "nfse_service_descriptions_serviceItemId_fkey"
      FOREIGN KEY ("serviceItemId") REFERENCES "nfse_service_items" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "nfse_service_descriptions" (
    "id",
    "companyId",
    "branchCode",
    "serviceItemId",
    "status",
    "text",
    "sortOrder",
    "createdAt",
    "createdBy",
    "updatedAt",
    "updatedBy"
)
SELECT
    lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(2))) || '-' ||
    lower(hex(randomblob(6))),
    "companyId",
    "branchCode",
    "id",
    'ACTIVE',
    "description",
    0,
    COALESCE("createdAt", CURRENT_TIMESTAMP),
    "createdBy",
    COALESCE("updatedAt", CURRENT_TIMESTAMP),
    "updatedBy"
FROM "nfse_service_items"
WHERE "canceledAt" IS NULL
  AND trim("description") <> '';

CREATE UNIQUE INDEX "nfse_service_descriptions_serviceItemId_text_key"
ON "nfse_service_descriptions"("serviceItemId", "text");

CREATE INDEX "nfse_service_descriptions_companyId_branchCode_serviceItemId_status_sortOrder_idx"
ON "nfse_service_descriptions"(
    "companyId",
    "branchCode",
    "serviceItemId",
    "status",
    "sortOrder"
);
