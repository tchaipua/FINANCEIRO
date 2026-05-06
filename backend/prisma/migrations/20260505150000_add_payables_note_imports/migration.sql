-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "document" TEXT,
    "stateRegistration" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "suppliers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payable_invoice_imports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT,
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
    "xmlContent" TEXT NOT NULL,
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
    CONSTRAINT "payable_invoice_imports_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payable_invoice_import_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceImportId" TEXT NOT NULL,
    "productId" TEXT,
    "lineNumber" INTEGER NOT NULL,
    "approvalAction" TEXT,
    "supplierItemCode" TEXT,
    "barcode" TEXT,
    "description" TEXT NOT NULL,
    "ncmCode" TEXT,
    "cfopCode" TEXT,
    "unitCode" TEXT,
    "quantity" REAL NOT NULL DEFAULT 0,
    "unitPrice" REAL NOT NULL DEFAULT 0,
    "totalPrice" REAL NOT NULL DEFAULT 0,
    "tracksInventory" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "payable_invoice_import_items_invoiceImportId_fkey" FOREIGN KEY ("invoiceImportId") REFERENCES "payable_invoice_imports" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payable_invoice_import_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payable_invoice_import_installments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceImportId" TEXT NOT NULL,
    "installmentLabel" TEXT,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "amount" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "payable_invoice_import_installments_invoiceImportId_fkey" FOREIGN KEY ("invoiceImportId") REFERENCES "payable_invoice_imports" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payable_titles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT,
    "sourceDocumentType" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "documentNumber" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "issueDate" DATETIME NOT NULL,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "supplierNameSnapshot" TEXT NOT NULL,
    "supplierDocumentSnapshot" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "payable_titles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payable_titles_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "payable_titles_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "payable_invoice_imports" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payable_installments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "amount" REAL NOT NULL DEFAULT 0,
    "openAmount" REAL NOT NULL DEFAULT 0,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "descriptionSnapshot" TEXT NOT NULL,
    "supplierNameSnapshot" TEXT NOT NULL,
    "supplierDocumentSnapshot" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "payable_installments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payable_installments_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "payable_titles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sourceImportId" TEXT NOT NULL,
    "sourceImportItemId" TEXT NOT NULL,
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

-- CreateIndex
CREATE INDEX "suppliers_companyId_status_legalName_idx" ON "suppliers"("companyId", "status", "legalName");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_companyId_document_key" ON "suppliers"("companyId", "document");

-- CreateIndex
CREATE INDEX "payable_invoice_imports_companyId_status_issueDate_idx" ON "payable_invoice_imports"("companyId", "status", "issueDate");

-- CreateIndex
CREATE INDEX "payable_invoice_imports_companyId_invoiceNumber_series_idx" ON "payable_invoice_imports"("companyId", "invoiceNumber", "series");

-- CreateIndex
CREATE UNIQUE INDEX "payable_invoice_imports_companyId_accessKey_key" ON "payable_invoice_imports"("companyId", "accessKey");

-- CreateIndex
CREATE UNIQUE INDEX "payable_invoice_imports_companyId_xmlHash_key" ON "payable_invoice_imports"("companyId", "xmlHash");

-- CreateIndex
CREATE INDEX "payable_invoice_import_items_productId_idx" ON "payable_invoice_import_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "payable_invoice_import_items_invoiceImportId_lineNumber_key" ON "payable_invoice_import_items"("invoiceImportId", "lineNumber");

-- CreateIndex
CREATE INDEX "payable_invoice_import_installments_dueDate_idx" ON "payable_invoice_import_installments"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "payable_invoice_import_installments_invoiceImportId_installmentNumber_key" ON "payable_invoice_import_installments"("invoiceImportId", "installmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "payable_titles_sourceDocumentId_key" ON "payable_titles"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "payable_titles_companyId_status_issueDate_idx" ON "payable_titles"("companyId", "status", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "payable_titles_companyId_sourceDocumentType_sourceDocumentId_key" ON "payable_titles"("companyId", "sourceDocumentType", "sourceDocumentId");

-- CreateIndex
CREATE INDEX "payable_installments_companyId_status_dueDate_idx" ON "payable_installments"("companyId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "payable_installments_titleId_installmentNumber_key" ON "payable_installments"("titleId", "installmentNumber");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_occurredAt_idx" ON "stock_movements"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_productId_occurredAt_idx" ON "stock_movements"("productId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_sourceImportId_idx" ON "stock_movements"("sourceImportId");
