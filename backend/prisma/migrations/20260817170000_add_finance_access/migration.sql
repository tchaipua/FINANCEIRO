CREATE TABLE "finance_access_subjects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "sourceUserId" TEXT NOT NULL,
    "centralIdentityAccountId" TEXT,
    "registeredPersonId" TEXT,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "sourceRole" TEXT,
    "sourceBranchCodesJson" TEXT NOT NULL DEFAULT '[]',
    "subjectType" TEXT NOT NULL DEFAULT 'INTERNAL_USER',
    "sourceActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSynchronizedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "finance_access_subjects_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "finance_access_assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "profileCode" TEXT NOT NULL,
    "permissionCodesJson" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "finance_access_assignments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "finance_access_assignments_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "finance_access_subjects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "finance_access_audit_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "subjectId" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadataJson" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "finance_access_audit_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "finance_access_audit_events_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "finance_access_subjects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "finance_access_subjects_companyId_sourceSystem_sourceTenantId_sourceUserId_key" ON "finance_access_subjects"("companyId", "sourceSystem", "sourceTenantId", "sourceUserId");
CREATE INDEX "finance_access_subjects_companyId_displayName_sourceActive_canceledAt_idx" ON "finance_access_subjects"("companyId", "displayName", "sourceActive", "canceledAt");
CREATE UNIQUE INDEX "finance_access_assignments_companyId_subjectId_branchCode_key" ON "finance_access_assignments"("companyId", "subjectId", "branchCode");
CREATE INDEX "finance_access_assignments_companyId_branchCode_active_canceledAt_idx" ON "finance_access_assignments"("companyId", "branchCode", "active", "canceledAt");
CREATE INDEX "finance_access_audit_events_companyId_branchCode_occurredAt_idx" ON "finance_access_audit_events"("companyId", "branchCode", "occurredAt");
CREATE INDEX "finance_access_audit_events_companyId_subjectId_occurredAt_idx" ON "finance_access_audit_events"("companyId", "subjectId", "occurredAt");
