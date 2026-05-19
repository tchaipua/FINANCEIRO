-- CreateTable
CREATE TABLE "company_branches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "company_branches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_bank_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "branchNumber" TEXT NOT NULL,
    "branchDigit" TEXT NOT NULL DEFAULT '',
    "accountNumber" TEXT NOT NULL,
    "accountDigit" TEXT NOT NULL DEFAULT '',
    "walletCode" TEXT,
    "agreementCode" TEXT,
    "pixKey" TEXT,
    "beneficiaryName" TEXT,
    "beneficiaryDocument" TEXT,
    "billingProvider" TEXT,
    "billingEnvironment" TEXT,
    "billingApiClientId" TEXT,
    "billingApiClientSecret" TEXT,
    "billingCertificateBase64" TEXT,
    "billingCertificatePassword" TEXT,
    "billingBeneficiaryCode" TEXT,
    "billingWalletVariation" TEXT,
    "billingContractNumber" TEXT,
    "billingModalityCode" TEXT,
    "billingDocumentSpeciesCode" TEXT,
    "billingAcceptanceCode" TEXT,
    "billingIssueTypeCode" TEXT,
    "billingDistributionTypeCode" TEXT,
    "billingNextBoletoNumber" INTEGER,
    "billingRegisterPixCode" INTEGER,
    "billingInstructionLine1" TEXT,
    "billingInstructionLine2" TEXT,
    "billingDefaultFinePercent" REAL,
    "billingDefaultInterestPercent" REAL,
    "billingDefaultDiscountPercent" REAL,
    "billingProtestDays" INTEGER,
    "billingNegativeDays" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "bank_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_bank_accounts" ("accountDigit", "accountNumber", "agreementCode", "bankCode", "bankName", "beneficiaryDocument", "beneficiaryName", "billingAcceptanceCode", "billingApiClientId", "billingApiClientSecret", "billingBeneficiaryCode", "billingCertificateBase64", "billingCertificatePassword", "billingContractNumber", "billingDefaultDiscountPercent", "billingDefaultFinePercent", "billingDefaultInterestPercent", "billingDistributionTypeCode", "billingDocumentSpeciesCode", "billingEnvironment", "billingInstructionLine1", "billingInstructionLine2", "billingIssueTypeCode", "billingModalityCode", "billingNegativeDays", "billingNextBoletoNumber", "billingProtestDays", "billingProvider", "billingRegisterPixCode", "billingWalletVariation", "branchDigit", "branchNumber", "canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "id", "notes", "pixKey", "status", "updatedAt", "updatedBy", "walletCode") SELECT "accountDigit", "accountNumber", "agreementCode", "bankCode", "bankName", "beneficiaryDocument", "beneficiaryName", "billingAcceptanceCode", "billingApiClientId", "billingApiClientSecret", "billingBeneficiaryCode", "billingCertificateBase64", "billingCertificatePassword", "billingContractNumber", "billingDefaultDiscountPercent", "billingDefaultFinePercent", "billingDefaultInterestPercent", "billingDistributionTypeCode", "billingDocumentSpeciesCode", "billingEnvironment", "billingInstructionLine1", "billingInstructionLine2", "billingIssueTypeCode", "billingModalityCode", "billingNegativeDays", "billingNextBoletoNumber", "billingProtestDays", "billingProvider", "billingRegisterPixCode", "billingWalletVariation", "branchDigit", "branchNumber", "canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "id", "notes", "pixKey", "status", "updatedAt", "updatedBy", "walletCode" FROM "bank_accounts";
DROP TABLE "bank_accounts";
ALTER TABLE "new_bank_accounts" RENAME TO "bank_accounts";
CREATE INDEX "bank_accounts_companyId_status_bankName_idx" ON "bank_accounts"("companyId", "status", "bankName");
CREATE UNIQUE INDEX "bank_accounts_companyId_branchCode_bankCode_branchNumber_branchDigit_accountNumber_accountDigit_key" ON "bank_accounts"("companyId", "branchCode", "bankCode", "branchNumber", "branchDigit", "accountNumber", "accountDigit");
CREATE TABLE "new_bank_return_import_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "bankAccountId" TEXT NOT NULL,
    "matchedInstallmentId" TEXT,
    "appliedSettlementId" TEXT,
    "movementTypeCode" TEXT NOT NULL,
    "movementStatus" TEXT NOT NULL,
    "externalRequestCode" TEXT,
    "externalFileId" TEXT,
    "dueDate" DATETIME,
    "movementDate" DATETIME,
    "paymentDate" DATETIME,
    "expectedCreditDate" DATETIME,
    "ourNumber" TEXT,
    "yourNumber" TEXT,
    "barcode" TEXT,
    "contractNumber" TEXT,
    "amount" REAL NOT NULL DEFAULT 0,
    "settledAmount" REAL,
    "discountAmount" REAL,
    "interestAmount" REAL,
    "feeAmount" REAL,
    "rawPayloadJson" TEXT NOT NULL,
    "appliedAt" DATETIME,
    "appliedBy" TEXT,
    "appliedStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "bank_return_import_items_importId_fkey" FOREIGN KEY ("importId") REFERENCES "bank_return_imports" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bank_return_import_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bank_return_import_items_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bank_return_import_items_matchedInstallmentId_fkey" FOREIGN KEY ("matchedInstallmentId") REFERENCES "receivable_installments" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "bank_return_import_items_appliedSettlementId_fkey" FOREIGN KEY ("appliedSettlementId") REFERENCES "installment_settlements" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_bank_return_import_items" ("amount", "appliedAt", "appliedBy", "appliedSettlementId", "appliedStatus", "bankAccountId", "barcode", "canceledAt", "canceledBy", "companyId", "contractNumber", "createdAt", "createdBy", "discountAmount", "dueDate", "expectedCreditDate", "externalFileId", "externalRequestCode", "feeAmount", "id", "importId", "interestAmount", "matchedInstallmentId", "movementDate", "movementStatus", "movementTypeCode", "ourNumber", "paymentDate", "rawPayloadJson", "settledAmount", "updatedAt", "updatedBy", "yourNumber") SELECT "amount", "appliedAt", "appliedBy", "appliedSettlementId", "appliedStatus", "bankAccountId", "barcode", "canceledAt", "canceledBy", "companyId", "contractNumber", "createdAt", "createdBy", "discountAmount", "dueDate", "expectedCreditDate", "externalFileId", "externalRequestCode", "feeAmount", "id", "importId", "interestAmount", "matchedInstallmentId", "movementDate", "movementStatus", "movementTypeCode", "ourNumber", "paymentDate", "rawPayloadJson", "settledAmount", "updatedAt", "updatedBy", "yourNumber" FROM "bank_return_import_items";
DROP TABLE "bank_return_import_items";
ALTER TABLE "new_bank_return_import_items" RENAME TO "bank_return_import_items";
CREATE INDEX "bank_return_import_items_importId_movementStatus_idx" ON "bank_return_import_items"("importId", "movementStatus");
CREATE INDEX "bank_return_import_items_companyId_bankAccountId_movementStatus_idx" ON "bank_return_import_items"("companyId", "bankAccountId", "movementStatus");
CREATE INDEX "bank_return_import_items_matchedInstallmentId_idx" ON "bank_return_import_items"("matchedInstallmentId");
CREATE TABLE "new_bank_return_imports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "bankAccountId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "importedItemCount" INTEGER NOT NULL DEFAULT 0,
    "matchedItemCount" INTEGER NOT NULL DEFAULT 0,
    "liquidatedItemCount" INTEGER NOT NULL DEFAULT 0,
    "bankClosedItemCount" INTEGER NOT NULL DEFAULT 0,
    "readyToApplyCount" INTEGER NOT NULL DEFAULT 0,
    "appliedItemCount" INTEGER NOT NULL DEFAULT 0,
    "unmatchedItemCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'IMPORTED',
    "requestSnapshotJson" TEXT,
    "summaryJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "bank_return_imports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bank_return_imports_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_bank_return_imports" ("appliedItemCount", "bankAccountId", "bankClosedItemCount", "canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "id", "importedItemCount", "liquidatedItemCount", "matchedItemCount", "periodEnd", "periodStart", "provider", "readyToApplyCount", "requestSnapshotJson", "status", "summaryJson", "unmatchedItemCount", "updatedAt", "updatedBy") SELECT "appliedItemCount", "bankAccountId", "bankClosedItemCount", "canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "id", "importedItemCount", "liquidatedItemCount", "matchedItemCount", "periodEnd", "periodStart", "provider", "readyToApplyCount", "requestSnapshotJson", "status", "summaryJson", "unmatchedItemCount", "updatedAt", "updatedBy" FROM "bank_return_imports";
DROP TABLE "bank_return_imports";
ALTER TABLE "new_bank_return_imports" RENAME TO "bank_return_imports";
CREATE INDEX "bank_return_imports_companyId_createdAt_idx" ON "bank_return_imports"("companyId", "createdAt");
CREATE INDEX "bank_return_imports_bankAccountId_createdAt_idx" ON "bank_return_imports"("bankAccountId", "createdAt");
CREATE TABLE "new_cash_movements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "cashSessionId" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "amount" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "cash_movements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cash_movements_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_cash_movements" ("amount", "canceledAt", "canceledBy", "cashSessionId", "companyId", "createdAt", "createdBy", "description", "direction", "id", "movementType", "occurredAt", "paymentMethod", "referenceId", "referenceType", "updatedAt", "updatedBy") SELECT "amount", "canceledAt", "canceledBy", "cashSessionId", "companyId", "createdAt", "createdBy", "description", "direction", "id", "movementType", "occurredAt", "paymentMethod", "referenceId", "referenceType", "updatedAt", "updatedBy" FROM "cash_movements";
DROP TABLE "cash_movements";
ALTER TABLE "new_cash_movements" RENAME TO "cash_movements";
CREATE INDEX "cash_movements_companyId_occurredAt_idx" ON "cash_movements"("companyId", "occurredAt");
CREATE INDEX "cash_movements_cashSessionId_idx" ON "cash_movements"("cashSessionId");
CREATE TABLE "new_cash_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "cashierUserId" TEXT NOT NULL,
    "cashierDisplayName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openingAmount" REAL NOT NULL DEFAULT 0,
    "totalReceivedAmount" REAL NOT NULL DEFAULT 0,
    "expectedClosingAmount" REAL NOT NULL DEFAULT 0,
    "declaredClosingAmount" REAL,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "cash_sessions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_cash_sessions" ("canceledAt", "canceledBy", "cashierDisplayName", "cashierUserId", "closedAt", "companyId", "createdAt", "createdBy", "declaredClosingAmount", "expectedClosingAmount", "id", "notes", "openedAt", "openingAmount", "sourceSystem", "sourceTenantId", "status", "totalReceivedAmount", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "cashierDisplayName", "cashierUserId", "closedAt", "companyId", "createdAt", "createdBy", "declaredClosingAmount", "expectedClosingAmount", "id", "notes", "openedAt", "openingAmount", "sourceSystem", "sourceTenantId", "status", "totalReceivedAmount", "updatedAt", "updatedBy" FROM "cash_sessions";
DROP TABLE "cash_sessions";
ALTER TABLE "new_cash_sessions" RENAME TO "cash_sessions";
CREATE INDEX "cash_sessions_companyId_cashierUserId_status_idx" ON "cash_sessions"("companyId", "cashierUserId", "status");
CREATE INDEX "cash_sessions_companyId_openedAt_idx" ON "cash_sessions"("companyId", "openedAt");
CREATE TABLE "new_fiscal_certificates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_fiscal_certificates" ("aliasName", "authorStateCode", "canceledAt", "canceledBy", "certificateType", "companyId", "createdAt", "createdBy", "environment", "holderDocument", "holderName", "id", "isDefault", "lastMaxNsu", "lastNsu", "lastSyncAt", "lastSyncMessage", "lastSyncStatus", "passwordEncrypted", "pfxEncryptedBase64", "purpose", "serialNumber", "status", "thumbprint", "updatedAt", "updatedBy", "validFrom", "validTo") SELECT "aliasName", "authorStateCode", "canceledAt", "canceledBy", "certificateType", "companyId", "createdAt", "createdBy", "environment", "holderDocument", "holderName", "id", "isDefault", "lastMaxNsu", "lastNsu", "lastSyncAt", "lastSyncMessage", "lastSyncStatus", "passwordEncrypted", "pfxEncryptedBase64", "purpose", "serialNumber", "status", "thumbprint", "updatedAt", "updatedBy", "validFrom", "validTo" FROM "fiscal_certificates";
DROP TABLE "fiscal_certificates";
ALTER TABLE "new_fiscal_certificates" RENAME TO "fiscal_certificates";
CREATE INDEX "fiscal_certificates_companyId_status_environment_purpose_aliasName_idx" ON "fiscal_certificates"("companyId", "status", "environment", "purpose", "aliasName");
CREATE TABLE "new_installment_settlements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "installmentId" TEXT NOT NULL,
    "cashSessionId" TEXT NOT NULL,
    "receivedAmount" REAL NOT NULL,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "interestAmount" REAL NOT NULL DEFAULT 0,
    "penaltyAmount" REAL NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL,
    "settledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedBy" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "installment_settlements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "installment_settlements_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "receivable_installments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "installment_settlements_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_installment_settlements" ("canceledAt", "canceledBy", "cashSessionId", "companyId", "createdAt", "createdBy", "discountAmount", "id", "installmentId", "interestAmount", "notes", "paymentMethod", "penaltyAmount", "receivedAmount", "requestedBy", "settledAt", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "cashSessionId", "companyId", "createdAt", "createdBy", "discountAmount", "id", "installmentId", "interestAmount", "notes", "paymentMethod", "penaltyAmount", "receivedAmount", "requestedBy", "settledAt", "updatedAt", "updatedBy" FROM "installment_settlements";
DROP TABLE "installment_settlements";
ALTER TABLE "new_installment_settlements" RENAME TO "installment_settlements";
CREATE INDEX "installment_settlements_companyId_settledAt_idx" ON "installment_settlements"("companyId", "settledAt");
CREATE INDEX "installment_settlements_installmentId_idx" ON "installment_settlements"("installmentId");
CREATE INDEX "installment_settlements_cashSessionId_idx" ON "installment_settlements"("cashSessionId");
CREATE TABLE "new_parties" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "externalEntityType" TEXT NOT NULL,
    "externalEntityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "parties_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_parties" ("addressLine1", "canceledAt", "canceledBy", "city", "companyId", "createdAt", "createdBy", "document", "email", "externalEntityId", "externalEntityType", "id", "name", "neighborhood", "phone", "postalCode", "state", "updatedAt", "updatedBy") SELECT "addressLine1", "canceledAt", "canceledBy", "city", "companyId", "createdAt", "createdBy", "document", "email", "externalEntityId", "externalEntityType", "id", "name", "neighborhood", "phone", "postalCode", "state", "updatedAt", "updatedBy" FROM "parties";
DROP TABLE "parties";
ALTER TABLE "new_parties" RENAME TO "parties";
CREATE INDEX "parties_companyId_name_idx" ON "parties"("companyId", "name");
CREATE UNIQUE INDEX "parties_companyId_branchCode_externalEntityType_externalEntityId_key" ON "parties"("companyId", "branchCode", "externalEntityType", "externalEntityId");
CREATE TABLE "new_payable_installments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "titleId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "originalAmount" REAL NOT NULL DEFAULT 0,
    "additionAmount" REAL NOT NULL DEFAULT 0,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "finalAmount" REAL NOT NULL DEFAULT 0,
    "amount" REAL NOT NULL DEFAULT 0,
    "openAmount" REAL NOT NULL DEFAULT 0,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "paymentMethod" TEXT,
    "settledAt" DATETIME,
    "notes" TEXT,
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
INSERT INTO "new_payable_installments" ("additionAmount", "amount", "canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "descriptionSnapshot", "discountAmount", "dueDate", "finalAmount", "id", "installmentCount", "installmentNumber", "notes", "openAmount", "originalAmount", "paidAmount", "paymentMethod", "settledAt", "status", "supplierDocumentSnapshot", "supplierNameSnapshot", "titleId", "updatedAt", "updatedBy") SELECT "additionAmount", "amount", "canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "descriptionSnapshot", "discountAmount", "dueDate", "finalAmount", "id", "installmentCount", "installmentNumber", "notes", "openAmount", "originalAmount", "paidAmount", "paymentMethod", "settledAt", "status", "supplierDocumentSnapshot", "supplierNameSnapshot", "titleId", "updatedAt", "updatedBy" FROM "payable_installments";
DROP TABLE "payable_installments";
ALTER TABLE "new_payable_installments" RENAME TO "payable_installments";
CREATE INDEX "payable_installments_companyId_status_dueDate_idx" ON "payable_installments"("companyId", "status", "dueDate");
CREATE UNIQUE INDEX "payable_installments_titleId_installmentNumber_key" ON "payable_installments"("titleId", "installmentNumber");
CREATE TABLE "new_payable_invoice_imports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_payable_invoice_imports" ("accessKey", "approvalNotes", "approvedAt", "approvedBy", "canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "distributionNsu", "documentModel", "entryDate", "fiscalCertificateId", "id", "importType", "invoiceNumber", "issueDate", "operationNature", "parsedSnapshotJson", "series", "status", "supplierId", "totalInvoiceAmount", "totalProductsAmount", "updatedAt", "updatedBy", "xmlContentBlob", "xmlHash") SELECT "accessKey", "approvalNotes", "approvedAt", "approvedBy", "canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "distributionNsu", "documentModel", "entryDate", "fiscalCertificateId", "id", "importType", "invoiceNumber", "issueDate", "operationNature", "parsedSnapshotJson", "series", "status", "supplierId", "totalInvoiceAmount", "totalProductsAmount", "updatedAt", "updatedBy", "xmlContentBlob", "xmlHash" FROM "payable_invoice_imports";
DROP TABLE "payable_invoice_imports";
ALTER TABLE "new_payable_invoice_imports" RENAME TO "payable_invoice_imports";
CREATE INDEX "payable_invoice_imports_companyId_status_issueDate_idx" ON "payable_invoice_imports"("companyId", "status", "issueDate");
CREATE INDEX "payable_invoice_imports_companyId_invoiceNumber_series_idx" ON "payable_invoice_imports"("companyId", "invoiceNumber", "series");
CREATE INDEX "payable_invoice_imports_fiscalCertificateId_distributionNsu_idx" ON "payable_invoice_imports"("fiscalCertificateId", "distributionNsu");
CREATE UNIQUE INDEX "payable_invoice_imports_companyId_branchCode_accessKey_key" ON "payable_invoice_imports"("companyId", "branchCode", "accessKey");
CREATE UNIQUE INDEX "payable_invoice_imports_companyId_branchCode_xmlHash_key" ON "payable_invoice_imports"("companyId", "branchCode", "xmlHash");
CREATE TABLE "new_payable_titles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_payable_titles" ("canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "description", "documentNumber", "id", "issueDate", "sourceDocumentId", "sourceDocumentType", "status", "supplierDocumentSnapshot", "supplierId", "supplierNameSnapshot", "totalAmount", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "description", "documentNumber", "id", "issueDate", "sourceDocumentId", "sourceDocumentType", "status", "supplierDocumentSnapshot", "supplierId", "supplierNameSnapshot", "totalAmount", "updatedAt", "updatedBy" FROM "payable_titles";
DROP TABLE "payable_titles";
ALTER TABLE "new_payable_titles" RENAME TO "payable_titles";
CREATE UNIQUE INDEX "payable_titles_sourceDocumentId_key" ON "payable_titles"("sourceDocumentId");
CREATE INDEX "payable_titles_companyId_status_issueDate_idx" ON "payable_titles"("companyId", "status", "issueDate");
CREATE UNIQUE INDEX "payable_titles_companyId_branchCode_sourceDocumentType_sourceDocumentId_key" ON "payable_titles"("companyId", "branchCode", "sourceDocumentType", "sourceDocumentId");
CREATE TABLE "new_products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "name" TEXT NOT NULL,
    "internalCode" TEXT,
    "sku" TEXT,
    "barcode" TEXT,
    "unitCode" TEXT NOT NULL DEFAULT 'UN',
    "productType" TEXT NOT NULL DEFAULT 'GOODS',
    "tracksInventory" BOOLEAN NOT NULL DEFAULT true,
    "allowFraction" BOOLEAN NOT NULL DEFAULT false,
    "currentStock" REAL NOT NULL DEFAULT 0,
    "minimumStock" REAL NOT NULL DEFAULT 0,
    "purchasePrice" REAL,
    "salePrice" REAL,
    "ncmCode" TEXT,
    "cestCode" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "products_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_products" ("allowFraction", "barcode", "canceledAt", "canceledBy", "cestCode", "companyId", "createdAt", "createdBy", "currentStock", "id", "internalCode", "minimumStock", "name", "ncmCode", "notes", "productType", "purchasePrice", "salePrice", "sku", "status", "tracksInventory", "unitCode", "updatedAt", "updatedBy") SELECT "allowFraction", "barcode", "canceledAt", "canceledBy", "cestCode", "companyId", "createdAt", "createdBy", "currentStock", "id", "internalCode", "minimumStock", "name", "ncmCode", "notes", "productType", "purchasePrice", "salePrice", "sku", "status", "tracksInventory", "unitCode", "updatedAt", "updatedBy" FROM "products";
DROP TABLE "products";
ALTER TABLE "new_products" RENAME TO "products";
CREATE INDEX "products_companyId_status_name_idx" ON "products"("companyId", "status", "name");
CREATE INDEX "products_companyId_productType_tracksInventory_idx" ON "products"("companyId", "productType", "tracksInventory");
CREATE UNIQUE INDEX "products_companyId_branchCode_internalCode_key" ON "products"("companyId", "branchCode", "internalCode");
CREATE UNIQUE INDEX "products_companyId_branchCode_sku_key" ON "products"("companyId", "branchCode", "sku");
CREATE UNIQUE INDEX "products_companyId_branchCode_barcode_key" ON "products"("companyId", "branchCode", "barcode");
CREATE TABLE "new_receivable_batches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "sourceBatchType" TEXT NOT NULL,
    "sourceBatchId" TEXT NOT NULL,
    "referenceDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PROCESSED',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "payloadSnapshot" TEXT,
    "metadataJson" TEXT,
    "skippedItemsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "receivable_batches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_receivable_batches" ("canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "duplicateCount", "errorCount", "id", "itemCount", "metadataJson", "payloadSnapshot", "processedCount", "referenceDate", "skippedItemsJson", "sourceBatchId", "sourceBatchType", "sourceSystem", "sourceTenantId", "status", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "duplicateCount", "errorCount", "id", "itemCount", "metadataJson", "payloadSnapshot", "processedCount", "referenceDate", "skippedItemsJson", "sourceBatchId", "sourceBatchType", "sourceSystem", "sourceTenantId", "status", "updatedAt", "updatedBy" FROM "receivable_batches";
DROP TABLE "receivable_batches";
ALTER TABLE "new_receivable_batches" RENAME TO "receivable_batches";
CREATE INDEX "receivable_batches_companyId_createdAt_idx" ON "receivable_batches"("companyId", "createdAt");
CREATE INDEX "receivable_batches_sourceSystem_sourceTenantId_idx" ON "receivable_batches"("sourceSystem", "sourceTenantId");
CREATE UNIQUE INDEX "receivable_batches_companyId_branchCode_sourceBatchId_key" ON "receivable_batches"("companyId", "branchCode", "sourceBatchId");
CREATE TABLE "new_receivable_installments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "batchId" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "bankAccountLabel" TEXT,
    "bankAssignedAt" DATETIME,
    "bankAssignedBy" TEXT,
    "bankSlipStatus" TEXT,
    "bankSlipMessage" TEXT,
    "bankSlipProvider" TEXT,
    "bankSlipOurNumber" TEXT,
    "bankSlipYourNumber" TEXT,
    "bankSlipDigitableLine" TEXT,
    "bankSlipBarcode" TEXT,
    "bankSlipQrCode" TEXT,
    "bankSlipPdfBase64" TEXT,
    "bankSlipPayloadJson" TEXT,
    "bankSlipResponseJson" TEXT,
    "bankSlipIssuedAt" DATETIME,
    "bankSlipIssuedBy" TEXT,
    "sourceInstallmentKey" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "openAmount" REAL NOT NULL,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "interestRate" REAL,
    "interestGracePeriod" INTEGER,
    "penaltyRate" REAL,
    "penaltyValue" REAL,
    "penaltyGracePeriod" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "settlementMethod" TEXT,
    "settledAt" DATETIME,
    "descriptionSnapshot" TEXT NOT NULL,
    "payerNameSnapshot" TEXT NOT NULL,
    "payerDocumentSnapshot" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "receivable_installments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "receivable_installments_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "receivable_batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "receivable_installments_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "receivable_titles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_receivable_installments" ("amount", "bankAccountId", "bankAccountLabel", "bankAssignedAt", "bankAssignedBy", "bankSlipBarcode", "bankSlipDigitableLine", "bankSlipIssuedAt", "bankSlipIssuedBy", "bankSlipMessage", "bankSlipOurNumber", "bankSlipPayloadJson", "bankSlipPdfBase64", "bankSlipProvider", "bankSlipQrCode", "bankSlipResponseJson", "bankSlipStatus", "bankSlipYourNumber", "batchId", "canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "descriptionSnapshot", "dueDate", "id", "installmentCount", "installmentNumber", "interestGracePeriod", "interestRate", "openAmount", "paidAmount", "payerDocumentSnapshot", "payerNameSnapshot", "penaltyGracePeriod", "penaltyRate", "penaltyValue", "settledAt", "settlementMethod", "sourceInstallmentKey", "status", "titleId", "updatedAt", "updatedBy") SELECT "amount", "bankAccountId", "bankAccountLabel", "bankAssignedAt", "bankAssignedBy", "bankSlipBarcode", "bankSlipDigitableLine", "bankSlipIssuedAt", "bankSlipIssuedBy", "bankSlipMessage", "bankSlipOurNumber", "bankSlipPayloadJson", "bankSlipPdfBase64", "bankSlipProvider", "bankSlipQrCode", "bankSlipResponseJson", "bankSlipStatus", "bankSlipYourNumber", "batchId", "canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "descriptionSnapshot", "dueDate", "id", "installmentCount", "installmentNumber", "interestGracePeriod", "interestRate", "openAmount", "paidAmount", "payerDocumentSnapshot", "payerNameSnapshot", "penaltyGracePeriod", "penaltyRate", "penaltyValue", "settledAt", "settlementMethod", "sourceInstallmentKey", "status", "titleId", "updatedAt", "updatedBy" FROM "receivable_installments";
DROP TABLE "receivable_installments";
ALTER TABLE "new_receivable_installments" RENAME TO "receivable_installments";
CREATE INDEX "receivable_installments_companyId_status_dueDate_idx" ON "receivable_installments"("companyId", "status", "dueDate");
CREATE INDEX "receivable_installments_companyId_bankAccountId_status_idx" ON "receivable_installments"("companyId", "bankAccountId", "status");
CREATE INDEX "receivable_installments_titleId_idx" ON "receivable_installments"("titleId");
CREATE UNIQUE INDEX "receivable_installments_companyId_branchCode_sourceInstallmentKey_key" ON "receivable_installments"("companyId", "branchCode", "sourceInstallmentKey");
CREATE TABLE "new_receivable_titles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "batchId" TEXT NOT NULL,
    "payerPartyId" TEXT,
    "sourceEntityType" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "sourceEntityName" TEXT,
    "classLabel" TEXT,
    "businessKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryCode" TEXT,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "payerNameSnapshot" TEXT NOT NULL,
    "payerDocumentSnapshot" TEXT,
    "payerEmailSnapshot" TEXT,
    "payerPhoneSnapshot" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "receivable_titles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "receivable_titles_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "receivable_batches" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "receivable_titles_payerPartyId_fkey" FOREIGN KEY ("payerPartyId") REFERENCES "parties" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_receivable_titles" ("batchId", "businessKey", "canceledAt", "canceledBy", "categoryCode", "classLabel", "companyId", "createdAt", "createdBy", "description", "id", "payerDocumentSnapshot", "payerEmailSnapshot", "payerNameSnapshot", "payerPartyId", "payerPhoneSnapshot", "sourceEntityId", "sourceEntityName", "sourceEntityType", "totalAmount", "updatedAt", "updatedBy") SELECT "batchId", "businessKey", "canceledAt", "canceledBy", "categoryCode", "classLabel", "companyId", "createdAt", "createdBy", "description", "id", "payerDocumentSnapshot", "payerEmailSnapshot", "payerNameSnapshot", "payerPartyId", "payerPhoneSnapshot", "sourceEntityId", "sourceEntityName", "sourceEntityType", "totalAmount", "updatedAt", "updatedBy" FROM "receivable_titles";
DROP TABLE "receivable_titles";
ALTER TABLE "new_receivable_titles" RENAME TO "receivable_titles";
CREATE INDEX "receivable_titles_companyId_sourceEntityType_sourceEntityId_idx" ON "receivable_titles"("companyId", "sourceEntityType", "sourceEntityId");
CREATE INDEX "receivable_titles_batchId_idx" ON "receivable_titles"("batchId");
CREATE UNIQUE INDEX "receivable_titles_companyId_branchCode_businessKey_key" ON "receivable_titles"("companyId", "branchCode", "businessKey");
CREATE TABLE "new_stock_movements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_stock_movements" ("canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "id", "movementType", "notes", "occurredAt", "previousStock", "productId", "quantity", "resultingStock", "sourceImportId", "sourceImportItemId", "unitCost", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "id", "movementType", "notes", "occurredAt", "previousStock", "productId", "quantity", "resultingStock", "sourceImportId", "sourceImportItemId", "unitCost", "updatedAt", "updatedBy" FROM "stock_movements";
DROP TABLE "stock_movements";
ALTER TABLE "new_stock_movements" RENAME TO "stock_movements";
CREATE INDEX "stock_movements_companyId_occurredAt_idx" ON "stock_movements"("companyId", "occurredAt");
CREATE INDEX "stock_movements_productId_occurredAt_idx" ON "stock_movements"("productId", "occurredAt");
CREATE INDEX "stock_movements_sourceImportId_idx" ON "stock_movements"("sourceImportId");
CREATE TABLE "new_suppliers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_suppliers" ("canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "document", "email", "id", "legalName", "notes", "phone", "stateRegistration", "status", "tradeName", "updatedAt", "updatedBy") SELECT "canceledAt", "canceledBy", "companyId", "createdAt", "createdBy", "document", "email", "id", "legalName", "notes", "phone", "stateRegistration", "status", "tradeName", "updatedAt", "updatedBy" FROM "suppliers";
DROP TABLE "suppliers";
ALTER TABLE "new_suppliers" RENAME TO "suppliers";
CREATE INDEX "suppliers_companyId_status_legalName_idx" ON "suppliers"("companyId", "status", "legalName");
CREATE UNIQUE INDEX "suppliers_companyId_branchCode_document_key" ON "suppliers"("companyId", "branchCode", "document");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "company_branches_companyId_isActive_name_idx" ON "company_branches"("companyId", "isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "company_branches_companyId_branchCode_key" ON "company_branches"("companyId", "branchCode");

