const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const backendRoot = path.resolve(process.cwd());

function read(relativePath) {
  return fs.readFileSync(path.resolve(backendRoot, relativePath), "utf8");
}

const schemaCheck = spawnSync(
  process.execPath,
  ["scripts/sync-postgresql-schema.mjs", "--check"],
  {
    cwd: backendRoot,
    encoding: "utf8",
  },
);
assert.equal(
  schemaCheck.status,
  0,
  schemaCheck.stderr || schemaCheck.stdout || "Schema PostgreSQL divergente.",
);

const sqliteSchema = read("prisma/schema.prisma");
const postgresqlSchema = read("prisma/postgresql/schema.prisma");
assert.match(sqliteSchema, /provider\s*=\s*"sqlite"/);
assert.match(postgresqlSchema, /provider\s*=\s*"postgresql"/);
assert.doesNotMatch(postgresqlSchema, /provider\s*=\s*"sqlite"/);

const sqliteDateTimeFields =
  sqliteSchema.match(/^\s+\w+\s+DateTime\??(?:\s|$)/gm) || [];
const postgresqlTimestamptzFields =
  postgresqlSchema.match(/@db\.Timestamptz\(3\)/g) || [];
assert.equal(
  postgresqlTimestamptzFields.length,
  sqliteDateTimeFields.length,
  "Todo DateTime PostgreSQL deve preservar fuso horário.",
);

const baseline = read(
  "prisma/postgresql/migrations/20260724000000_postgresql_baseline/migration.sql",
);
assert.match(baseline, /TIMESTAMPTZ\(3\)/);
assert.match(baseline, /CREATE TABLE "companies"/);

const grantsMigration = read(
  "prisma/postgresql/migrations/20260724001000_runtime_role_grants/migration.sql",
);
assert.match(grantsMigration, /TO financeiro_runtime/);
assert.match(
  grantsMigration,
  /REVOKE CONNECT, TEMPORARY ON DATABASE financeiro_01 FROM PUBLIC/,
);
assert.match(
  grantsMigration,
  /REVOKE ALL ON TABLE "_prisma_migrations" FROM financeiro_runtime/,
);
assert.doesNotMatch(
  grantsMigration,
  /GRANT\s+(?:ALL|CREATE|TRUNCATE).*financeiro_runtime/i,
);

const backendDockerfile = read("Dockerfile");
const migratorDockerfile = read("Dockerfile.migrator");
for (const [name, dockerfile] of [
  ["backend", backendDockerfile],
  ["migrator", migratorDockerfile],
]) {
  assert.match(
    dockerfile,
    /USER 1000[12]:1000[12]/,
    `${name} deve executar sem root.`,
  );
  assert.match(dockerfile, /ENTRYPOINT \["\/usr\/bin\/tini"/);
  assert.doesNotMatch(dockerfile, /COPY\s+\.env/i);
  assert.doesNotMatch(dockerfile, /curl\s+.*\|\s*(?:sh|bash)/i);
}
assert.match(
  backendDockerfile,
  /FINANCEIRO_DATABASE_REQUIRE_LEAST_PRIVILEGE=true/,
);
assert.match(
  backendDockerfile,
  /FINANCEIRO_FISCAL_ARTIFACT_STORAGE_MODE=database/,
);
assert.match(
  backendDockerfile,
  /FINANCEIRO_SICOOB_POWERSHELL_ENABLED=false/,
);
assert.match(backendDockerfile, /\/api\/v1\/health\/ready/);
assert.doesNotMatch(migratorDockerfile, /COPY\s+(?:--\S+\s+)*src\b/i);

const runtimeEntrypoint = read("scripts/runtime-entrypoint.mjs");
assert.match(runtimeEntrypoint, /MIGRATION_DATABASE_URL/);
assert.match(runtimeEntrypoint, /inicialização foi recusada/);

const sicoobPowerShellGate = read("src/common/sicoob-powershell.ts");
assert.match(
  sicoobPowerShellGate,
  /FINANCEIRO_SICOOB_POWERSHELL_ENABLED/,
);
assert.match(sicoobPowerShellGate, /process\.platform !== "win32"/);
for (const servicePath of [
  "src/modules/banks/application/sicoob-dda.service.ts",
  "src/modules/banks/application/sicoob-bank-statement.service.ts",
  "src/modules/receivables/application/sicoob-billing.service.ts",
  "src/modules/sales/application/sicoob-pix.service.ts",
]) {
  const serviceSource = read(servicePath);
  assert.match(serviceSource, /requireSicoobPowerShellExecutable/);
  assert.doesNotMatch(
    serviceSource,
    /execFileAsync\(\s*["']powershell(?:\.exe)?["']/,
    `${servicePath} contorna o bloqueio explícito da integração Sicoob.`,
  );
}

process.stdout.write(
  "Schema PostgreSQL, papéis e imagens Docker validados estaticamente.\n",
);
