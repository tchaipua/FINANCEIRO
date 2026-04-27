import { roundMoney } from "./finance-core.utils";

export type FinancialRuleSettings = {
  interestRate?: number | null;
  interestGracePeriod?: number | null;
  penaltyRate?: number | null;
  penaltyValue?: number | null;
  penaltyGracePeriod?: number | null;
};

export type InstallmentSettlementSuggestion = {
  interestRate: number;
  interestGracePeriod: number;
  penaltyRate: number;
  penaltyValue: number;
  penaltyGracePeriod: number;
  overdueDays: number;
  interestDays: number;
  penaltyApplied: boolean;
  suggestedDiscountAmount: number;
  suggestedInterestAmount: number;
  suggestedPenaltyAmount: number;
  suggestedReceivedAmount: number;
};

function normalizeNumericValue(value?: number | null) {
  const numericValue = Number(value || 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function startOfDay(value: Date) {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
}

export function resolveFinancialRuleSettings(
  settings?: FinancialRuleSettings | null,
) {
  return {
    interestRate: roundMoney(normalizeNumericValue(settings?.interestRate)),
    interestGracePeriod: Math.max(
      0,
      Math.trunc(normalizeNumericValue(settings?.interestGracePeriod)),
    ),
    penaltyRate: roundMoney(normalizeNumericValue(settings?.penaltyRate)),
    penaltyValue: roundMoney(normalizeNumericValue(settings?.penaltyValue)),
    penaltyGracePeriod: Math.max(
      0,
      Math.trunc(normalizeNumericValue(settings?.penaltyGracePeriod)),
    ),
  };
}

export function calculateOverdueDays(
  dueDate: Date,
  referenceDate?: Date | null,
) {
  const normalizedDueDate = startOfDay(dueDate);
  const normalizedReferenceDate = startOfDay(referenceDate || new Date());
  const differenceInMs =
    normalizedReferenceDate.getTime() - normalizedDueDate.getTime();

  if (differenceInMs <= 0) {
    return 0;
  }

  return Math.floor(differenceInMs / 86400000);
}

export function buildInstallmentSettlementSuggestion(input: {
  dueDate: Date;
  openAmount: number;
  referenceDate?: Date | null;
  settings?: FinancialRuleSettings | null;
}) {
  const normalizedSettings = resolveFinancialRuleSettings(input.settings);
  const normalizedOpenAmount = roundMoney(Number(input.openAmount || 0));
  const overdueDays = calculateOverdueDays(
    input.dueDate,
    input.referenceDate,
  );

  const interestDays =
    overdueDays > normalizedSettings.interestGracePeriod
      ? overdueDays - normalizedSettings.interestGracePeriod
      : 0;

  const penaltyApplied = overdueDays > normalizedSettings.penaltyGracePeriod;

  const suggestedInterestAmount =
    normalizedSettings.interestRate > 0 && interestDays > 0
      ? roundMoney(
          normalizedOpenAmount *
            (normalizedSettings.interestRate / 100) *
            (interestDays / 30),
        )
      : 0;

  const suggestedPenaltyAmount =
    penaltyApplied && normalizedSettings.penaltyValue > 0
      ? normalizedSettings.penaltyValue
      : penaltyApplied && normalizedSettings.penaltyRate > 0
        ? roundMoney(
            normalizedOpenAmount * (normalizedSettings.penaltyRate / 100),
          )
        : 0;

  return {
    ...normalizedSettings,
    overdueDays,
    interestDays,
    penaltyApplied,
    suggestedDiscountAmount: 0,
    suggestedInterestAmount,
    suggestedPenaltyAmount,
    suggestedReceivedAmount: roundMoney(
      normalizedOpenAmount + suggestedInterestAmount + suggestedPenaltyAmount,
    ),
  } satisfies InstallmentSettlementSuggestion;
}
