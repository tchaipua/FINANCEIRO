-- Identidade fiscal da filial emitente.
ALTER TABLE "company_branches" ADD COLUMN "fiscalCity" TEXT;
ALTER TABLE "company_branches" ADD COLUMN "fiscalCityCode" TEXT;
ALTER TABLE "company_branches" ADD COLUMN "fiscalComplement" TEXT;
ALTER TABLE "company_branches" ADD COLUMN "fiscalCountryCode" TEXT DEFAULT '1058';
ALTER TABLE "company_branches" ADD COLUMN "fiscalCountryName" TEXT DEFAULT 'BRASIL';
ALTER TABLE "company_branches" ADD COLUMN "fiscalDocument" TEXT;
ALTER TABLE "company_branches" ADD COLUMN "fiscalEmail" TEXT;
ALTER TABLE "company_branches" ADD COLUMN "fiscalLegalName" TEXT;
ALTER TABLE "company_branches" ADD COLUMN "fiscalNeighborhood" TEXT;
ALTER TABLE "company_branches" ADD COLUMN "fiscalNumber" TEXT;
ALTER TABLE "company_branches" ADD COLUMN "fiscalPhone" TEXT;
ALTER TABLE "company_branches" ADD COLUMN "fiscalPostalCode" TEXT;
ALTER TABLE "company_branches" ADD COLUMN "fiscalState" TEXT;
ALTER TABLE "company_branches" ADD COLUMN "fiscalStateCode" TEXT;
ALTER TABLE "company_branches" ADD COLUMN "fiscalStreet" TEXT;
ALTER TABLE "company_branches" ADD COLUMN "fiscalTradeName" TEXT;
ALTER TABLE "company_branches" ADD COLUMN "municipalRegistration" TEXT;
ALTER TABLE "company_branches" ADD COLUMN "stateRegistration" TEXT;
ALTER TABLE "company_branches" ADD COLUMN "taxRegimeCode" TEXT;

-- Endereço estruturado e situação fiscal do destinatário.
ALTER TABLE "parties" ADD COLUMN "addressComplement" TEXT;
ALTER TABLE "parties" ADD COLUMN "addressNumber" TEXT;
ALTER TABLE "parties" ADD COLUMN "cityCode" TEXT;
ALTER TABLE "parties" ADD COLUMN "countryCode" TEXT DEFAULT '1058';
ALTER TABLE "parties" ADD COLUMN "countryName" TEXT DEFAULT 'BRASIL';
ALTER TABLE "parties" ADD COLUMN "municipalRegistration" TEXT;
ALTER TABLE "parties" ADD COLUMN "stateRegistration" TEXT;
ALTER TABLE "parties" ADD COLUMN "stateRegistrationIndicator" TEXT DEFAULT '9';
ALTER TABLE "parties" ADD COLUMN "street" TEXT;

-- Classificação fiscal do produto.
ALTER TABLE "products" ADD COLUMN "approximateTaxRate" REAL;
ALTER TABLE "products" ADD COLUMN "cofinsCstCode" TEXT;
ALTER TABLE "products" ADD COLUMN "cofinsRate" REAL;
ALTER TABLE "products" ADD COLUMN "defaultCfopCode" TEXT;
ALTER TABLE "products" ADD COLUMN "exTipiCode" TEXT;
ALTER TABLE "products" ADD COLUMN "fiscalBenefitCode" TEXT;
ALTER TABLE "products" ADD COLUMN "fiscalDescription" TEXT;
ALTER TABLE "products" ADD COLUMN "fiscalNotes" TEXT;
ALTER TABLE "products" ADD COLUMN "fiscalOriginCode" TEXT;
ALTER TABLE "products" ADD COLUMN "gtinCode" TEXT;
ALTER TABLE "products" ADD COLUMN "ibsCbsClassCode" TEXT;
ALTER TABLE "products" ADD COLUMN "ibsCbsCstCode" TEXT;
ALTER TABLE "products" ADD COLUMN "icmsCsosnCode" TEXT;
ALTER TABLE "products" ADD COLUMN "icmsCstCode" TEXT;
ALTER TABLE "products" ADD COLUMN "icmsRate" REAL;
ALTER TABLE "products" ADD COLUMN "ipiCstCode" TEXT;
ALTER TABLE "products" ADD COLUMN "ipiFrameworkCode" TEXT;
ALTER TABLE "products" ADD COLUMN "ipiRate" REAL;
ALTER TABLE "products" ADD COLUMN "pisCstCode" TEXT;
ALTER TABLE "products" ADD COLUMN "pisRate" REAL;
ALTER TABLE "products" ADD COLUMN "taxableConversionFactor" REAL NOT NULL DEFAULT 1;
ALTER TABLE "products" ADD COLUMN "taxableGtinCode" TEXT;
ALTER TABLE "products" ADD COLUMN "taxableUnitCode" TEXT;

CREATE TABLE "fiscal_operation_natures" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "documentModel" TEXT NOT NULL DEFAULT '55',
    "operationType" TEXT NOT NULL DEFAULT 'OUTBOUND',
    "destinationType" TEXT NOT NULL DEFAULT 'INTERNAL',
    "purposeCode" TEXT NOT NULL DEFAULT '1',
    "cfopCode" TEXT NOT NULL,
    "finalConsumer" BOOLEAN NOT NULL DEFAULT true,
    "presenceIndicator" TEXT NOT NULL DEFAULT '1',
    "intermediaryIndicator" TEXT,
    "freightMode" TEXT NOT NULL DEFAULT '9',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "additionalInformation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "fiscal_operation_natures_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "nfe_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "certificateId" TEXT NOT NULL,
    "defaultOperationNatureId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "environment" TEXT NOT NULL DEFAULT 'HOMOLOGATION',
    "autoIssueOnSale" BOOLEAN NOT NULL DEFAULT false,
    "series" INTEGER NOT NULL DEFAULT 1,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "emissionType" TEXT NOT NULL DEFAULT 'NORMAL',
    "danfeLayout" TEXT NOT NULL DEFAULT 'PORTRAIT',
    "softwareVersion" TEXT NOT NULL DEFAULT 'MSINFOR FIN 1.0',
    "schemaVersion" TEXT NOT NULL DEFAULT 'PL_010E_V1.02+PL_010D_V1.03',
    "cbenefCatalogVersion" TEXT NOT NULL DEFAULT '20260626',
    "sendEmailToRecipient" BOOLEAN NOT NULL DEFAULT false,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "smtpAuthenticate" BOOLEAN NOT NULL DEFAULT true,
    "smtpUsername" TEXT,
    "smtpPasswordEncrypted" TEXT,
    "smtpFromEmail" TEXT,
    "smtpFromName" TEXT,
    "smtpTimeoutSeconds" INTEGER NOT NULL DEFAULT 60,
    "homologationEmailRecipient" TEXT,
    "additionalInformation" TEXT,
    "technicalResponsibleCnpj" TEXT,
    "technicalResponsibleName" TEXT,
    "technicalResponsibleEmail" TEXT,
    "technicalResponsiblePhone" TEXT,
    "csrtId" TEXT,
    "csrtHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "nfe_profiles_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "nfe_profiles_certificateId_fkey"
      FOREIGN KEY ("certificateId") REFERENCES "fiscal_certificates" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "nfe_profiles_defaultOperationNatureId_fkey"
      FOREIGN KEY ("defaultOperationNatureId") REFERENCES "fiscal_operation_natures" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "fiscal_tax_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "operationNatureId" TEXT NOT NULL,
    "productId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "originCode" TEXT NOT NULL DEFAULT '0',
    "icmsCsosnCode" TEXT,
    "icmsCstCode" TEXT,
    "icmsBaseMode" TEXT,
    "icmsRate" REAL NOT NULL DEFAULT 0,
    "icmsBaseReductionRate" REAL NOT NULL DEFAULT 0,
    "icmsStRate" REAL NOT NULL DEFAULT 0,
    "fcpRate" REAL NOT NULL DEFAULT 0,
    "difalDestinationRate" REAL NOT NULL DEFAULT 0,
    "difalInterstateRate" REAL NOT NULL DEFAULT 0,
    "fiscalBenefitCode" TEXT,
    "fiscalBenefitRequired" BOOLEAN NOT NULL DEFAULT false,
    "fiscalBenefitLegalBasis" TEXT,
    "pisCstCode" TEXT NOT NULL DEFAULT '49',
    "pisRate" REAL NOT NULL DEFAULT 0,
    "cofinsCstCode" TEXT NOT NULL DEFAULT '49',
    "cofinsRate" REAL NOT NULL DEFAULT 0,
    "ipiCstCode" TEXT,
    "ipiFrameworkCode" TEXT,
    "ipiRate" REAL NOT NULL DEFAULT 0,
    "ibsCbsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ibsCbsCstCode" TEXT,
    "ibsCbsClassCode" TEXT,
    "ibsStateRate" REAL NOT NULL DEFAULT 0,
    "ibsMunicipalRate" REAL NOT NULL DEFAULT 0,
    "cbsRate" REAL NOT NULL DEFAULT 0,
    "selectiveTaxCode" TEXT,
    "selectiveTaxRate" REAL NOT NULL DEFAULT 0,
    "validFrom" DATETIME,
    "validTo" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "fiscal_tax_rules_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fiscal_tax_rules_operationNatureId_fkey"
      FOREIGN KEY ("operationNatureId") REFERENCES "fiscal_operation_natures" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fiscal_tax_rules_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "products" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "fiscal_benefit_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "stateCode" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "catalogVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT NOT NULL,
    "legalBasis" TEXT,
    "observations" TEXT,
    "simpleNationalEligible" BOOLEAN NOT NULL DEFAULT false,
    "cstCodesJson" TEXT,
    "validFrom" DATETIME,
    "validTo" DATETIME,
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "fiscal_benefit_codes_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

-- O perfil NFC-e permanece compatível; a mesma tabela passa a aceitar perfil NF-e.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_fiscal_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "saleId" TEXT NOT NULL,
    "profileId" TEXT,
    "nfeProfileId" TEXT,
    "operationNatureId" TEXT,
    "recipientPartyId" TEXT,
    "certificateId" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '65',
    "environment" TEXT NOT NULL,
    "series" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "randomCode" TEXT,
    "accessKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "statusCode" TEXT,
    "statusMessage" TEXT,
    "protocol" TEXT,
    "receivedAt" DATETIME,
    "issuedAt" DATETIME NOT NULL,
    "qrCodeUrl" TEXT,
    "operationNatureSnapshot" TEXT,
    "issuerSnapshotJson" TEXT,
    "recipientSnapshotJson" TEXT,
    "totalsSnapshotJson" TEXT,
    "paymentSnapshotJson" TEXT,
    "schemaVersion" TEXT,
    "danfeFileName" TEXT,
    "danfePdfBlob" BLOB,
    "danfeGeneratedAt" DATETIME,
    "signedXml" TEXT,
    "responseXml" TEXT,
    "processedXml" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "fiscal_documents_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fiscal_documents_saleId_fkey"
      FOREIGN KEY ("saleId") REFERENCES "sales" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fiscal_documents_profileId_fkey"
      FOREIGN KEY ("profileId") REFERENCES "nfce_profiles" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fiscal_documents_nfeProfileId_fkey"
      FOREIGN KEY ("nfeProfileId") REFERENCES "nfe_profiles" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fiscal_documents_operationNatureId_fkey"
      FOREIGN KEY ("operationNatureId") REFERENCES "fiscal_operation_natures" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fiscal_documents_recipientPartyId_fkey"
      FOREIGN KEY ("recipientPartyId") REFERENCES "parties" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "fiscal_documents_certificateId_fkey"
      FOREIGN KEY ("certificateId") REFERENCES "fiscal_certificates" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_fiscal_documents" (
    "accessKey", "attemptCount", "branchCode", "canceledAt", "canceledBy",
    "certificateId", "companyId", "createdAt", "createdBy", "environment",
    "id", "issuedAt", "lastAttemptAt", "lastError", "model", "number",
    "processedXml", "profileId", "protocol", "qrCodeUrl", "randomCode",
    "receivedAt", "responseXml", "saleId", "series", "signedXml", "status",
    "statusCode", "statusMessage", "updatedAt", "updatedBy"
)
SELECT
    "accessKey", "attemptCount", "branchCode", "canceledAt", "canceledBy",
    "certificateId", "companyId", "createdAt", "createdBy", "environment",
    "id", "issuedAt", "lastAttemptAt", "lastError", "model", "number",
    "processedXml", "profileId", "protocol", "qrCodeUrl", "randomCode",
    "receivedAt", "responseXml", "saleId", "series", "signedXml", "status",
    "statusCode", "statusMessage", "updatedAt", "updatedBy"
FROM "fiscal_documents";

DROP TABLE "fiscal_documents";
ALTER TABLE "new_fiscal_documents" RENAME TO "fiscal_documents";

CREATE UNIQUE INDEX "fiscal_documents_saleId_key"
  ON "fiscal_documents"("saleId");
CREATE UNIQUE INDEX "fiscal_documents_accessKey_key"
  ON "fiscal_documents"("accessKey");
CREATE INDEX "fiscal_documents_companyId_branchCode_status_issuedAt_idx"
  ON "fiscal_documents"("companyId", "branchCode", "status", "issuedAt");
CREATE UNIQUE INDEX "fiscal_documents_companyId_branchCode_model_series_number_key"
  ON "fiscal_documents"("companyId", "branchCode", "model", "series", "number");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE TABLE "fiscal_document_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "fiscalDocumentId" TEXT NOT NULL,
    "productId" TEXT,
    "lineNumber" INTEGER NOT NULL,
    "productCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ncmCode" TEXT NOT NULL,
    "cestCode" TEXT,
    "cfopCode" TEXT NOT NULL,
    "unitCode" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unitPrice" REAL NOT NULL,
    "grossAmount" REAL NOT NULL,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "totalAmount" REAL NOT NULL,
    "originCode" TEXT NOT NULL,
    "icmsCode" TEXT NOT NULL,
    "pisCstCode" TEXT NOT NULL,
    "cofinsCstCode" TEXT NOT NULL,
    "fiscalBenefitCode" TEXT,
    "taxDetailsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "fiscal_document_items_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fiscal_document_items_fiscalDocumentId_fkey"
      FOREIGN KEY ("fiscalDocumentId") REFERENCES "fiscal_documents" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fiscal_document_items_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "products" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "fiscal_document_installments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "fiscalDocumentId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "fiscal_document_installments_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fiscal_document_installments_fiscalDocumentId_fkey"
      FOREIGN KEY ("fiscalDocumentId") REFERENCES "fiscal_documents" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "fiscal_document_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "fiscalDocumentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "statusCode" TEXT,
    "statusMessage" TEXT,
    "protocol" TEXT,
    "eventAt" DATETIME NOT NULL,
    "justification" TEXT,
    "correctionText" TEXT,
    "signedXml" TEXT,
    "responseXml" TEXT,
    "processedXml" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "fiscal_document_events_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fiscal_document_events_fiscalDocumentId_fkey"
      FOREIGN KEY ("fiscalDocumentId") REFERENCES "fiscal_documents" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "fiscal_document_email_deliveries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "fiscalDocumentId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "messageId" TEXT,
    "attemptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    "errorMessage" TEXT,
    "attachmentsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "fiscal_document_email_deliveries_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fiscal_document_email_deliveries_fiscalDocumentId_fkey"
      FOREIGN KEY ("fiscalDocumentId") REFERENCES "fiscal_documents" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "fiscal_number_inutilizations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "nfeProfileId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '55',
    "series" INTEGER NOT NULL,
    "startNumber" INTEGER NOT NULL,
    "endNumber" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "statusCode" TEXT,
    "statusMessage" TEXT,
    "protocol" TEXT,
    "justification" TEXT NOT NULL,
    "signedXml" TEXT,
    "responseXml" TEXT,
    "processedXml" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "fiscal_number_inutilizations_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fiscal_number_inutilizations_nfeProfileId_fkey"
      FOREIGN KEY ("nfeProfileId") REFERENCES "nfe_profiles" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "fiscal_audit_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "metadataJson" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    CONSTRAINT "fiscal_audit_events_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "nfe_profiles_companyId_branchCode_status_autoIssueOnSale_idx"
  ON "nfe_profiles"("companyId", "branchCode", "status", "autoIssueOnSale");
CREATE UNIQUE INDEX "nfe_profiles_companyId_branchCode_environment_series_key"
  ON "nfe_profiles"("companyId", "branchCode", "environment", "series");
CREATE INDEX "fiscal_operation_natures_companyId_branchCode_status_documentModel_idx"
  ON "fiscal_operation_natures"("companyId", "branchCode", "status", "documentModel");
CREATE UNIQUE INDEX "fiscal_operation_natures_companyId_branchCode_code_key"
  ON "fiscal_operation_natures"("companyId", "branchCode", "code");
CREATE INDEX "fiscal_tax_rules_companyId_branchCode_operationNatureId_status_priority_idx"
  ON "fiscal_tax_rules"("companyId", "branchCode", "operationNatureId", "status", "priority");
CREATE INDEX "fiscal_tax_rules_companyId_branchCode_productId_idx"
  ON "fiscal_tax_rules"("companyId", "branchCode", "productId");
CREATE INDEX "fiscal_benefit_codes_companyId_branchCode_stateCode_status_code_idx"
  ON "fiscal_benefit_codes"("companyId", "branchCode", "stateCode", "status", "code");
CREATE UNIQUE INDEX "fiscal_benefit_codes_companyId_branchCode_stateCode_code_catalogVersion_key"
  ON "fiscal_benefit_codes"("companyId", "branchCode", "stateCode", "code", "catalogVersion");
CREATE INDEX "fiscal_document_items_companyId_fiscalDocumentId_idx"
  ON "fiscal_document_items"("companyId", "fiscalDocumentId");
CREATE UNIQUE INDEX "fiscal_document_items_fiscalDocumentId_lineNumber_key"
  ON "fiscal_document_items"("fiscalDocumentId", "lineNumber");
CREATE INDEX "fiscal_document_installments_companyId_dueDate_idx"
  ON "fiscal_document_installments"("companyId", "dueDate");
CREATE UNIQUE INDEX "fiscal_document_installments_fiscalDocumentId_installmentNumber_key"
  ON "fiscal_document_installments"("fiscalDocumentId", "installmentNumber");
CREATE INDEX "fiscal_document_events_companyId_branchCode_eventType_eventAt_idx"
  ON "fiscal_document_events"("companyId", "branchCode", "eventType", "eventAt");
CREATE UNIQUE INDEX "fiscal_document_events_fiscalDocumentId_eventType_sequence_key"
  ON "fiscal_document_events"("fiscalDocumentId", "eventType", "sequence");
CREATE INDEX "fiscal_document_email_deliveries_companyId_branchCode_recipientEmail_attemptedAt_idx"
  ON "fiscal_document_email_deliveries"("companyId", "branchCode", "recipientEmail", "attemptedAt");
CREATE INDEX "fiscal_document_email_deliveries_fiscalDocumentId_status_attemptedAt_idx"
  ON "fiscal_document_email_deliveries"("fiscalDocumentId", "status", "attemptedAt");
CREATE INDEX "fiscal_number_inutilizations_companyId_branchCode_status_createdAt_idx"
  ON "fiscal_number_inutilizations"("companyId", "branchCode", "status", "createdAt");
CREATE UNIQUE INDEX "fiscal_number_inutilizations_companyId_branchCode_environment_model_series_year_startNumber_endNumber_key"
  ON "fiscal_number_inutilizations"(
    "companyId", "branchCode", "environment", "model", "series",
    "year", "startNumber", "endNumber"
  );
CREATE INDEX "fiscal_audit_events_companyId_branchCode_entityType_entityId_occurredAt_idx"
  ON "fiscal_audit_events"("companyId", "branchCode", "entityType", "entityId", "occurredAt");
