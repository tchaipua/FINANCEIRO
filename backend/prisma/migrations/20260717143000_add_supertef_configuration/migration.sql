CREATE TABLE "supertef_configurations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "provider" TEXT NOT NULL DEFAULT 'SUPERTEF',
    "status" TEXT NOT NULL DEFAULT 'INACTIVE',
    "environment" TEXT NOT NULL DEFAULT 'HOMOLOGATION',
    "clientKey" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "tokenFingerprint" TEXT NOT NULL,
    "tokenHint" TEXT NOT NULL,
    "printReceipt" BOOLEAN NOT NULL DEFAULT true,
    "operationTimeoutSeconds" INTEGER NOT NULL DEFAULT 120,
    "pollIntervalSeconds" INTEGER NOT NULL DEFAULT 4,
    "lastConnectionTestAt" DATETIME,
    "lastConnectionStatus" TEXT,
    "lastConnectionMessage" TEXT,
    "lastPosSyncAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "supertef_configurations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "supertef_terminals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configurationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "providerPosId" INTEGER NOT NULL,
    "operationalStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "providerStatus" INTEGER,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "bank" TEXT,
    "providerClientId" INTEGER,
    "providerCreatedAt" DATETIME,
    "providerUpdatedAt" DATETIME,
    "activatedAt" DATETIME,
    "lastSeenAt" DATETIME,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "supertef_terminals_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "supertef_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "supertef_terminals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "supertef_checkouts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "supertef_checkouts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "supertef_checkout_routes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "checkoutId" TEXT NOT NULL,
    "terminalId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "supertef_checkout_routes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "supertef_checkout_routes_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "supertef_checkouts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "supertef_checkout_routes_terminalId_fkey" FOREIGN KEY ("terminalId") REFERENCES "supertef_terminals" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "supertef_audit_events" (
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
    CONSTRAINT "supertef_audit_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "supertef_configurations_companyId_branchCode_provider_key" ON "supertef_configurations"("companyId", "branchCode", "provider");
CREATE INDEX "supertef_configurations_companyId_branchCode_status_canceledAt_idx" ON "supertef_configurations"("companyId", "branchCode", "status", "canceledAt");
CREATE UNIQUE INDEX "supertef_terminals_configurationId_providerPosId_key" ON "supertef_terminals"("configurationId", "providerPosId");
CREATE INDEX "supertef_terminals_companyId_branchCode_operationalStatus_canceledAt_idx" ON "supertef_terminals"("companyId", "branchCode", "operationalStatus", "canceledAt");
CREATE UNIQUE INDEX "supertef_checkouts_companyId_branchCode_code_key" ON "supertef_checkouts"("companyId", "branchCode", "code");
CREATE INDEX "supertef_checkouts_companyId_branchCode_status_canceledAt_idx" ON "supertef_checkouts"("companyId", "branchCode", "status", "canceledAt");
CREATE UNIQUE INDEX "supertef_checkout_routes_checkoutId_terminalId_key" ON "supertef_checkout_routes"("checkoutId", "terminalId");
CREATE INDEX "supertef_checkout_routes_companyId_branchCode_checkoutId_status_priority_idx" ON "supertef_checkout_routes"("companyId", "branchCode", "checkoutId", "status", "priority");
CREATE INDEX "supertef_checkout_routes_companyId_branchCode_terminalId_status_idx" ON "supertef_checkout_routes"("companyId", "branchCode", "terminalId", "status");
CREATE INDEX "supertef_audit_events_companyId_branchCode_occurredAt_idx" ON "supertef_audit_events"("companyId", "branchCode", "occurredAt");
CREATE INDEX "supertef_audit_events_companyId_branchCode_entityType_entityId_idx" ON "supertef_audit_events"("companyId", "branchCode", "entityType", "entityId");
