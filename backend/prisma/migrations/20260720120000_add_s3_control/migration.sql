CREATE TABLE "s3_configurations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "endpoint" TEXT,
    "region" TEXT NOT NULL DEFAULT 'us-east-1',
    "bucket" TEXT NOT NULL,
    "basePrefix" TEXT NOT NULL,
    "accessKeyEncrypted" TEXT NOT NULL,
    "secretKeyEncrypted" TEXT NOT NULL,
    "forcePathStyle" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "s3_configurations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "s3_audit_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadataJson" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "s3_audit_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "s3_configurations_companyId_branchCode_key" ON "s3_configurations"("companyId", "branchCode");
CREATE INDEX "s3_configurations_companyId_branchCode_status_canceledAt_idx" ON "s3_configurations"("companyId", "branchCode", "status", "canceledAt");
CREATE INDEX "s3_audit_events_companyId_branchCode_occurredAt_idx" ON "s3_audit_events"("companyId", "branchCode", "occurredAt");
CREATE INDEX "s3_audit_events_companyId_branchCode_entityType_entityId_idx" ON "s3_audit_events"("companyId", "branchCode", "entityType", "entityId");
