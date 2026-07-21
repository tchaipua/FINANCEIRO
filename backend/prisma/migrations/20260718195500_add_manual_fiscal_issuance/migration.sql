-- Permite que a NF-e manual exista sem criar uma venda artificial e
-- persiste o plano opcional de Contas a Receber das emissões manuais.
ALTER TABLE "nfse_documents" ADD COLUMN "receivablePlanJson" TEXT;

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_fiscal_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "saleId" TEXT,
    "receivableTitleId" TEXT,
    "sourceSystem" TEXT,
    "sourceTenantId" TEXT,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "idempotencyKey" TEXT,
    "receivablePlanJson" TEXT,
    "profileId" TEXT,
    "nfeProfileId" TEXT,
    "operationNatureId" TEXT,
    "recipientPartyId" TEXT,
    "certificateId" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '65',
    "environment" TEXT NOT NULL,
    "series" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "randomCode" TEXT,
    "accessKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "statusCode" TEXT,
    "statusMessage" TEXT,
    "protocol" TEXT,
    "receivedAt" DATETIME,
    "issuedAt" DATETIME NOT NULL,
    "qrCodeUrl" TEXT,
    "operationNatureSnapshot" TEXT,
    "issuerSnapshotJson" TEXT,
    "recipientSnapshotJson" TEXT,
    "totalsSnapshotJson" TEXT,
    "paymentSnapshotJson" TEXT,
    "schemaVersion" TEXT,
    "danfeFileName" TEXT,
    "danfePdfBlob" BLOB,
    "danfeGeneratedAt" DATETIME,
    "signedXml" TEXT,
    "responseXml" TEXT,
    "processedXml" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "fiscal_documents_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fiscal_documents_saleId_fkey"
      FOREIGN KEY ("saleId") REFERENCES "sales" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fiscal_documents_receivableTitleId_fkey"
      FOREIGN KEY ("receivableTitleId") REFERENCES "receivable_titles" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "fiscal_documents_profileId_fkey"
      FOREIGN KEY ("profileId") REFERENCES "nfce_profiles" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fiscal_documents_nfeProfileId_fkey"
      FOREIGN KEY ("nfeProfileId") REFERENCES "nfe_profiles" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fiscal_documents_operationNatureId_fkey"
      FOREIGN KEY ("operationNatureId") REFERENCES "fiscal_operation_natures" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fiscal_documents_recipientPartyId_fkey"
      FOREIGN KEY ("recipientPartyId") REFERENCES "parties" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "fiscal_documents_certificateId_fkey"
      FOREIGN KEY ("certificateId") REFERENCES "fiscal_certificates" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_fiscal_documents" (
    "accessKey", "attemptCount", "branchCode", "canceledAt", "canceledBy",
    "certificateId", "companyId", "createdAt", "createdBy", "danfeFileName",
    "danfeGeneratedAt", "danfePdfBlob", "environment", "id", "issuedAt",
    "issuerSnapshotJson", "lastAttemptAt", "lastError", "model", "nfeProfileId",
    "number", "operationNatureId", "operationNatureSnapshot",
    "paymentSnapshotJson", "processedXml", "profileId", "protocol", "qrCodeUrl",
    "randomCode", "receivedAt", "recipientPartyId", "recipientSnapshotJson",
    "responseXml", "saleId", "schemaVersion", "series", "signedXml", "status",
    "statusCode", "statusMessage", "totalsSnapshotJson", "updatedAt", "updatedBy",
    "sourceSystem", "sourceTenantId", "sourceEntityType", "sourceEntityId"
)
SELECT
    FD."accessKey", FD."attemptCount", FD."branchCode", FD."canceledAt",
    FD."canceledBy", FD."certificateId", FD."companyId", FD."createdAt",
    FD."createdBy", FD."danfeFileName", FD."danfeGeneratedAt", FD."danfePdfBlob",
    FD."environment", FD."id", FD."issuedAt", FD."issuerSnapshotJson",
    FD."lastAttemptAt", FD."lastError", FD."model", FD."nfeProfileId",
    FD."number", FD."operationNatureId", FD."operationNatureSnapshot",
    FD."paymentSnapshotJson", FD."processedXml", FD."profileId", FD."protocol",
    FD."qrCodeUrl", FD."randomCode", FD."receivedAt", FD."recipientPartyId",
    FD."recipientSnapshotJson", FD."responseXml", FD."saleId", FD."schemaVersion",
    FD."series", FD."signedXml", FD."status", FD."statusCode", FD."statusMessage",
    FD."totalsSnapshotJson", FD."updatedAt", FD."updatedBy",
    S."sourceSystem", S."sourceTenantId",
    CASE WHEN FD."saleId" IS NOT NULL THEN 'SALE' ELSE NULL END,
    FD."saleId"
FROM "fiscal_documents" FD
LEFT JOIN "sales" S ON S."id" = FD."saleId";

DROP TABLE "fiscal_documents";
ALTER TABLE "new_fiscal_documents" RENAME TO "fiscal_documents";

CREATE UNIQUE INDEX "fiscal_documents_saleId_key"
  ON "fiscal_documents"("saleId");
CREATE UNIQUE INDEX "fiscal_documents_accessKey_key"
  ON "fiscal_documents"("accessKey");
CREATE INDEX "fiscal_documents_companyId_branchCode_status_issuedAt_idx"
  ON "fiscal_documents"("companyId", "branchCode", "status", "issuedAt");
CREATE INDEX "fiscal_documents_companyId_branchCode_sourceEntityType_sourceEntityId_idx"
  ON "fiscal_documents"("companyId", "branchCode", "sourceEntityType", "sourceEntityId");
CREATE INDEX "fiscal_documents_receivableTitleId_idx"
  ON "fiscal_documents"("receivableTitleId");
CREATE UNIQUE INDEX "fiscal_documents_companyId_branchCode_model_series_number_key"
  ON "fiscal_documents"("companyId", "branchCode", "model", "series", "number");
CREATE UNIQUE INDEX "fiscal_documents_companyId_branchCode_idempotencyKey_key"
  ON "fiscal_documents"("companyId", "branchCode", "idempotencyKey");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
