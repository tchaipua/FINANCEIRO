CREATE TABLE "financial_notification_preferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "sendInternal" BOOLEAN NOT NULL DEFAULT false,
    "sendEmail" BOOLEAN NOT NULL DEFAULT false,
    "sendTelegram" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "financial_notification_preferences_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "financial_notification_preferences_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "finance_access_subjects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "financial_notification_deliveries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "actionUrl" TEXT,
    "metadataJson" TEXT,
    "sendInternal" BOOLEAN NOT NULL DEFAULT false,
    "sendEmail" BOOLEAN NOT NULL DEFAULT false,
    "sendTelegram" BOOLEAN NOT NULL DEFAULT false,
    "internalStatus" TEXT NOT NULL DEFAULT 'SKIPPED',
    "emailStatus" TEXT NOT NULL DEFAULT 'SKIPPED',
    "telegramStatus" TEXT NOT NULL DEFAULT 'SKIPPED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "deliveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "financial_notification_deliveries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "financial_notification_deliveries_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "finance_access_subjects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "financial_notification_audit_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "subjectId" TEXT,
    "action" TEXT NOT NULL,
    "eventType" TEXT,
    "summary" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "metadataJson" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "financial_notification_audit_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "financial_notification_preferences_scope_subject_event_key" ON "financial_notification_preferences"("companyId", "branchCode", "sourceSystem", "sourceTenantId", "subjectId", "eventType");
CREATE INDEX "financial_notification_preferences_event_enabled_idx" ON "financial_notification_preferences"("companyId", "branchCode", "eventType", "enabled", "canceledAt");
CREATE INDEX "financial_notification_preferences_subject_branch_idx" ON "financial_notification_preferences"("subjectId", "branchCode", "canceledAt");
CREATE UNIQUE INDEX "financial_notification_deliveries_scope_subject_event_key" ON "financial_notification_deliveries"("companyId", "branchCode", "sourceSystem", "sourceTenantId", "subjectId", "eventKey");
CREATE INDEX "financial_notification_deliveries_event_created_idx" ON "financial_notification_deliveries"("companyId", "branchCode", "eventType", "createdAt");
CREATE INDEX "financial_notification_deliveries_delivered_idx" ON "financial_notification_deliveries"("companyId", "branchCode", "deliveredAt");
CREATE INDEX "financial_notification_audit_scope_occurred_idx" ON "financial_notification_audit_events"("companyId", "branchCode", "occurredAt");
CREATE INDEX "financial_notification_audit_subject_event_idx" ON "financial_notification_audit_events"("companyId", "subjectId", "eventType", "occurredAt");
