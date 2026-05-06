-- CreateTable
CREATE TABLE "fiscal_certificates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "certificateType" TEXT NOT NULL DEFAULT 'A1',
    "environment" TEXT NOT NULL DEFAULT 'PRODUCTION',
    "purpose" TEXT NOT NULL DEFAULT 'NFE_DFE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "aliasName" TEXT NOT NULL,
    "authorStateCode" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "holderDocument" TEXT NOT NULL,
    "serialNumber" TEXT,
    "thumbprint" TEXT,
    "validFrom" DATETIME,
    "validTo" DATETIME,
    "pfxEncryptedBase64" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "lastNsu" TEXT,
    "lastMaxNsu" TEXT,
    "lastSyncAt" DATETIME,
    "lastSyncStatus" TEXT,
    "lastSyncMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "fiscal_certificates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_payable_invoice_imports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT,
    "fiscalCertificateId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "importType" TEXT NOT NULL DEFAULT 'XML_UPLOAD',
    "documentModel" TEXT NOT NULL,
    "accessKey" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "series" TEXT,
    "operationNature" TEXT,
    "issueDate" DATETIME NOT NULL,
    "entryDate" DATETIME,
    "totalProductsAmount" REAL NOT NULL DEFAULT 0,
    "totalInvoiceAmount" REAL NOT NULL DEFAULT 0,
    "xmlHash" TEXT NOT NULL,
    "xmlContentBlob" BLOB NOT NULL,
    "distributionNsu" TEXT,
    "parsedSnapshotJson" TEXT,
    "approvalNotes" TEXT,
    "approvedAt" DATETIME,
    "approvedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "payable_invoice_imports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payable_invoice_imports_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "payable_invoice_imports_fiscalCertificateId_fkey" FOREIGN KEY ("fiscalCertificateId") REFERENCES "fiscal_certificates" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_payable_invoice_imports" (
    "id",
    "companyId",
    "supplierId",
    "status",
    "importType",
    "documentModel",
    "accessKey",
    "invoiceNumber",
    "series",
    "operationNature",
    "issueDate",
    "entryDate",
    "totalProductsAmount",
    "totalInvoiceAmount",
    "xmlHash",
    "xmlContentBlob",
    "parsedSnapshotJson",
    "approvalNotes",
    "approvedAt",
    "approvedBy",
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
    "supplierId",
    "status",
    "importType",
    "documentModel",
    "accessKey",
    "invoiceNumber",
    "series",
    "operationNature",
    "issueDate",
    "entryDate",
    "totalProductsAmount",
    "totalInvoiceAmount",
    "xmlHash",
    CAST("xmlContent" AS BLOB),
    "parsedSnapshotJson",
    "approvalNotes",
    "approvedAt",
    "approvedBy",
    "createdAt",
    "createdBy",
    "updatedAt",
    "updatedBy",
    "canceledAt",
    "canceledBy"
FROM "payable_invoice_imports";
DROP TABLE "payable_invoice_imports";
ALTER TABLE "new_payable_invoice_imports" RENAME TO "payable_invoice_imports";
CREATE INDEX "payable_invoice_imports_companyId_status_issueDate_idx" ON "payable_invoice_imports"("companyId", "status", "issueDate");
CREATE INDEX "payable_invoice_imports_companyId_invoiceNumber_series_idx" ON "payable_invoice_imports"("companyId", "invoiceNumber", "series");
CREATE INDEX "payable_invoice_imports_fiscalCertificateId_distributionNsu_idx" ON "payable_invoice_imports"("fiscalCertificateId", "distributionNsu");
CREATE UNIQUE INDEX "payable_invoice_imports_companyId_accessKey_key" ON "payable_invoice_imports"("companyId", "accessKey");
CREATE UNIQUE INDEX "payable_invoice_imports_companyId_xmlHash_key" ON "payable_invoice_imports"("companyId", "xmlHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "fiscal_certificates_companyId_status_environment_purpose_aliasName_idx" ON "fiscal_certificates"("companyId", "status", "environment", "purpose", "aliasName");
