-- Núcleo próprio da NFS-e Nacional (DPS, serviço, parâmetros municipais e entrega).
CREATE TABLE "nfse_service_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "internalCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cnaeCode" TEXT,
    "nationalTaxCode" TEXT NOT NULL,
    "municipalTaxCode" TEXT,
    "nbsCode" TEXT,
    "serviceCityCode" TEXT NOT NULL,
    "issTaxationCode" TEXT NOT NULL DEFAULT '1',
    "issWithholdingCode" TEXT NOT NULL DEFAULT '1',
    "issRate" REAL,
    "pisCofinsCst" TEXT NOT NULL DEFAULT '00',
    "pisRate" REAL,
    "cofinsRate" REAL,
    "simpleNationalTotalTaxRate" REAL,
    "ibsCbsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ibsCbsCst" TEXT,
    "ibsCbsClassCode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "nfse_service_items_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "nfse_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "certificateId" TEXT NOT NULL,
    "defaultServiceItemId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "environment" TEXT NOT NULL DEFAULT 'HOMOLOGATION',
    "autoIssueOnSale" BOOLEAN NOT NULL DEFAULT false,
    "series" INTEGER NOT NULL DEFAULT 1,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "softwareVersion" TEXT NOT NULL DEFAULT 'MSINFOR FIN 1.0',
    "schemaVersion" TEXT NOT NULL DEFAULT '1.01',
    "simpleNationalOption" INTEGER NOT NULL DEFAULT 3,
    "simpleNationalTaxRegime" INTEGER DEFAULT 1,
    "specialTaxRegime" INTEGER NOT NULL DEFAULT 0,
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
    "lastMunicipalCheckAt" DATETIME,
    "lastMunicipalCheckStatus" TEXT,
    "lastMunicipalCheckMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "nfse_profiles_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "nfse_profiles_certificateId_fkey"
      FOREIGN KEY ("certificateId") REFERENCES "fiscal_certificates" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "nfse_profiles_defaultServiceItemId_fkey"
      FOREIGN KEY ("defaultServiceItemId") REFERENCES "nfse_service_items" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "nfse_documents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "profileId" TEXT NOT NULL,
    "serviceItemId" TEXT,
    "takerPartyId" TEXT NOT NULL,
    "receivableTitleId" TEXT,
    "saleId" TEXT,
    "sourceSystem" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "series" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "dpsId" TEXT NOT NULL,
    "accessKey" TEXT,
    "nationalNfseNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "statusCode" TEXT,
    "statusMessage" TEXT,
    "competenceDate" DATETIME NOT NULL,
    "issuedAt" DATETIME NOT NULL,
    "serviceCityCode" TEXT NOT NULL,
    "grossAmount" REAL NOT NULL,
    "discountAmount" REAL NOT NULL DEFAULT 0,
    "deductionAmount" REAL NOT NULL DEFAULT 0,
    "netAmount" REAL NOT NULL,
    "issuerSnapshotJson" TEXT NOT NULL,
    "takerSnapshotJson" TEXT NOT NULL,
    "serviceSnapshotJson" TEXT NOT NULL,
    "taxSnapshotJson" TEXT NOT NULL,
    "signedDpsXml" TEXT,
    "requestJson" TEXT,
    "responseJson" TEXT,
    "authorizedXml" TEXT,
    "danfseFileName" TEXT,
    "danfsePdfBlob" BLOB,
    "danfseDownloadedAt" DATETIME,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" DATETIME,
    "lastError" TEXT,
    "emailSentAt" DATETIME,
    "emailError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "nfse_documents_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "nfse_documents_profileId_fkey"
      FOREIGN KEY ("profileId") REFERENCES "nfse_profiles" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "nfse_documents_serviceItemId_fkey"
      FOREIGN KEY ("serviceItemId") REFERENCES "nfse_service_items" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "nfse_documents_takerPartyId_fkey"
      FOREIGN KEY ("takerPartyId") REFERENCES "parties" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "nfse_documents_receivableTitleId_fkey"
      FOREIGN KEY ("receivableTitleId") REFERENCES "receivable_titles" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "nfse_documents_saleId_fkey"
      FOREIGN KEY ("saleId") REFERENCES "sales" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "nfse_document_attempts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "nfseDocumentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "operation" TEXT NOT NULL DEFAULT 'ISSUE',
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "statusCode" TEXT,
    "statusMessage" TEXT,
    "requestJson" TEXT,
    "responseJson" TEXT,
    "errorMessage" TEXT,
    "attemptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "nfse_document_attempts_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "nfse_document_attempts_nfseDocumentId_fkey"
      FOREIGN KEY ("nfseDocumentId") REFERENCES "nfse_documents" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "nfse_email_deliveries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "nfseDocumentId" TEXT NOT NULL,
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
    CONSTRAINT "nfse_email_deliveries_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "nfse_email_deliveries_nfseDocumentId_fkey"
      FOREIGN KEY ("nfseDocumentId") REFERENCES "nfse_documents" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "nfse_municipal_parameters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cacheKey" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL,
    "environment" TEXT NOT NULL,
    "municipalityCode" TEXT NOT NULL,
    "nationalTaxCode" TEXT,
    "competence" TEXT,
    "parameterType" TEXT NOT NULL,
    "requestPath" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "responseJson" TEXT,
    "errorMessage" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" DATETIME,
    "canceledBy" TEXT,
    CONSTRAINT "nfse_municipal_parameters_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "companies" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "nfse_profiles_companyId_branchCode_status_autoIssueOnSale_idx"
  ON "nfse_profiles"("companyId", "branchCode", "status", "autoIssueOnSale");
CREATE UNIQUE INDEX "nfse_profiles_companyId_branchCode_environment_series_key"
  ON "nfse_profiles"("companyId", "branchCode", "environment", "series");
CREATE INDEX "nfse_service_items_companyId_branchCode_status_nationalTaxCode_idx"
  ON "nfse_service_items"("companyId", "branchCode", "status", "nationalTaxCode");
CREATE UNIQUE INDEX "nfse_service_items_companyId_branchCode_internalCode_key"
  ON "nfse_service_items"("companyId", "branchCode", "internalCode");
CREATE UNIQUE INDEX "nfse_documents_accessKey_key"
  ON "nfse_documents"("accessKey");
CREATE INDEX "nfse_documents_companyId_branchCode_status_issuedAt_idx"
  ON "nfse_documents"("companyId", "branchCode", "status", "issuedAt");
CREATE INDEX "nfse_documents_companyId_takerPartyId_issuedAt_idx"
  ON "nfse_documents"("companyId", "takerPartyId", "issuedAt");
CREATE INDEX "nfse_documents_receivableTitleId_idx"
  ON "nfse_documents"("receivableTitleId");
CREATE INDEX "nfse_documents_saleId_idx"
  ON "nfse_documents"("saleId");
CREATE UNIQUE INDEX "nfse_documents_companyId_branchCode_environment_series_number_key"
  ON "nfse_documents"("companyId", "branchCode", "environment", "series", "number");
CREATE UNIQUE INDEX "nfse_documents_companyId_branchCode_environment_dpsId_key"
  ON "nfse_documents"("companyId", "branchCode", "environment", "dpsId");
CREATE UNIQUE INDEX "nfse_documents_companyId_branchCode_idempotencyKey_key"
  ON "nfse_documents"("companyId", "branchCode", "idempotencyKey");
CREATE INDEX "nfse_document_attempts_companyId_attemptedAt_idx"
  ON "nfse_document_attempts"("companyId", "attemptedAt");
CREATE UNIQUE INDEX "nfse_document_attempts_nfseDocumentId_attemptNumber_key"
  ON "nfse_document_attempts"("nfseDocumentId", "attemptNumber");
CREATE INDEX "nfse_email_deliveries_companyId_branchCode_recipientEmail_attemptedAt_idx"
  ON "nfse_email_deliveries"("companyId", "branchCode", "recipientEmail", "attemptedAt");
CREATE INDEX "nfse_email_deliveries_nfseDocumentId_status_attemptedAt_idx"
  ON "nfse_email_deliveries"("nfseDocumentId", "status", "attemptedAt");
CREATE UNIQUE INDEX "nfse_municipal_parameters_cacheKey_key"
  ON "nfse_municipal_parameters"("cacheKey");
CREATE INDEX "nfse_municipal_parameters_companyId_branchCode_environment_municipalityCode_fetchedAt_idx"
  ON "nfse_municipal_parameters"("companyId", "branchCode", "environment", "municipalityCode", "fetchedAt");
CREATE UNIQUE INDEX "nfse_municipal_parameters_companyId_branchCode_environment_municipalityCode_nationalTaxCode_competence_parameterType_key"
  ON "nfse_municipal_parameters"("companyId", "branchCode", "environment", "municipalityCode", "nationalTaxCode", "competence", "parameterType");
