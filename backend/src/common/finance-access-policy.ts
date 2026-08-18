export const FINANCE_PERMISSION_CODES = [
  "VIEW_FINANCIAL",
  "FINANCE_ADMIN",
  "MANAGE_SALES",
  "OPERATE_CASHIER",
  "CLOSE_CASHIER",
  "MANAGE_RECEIVABLES",
  "SETTLE_RECEIVABLES",
  "MANAGE_PAYABLES",
  "MANAGE_PRODUCTS",
  "MANAGE_BANKS",
  "MANAGE_FISCAL",
] as const;

export type FinancePermissionCode = (typeof FINANCE_PERMISSION_CODES)[number];

export type FinanceProfileDefinition = {
  code: string;
  name: string;
  description: string;
  permissionCodes: readonly FinancePermissionCode[];
};

export const FINANCE_PROFILES: readonly FinanceProfileDefinition[] = [
  {
    code: "ADMIN_FINANCEIRO",
    name: "ADMINISTRADOR FINANCEIRO",
    description: "ACESSO COMPLETO À CONFIGURAÇÃO E ÀS OPERAÇÕES FINANCEIRAS.",
    permissionCodes: FINANCE_PERMISSION_CODES,
  },
  {
    code: "GERENTE_FINANCEIRO",
    name: "GERENTE FINANCEIRO",
    description: "GERENCIA AS OPERAÇÕES FINANCEIRAS, SEM ALTERAR ACESSOS.",
    permissionCodes: FINANCE_PERMISSION_CODES.filter(
      (permissionCode) => permissionCode !== "FINANCE_ADMIN",
    ),
  },
  {
    code: "CAIXA",
    name: "CAIXA",
    description: "OPERA VENDAS, RECEBIMENTOS E O PRÓPRIO CAIXA.",
    permissionCodes: [
      "VIEW_FINANCIAL",
      "MANAGE_SALES",
      "OPERATE_CASHIER",
      "CLOSE_CASHIER",
      "SETTLE_RECEIVABLES",
    ],
  },
  {
    code: "CONTAS_RECEBER",
    name: "CONTAS A RECEBER",
    description: "CONSULTA, MANTÉM E BAIXA CONTAS A RECEBER.",
    permissionCodes: [
      "VIEW_FINANCIAL",
      "MANAGE_RECEIVABLES",
      "SETTLE_RECEIVABLES",
    ],
  },
  {
    code: "CONTAS_PAGAR",
    name: "CONTAS A PAGAR",
    description: "CONSULTA E MANTÉM CONTAS A PAGAR.",
    permissionCodes: ["VIEW_FINANCIAL", "MANAGE_PAYABLES"],
  },
  {
    code: "CONSULTA",
    name: "SOMENTE CONSULTA",
    description: "CONSULTA DADOS FINANCEIROS SEM REALIZAR MUTAÇÕES.",
    permissionCodes: ["VIEW_FINANCIAL"],
  },
] as const;

export function normalizeFinancePermissionCodes(values: readonly string[]) {
  const allowed = new Set<string>(FINANCE_PERMISSION_CODES);
  return [...new Set(values.map((value) => String(value).trim().toUpperCase()))]
    .filter((value): value is FinancePermissionCode => allowed.has(value))
    .sort();
}

export function getFinanceProfile(profileCode: string) {
  const normalizedCode = String(profileCode || "").trim().toUpperCase();
  return FINANCE_PROFILES.find((profile) => profile.code === normalizedCode);
}

export function getRequiredFinancePermissions(method: string, path: string) {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = path.replace(/^\/api\/v1\//, "");
  const isRead = normalizedMethod === "GET" || normalizedMethod === "HEAD";

  if (normalizedPath.startsWith("finance-access")) return ["FINANCE_ADMIN"];
  if (isRead) return ["VIEW_FINANCIAL"];
  if (
    normalizedPath.startsWith("companies") ||
    normalizedPath.startsWith("fiscal-parameters") ||
    normalizedPath.startsWith("printing") ||
    normalizedPath.startsWith("s3-control") ||
    normalizedPath.startsWith("supertef")
  ) return ["FINANCE_ADMIN"];
  if (normalizedPath.startsWith("sales")) return ["MANAGE_SALES"];
  if (normalizedPath.startsWith("products")) return ["MANAGE_PRODUCTS"];
  if (normalizedPath.startsWith("payables")) return ["MANAGE_PAYABLES"];
  if (normalizedPath.startsWith("banks")) return ["MANAGE_BANKS"];
  if (
    normalizedPath.startsWith("fiscal-documents") ||
    normalizedPath.startsWith("fiscal-certificates")
  ) return ["MANAGE_FISCAL"];
  if (normalizedPath.startsWith("receivables")) {
    return normalizedPath.includes("settle") || normalizedPath.includes("reverse")
      ? ["SETTLE_RECEIVABLES"]
      : ["MANAGE_RECEIVABLES"];
  }
  if (normalizedPath.startsWith("customers")) return ["MANAGE_RECEIVABLES"];
  if (normalizedPath.startsWith("cash-sessions/operator-policy")) {
    return ["FINANCE_ADMIN"];
  }
  if (normalizedPath.startsWith("cash-sessions")) {
    return normalizedPath.includes("close")
      ? ["CLOSE_CASHIER"]
      : ["OPERATE_CASHIER"];
  }
  if (normalizedPath.startsWith("customer-credits")) {
    return ["SETTLE_RECEIVABLES"];
  }
  return ["FINANCE_ADMIN"];
}

