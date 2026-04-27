import { normalizeDigits, normalizeText, roundMoney } from "../../../common/finance-core.utils";

export const SICOOB_MOVEMENT_TYPE_CODES = {
  LIQUIDATION: 5,
  WRITE_OFF: 6,
} as const;

export type BankReturnMovementPayload = {
  siglaMovimento?: string | null;
  numeroTitulo?: number | string | null;
  seuNumero?: string | null;
  codigoBarras?: string | null;
  valorTitulo?: number | null;
  valorLiquido?: number | null;
  valorDesconto?: number | null;
  valorMora?: number | null;
  valorTarifaMovimento?: number | null;
  dataVencimentoTitulo?: string | null;
  dataMovimentoLiquidacao?: string | null;
  dataLiquidacao?: string | null;
  dataPrevisaoCredito?: string | null;
  numeroContratoCobranca?: number | string | null;
};

export type BankReturnInstallmentSnapshot = {
  id: string;
  sourceInstallmentKey: string;
  status: string;
  openAmount: number;
  paidAmount: number;
  settledAt?: Date | null;
};

export type BankReturnEvaluation = {
  suggestionCode: string;
  suggestionLabel: string;
  noteText: string;
  canApply: boolean;
};

export function resolveBankReturnMovementStatus(siglaMovimento?: string | null) {
  const normalized = normalizeText(siglaMovimento) || "";

  if (normalized.startsWith("LIQUI")) {
    return {
      code: "LIQUIDATED",
      label: "LIQUIDADO",
    };
  }

  if (normalized.startsWith("BAIX")) {
    return {
      code: "WRITE_OFF",
      label: "BAIXADO",
    };
  }

  return {
    code: "OTHER",
    label: normalized || "OUTRO",
  };
}

export function buildImportedBankReturnItem(input: {
  payload: BankReturnMovementPayload;
  movementStatus: string;
  requestCode?: string | number | null;
  fileId?: string | number | null;
}) {
  return {
    movementTypeCode: normalizeText(input.payload.siglaMovimento) || "OUTRO",
    movementStatus: normalizeText(input.movementStatus) || "OTHER",
    externalRequestCode: normalizeDigits(String(input.requestCode || "")),
    externalFileId: normalizeDigits(String(input.fileId || "")),
    dueDate: input.payload.dataVencimentoTitulo
      ? new Date(input.payload.dataVencimentoTitulo)
      : null,
    movementDate: input.payload.dataMovimentoLiquidacao
      ? new Date(input.payload.dataMovimentoLiquidacao)
      : null,
    paymentDate: input.payload.dataLiquidacao
      ? new Date(input.payload.dataLiquidacao)
      : null,
    expectedCreditDate: input.payload.dataPrevisaoCredito
      ? new Date(input.payload.dataPrevisaoCredito)
      : null,
    ourNumber: normalizeDigits(String(input.payload.numeroTitulo || "")),
    yourNumber: normalizeText(input.payload.seuNumero),
    barcode: normalizeDigits(input.payload.codigoBarras),
    contractNumber: normalizeDigits(
      String(input.payload.numeroContratoCobranca || ""),
    ),
    amount: roundMoney(Number(input.payload.valorTitulo || 0)),
    settledAmount:
      input.payload.valorLiquido === undefined ||
      input.payload.valorLiquido === null
        ? null
        : roundMoney(Number(input.payload.valorLiquido || 0)),
    discountAmount:
      input.payload.valorDesconto === undefined ||
      input.payload.valorDesconto === null
        ? null
        : roundMoney(Number(input.payload.valorDesconto || 0)),
    interestAmount:
      input.payload.valorMora === undefined || input.payload.valorMora === null
        ? null
        : roundMoney(Number(input.payload.valorMora || 0)),
    feeAmount:
      input.payload.valorTarifaMovimento === undefined ||
      input.payload.valorTarifaMovimento === null
        ? null
        : roundMoney(Number(input.payload.valorTarifaMovimento || 0)),
    rawPayloadJson: JSON.stringify(input.payload),
  };
}

export function evaluateBankReturnForInstallment(input: {
  movementStatus: string;
  installment?: BankReturnInstallmentSnapshot | null;
  appliedStatus?: string | null;
}) {
  const movementStatus = normalizeText(input.movementStatus) || "OTHER";
  const appliedStatus = normalizeText(input.appliedStatus);
  const installment = input.installment;

  if (appliedStatus === "APPLIED") {
    return {
      suggestionCode: "DONE",
      suggestionLabel: "RETORNO JÁ APLICADO",
      noteText: "RETORNO JÁ APLICADO NO SISTEMA.",
      canApply: false,
    } satisfies BankReturnEvaluation;
  }

  if (movementStatus === "WRITE_OFF") {
    return {
      suggestionCode: "IGNORE_WRITE_OFF",
      suggestionLabel: "NÃO BAIXAR",
      noteText: installment
        ? "BOLETO BAIXADO NO BANCO - NÃO BAIXA PARCELA."
        : "BOLETO BAIXADO NO BANCO SEM VÍNCULO NO SISTEMA.",
      canApply: false,
    } satisfies BankReturnEvaluation;
  }

  if (movementStatus !== "LIQUIDATED") {
    return {
      suggestionCode: "IGNORE_OTHER",
      suggestionLabel: "SEM AÇÃO",
      noteText: "TIPO DE RETORNO SEM AÇÃO AUTOMÁTICA.",
      canApply: false,
    } satisfies BankReturnEvaluation;
  }

  if (!installment) {
    return {
      suggestionCode: "NO_MATCH",
      suggestionLabel: "SEM VÍNCULO",
      noteText: "LIQUIDADO NO BANCO SEM PARCELA VINCULADA.",
      canApply: false,
    } satisfies BankReturnEvaluation;
  }

  if (normalizeText(installment.status) === "PAID" || installment.openAmount <= 0) {
    return {
      suggestionCode: "ALREADY_SETTLED",
      suggestionLabel: "JÁ BAIXADA",
      noteText: "PARCELA JÁ ESTÁ FECHADA NO SISTEMA.",
      canApply: false,
    } satisfies BankReturnEvaluation;
  }

  return {
    suggestionCode: "APPLY_LIQUIDATION",
    suggestionLabel: "VAI BAIXAR",
    noteText: "VAI BAIXAR BOLETO.",
    canApply: true,
  } satisfies BankReturnEvaluation;
}
