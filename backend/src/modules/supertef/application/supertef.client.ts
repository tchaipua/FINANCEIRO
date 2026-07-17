import { BadGatewayException, Injectable } from "@nestjs/common";
import { normalizeText } from "../../../common/finance-core.utils";

export const SUPERTEF_API_BASE_URL = "https://api.supertef.com.br/api";

export type SuperTefPos = {
  providerPosId: number;
  providerStatus: number | null;
  name: string;
  brand: string | null;
  model: string | null;
  bank: string | null;
  providerClientId: number | null;
  providerCreatedAt: Date | null;
  providerUpdatedAt: Date | null;
  activatedAt: Date | null;
};

export type SuperTefPayment = {
  providerPaymentUniqueId: string;
  providerPaymentStatus: number;
  paymentMessage: string;
  createdAt: Date | null;
  paymentOrder: {
    posId: number | null;
    installmentType: number | null;
    transactionType: number | null;
    installmentCount: number | null;
    amount: number | null;
    orderId: string | null;
    description: string | null;
    printReceipt: boolean | null;
  };
  paymentData: {
    posId: number | null;
    idPayment: string | null;
    cardholderName: string | null;
    brand: string | null;
    nsu: string | null;
    authorizationCode: string | null;
    authorizationDateTime: string | null;
    acquirerBank: string | null;
    acquirerDocument: string | null;
  };
};

export type CreateSuperTefPaymentInput = {
  clientKey: string;
  providerPosId: number;
  transactionType: 1 | 2;
  installmentCount: number;
  installmentType: number;
  amount: number;
  orderId: string;
  description: string;
  printReceipt: boolean;
};

function nullableInteger(value: unknown) {
  const normalized = Number(value);
  return Number.isInteger(normalized) ? normalized : null;
}

function nullableDate(value: unknown) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function nullableText(value: unknown) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized || null;
}

function safeProviderMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const value = record.message || record.error || record.detail;
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, 300)
    : null;
}

function redactAccessToken(message: string | null, accessToken: string) {
  if (!message) return null;
  return message
    .split(accessToken)
    .join("[CREDENCIAL PROTEGIDA]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [CREDENCIAL PROTEGIDA]");
}

export function parseSuperTefPosResponse(payload: unknown): SuperTefPos[] {
  const data =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).data
      : null;

  if (!Array.isArray(data)) {
    throw new BadGatewayException(
      "O SUPERTEF RESPONDEU SEM A LISTA DE MÁQUINAS POS ESPERADA.",
    );
  }

  return data.map((item, index) => {
    const record =
      item && typeof item === "object"
        ? (item as Record<string, unknown>)
        : {};
    const providerPosId = nullableInteger(record.id);

    if (!providerPosId || providerPosId < 1) {
      throw new BadGatewayException(
        `O SUPERTEF RETORNOU UMA POS INVÁLIDA NA POSIÇÃO ${index + 1}.`,
      );
    }

    return {
      providerPosId,
      providerStatus: nullableInteger(record.status),
      name: normalizeText(String(record.nome || "")) || `POS ${providerPosId}`,
      brand: normalizeText(String(record.marca || "")),
      model: normalizeText(String(record.modelo || "")),
      bank: normalizeText(String(record.banco || "")),
      providerClientId: nullableInteger(record.cliente_id),
      providerCreatedAt: nullableDate(record.created_at),
      providerUpdatedAt: nullableDate(record.updated_at),
      activatedAt: nullableDate(record.date_ativacao),
    };
  });
}

export function parseSuperTefPaymentResponse(payload: unknown): SuperTefPayment {
  const outerRecord =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const record =
    outerRecord.data &&
    typeof outerRecord.data === "object" &&
    "payment_uniqueid" in (outerRecord.data as Record<string, unknown>)
      ? (outerRecord.data as Record<string, unknown>)
      : outerRecord;
  const uniqueId = nullableText(record.payment_uniqueid);
  const paymentStatus = nullableInteger(record.payment_status);
  if (!uniqueId || paymentStatus === null) {
    throw new BadGatewayException(
      "O SUPERTEF RESPONDEU SEM A IDENTIFICAÇÃO OU SITUAÇÃO DO PAGAMENTO.",
    );
  }

  const order =
    record.payment_order && typeof record.payment_order === "object"
      ? (record.payment_order as Record<string, unknown>)
      : {};
  const data =
    record.payment_data && typeof record.payment_data === "object"
      ? (record.payment_data as Record<string, unknown>)
      : {};
  const printReceipt =
    typeof order.print_receipt === "boolean" ? order.print_receipt : null;

  return {
    providerPaymentUniqueId: uniqueId,
    providerPaymentStatus: paymentStatus,
    paymentMessage:
      normalizeText(nullableText(record.payment_message)) ||
      `STATUS ${paymentStatus}`,
    createdAt: nullableDate(record.created_at),
    paymentOrder: {
      posId: nullableInteger(order.pos_id),
      installmentType: nullableInteger(order.installment_type),
      transactionType: nullableInteger(order.transaction_type),
      installmentCount: nullableInteger(order.installment_count),
      amount: Number.isFinite(Number(order.amount)) ? Number(order.amount) : null,
      orderId: normalizeText(nullableText(order.order_id)),
      description: normalizeText(nullableText(order.description)),
      printReceipt,
    },
    paymentData: {
      posId: nullableInteger(data.pos_id),
      idPayment: nullableText(data.id_payment),
      cardholderName: normalizeText(nullableText(data.cardholder_name)),
      brand: normalizeText(nullableText(data.brand)),
      nsu: nullableText(data.nsu),
      authorizationCode: nullableText(data.authorization_code),
      authorizationDateTime: nullableText(data.authorization_date_time),
      acquirerBank: normalizeText(nullableText(data.acquirer_banco)),
      acquirerDocument: nullableText(data.acquirer_cnpj),
    },
  };
}

@Injectable()
export class SuperTefClient {
  async listPos(accessToken: string, timeoutSeconds: number) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.max(30, Math.min(300, timeoutSeconds)) * 1000,
    );

    try {
      const response = await fetch(`${SUPERTEF_API_BASE_URL}/pos`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const providerMessage = redactAccessToken(
          safeProviderMessage(payload),
          accessToken,
        );
        throw new BadGatewayException(
          providerMessage
            ? `SUPERTEF RECUSOU A CONEXÃO: ${providerMessage}`
            : `SUPERTEF RECUSOU A CONEXÃO (HTTP ${response.status}).`,
        );
      }

      return parseSuperTefPosResponse(payload);
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new BadGatewayException(
          "A CONSULTA AO SUPERTEF EXCEDEU O TEMPO LIMITE CONFIGURADO.",
        );
      }
      throw new BadGatewayException(
        "NÃO FOI POSSÍVEL COMUNICAR COM A API DO SUPERTEF.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async paymentRequest(
    accessToken: string,
    path: string,
    timeoutSeconds: number,
    init?: { method?: string; body?: Record<string, unknown> },
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.max(30, Math.min(300, timeoutSeconds)) * 1000,
    );

    try {
      const response = await fetch(`${SUPERTEF_API_BASE_URL}/${path}`, {
        method: init?.method || "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
        },
        body: init?.body ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const providerMessage = redactAccessToken(
          safeProviderMessage(payload),
          accessToken,
        );
        throw new BadGatewayException(
          providerMessage
            ? `SUPERTEF RECUSOU A OPERAÇÃO: ${providerMessage}`
            : `SUPERTEF RECUSOU A OPERAÇÃO (HTTP ${response.status}).`,
        );
      }
      return parseSuperTefPaymentResponse(payload);
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new BadGatewayException(
          "A OPERAÇÃO NO SUPERTEF EXCEDEU O TEMPO LIMITE CONFIGURADO.",
        );
      }
      throw new BadGatewayException(
        "NÃO FOI POSSÍVEL COMUNICAR COM A API DO SUPERTEF.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  requestPayment(
    accessToken: string,
    input: CreateSuperTefPaymentInput,
    timeoutSeconds: number,
  ) {
    return this.paymentRequest(accessToken, "pagamentos", timeoutSeconds, {
      method: "POST",
      body: {
        cliente_chave: input.clientKey,
        pos_id: input.providerPosId,
        transaction_type: String(input.transactionType),
        installment_count: input.installmentCount,
        installment_type: input.installmentType,
        amount: input.amount,
        order_id: input.orderId,
        description: input.description,
        print_receipt: input.printReceipt,
      },
    });
  }

  getPayment(
    accessToken: string,
    providerPaymentUniqueId: string,
    timeoutSeconds: number,
  ) {
    return this.paymentRequest(
      accessToken,
      `pagamentos/by-uniqueid/${encodeURIComponent(providerPaymentUniqueId)}`,
      timeoutSeconds,
    );
  }

  rejectPayment(
    accessToken: string,
    providerPaymentUniqueId: string,
    timeoutSeconds: number,
  ) {
    return this.paymentRequest(
      accessToken,
      `pagamentos/cancelar/${encodeURIComponent(providerPaymentUniqueId)}`,
      timeoutSeconds,
      { method: "PUT" },
    );
  }
}
