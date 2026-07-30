const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.FINANCEIRO_CERTIFICATE_SECRET =
  "test-only-secret-with-at-least-thirty-two-characters";

const {
  decryptSecret,
  decryptStoredBankSecret,
  encryptSecret,
  isVersionedEncryptedSecret,
} = require("../dist/common/secret-crypto.utils.js");
const {
  BanksService,
} = require("../dist/modules/banks/application/banks.service.js");
const {
  BankSecretsMigrationService,
} = require("../dist/modules/banks/application/bank-secrets-migration.service.js");
const {
  FiscalCertificatesService,
} = require("../dist/modules/fiscal-certificates/application/fiscal-certificates.service.js");
const {
  CompaniesService,
} = require("../dist/modules/companies/application/companies.service.js");
const {
  financeContext,
} = require("../dist/common/finance-context.js");
const {
  getAllowedOrigins,
  getBindHost,
  isSwaggerEnabled,
  validateProductionSecurityConfig,
} = require("../dist/common/security-config.js");
const {
  assertPostgresqlRuntimeRoleIsLeastPrivileged,
} = require("../dist/prisma/postgresql-runtime-security.js");

function assertKeysAreAbsent(value, forbiddenKeys) {
  for (const key of forbiddenKeys) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(value, key),
      false,
      `A resposta não pode conter ${key}.`,
    );
  }
}

function listSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    return /\.(?:ts|tsx|js|cjs|mjs)$/.test(entry.name) ? [fullPath] : [];
  });
}

async function run() {
  const legacyCentralBearerHeader = ["x-msinfor", "system-key"].join("-");
  for (const sourceFile of listSourceFiles(path.resolve(process.cwd(), "src"))) {
    assert.equal(
      fs.readFileSync(sourceFile, "utf8").includes(legacyCentralBearerHeader),
      false,
      `${sourceFile} ainda contém o cabeçalho bearer legado da Central.`,
    );
  }

  const originalEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    FINANCEIRO_ALLOWED_ORIGINS: process.env.FINANCEIRO_ALLOWED_ORIGINS,
    FINANCEIRO_INTEGRATION_API_KEY:
      process.env.FINANCEIRO_INTEGRATION_API_KEY,
    FINANCEIRO_HMAC_ESCOLA_SECRET:
      process.env.FINANCEIRO_HMAC_ESCOLA_SECRET,
    FINANCEIRO_HMAC_PROJETO_INICIAL_SECRET:
      process.env.FINANCEIRO_HMAC_PROJETO_INICIAL_SECRET,
    SOURCE_SYSTEM_ESCOLA_HMAC_SECRET:
      process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET,
    SOURCE_SYSTEM_PROJETO_INICIAL_HMAC_SECRET:
      process.env.SOURCE_SYSTEM_PROJETO_INICIAL_HMAC_SECRET,
    FINANCEIRO_BIND_HOST: process.env.FINANCEIRO_BIND_HOST,
    FINANCEIRO_SWAGGER_ENABLED: process.env.FINANCEIRO_SWAGGER_ENABLED,
    DATABASE_URL: process.env.DATABASE_URL,
    FINANCEIRO_DATABASE_RUNTIME_ROLE:
      process.env.FINANCEIRO_DATABASE_RUNTIME_ROLE,
  };
  process.env.NODE_ENV = "production";
  process.env.DATABASE_URL =
    "postgresql://financeiro_runtime:test-only-password@postgres.internal:5432/financeiro?schema=public&sslmode=require&sslaccept=strict&sslrootcert=/run/secrets/postgres_tls_ca.pem&connection_limit=10";
  process.env.FINANCEIRO_DATABASE_RUNTIME_ROLE = "financeiro_runtime";
  delete process.env.FINANCEIRO_ALLOWED_ORIGINS;
  process.env.FINANCEIRO_HMAC_ESCOLA_SECRET =
    "school-test-secret-with-at-least-thirty-two-characters";
  process.env.FINANCEIRO_HMAC_PROJETO_INICIAL_SECRET =
    "initial-project-test-secret-with-at-least-thirty-two-characters";
  process.env.SOURCE_SYSTEM_ESCOLA_HMAC_SECRET =
    "finance-to-school-test-secret-with-at-least-thirty-two";
  process.env.SOURCE_SYSTEM_PROJETO_INICIAL_HMAC_SECRET =
    "finance-to-project-test-secret-with-at-least-thirty-two";
  delete process.env.FINANCEIRO_BIND_HOST;
  delete process.env.FINANCEIRO_SWAGGER_ENABLED;
  assert.doesNotThrow(() => validateProductionSecurityConfig());
  assert.deepEqual(getAllowedOrigins(), []);
  assert.equal(getBindHost(), "127.0.0.1");
  assert.equal(isSwaggerEnabled(), false);
  process.env.DATABASE_URL =
    "postgresql://financeiro_owner:test-only-password@postgres.internal:5432/financeiro?schema=public&sslmode=require&sslaccept=strict&sslrootcert=/run/secrets/postgres_tls_ca.pem&connection_limit=10";
  assert.throws(
    () => validateProductionSecurityConfig(),
    /papel de runtime/,
  );
  process.env.DATABASE_URL =
    "postgresql://financeiro_runtime:test-only-password@postgres.internal:5432/financeiro?schema=public&sslmode=disable&sslaccept=strict&sslrootcert=/run/secrets/postgres_tls_ca.pem&connection_limit=10";
  assert.throws(
    () => validateProductionSecurityConfig(),
    /exigir TLS/,
  );
  process.env.DATABASE_URL =
    "postgresql://financeiro_runtime:test-only-password@postgres.internal:5432/financeiro?schema=public&sslmode=require&connection_limit=10";
  assert.throws(
    () => validateProductionSecurityConfig(),
    /validar estritamente/,
  );
  process.env.DATABASE_URL =
    "postgresql://financeiro_runtime:test-only-password@postgres.internal:5432/financeiro?schema=public&sslmode=require&sslaccept=strict&sslrootcert=/run/secrets/postgres_tls_ca.pem&connection_limit=10";
  process.env.FINANCEIRO_ALLOWED_ORIGINS =
    "https://escola.msinfor.com.br";
  assert.throws(
    () => validateProductionSecurityConfig(),
    /deve permanecer vazio/,
  );
  delete process.env.FINANCEIRO_ALLOWED_ORIGINS;
  process.env.FINANCEIRO_HMAC_PROJETO_INICIAL_SECRET =
    process.env.FINANCEIRO_HMAC_ESCOLA_SECRET;
  assert.throws(
    () => validateProductionSecurityConfig(),
    /credenciais HMAC diferentes/,
  );
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  const safeRuntimeRole = {
    current_user_name: "financeiro_runtime",
    is_superuser: false,
    can_create_database: false,
    can_create_role: false,
    can_replicate: false,
    can_bypass_rls: false,
    owns_database: false,
    can_create_in_database: false,
    owns_current_schema: false,
    can_create_in_schema: false,
    owns_application_objects: false,
    inherits_privileged_role: false,
  };
  await assert.doesNotReject(() =>
    assertPostgresqlRuntimeRoleIsLeastPrivileged({
      $queryRawUnsafe: async () => [safeRuntimeRole],
    }),
  );
  await assert.rejects(
    () =>
      assertPostgresqlRuntimeRoleIsLeastPrivileged({
        $queryRawUnsafe: async () => [
          {
            ...safeRuntimeRole,
            current_user_name: "financeiro_owner",
            owns_database: true,
          },
        ],
      }),
    /credencial proprietária\/migradora é proibida/,
  );

  const encrypted = encryptSecret("segredo-bancario");
  assert.equal(isVersionedEncryptedSecret(encrypted), true);
  assert.equal(encrypted.startsWith("v1:"), true);
  assert.equal(encrypted.includes("segredo-bancario"), false);
  assert.equal(decryptSecret(encrypted), "segredo-bancario");
  assert.equal(
    decryptSecret(encrypted.slice("v1:".length)),
    "segredo-bancario",
    "O formato criptografado legado deve continuar legível.",
  );
  assert.equal(
    decryptStoredBankSecret("texto-legado"),
    "texto-legado",
    "O dado bancário legado deve poder ser migrado sem perda.",
  );
  assert.equal(decryptStoredBankSecret(encrypted), "segredo-bancario");

  const now = new Date();
  const bankRecord = {
    id: "bank-1",
    companyId: "company-1",
    company: {
      name: "Empresa",
      sourceSystem: "ESCOLA",
      sourceTenantId: "tenant-1",
    },
    status: "ACTIVE",
    bankCode: "756",
    bankName: "Banco",
    branchNumber: "1",
    accountNumber: "2",
    billingProvider: "SICOOB",
    billingApiClientId: "client-id-secreto",
    billingApiClientSecret: encrypted,
    billingCertificateBase64: encryptSecret("pfx-base64"),
    billingCertificatePassword: encryptSecret("senha-pfx"),
    bankStatementImports: [],
    bankStatementMovements: [],
    createdAt: now,
    updatedAt: now,
  };
  const banksService = new BanksService({});
  banksService.loadScopedBank = async () => ({
    company: bankRecord.company,
    bank: bankRecord,
  });
  const mappedBank = await banksService.get("bank-1", {
    sourceSystem: "ESCOLA",
    sourceTenantId: "tenant-1",
  });
  assert.equal(mappedBank.hasBillingApiCredentials, true);
  assert.equal(mappedBank.hasBillingCertificate, true);
  assertKeysAreAbsent(mappedBank, [
    "billingApiClientId",
    "billingApiClientSecret",
    "billingCertificateBase64",
    "billingCertificatePassword",
  ]);
  assert.equal(
    JSON.stringify(mappedBank).includes("client-id-secreto"),
    false,
  );

  const certificateRecord = {
    id: "certificate-1",
    companyId: "company-1",
    company: bankRecord.company,
    status: "ACTIVE",
    certificateType: "A1",
    environment: "PRODUCTION",
    purpose: "NFE_DFE",
    isDefault: true,
    aliasName: "Certificado",
    authorStateCode: "35",
    holderName: "Empresa",
    holderDocument: "123",
    pfxEncryptedBase64: encryptSecret("pfx"),
    passwordEncrypted: encryptSecret("senha-fiscal"),
    createdAt: now,
    updatedAt: now,
  };
  const fiscalService = new FiscalCertificatesService({}, {});
  fiscalService.loadScopedCertificate = async () => ({
    company: certificateRecord.company,
    certificate: certificateRecord,
  });
  const mappedCertificate = await fiscalService.get("certificate-1", {
    sourceSystem: "ESCOLA",
    sourceTenantId: "tenant-1",
  });
  assert.equal(mappedCertificate.hasStoredCertificate, true);
  assertKeysAreAbsent(mappedCertificate, [
    "certificatePassword",
    "pfxEncryptedBase64",
    "passwordEncrypted",
  ]);
  assert.equal(
    JSON.stringify(mappedCertificate).includes("senha-fiscal"),
    false,
  );

  const migrationUpdates = [];
  const migration = new BankSecretsMigrationService({
    bankAccount: {
      findMany: async () => [
        {
          id: "bank-legacy",
          billingApiClientSecret: "codigo-legado",
          billingCertificateBase64: "pfx-legado",
          billingCertificatePassword: "senha-legada",
        },
      ],
      update: async (operation) => {
        migrationUpdates.push(operation);
      },
    },
  });
  await migration.onApplicationBootstrap();
  assert.equal(migrationUpdates.length, 1);
  for (const protectedValue of Object.values(migrationUpdates[0].data)) {
    assert.equal(isVersionedEncryptedSecret(protectedValue), true);
  }

  const syncPayload = {
    sourceSystem: "ESCOLA",
    sourceTenantId: "tenant-1",
    sourceBranchCode: 1,
    companyName: "Empresa",
    branchName: "Matriz",
    requestedBy: "user-1",
  };
  const deniedService = new CompaniesService({
    company: {
      findUnique: async () => {
        throw new Error("O banco não deve ser consultado sem o escopo.");
      },
    },
  });
  await assert.rejects(
    () => deniedService.syncSourceIntegrationSettings(syncPayload),
    /SOURCE_SETTINGS_SYNC/,
  );

  const missingMappingCalls = [];
  const missingMappingService = new CompaniesService({
    company: {
      findUnique: async () => {
        missingMappingCalls.push("company.findUnique");
        return null;
      },
    },
  });
  await financeContext.run(
    {
      authenticated: true,
      branchCode: 1,
      sourceSystem: "ESCOLA",
      sourceTenantId: "tenant-1",
      sourceBranchCode: 1,
      sourceUserId: "user-1",
      companyId: "company-1",
      branchId: "branch-1",
      scopes: ["SOURCE_SETTINGS_SYNC"],
    },
    async () => {
      await assert.rejects(
        () => missingMappingService.syncSourceIntegrationSettings(syncPayload),
        /DEVE SER PROVISIONADO/,
      );
    },
  );
  assert.deepEqual(missingMappingCalls, ["company.findUnique"]);

  const syncCalls = [];
  const scopedCompany = { id: "company-1" };
  const scopedBranch = { id: "branch-1", companyId: "company-1", branchCode: 1 };
  const syncService = new CompaniesService({
    company: {
      findUnique: async () => {
        syncCalls.push("company.findUnique");
        return scopedCompany;
      },
      update: async () => {
        syncCalls.push("company.update");
        return scopedCompany;
      },
    },
    companyBranch: {
      findUnique: async () => {
        syncCalls.push("companyBranch.findUnique");
        return scopedBranch;
      },
      update: async () => {
        syncCalls.push("companyBranch.update");
        return scopedBranch;
      },
    },
    screenParameter: {
      upsert: async () => {
        syncCalls.push("screenParameter.upsert");
        return { id: "screen-1" };
      },
    },
    sourceIntegrationConfiguration: {
      upsert: async () => {
        syncCalls.push("sourceIntegrationConfiguration.upsert");
        return { id: "source-config-1" };
      },
    },
    s3Configuration: {
      findUnique: async () => {
        syncCalls.push("s3Configuration.findUnique");
        return null;
      },
    },
    sourceIntegrationAuditEvent: {
      create: async () => {
        syncCalls.push("sourceIntegrationAuditEvent.create");
        return { id: "audit-1" };
      },
    },
  });
  await financeContext.run(
    {
      authenticated: true,
      branchCode: 1,
      sourceSystem: "ESCOLA",
      sourceTenantId: "tenant-1",
      sourceBranchCode: 1,
      sourceUserId: "user-1",
      companyId: "company-1",
      branchId: "branch-1",
      scopes: ["SOURCE_SETTINGS_SYNC"],
    },
    () => syncService.syncSourceIntegrationSettings(syncPayload),
  );
  assert.deepEqual(syncCalls, [
    "company.findUnique",
    "company.update",
    "companyBranch.findUnique",
    "companyBranch.update",
    "screenParameter.upsert",
    "sourceIntegrationConfiguration.upsert",
    "s3Configuration.findUnique",
    "sourceIntegrationAuditEvent.create",
  ]);
}

run()
  .then(() => {
    process.stdout.write("Testes de contenção de segredos concluídos.\n");
  })
  .catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
