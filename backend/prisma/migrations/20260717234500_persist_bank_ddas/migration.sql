-- CreateTable
CREATE TABLE "bank_dda_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "bankAccountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "dueDate" TEXT,
    "issueDate" TEXT,
    "beneficiaryName" TEXT NOT NULL,
    "beneficiaryDocument" TEXT,
    "payerName" TEXT,
    "payerDocument" TEXT,
    "documentNumber" TEXT,
    "digitableLine" TEXT,
    "barcode" TEXT,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "bankStatus" TEXT,
    "rawPayloadJson" TEXT,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusChangedAt" DATETIME,
    "statusChangedBy" TEXT,
    "localNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "bank_dda_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bank_dda_records_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bank_dda_audit_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "bankDdaRecordId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "metadataJson" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "bank_dda_audit_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bank_dda_audit_events_bankDdaRecordId_fkey" FOREIGN KEY ("bankDdaRecordId") REFERENCES "bank_dda_records" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "bank_dda_records_bankAccountId_externalId_key" ON "bank_dda_records"("bankAccountId", "externalId");
CREATE INDEX "bank_dda_records_companyId_branchCode_status_dueDate_idx" ON "bank_dda_records"("companyId", "branchCode", "status", "dueDate");
CREATE INDEX "bank_dda_records_companyId_bankAccountId_lastSeenAt_idx" ON "bank_dda_records"("companyId", "bankAccountId", "lastSeenAt");
CREATE INDEX "bank_dda_audit_events_companyId_branchCode_occurredAt_idx" ON "bank_dda_audit_events"("companyId", "branchCode", "occurredAt");
CREATE INDEX "bank_dda_audit_events_companyId_bankDdaRecordId_occurredAt_idx" ON "bank_dda_audit_events"("companyId", "bankDdaRecordId", "occurredAt");
