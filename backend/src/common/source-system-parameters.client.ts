import {
  BadGatewayException,
  ServiceUnavailableException,
} from "@nestjs/common";

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
  allowSaleUnitPriceEdit?: boolean;
  allowSaleItemDiscount?: boolean;
  groupSameProduct?: boolean;
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
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized ? `SOURCE_SYSTEM_${normalized}` : "";
}

export function resolveSourceCallbackConfiguration(sourceSystem: string) {
  const prefix = sourceEnvironmentPrefix(sourceSystem);
  const normalizedSourceSystem = String(sourceSystem || "").trim().toUpperCase();
  const defaultSchoolUrl =
    normalizedSourceSystem === "ESCOLA"
      ? "http://localhost:3001/api/v1"
      : "";

  return {
    baseUrl: String(
      (prefix ? process.env[`${prefix}_API_URL`] : "") || defaultSchoolUrl,
    )
      .trim()
      .replace(/\/+$/g, ""),
    apiKey: String(
      (prefix ? process.env[`${prefix}_API_KEY`] : "") ||
        (normalizedSourceSystem === "ESCOLA"
          ? process.env.FINANCEIRO_INTEGRATION_API_KEY
          : "") ||
        "",
    ).trim(),
  };
}

export async function pushSourceCompanyBranchParameters(
  input: PushSourceParametersInput,
) {
  const configuration = resolveSourceCallbackConfiguration(input.sourceSystem);
  if (!configuration.baseUrl || !configuration.apiKey) {
    throw new ServiceUnavailableException(
      "O sistema de origem não está configurado para receber alterações.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(
      `${configuration.baseUrl}/integrations/financeiro/company-branch-parameters`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": configuration.apiKey,
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      },
    );

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
