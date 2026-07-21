CREATE TABLE "source_integration_configurations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpTimeout" INTEGER,
    "smtpAuthenticate" BOOLEAN,
    "smtpSecure" BOOLEAN,
    "smtpAuthType" TEXT,
    "smtpEmail" TEXT,
    "smtpPasswordEncrypted" TEXT,
    "smtpSourceScope" TEXT,
    "telegramEnabled" BOOLEAN,
    "telegramBotTokenEncrypted" TEXT,
    "telegramBotUsername" TEXT,
    "telegramSourceScope" TEXT,
    "storageDefaultAcl" TEXT,
    "storageDefaultExpiration" INTEGER,
    "storageSourceScope" TEXT,
    "lastSyncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "source_integration_configurations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "source_integration_audit_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadataJson" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "source_integration_audit_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "source_integration_configurations_companyId_branchCode_key" ON "source_integration_configurations"("companyId", "branchCode");
CREATE INDEX "source_integration_configurations_companyId_branchCode_status_canceledAt_idx" ON "source_integration_configurations"("companyId", "branchCode", "status", "canceledAt");
CREATE INDEX "source_integration_audit_events_companyId_branchCode_occurredAt_idx" ON "source_integration_audit_events"("companyId", "branchCode", "occurredAt");
