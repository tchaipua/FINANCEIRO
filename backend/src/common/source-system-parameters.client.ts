import {
  BadGatewayException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHmac, randomBytes } from "crypto";
import { getFinanceContext } from "./finance-context";
import {
  buildInternalSignaturePayload,
  canonicalizePathAndQuery,
  hashInternalRequestBody,
  INTERNAL_API_HEADERS,
  INTERNAL_API_SIGNATURE_VERSION,
} from "./internal-api-signature";

export type SourceCompanyParameters = {
  interestRate?: number | null;
  interestGracePeriod?: number | null;
  penaltyRate?: number | null;
  penaltyValue?: number | null;
  penaltyGracePeriod?: number | null;
};

export type SourceBranchParameters = {
  stockControlMode?: string;
  stockIntegerQuantityMode?: string;
  stockLotControlMode?: string;
  stockExpirationControlMode?: string;
  stockGridControlMode?: string;
  stockNegativeControlMode?: string;
  stockClassificationMode?: string;
  allowSaleUnitPriceEdit?: boolean;
  allowSaleItemDiscount?: boolean;
  groupSameProduct?: boolean;
  allowProductImageEdit?: boolean;
  requirePasswordToRemoveSaleItems?: boolean;
};

type PushSourceParametersInput = {
  sourceSystem: string;
  sourceTenantId: string;
  sourceBranchCode?: number;
  entityType: "COMPANY" | "BRANCH";
  requestedBy?: string | null;
  parameters: SourceCompanyParameters | SourceBranchParameters;
};

function sourceEnvironmentPrefix(sourceSystem: string) {
  const normalized = String(sourceSystem || "")
    .trim()
    .toUpperCase();

  return ["ESCOLA", "PROJETO_INICIAL"].includes(normalized)
    ? `SOURCE_SYSTEM_${normalized}`
    : "";
}

export function resolveSourceCallbackConfiguration(sourceSystem: string) {
  const prefix = sourceEnvironmentPrefix(sourceSystem);
  const normalizedSourceSystem = String(sourceSystem || "").trim().toUpperCase();
  const defaultSchoolUrl =
    String(process.env.NODE_ENV || "").toLowerCase() !== "production" &&
    normalizedSourceSystem === "ESCOLA"
      ? "http://localhost:3001/api/v1"
      : "";

  const rawBaseUrl = String(
      (prefix ? process.env[`${prefix}_API_URL`] : "") || defaultSchoolUrl,
    )
      .trim()
      .replace(/\/+$/g, "");
  const secret = String(
    prefix ? process.env[`${prefix}_HMAC_SECRET`] || "" : "",
  ).trim();
  if (!prefix || !rawBaseUrl || secret.length < 32) {
    return { baseUrl: "", secret: "" };
  }

  try {
    const parsedBaseUrl = new URL(rawBaseUrl);
    if (
      !["http:", "https:"].includes(parsedBaseUrl.protocol) ||
      parsedBaseUrl.username ||
      parsedBaseUrl.password ||
      parsedBaseUrl.search ||
      parsedBaseUrl.hash
    ) {
      return { baseUrl: "", secret: "" };
    }
    return {
      baseUrl: `${parsedBaseUrl.origin}${
        parsedBaseUrl.pathname.replace(/\/+$/g, "") || ""
      }`,
      secret,
    };
  } catch {
    return { baseUrl: "", secret: "" };
  }
}

export async function pushSourceCompanyBranchParameters(
  input: PushSourceParametersInput,
) {
  const financeContext = getFinanceContext();
  const normalizedSourceSystem = String(input.sourceSystem || "")
    .trim()
    .toUpperCase();
  const normalizedTenantId = String(input.sourceTenantId || "")
    .trim()
    .toUpperCase();
  if (
    !financeContext?.authenticated ||
    financeContext.sourceSystem !== normalizedSourceSystem ||
    financeContext.sourceTenantId !== normalizedTenantId ||
    !financeContext.sourceBranchCode ||
    !financeContext.sourceUserId ||
    (input.sourceBranchCode !== undefined &&
      input.sourceBranchCode !== financeContext.sourceBranchCode) ||
    (input.requestedBy &&
      input.requestedBy !== financeContext.sourceUserId)
  ) {
    throw new ForbiddenException(
      "CONTEXTO DO CALLBACK FINANCEIRO DIVERGENTE.",
    );
  }

  const configuration = resolveSourceCallbackConfiguration(input.sourceSystem);
  if (!configuration.baseUrl || !configuration.secret) {
    throw new ServiceUnavailableException(
      "O sistema de origem não está configurado para receber alterações.",
    );
  }

  const endpoint = new URL(
    `${configuration.baseUrl}/integrations/financeiro/company-branch-parameters`,
  );
  const callbackBody = {
    ...input,
    sourceSystem: financeContext.sourceSystem,
    sourceTenantId: financeContext.sourceTenantId,
    sourceBranchCode: financeContext.sourceBranchCode,
    requestedBy: financeContext.sourceUserId,
  };
  const bodyBytes = Buffer.from(JSON.stringify(callbackBody), "utf8");
  const timestamp = String(Date.now());
  const nonce = randomBytes(24).toString("base64url");
  const scopes = ["SOURCE_PARAMETERS_WRITE"] as const;
  const bodySha256 = hashInternalRequestBody(bodyBytes);
  const canonicalPayload = buildInternalSignaturePayload({
    version: INTERNAL_API_SIGNATURE_VERSION,
    systemId: "FINANCEIRO",
    method: "PATCH",
    canonicalTarget: canonicalizePathAndQuery(
      `${endpoint.pathname}${endpoint.search}`,
    ),
    timestamp,
    nonce,
    bodySha256,
    tenantId: financeContext.sourceTenantId,
    branchCode: String(financeContext.sourceBranchCode),
    userId: financeContext.sourceUserId,
    scopes,
  });
  const signature = createHmac("sha256", configuration.secret)
    .update(canonicalPayload)
    .digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(endpoint, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          [INTERNAL_API_HEADERS.version]: INTERNAL_API_SIGNATURE_VERSION,
          [INTERNAL_API_HEADERS.systemId]: "FINANCEIRO",
          [INTERNAL_API_HEADERS.tenantId]: financeContext.sourceTenantId,
          [INTERNAL_API_HEADERS.branchCode]: String(
            financeContext.sourceBranchCode,
          ),
          [INTERNAL_API_HEADERS.userId]: financeContext.sourceUserId,
          [INTERNAL_API_HEADERS.scopes]: scopes.join(","),
          [INTERNAL_API_HEADERS.timestamp]: timestamp,
          [INTERNAL_API_HEADERS.nonce]: nonce,
          [INTERNAL_API_HEADERS.contentSha256]: bodySha256,
          [INTERNAL_API_HEADERS.signature]: signature,
        },
        body: bodyBytes,
        redirect: "manual",
        signal: controller.signal,
      });

    if (!response.ok) {
      throw new BadGatewayException(
        `O sistema de origem recusou a alteração dos parâmetros (HTTP ${response.status}).`,
      );
    }

    return await response.json().catch(() => ({ synchronized: true }));
  } catch (error) {
    if (
      error instanceof BadGatewayException ||
      error instanceof ServiceUnavailableException
    ) {
      throw error;
    }

    throw new BadGatewayException(
      "Não foi possível confirmar a alteração no sistema de origem.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
