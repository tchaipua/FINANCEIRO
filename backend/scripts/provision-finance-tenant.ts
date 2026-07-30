import { PrismaClient } from "@prisma/client";
import { readFileSync, statSync } from "node:fs";
import { isAbsolute, normalize } from "node:path";

const ALLOWED_SOURCE_SYSTEMS = new Set(["ESCOLA", "PROJETO_INICIAL"]);
const PROVISIONING_ACTOR = "FINANCEIRO_CONTROL_PLANE";

type ProvisioningArguments = {
  system: "ESCOLA" | "PROJETO_INICIAL";
  tenant: string;
  branch: number;
  companyName: string;
  branchName: string;
  companyDocument?: string;
};

function fail(message: string): never {
  throw new Error(message);
}

function loadProvisioningDatabaseUrl() {
  if (
    process.env.MIGRATION_DATABASE_URL ||
    process.env.MIGRATION_DATABASE_URL_FILE
  ) {
    fail("A credencial owner/migradora é proibida no provisionador.");
  }

  const inlineUrl = String(process.env.DATABASE_URL || "").trim();
  const filePath = String(process.env.DATABASE_URL_FILE || "").trim();
  if (inlineUrl && filePath) {
    fail("Configure somente DATABASE_URL ou DATABASE_URL_FILE.");
  }

  let databaseUrl = inlineUrl;
  if (filePath) {
    if (!isAbsolute(filePath)) {
      fail("DATABASE_URL_FILE deve usar um caminho absoluto.");
    }
    const normalizedPath = normalize(filePath);
    if (
      process.env.NODE_ENV === "production" &&
      !normalizedPath.startsWith("/run/secrets/")
    ) {
      fail("DATABASE_URL_FILE deve apontar para /run/secrets em produção.");
    }
    const metadata = statSync(normalizedPath);
    if (!metadata.isFile() || metadata.size < 1 || metadata.size > 16 * 1024) {
      fail("DATABASE_URL_FILE não aponta para um secret file válido.");
    }
    databaseUrl = readFileSync(normalizedPath, "utf8").replace(/\r?\n$/, "");
  }
  if (!databaseUrl || /[\r\n\u0000]/.test(databaseUrl)) {
    fail("A conexão do banco de provisionamento é obrigatória.");
  }

  if (process.env.NODE_ENV === "production") {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(databaseUrl);
    } catch {
      fail("A conexão PostgreSQL do provisionador é inválida.");
    }
    const expectedRole = String(
      process.env.FINANCEIRO_DATABASE_PROVISIONER_ROLE ||
        "financeiro_provisioner",
    ).trim();
    if (
      !["postgres:", "postgresql:"].includes(parsedUrl.protocol) ||
      decodeURIComponent(parsedUrl.username) !== expectedRole
    ) {
      fail(
        "O provisionador deve usar exclusivamente o papel PostgreSQL de provisionamento.",
      );
    }
  }

  process.env.DATABASE_URL = databaseUrl;
  delete process.env.DATABASE_URL_FILE;
}

function readArguments(argv: readonly string[]): ProvisioningArguments {
  const values = new Map<string, string>();
  for (const argument of argv) {
    const separatorIndex = argument.indexOf("=");
    if (!argument.startsWith("--") || separatorIndex < 3) {
      fail(`Argumento inválido: ${argument}`);
    }
    const key = argument.slice(2, separatorIndex);
    const value = argument.slice(separatorIndex + 1).trim();
    if (values.has(key)) {
      fail(`Argumento repetido: --${key}`);
    }
    values.set(key, value);
  }

  const allowedArguments = new Set([
    "system",
    "tenant",
    "branch",
    "company-name",
    "branch-name",
    "company-document",
  ]);
  for (const key of values.keys()) {
    if (!allowedArguments.has(key)) {
      fail(`Argumento não reconhecido: --${key}`);
    }
  }

  const system = String(values.get("system") || "")
    .trim()
    .toUpperCase();
  if (!ALLOWED_SOURCE_SYSTEMS.has(system)) {
    fail("--system deve ser ESCOLA ou PROJETO_INICIAL.");
  }

  const tenant = String(values.get("tenant") || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._:-]{0,127}$/.test(tenant)) {
    fail(
      "--tenant deve ter até 128 caracteres e usar somente letras, números, ponto, hífen, sublinhado ou dois-pontos.",
    );
  }

  const branchText = String(values.get("branch") || "").trim();
  const branch = Number(branchText);
  if (!/^[1-9][0-9]*$/.test(branchText) || !Number.isSafeInteger(branch)) {
    fail("--branch deve ser um número inteiro positivo.");
  }

  const companyName = String(values.get("company-name") || "").trim();
  if (!companyName || companyName.length > 160) {
    fail("--company-name é obrigatório e deve ter até 160 caracteres.");
  }

  const branchName =
    String(values.get("branch-name") || "").trim() ||
    (branch === 1 ? "Matriz" : `Filial ${branch}`);
  if (branchName.length > 160) {
    fail("--branch-name deve ter até 160 caracteres.");
  }

  const companyDocument =
    String(values.get("company-document") || "").replace(/\D/g, "") ||
    undefined;
  if (companyDocument && ![11, 14].includes(companyDocument.length)) {
    fail("--company-document deve ser um CPF ou CNPJ válido em tamanho.");
  }

  return {
    system: system as ProvisioningArguments["system"],
    tenant,
    branch,
    companyName,
    branchName,
    companyDocument,
  };
}

async function provision() {
  loadProvisioningDatabaseUrl();
  const input = readArguments(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const mapping = await prisma.$transaction(async (transaction) => {
      let company = await transaction.company.findUnique({
        where: {
          sourceSystem_sourceTenantId: {
            sourceSystem: input.system,
            sourceTenantId: input.tenant,
          },
        },
      });

      if (company && (company.status !== "ACTIVE" || company.canceledAt)) {
        fail(
          "O vínculo de empresa já existe, mas está inativo ou cancelado. A reativação exige revisão administrativa explícita.",
        );
      }

      if (!company) {
        company = await transaction.company.create({
          data: {
            sourceSystem: input.system,
            sourceTenantId: input.tenant,
            name: input.companyName,
            document: input.companyDocument,
            status: "ACTIVE",
            createdBy: PROVISIONING_ACTOR,
            updatedBy: PROVISIONING_ACTOR,
          },
        });
      } else {
        if (company.name !== input.companyName) {
          fail(
            "O tenant já está vinculado a outra razão de exibição. O script não altera vínculos existentes.",
          );
        }
        if (
          input.companyDocument &&
          company.document &&
          company.document !== input.companyDocument
        ) {
          fail(
            "O tenant já está vinculado a outro documento. O script não altera vínculos existentes.",
          );
        }
      }

      let branch = await transaction.companyBranch.findUnique({
        where: {
          companyId_branchCode: {
            companyId: company.id,
            branchCode: input.branch,
          },
        },
      });

      if (branch && (!branch.isActive || branch.canceledAt)) {
        fail(
          "O vínculo de filial já existe, mas está inativo ou cancelado. A reativação exige revisão administrativa explícita.",
        );
      }

      if (!branch) {
        branch = await transaction.companyBranch.create({
          data: {
            companyId: company.id,
            branchCode: input.branch,
            name: input.branchName,
            isActive: true,
            isDefault: input.branch === 1,
            createdBy: PROVISIONING_ACTOR,
            updatedBy: PROVISIONING_ACTOR,
          },
        });
      } else if (branch.name !== input.branchName) {
        fail(
          "O código da filial já está vinculado a outro nome. O script não altera vínculos existentes.",
        );
      }

      return {
        sourceSystem: company.sourceSystem,
        sourceTenantId: company.sourceTenantId,
        companyId: company.id,
        branchCode: branch.branchCode,
        branchId: branch.id,
        status: company.status,
        branchActive: branch.isActive,
      };
    });

    process.stdout.write(
      `${JSON.stringify({ provisioned: true, mapping }, null, 2)}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

provision().catch((error) => {
  process.stderr.write(
    `Provisionamento recusado: ${error instanceof Error ? error.message : "erro desconhecido"}\n`,
  );
  process.exitCode = 1;
});
