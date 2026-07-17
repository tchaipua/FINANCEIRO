export type SuperTefPaymentForApplication = {
  companyId: string;
  branchCode: number;
  status: string;
  transactionType: string;
  amount: number;
  purpose?: string | null;
  appliedAt?: Date | null;
  appliedEntityType?: string | null;
  appliedEntityId?: string | null;
  canceledAt?: Date | null;
};

export function getSuperTefCardApplicationError(
  payment: SuperTefPaymentForApplication | null | undefined,
  input: {
    companyId: string;
    branchCode: number;
    paymentMethod: "CREDIT_CARD" | "DEBIT_CARD";
    amount?: number;
    requiredPurpose?: "SALE" | "RECEIVABLE";
    allowedAppliedEntityType?: string;
    allowedAppliedEntityId?: string;
  },
) {
  if (
    !payment ||
    payment.companyId !== input.companyId ||
    Number(payment.branchCode) !== Number(input.branchCode) ||
    payment.canceledAt
  ) {
    return "O PAGAMENTO SUPERTEF NÃO PERTENCE A ESTA EMPRESA E FILIAL.";
  }
  if (payment.status !== "PAID") {
    return "O PAGAMENTO DO CARTÃO NÃO ESTÁ APROVADO NO SUPERTEF.";
  }
  if (
    input.requiredPurpose &&
    payment.purpose !== input.requiredPurpose
  ) {
    return "O PAGAMENTO SUPERTEF NÃO FOI EMITIDO PARA ESTA OPERAÇÃO.";
  }
  const expectedType =
    input.paymentMethod === "DEBIT_CARD" ? "DEBIT" : "CREDIT";
  if (payment.transactionType !== expectedType) {
    return "A MODALIDADE APROVADA NO SUPERTEF É DIFERENTE DA FORMA INFORMADA.";
  }
  if (
    input.amount !== undefined &&
    Math.abs(Number(payment.amount) - Number(input.amount)) > 0.01
  ) {
    return "O VALOR APROVADO NO SUPERTEF É DIFERENTE DO VALOR INFORMADO.";
  }
  if (
    payment.appliedAt &&
    (payment.appliedEntityType !== input.allowedAppliedEntityType ||
      payment.appliedEntityId !== input.allowedAppliedEntityId)
  ) {
    return "ESTE PAGAMENTO SUPERTEF JÁ FOI UTILIZADO.";
  }
  return null;
}
