import { BadRequestException } from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import { renderPrintTemplate } from "./print-template.renderer";

export const PRINT_REPORT_PACKAGE_FORMAT = "MSINFOR_REPORT_PACKAGE";
export const PRINT_REPORT_PACKAGE_SCHEMA_VERSION = 1;

const DOCUMENT_TYPES = new Set([
  "SALE_RECEIPT",
  "INSTALLMENT_PAYMENT_RECEIPT",
  "PRODUCT_LABEL",
  "CUSTOM",
]);
const MEDIA_TYPES = new Set(["RECEIPT", "LABEL"]);
const PACKAGE_MAX_BYTES = 2 * 1024 * 1024;
const FORBIDDEN_SCOPE_FIELDS = new Set([
  "companyid",
  "tenantid",
  "sourcetenantid",
  "sourcebranchcode",
  "branchcode",
  "apikey",
  "credential",
  "credentials",
]);

type JsonRecord = Record<string, any>;

export type PrintReportPackage = {
  format: typeof PRINT_REPORT_PACKAGE_FORMAT;
  schemaVersion: typeof PRINT_REPORT_PACKAGE_SCHEMA_VERSION;
  packageId: string;
  exportedAt: string;
  report: {
    code: string;
    name: string;
    description: string | null;
    documentType: string;
    mediaType: string;
    layout: JsonRecord;
    sampleData: JsonRecord;
    variables: string[];
  };
  compatibility: {
    rendererSchemaVersion: number;
    minColumns: number;
    maxColumns: number;
  };
  source: {
    createdWith: string;
    templateVersion: number | null;
    referenceImageName: string | null;
    referenceImageSha256: string | null;
  };
  integrity: {
    algorithm: "SHA-256";
    contentHash: string;
  };
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeUpper(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;

  return Object.keys(value)
    .sort()
    .reduce<JsonRecord>((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
}

export function stablePrintPackageJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

function packageHashPayload(pkg: Omit<PrintReportPackage, "integrity">) {
  return {
    report: pkg.report,
    compatibility: pkg.compatibility,
    source: pkg.source,
  };
}

export function calculatePrintPackageHash(
  pkg: Omit<PrintReportPackage, "integrity">,
) {
  return createHash("sha256")
    .update(stablePrintPackageJson(packageHashPayload(pkg)))
    .digest("hex");
}

function collectVariables(value: unknown, variables = new Set<string>()) {
  if (typeof value === "string") {
    for (const match of value.matchAll(/\{\{\s*([A-Z0-9_.-]+)\s*\}\}/gi)) {
      variables.add(match[1]);
    }
    return variables;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectVariables(item, variables));
    return variables;
  }
  if (isRecord(value)) {
    if (typeof value.path === "string" && value.path.trim()) {
      variables.add(value.path.trim());
    }
    Object.values(value).forEach((item) => collectVariables(item, variables));
  }
  return variables;
}

export function buildPrintReportPackage(params: {
  code: string;
  name: string;
  description?: string | null;
  documentType: string;
  mediaType: string;
  layout: JsonRecord;
  sampleData?: JsonRecord | null;
  templateVersion?: number | null;
  referenceImageName?: string | null;
  referenceImageSha256?: string | null;
  now?: Date;
  packageId?: string;
}): PrintReportPackage {
  const withoutIntegrity: Omit<PrintReportPackage, "integrity"> = {
    format: PRINT_REPORT_PACKAGE_FORMAT,
    schemaVersion: PRINT_REPORT_PACKAGE_SCHEMA_VERSION,
    packageId: params.packageId || randomUUID(),
    exportedAt: (params.now || new Date()).toISOString(),
    report: {
      code: normalizeUpper(params.code),
      name: normalizeUpper(params.name),
      description: params.description
        ? normalizeUpper(params.description)
        : null,
      documentType: normalizeUpper(params.documentType),
      mediaType: normalizeUpper(params.mediaType),
      layout: params.layout,
      sampleData: params.sampleData || {},
      variables: [...collectVariables(params.layout)].sort(),
    },
    compatibility: {
      rendererSchemaVersion: 1,
      minColumns: 16,
      maxColumns: 160,
    },
    source: {
      createdWith: "MSINFOR/CODEX",
      templateVersion: params.templateVersion || null,
      referenceImageName: params.referenceImageName || null,
      referenceImageSha256: params.referenceImageSha256 || null,
    },
  };

  return {
    ...withoutIntegrity,
    integrity: {
      algorithm: "SHA-256",
      contentHash: calculatePrintPackageHash(withoutIntegrity),
    },
  };
}

function requireRecord(value: unknown, field: string) {
  if (!isRecord(value)) {
    throw new BadRequestException(`Pacote inválido: ${field} não foi informado.`);
  }
  return value;
}

export function validatePrintReportPackage(input: unknown) {
  if (Buffer.byteLength(JSON.stringify(input ?? null), "utf8") > PACKAGE_MAX_BYTES) {
    throw new BadRequestException("O pacote excede o limite de 2 MB.");
  }

  const pkg = requireRecord(input, "conteúdo");
  const reportInput = isRecord(pkg.report) ? pkg.report : {};
  const sourceInput = isRecord(pkg.source) ? pkg.source : {};
  const forbiddenField = [
    ...Object.keys(pkg),
    ...Object.keys(reportInput),
    ...Object.keys(sourceInput),
  ].find((key) => FORBIDDEN_SCOPE_FIELDS.has(key.toLowerCase()));
  if (forbiddenField) {
    throw new BadRequestException(
      `O pacote não pode transportar escopo de cliente ou credencial (${forbiddenField}).`,
    );
  }
  if (pkg.format !== PRINT_REPORT_PACKAGE_FORMAT) {
    throw new BadRequestException("Formato de pacote de relatório não reconhecido.");
  }
  if (Number(pkg.schemaVersion) !== PRINT_REPORT_PACKAGE_SCHEMA_VERSION) {
    throw new BadRequestException(
      `Versão de pacote não suportada. Use a versão ${PRINT_REPORT_PACKAGE_SCHEMA_VERSION}.`,
    );
  }

  const report = requireRecord(pkg.report, "report");
  const layout = requireRecord(report.layout, "report.layout");
  const sampleData = requireRecord(report.sampleData || {}, "report.sampleData");
  const code = normalizeUpper(report.code);
  const name = normalizeUpper(report.name);
  const documentType = normalizeUpper(report.documentType);
  const mediaType = normalizeUpper(report.mediaType);

  if (!/^[A-Z0-9_]{2,80}$/.test(code)) {
    throw new BadRequestException(
      "O código do modelo deve ter de 2 a 80 caracteres, usando letras, números e underscore.",
    );
  }
  if (!name || name.length > 160) {
    throw new BadRequestException("O nome do modelo é obrigatório e aceita até 160 caracteres.");
  }
  if (!DOCUMENT_TYPES.has(documentType)) {
    throw new BadRequestException("O tipo de documento do pacote é inválido.");
  }
  if (!MEDIA_TYPES.has(mediaType)) {
    throw new BadRequestException("O tipo de mídia do pacote é inválido.");
  }

  const layoutMediaType = normalizeUpper(layout?.media?.type || "RECEIPT");
  if (layoutMediaType !== mediaType) {
    throw new BadRequestException(
      "O tipo de mídia do layout não corresponde ao tipo informado no pacote.",
    );
  }

  const source = isRecord(pkg.source) ? pkg.source : {};
  const compatibility = isRecord(pkg.compatibility) ? pkg.compatibility : {};
  const normalized = buildPrintReportPackage({
    code,
    name,
    description: report.description ? normalizeUpper(report.description) : null,
    documentType,
    mediaType,
    layout,
    sampleData,
    templateVersion: Number.isInteger(Number(source.templateVersion))
      ? Number(source.templateVersion)
      : null,
    referenceImageName:
      typeof source.referenceImageName === "string"
        ? source.referenceImageName.slice(0, 240)
        : null,
    referenceImageSha256:
      typeof source.referenceImageSha256 === "string"
        ? source.referenceImageSha256.slice(0, 64).toLowerCase()
        : null,
    packageId:
      typeof pkg.packageId === "string" && pkg.packageId.trim()
        ? pkg.packageId.trim()
        : randomUUID(),
    now:
      typeof pkg.exportedAt === "string" &&
      !Number.isNaN(new Date(pkg.exportedAt).getTime())
        ? new Date(pkg.exportedAt)
        : new Date(),
  });

  normalized.compatibility = {
    rendererSchemaVersion: Number(compatibility.rendererSchemaVersion || 1),
    minColumns: Math.max(16, Number(compatibility.minColumns || 16)),
    maxColumns: Math.min(160, Number(compatibility.maxColumns || 160)),
  };
  normalized.integrity.contentHash = calculatePrintPackageHash({
    format: normalized.format,
    schemaVersion: normalized.schemaVersion,
    packageId: normalized.packageId,
    exportedAt: normalized.exportedAt,
    report: normalized.report,
    compatibility: normalized.compatibility,
    source: normalized.source,
  });

  const suppliedHash =
    isRecord(pkg.integrity) && typeof pkg.integrity.contentHash === "string"
      ? pkg.integrity.contentHash.toLowerCase()
      : "";
  if (!suppliedHash || suppliedHash !== normalized.integrity.contentHash) {
    throw new BadRequestException(
      "A integridade do pacote não confere. Exporte novamente antes de importar.",
    );
  }

  const preview = renderPrintTemplate(layout, sampleData);
  return {
    valid: true,
    package: normalized,
    preview,
    warnings:
      Object.keys(sampleData).length === 0
        ? ["O pacote não possui dados de exemplo para a prévia."]
        : [],
  };
}
