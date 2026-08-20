import { FinancialNotificationEventType } from "../domain/financial-notification-events";

export type FinancialNotificationMetadata = Record<string, unknown>;

const UNSAFE_METADATA_KEY = /(?:cpf|cnpj|password|passwd|token|secret|api[_-]?key|authorization|(?:payer|customer|supplier|party|person)document)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeValue(value: unknown, key?: string): unknown {
  if (key && UNSAFE_METADATA_KEY.test(key)) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeValue(item))
      .filter((item) => item !== undefined);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([entryKey, entryValue]) => [entryKey, sanitizeValue(entryValue, entryKey)] as const)
        .filter(([, entryValue]) => entryValue !== undefined),
    );
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  return undefined;
}

export function sanitizeFinancialNotificationMetadata(
  metadata?: FinancialNotificationMetadata | null,
) {
  const sanitized = sanitizeValue(metadata);
  return isRecord(sanitized) ? sanitized : null;
}

function hasValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function firstValue(metadata: FinancialNotificationMetadata, ...keys: string[]) {
  return keys.map((key) => metadata[key]).find(hasValue);
}

function textValue(value: unknown) {
  if (!hasValue(value)) return null;
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function moneyValue(value: unknown) {
  if (!hasValue(value)) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

function dateValue(value: unknown) {
  if (!hasValue(value)) return null;
  const raw = String(value).trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(parsed);
}

function appendText(parts: string[], label: string, value: unknown) {
  const text = textValue(value);
  if (text) parts.push(`${label}: ${text}`);
}

function appendMoney(parts: string[], label: string, value: unknown) {
  const money = moneyValue(value);
  if (money) parts.push(`${label}: ${money}`);
}

function appendDate(parts: string[], label: string, value: unknown) {
  const date = dateValue(value);
  if (date) parts.push(`${label}: ${date}`);
}

function installmentLabel(metadata: FinancialNotificationMetadata) {
  const number = textValue(metadata.installmentNumber);
  const count = textValue(metadata.installmentCount);
  if (!number) return null;
  return count ? `${number}/${count}` : number;
}

function invoiceLabel(metadata: FinancialNotificationMetadata) {
  const number = textValue(metadata.invoiceNumber);
  const series = textValue(metadata.invoiceSeries);
  if (!number) return null;
  return series ? `${number} / SÉRIE ${series}` : number;
}

function appendCommonPartyAndDocument(parts: string[], metadata: FinancialNotificationMetadata, group: "RECEIVABLE" | "PAYABLE") {
  if (group === "RECEIVABLE") {
    appendText(
      parts,
      "CLIENTE",
      firstValue(metadata, "customerName", "customerNameSnapshot", "payerNameSnapshot"),
    );
    appendText(parts, "VENDA", metadata.saleNumber);
    appendText(parts, "TÍTULO", firstValue(metadata, "titleName", "titleId", "receivableTitleId"));
  } else {
    appendText(parts, "FORNECEDOR", metadata.supplierName);
    appendText(parts, "NOTA", invoiceLabel(metadata));
    appendText(parts, "TÍTULO", firstValue(metadata, "titleName", "titleId", "payableTitleId"));
  }
  appendText(parts, "PARCELA", installmentLabel(metadata));
}

function appendCancellationReason(parts: string[], metadata: FinancialNotificationMetadata) {
  appendText(parts, "MOTIVO", firstValue(metadata, "cancellationReason", "cancellationNote", "reason"));
}

function appendInstallmentSummary(parts: string[], metadata: FinancialNotificationMetadata) {
  if (!Array.isArray(metadata.installments)) return;
  const summary = metadata.installments
    .filter(isRecord)
    .slice(0, 8)
    .map((installment) => {
      const number = installmentLabel(installment);
      const amount = moneyValue(firstValue(installment, "amount", "currentAmount", "nextAmount"));
      if (!number && !amount) return null;
      return [number ? `PARCELA ${number}` : null, amount].filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .join("; ");
  if (summary) parts.push(`PARCELAS ENVOLVIDAS: ${summary}`);
}

function truncateMessage(value: string) {
  const normalized = value.trim().toUpperCase();
  return normalized.length <= 2000 ? normalized : `${normalized.slice(0, 1997).trimEnd()}...`;
}

export function formatFinancialNotificationMessage(
  eventType: FinancialNotificationEventType | string,
  metadata: FinancialNotificationMetadata | null | undefined,
  fallbackMessage: string,
) {
  const safeMetadata = metadata || {};
  const parts: string[] = [];

  if (eventType === "RECEIVABLE_INSTALLMENT_AMOUNT_CHANGED") {
    parts.push("ALTERAÇÃO DE VALOR DE PARCELA DO CONTAS A RECEBER");
    appendCommonPartyAndDocument(parts, safeMetadata, "RECEIVABLE");
    appendMoney(parts, "VALOR ANTERIOR", safeMetadata.previousAmount);
    appendMoney(parts, "NOVO VALOR", firstValue(safeMetadata, "nextAmount", "currentAmount", "amount"));
  } else if (eventType === "RECEIVABLE_INSTALLMENT_DUE_DATE_CHANGED") {
    parts.push("ALTERAÇÃO DE VENCIMENTO DE PARCELA DO CONTAS A RECEBER");
    appendCommonPartyAndDocument(parts, safeMetadata, "RECEIVABLE");
    appendDate(parts, "VENCIMENTO ANTERIOR", safeMetadata.previousDueDate);
    appendDate(parts, "NOVO VENCIMENTO", firstValue(safeMetadata, "nextDueDate", "currentDueDate", "dueDate"));
  } else if (eventType === "RECEIVABLE_INSTALLMENT_CANCELED") {
    parts.push("CANCELAMENTO DE PARCELA DO CONTAS A RECEBER");
    appendCommonPartyAndDocument(parts, safeMetadata, "RECEIVABLE");
    appendMoney(parts, "VALOR", firstValue(safeMetadata, "amount", "currentAmount", "nextAmount"));
    appendDate(parts, "VENCIMENTO", firstValue(safeMetadata, "dueDate", "currentDueDate"));
    appendCancellationReason(parts, safeMetadata);
  } else if (eventType === "RECEIVABLE_MOVEMENT_CANCELED") {
    parts.push("CANCELAMENTO DO MOVIMENTO DO CONTAS A RECEBER");
    appendCommonPartyAndDocument(parts, safeMetadata, "RECEIVABLE");
    appendMoney(parts, "VALOR DA VENDA", firstValue(safeMetadata, "totalAmount", "amount", "currentAmount"));
    appendMoney(parts, "VALOR PAGO", safeMetadata.paidAmount);
    appendMoney(parts, "VALOR A RECEBER", safeMetadata.receivableAmount);
    appendInstallmentSummary(parts, safeMetadata);
    appendCancellationReason(parts, safeMetadata);
  } else if (eventType === "RECEIVABLE_SETTLEMENT_REVERSED") {
    parts.push("ESTORNO DE RECEBIMENTO DO CONTAS A RECEBER");
    appendCommonPartyAndDocument(parts, safeMetadata, "RECEIVABLE");
    appendMoney(parts, "VALOR ESTORNADO", firstValue(safeMetadata, "reversedAmount", "receivedAmount", "amount"));
    appendText(parts, "QUANTIDADE DE PARCELAS", safeMetadata.reversedCount);
    appendMoney(parts, "SALDO REABERTO", safeMetadata.restoredOpenAmount);
    appendInstallmentSummary(parts, safeMetadata);
    appendCancellationReason(parts, safeMetadata);
  } else if (eventType === "PAYABLE_INSTALLMENT_AMOUNT_CHANGED") {
    parts.push("ALTERAÇÃO DE VALOR DE PARCELA DO CONTAS A PAGAR");
    appendCommonPartyAndDocument(parts, safeMetadata, "PAYABLE");
    appendMoney(parts, "VALOR ANTERIOR", safeMetadata.previousAmount);
    appendMoney(parts, "NOVO VALOR", firstValue(safeMetadata, "nextAmount", "currentAmount", "amount"));
  } else if (eventType === "PAYABLE_INSTALLMENT_DUE_DATE_CHANGED") {
    parts.push("ALTERAÇÃO DE VENCIMENTO DE PARCELA DO CONTAS A PAGAR");
    appendCommonPartyAndDocument(parts, safeMetadata, "PAYABLE");
    appendDate(parts, "VENCIMENTO ANTERIOR", safeMetadata.previousDueDate);
    appendDate(parts, "NOVO VENCIMENTO", firstValue(safeMetadata, "nextDueDate", "currentDueDate", "dueDate"));
  } else if (eventType === "PAYABLE_INSTALLMENT_CANCELED") {
    parts.push("CANCELAMENTO DE PARCELA DO CONTAS A PAGAR");
    appendCommonPartyAndDocument(parts, safeMetadata, "PAYABLE");
    appendMoney(parts, "VALOR", firstValue(safeMetadata, "amount", "currentAmount", "nextAmount"));
    appendDate(parts, "VENCIMENTO", firstValue(safeMetadata, "dueDate", "currentDueDate"));
    appendCancellationReason(parts, safeMetadata);
  } else if (eventType === "PAYABLE_MOVEMENT_CANCELED") {
    parts.push("CANCELAMENTO DO MOVIMENTO DO CONTAS A PAGAR");
    appendCommonPartyAndDocument(parts, safeMetadata, "PAYABLE");
    appendMoney(parts, "VALOR TOTAL", firstValue(safeMetadata, "totalAmount", "amount", "currentAmount"));
    appendInstallmentSummary(parts, safeMetadata);
    appendCancellationReason(parts, safeMetadata);
  } else if (eventType === "PAYABLE_SETTLEMENT_REVERSED") {
    parts.push("ESTORNO DE PAGAMENTO DO CONTAS A PAGAR");
    appendCommonPartyAndDocument(parts, safeMetadata, "PAYABLE");
    appendMoney(parts, "VALOR ESTORNADO", firstValue(safeMetadata, "reversedAmount", "amount", "currentAmount"));
    appendText(parts, "QUANTIDADE DE PARCELAS", safeMetadata.reversedCount);
    appendCancellationReason(parts, safeMetadata);
  } else if (eventType === "CASH_MOVEMENT_CANCELED") {
    parts.push("CANCELAMENTO DE MOVIMENTO DE CAIXA");
    appendText(parts, "TIPO", safeMetadata.movementType);
    appendText(parts, "DESCRIÇÃO", safeMetadata.description);
    appendMoney(parts, "VALOR", firstValue(safeMetadata, "amount", "currentAmount"));
    appendText(parts, "FORMA DE PAGAMENTO", safeMetadata.paymentMethod);
    appendText(parts, "VÍNCULO", firstValue(safeMetadata, "referenceType", "sourceEntityName"));
    appendText(
      parts,
      "CLIENTE",
      firstValue(safeMetadata, "customerName", "customerNameSnapshot", "payerNameSnapshot"),
    );
    appendText(parts, "VENDA", safeMetadata.saleNumber);
    appendText(parts, "TÍTULO", firstValue(safeMetadata, "titleName", "titleId", "receivableTitleId"));
    appendText(parts, "PARCELA", installmentLabel(safeMetadata));
    appendCancellationReason(parts, safeMetadata);
  }

  if (!parts.length) {
    return truncateMessage(fallbackMessage);
  }

  return truncateMessage(`${parts.join(". ")}.`);
}
