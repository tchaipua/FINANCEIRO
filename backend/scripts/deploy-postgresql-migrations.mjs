import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

function migrationUrl() {
  const inlineValue = String(
    process.env.MIGRATION_DATABASE_URL || "",
  ).trim();
  const filePath = String(
    process.env.MIGRATION_DATABASE_URL_FILE || "",
  ).trim();
  if (inlineValue && filePath) {
    throw new Error(
      "Configure somente MIGRATION_DATABASE_URL ou MIGRATION_DATABASE_URL_FILE.",
    );
  }

  let value = inlineValue;
  if (filePath) {
    if (!isAbsolute(filePath)) {
      throw new Error(
        "MIGRATION_DATABASE_URL_FILE deve apontar para um caminho absoluto.",
      );
    }
    const metadata = statSync(filePath);
    if (!metadata.isFile() || metadata.size < 1 || metadata.size > 16 * 1024) {
      throw new Error(
        "MIGRATION_DATABASE_URL_FILE não aponta para um secret file válido.",
      );
    }
    value = readFileSync(filePath, "utf8").replace(/\r?\n$/, "");
  }
  if (!value) {
    throw new Error(
      "MIGRATION_DATABASE_URL ou MIGRATION_DATABASE_URL_FILE é obrigatória no contêiner migrador.",
    );
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("MIGRATION_DATABASE_URL não é uma URL válida.");
  }

  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.username ||
    !parsed.password ||
    !parsed.hostname ||
    !parsed.pathname ||
    parsed.pathname === "/"
  ) {
    throw new Error(
      "MIGRATION_DATABASE_URL deve ser uma URL PostgreSQL completa, com usuário, senha, host e banco.",
    );
  }

  if (parsed.username === "financeiro_runtime") {
    throw new Error(
      "O migrador não pode usar a credencial financeiro_runtime.",
    );
  }

  return value;
}

const childEnvironment = {
  ...process.env,
  DATABASE_URL: migrationUrl(),
  PRISMA_HIDE_UPDATE_MESSAGE: "1",
  CHECKPOINT_DISABLE: "1",
};
delete childEnvironment.MIGRATION_DATABASE_URL;
delete childEnvironment.MIGRATION_DATABASE_URL_FILE;

const result = spawnSync(
  process.execPath,
  [
    resolve(process.cwd(), "node_modules", "prisma", "build", "index.js"),
    "migrate",
    "deploy",
    "--schema",
    "prisma/postgresql/schema.prisma",
  ],
  {
    cwd: process.cwd(),
    env: childEnvironment,
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error(
    `O deploy das migrations PostgreSQL falhou com código ${result.status}.`,
  );
}
