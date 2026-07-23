CREATE TABLE "print_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "documentType" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "print_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "print_template_versions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "layoutJson" TEXT NOT NULL,
    "sampleDataJson" TEXT,
    "publishedAt" DATETIME,
    "publishedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "print_template_versions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "print_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "print_templates" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "printer_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "printerName" TEXT NOT NULL,
    "printerType" TEXT NOT NULL,
    "connectionType" TEXT NOT NULL DEFAULT 'WINDOWS',
    "language" TEXT NOT NULL DEFAULT 'WINDOWS_DRIVER',
    "paperWidthMm" REAL NOT NULL DEFAULT 80,
    "paperHeightMm" REAL,
    "columns" INTEGER NOT NULL DEFAULT 40,
    "dpi" INTEGER NOT NULL DEFAULT 203,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "cutterEnabled" BOOLEAN NOT NULL DEFAULT false,
    "settingsJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "printer_profiles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "print_template_bindings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "sourceSystem" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersionId" TEXT,
    "printerProfileId" TEXT,
    "autoPrint" BOOLEAN NOT NULL DEFAULT false,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "print_template_bindings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "print_template_bindings_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "print_templates" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "print_template_bindings_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "print_template_versions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "print_template_bindings_printerProfileId_fkey" FOREIGN KEY ("printerProfileId") REFERENCES "printer_profiles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "print_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "businessEntityType" TEXT NOT NULL,
    "businessEntityId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "printerProfileId" TEXT,
    "payloadJson" TEXT NOT NULL,
    "renderedFormat" TEXT NOT NULL,
    "renderedContent" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedBy" TEXT,
    "dispatchedAt" DATETIME,
    "completedAt" DATETIME,
    "errorMessage" TEXT,
    "localPrinterName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "print_jobs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "print_jobs_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "print_templates" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "print_jobs_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "print_template_versions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "print_jobs_printerProfileId_fkey" FOREIGN KEY ("printerProfileId") REFERENCES "printer_profiles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "print_audit_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "metadataJson" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "print_audit_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "print_templates_companyId_branchCode_code_key" ON "print_templates"("companyId", "branchCode", "code");
CREATE INDEX "print_templates_companyId_branchCode_documentType_status_canceledAt_idx" ON "print_templates"("companyId", "branchCode", "documentType", "status", "canceledAt");
CREATE UNIQUE INDEX "print_template_versions_templateId_version_key" ON "print_template_versions"("templateId", "version");
CREATE INDEX "print_template_versions_companyId_branchCode_status_publishedAt_idx" ON "print_template_versions"("companyId", "branchCode", "status", "publishedAt");
CREATE UNIQUE INDEX "printer_profiles_companyId_branchCode_name_key" ON "printer_profiles"("companyId", "branchCode", "name");
CREATE INDEX "printer_profiles_companyId_branchCode_status_canceledAt_idx" ON "printer_profiles"("companyId", "branchCode", "status", "canceledAt");
CREATE UNIQUE INDEX "print_template_bindings_companyId_branchCode_sourceSystem_eventType_key" ON "print_template_bindings"("companyId", "branchCode", "sourceSystem", "eventType");
CREATE INDEX "print_template_bindings_companyId_branchCode_status_canceledAt_idx" ON "print_template_bindings"("companyId", "branchCode", "status", "canceledAt");
CREATE UNIQUE INDEX "print_jobs_companyId_branchCode_idempotencyKey_key" ON "print_jobs"("companyId", "branchCode", "idempotencyKey");
CREATE INDEX "print_jobs_companyId_branchCode_eventType_status_requestedAt_idx" ON "print_jobs"("companyId", "branchCode", "eventType", "status", "requestedAt");
CREATE INDEX "print_jobs_companyId_businessEntityType_businessEntityId_idx" ON "print_jobs"("companyId", "businessEntityType", "businessEntityId");
CREATE INDEX "print_audit_events_companyId_branchCode_entityType_entityId_occurredAt_idx" ON "print_audit_events"("companyId", "branchCode", "entityType", "entityId", "occurredAt");
