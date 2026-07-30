import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const backendDirectory = resolve(scriptDirectory, "..");
const sqliteSchemaPath = resolve(backendDirectory, "prisma", "schema.prisma");
const postgresqlDirectory = resolve(
  backendDirectory,
  "prisma",
  "postgresql",
);
const postgresqlSchemaPath = resolve(postgresqlDirectory, "schema.prisma");
const migrationDirectory = resolve(
  postgresqlDirectory,
  "migrations",
  "20260724000000_postgresql_baseline",
);
const migrationPath = resolve(migrationDirectory, "migration.sql");
const migrationLockPath = resolve(
  postgresqlDirectory,
  "migrations",
  "migration_lock.toml",
);

const generatedHeader = [
  "// GENERATED FILE. DO NOT EDIT DIRECTLY.",
  "// Source: ../schema.prisma (SQLite is retained only for local development/tests).",
  "// Run: npm run postgresql:schema:sync",
  "",
].join("\n");

function generatePostgresqlSchema() {
  const source = readFileSync(sqliteSchemaPath, "utf8").replace(/\r\n/g, "\n");
  const datasourcePattern =
    /datasource db \{\n(\s*)provider\s*=\s*"sqlite"/;
  if (!datasourcePattern.test(source)) {
    throw new Error(
      "O datasource SQLite esperado não foi encontrado em prisma/schema.prisma.",
    );
  }

  const providerReplaced = source.replace(
    datasourcePattern,
    (_match, indentation) =>
      `datasource db {\n${indentation}provider = "postgresql"`,
  );
  const replaced = providerReplaced
    .split("\n")
    .map((line) =>
      /^\s+\w+\s+DateTime\??(?:\s|$)/.test(line) &&
      !line.includes("@db.Timestamptz")
        ? `${line} @db.Timestamptz(3)`
        : line,
    )
    .join("\n");
  if (replaced.match(/provider\s*=\s*"postgresql"/g)?.length !== 1) {
    throw new Error("A geração alterou uma quantidade inesperada de providers.");
  }

  return `${generatedHeader}${replaced}`;
}

function writeIfChanged(path, content) {
  if (existsSync(path) && readFileSync(path, "utf8") === content) {
    return false;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  return true;
}

function generateBaseline() {
  if (existsSync(migrationPath) && !process.argv.includes("--force-baseline")) {
    throw new Error(
      "A migration baseline já existe. Ela é imutável após o primeiro deploy; " +
        "use uma nova migration para mudanças futuras.",
    );
  }

  const result = spawnSync(
    process.execPath,
    [
      resolve(backendDirectory, "node_modules", "prisma", "build", "index.js"),
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema-datamodel",
      postgresqlSchemaPath,
      "--script",
    ],
    {
      cwd: backendDirectory,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL:
          "postgresql://schema_generator:build-only@127.0.0.1:5432/financeiro?schema=public",
      },
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  if (result.error || result.status !== 0 || !result.stdout.trim()) {
    const details = String(
      result.error?.message || result.stderr || result.stdout || "",
    ).trim();
    throw new Error(
      `Não foi possível gerar a migration PostgreSQL: ${details || "erro desconhecido"}`,
    );
  }

  mkdirSync(migrationDirectory, { recursive: true });
  writeFileSync(migrationPath, result.stdout.replace(/\r\n/g, "\n"), "utf8");
  writeFileSync(migrationLockPath, 'provider = "postgresql"\n', "utf8");
}

const generatedSchema = generatePostgresqlSchema();
if (process.argv.includes("--check")) {
  if (
    !existsSync(postgresqlSchemaPath) ||
    readFileSync(postgresqlSchemaPath, "utf8") !== generatedSchema
  ) {
    throw new Error(
      "prisma/postgresql/schema.prisma está desatualizado. " +
        "Execute npm run postgresql:schema:sync.",
    );
  }
  process.stdout.write("Schema PostgreSQL está sincronizado.\n");
} else {
  const changed = writeIfChanged(postgresqlSchemaPath, generatedSchema);
  process.stdout.write(
    changed
      ? "Schema PostgreSQL atualizado.\n"
      : "Schema PostgreSQL já estava sincronizado.\n",
  );
}

if (
  process.argv.includes("--baseline") ||
  process.argv.includes("--force-baseline")
) {
  generateBaseline();
  process.stdout.write("Migration baseline PostgreSQL gerada.\n");
}
