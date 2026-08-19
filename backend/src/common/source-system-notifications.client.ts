import { BadGatewayException, ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { createHmac, randomBytes } from "crypto";
import { getFinanceContext } from "./finance-context";
import {
  buildInternalSignaturePayload,
  canonicalizePathAndQuery,
  hashInternalRequestBody,
  INTERNAL_API_HEADERS,
  INTERNAL_API_SIGNATURE_VERSION,
} from "./internal-api-signature";
import { resolveSourceCallbackConfiguration } from "./source-system-parameters.client";

export type FinancialNotificationCallbackPayload = {
  deliveryId: string;
  eventType: string;
  title: string;
  message: string;
  recipientUserId: string;
  recipientEmail?: string | null;
  sendInternal: boolean;
  sendEmail: boolean;
  sendTelegram: boolean;
  actionUrl?: string | null;
  metadata?: Record<string, unknown>;
  simulationEmailOverride?: string;
};

export type FinancialNotificationCallbackResult = {
  deliveryId: string;
  internalStatus: string;
  emailStatus: string;
  telegramStatus: string;
  processedAt: string;
};

export async function sendFinancialNotificationToSource(
  payload: FinancialNotificationCallbackPayload,
): Promise<FinancialNotificationCallbackResult> {
  const context = getFinanceContext();
  if (!context?.authenticated || !context.sourceSystem || !context.sourceTenantId ||
      !context.sourceBranchCode || !context.sourceUserId) {
    throw new ForbiddenException("CONTEXTO FINANCEIRO AUTENTICADO É OBRIGATÓRIO.");
  }
  const configuration = resolveSourceCallbackConfiguration(context.sourceSystem);
  if (!configuration.baseUrl || !configuration.secret) {
    throw new ServiceUnavailableException("O CALLBACK DE NOTIFICAÇÕES DA ORIGEM NÃO ESTÁ CONFIGURADO.");
  }
  const endpoint = new URL(`${configuration.baseUrl}/integrations/financeiro/financial-notifications`);
  const callbackBody = {
    ...payload,
    sourceSystem: context.sourceSystem,
    sourceTenantId: context.sourceTenantId,
    sourceBranchCode: context.sourceBranchCode,
    requestedBy: context.sourceUserId,
  };
  const bodyBytes = Buffer.from(JSON.stringify(callbackBody), "utf8");
  const timestamp = String(Date.now());
  const nonce = randomBytes(24).toString("base64url");
  const scopes = ["FINANCIAL_NOTIFICATIONS_WRITE"] as const;
  const bodySha256 = hashInternalRequestBody(bodyBytes);
  const canonicalPayload = buildInternalSignaturePayload({
    version: INTERNAL_API_SIGNATURE_VERSION,
    systemId: "FINANCEIRO",
    method: "POST",
    canonicalTarget: canonicalizePathAndQuery(`${endpoint.pathname}${endpoint.search}`),
    timestamp,
    nonce,
    bodySha256,
    tenantId: context.sourceTenantId,
    branchCode: String(context.sourceBranchCode),
    userId: context.sourceUserId,
    scopes,
  });
  const signature = createHmac("sha256", configuration.secret).update(canonicalPayload).digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [INTERNAL_API_HEADERS.version]: INTERNAL_API_SIGNATURE_VERSION,
        [INTERNAL_API_HEADERS.systemId]: "FINANCEIRO",
        [INTERNAL_API_HEADERS.tenantId]: context.sourceTenantId,
        [INTERNAL_API_HEADERS.branchCode]: String(context.sourceBranchCode),
        [INTERNAL_API_HEADERS.userId]: context.sourceUserId,
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
      const errorBody = await response.json().catch(() => null) as { message?: unknown } | null;
      throw new BadGatewayException(
        String(errorBody?.message || "").trim() ||
          `O SISTEMA DE ORIGEM RECUSOU A NOTIFICAÇÃO (HTTP ${response.status}).`,
      );
    }
    return await response.json() as FinancialNotificationCallbackResult;
  } catch (error) {
    if (error instanceof BadGatewayException || error instanceof ServiceUnavailableException) throw error;
    throw new BadGatewayException("NÃO FOI POSSÍVEL ENTREGAR A NOTIFICAÇÃO AO SISTEMA DE ORIGEM.");
  } finally {
    clearTimeout(timeout);
  }
}
