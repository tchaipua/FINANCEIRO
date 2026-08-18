import { BadRequestException } from "@nestjs/common";
import { normalizeText, roundMoney } from "./finance-core.utils";

export const CASH_SESSION_CLOSING_MODES = [
  "MANUAL",
  "DAILY_REQUIRED",
  "DAILY_AUTOMATIC",
] as const;

export type CashSessionClosingMode =
  (typeof CASH_SESSION_CLOSING_MODES)[number];

export const DEFAULT_CASH_SESSION_CLOSING_MODE: CashSessionClosingMode =
  "MANUAL";
export const DEFAULT_CASH_SESSION_TIMEZONE = "America/Sao_Paulo";

type CashSessionPolicyClient = {
  cashOperatorPolicy: {
    findUnique(args: any): Promise<any>;
  };
  cashSession: {
    findFirst(args: any): Promise<any>;
    findUnique(args: any): Promise<any>;
    updateMany(args: any): Promise<{ count: number }>;
    update(args: any): Promise<any>;
    create(args: any): Promise<any>;
  };
  $transaction<T>(callback: (transaction: any) => Promise<T>): Promise<T>;
};

export function normalizeCashSessionClosingMode(
  value?: string | null,
): CashSessionClosingMode {
  const normalized = String(value || "").trim().toUpperCase();
  return (CASH_SESSION_CLOSING_MODES as readonly string[]).includes(normalized)
    ? (normalized as CashSessionClosingMode)
    : DEFAULT_CASH_SESSION_CLOSING_MODE;
}

export function getCashBusinessDate(
  value: Date | string,
  timezone = DEFAULT_CASH_SESSION_TIMEZONE,
) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export async function getCashOperatorPolicy(
  prisma: CashSessionPolicyClient,
  input: {
    companyId: string;
    branchCode: number;
    cashierUserId: string;
  },
) {
  const policy = await prisma.cashOperatorPolicy.findUnique({
    where: {
      companyId_branchCode_cashierUserId: {
        companyId: input.companyId,
        branchCode: input.branchCode,
        cashierUserId: normalizeText(input.cashierUserId) || input.cashierUserId,
      },
    },
  });

  return {
    id: policy?.id || null,
    companyId: input.companyId,
    branchCode: input.branchCode,
    cashierUserId: policy?.cashierUserId || input.cashierUserId,
    cashierDisplayName: policy?.cashierDisplayName || null,
    closingMode: normalizeCashSessionClosingMode(policy?.closingMode),
    timezone: DEFAULT_CASH_SESSION_TIMEZONE,
    createdAt: policy?.createdAt?.toISOString?.() || null,
    updatedAt: policy?.updatedAt?.toISOString?.() || null,
  };
}

function buildSessionInclude(includeRelations: boolean) {
  return includeRelations
    ? {
        movements: {
          where: { canceledAt: null },
          orderBy: [{ occurredAt: "asc" }],
        },
        settlements: {
          where: { canceledAt: null },
        },
      }
    : undefined;
}

async function rollSessionToNextBusinessDay(
  prisma: CashSessionPolicyClient,
  session: any,
  input: {
    companyId: string;
    branchCode: number;
    sourceSystem: string;
    sourceTenantId: string;
    cashierUserId: string;
    cashierDisplayName?: string | null;
    includeRelations: boolean;
  },
) {
  const now = new Date();
  const finalAmount = roundMoney(Number(session.expectedClosingAmount || 0));
  const include = buildSessionInclude(input.includeRelations);

  return prisma.$transaction(async (tx) => {
    const current = await tx.cashSession.findUnique({
      where: { id: session.id },
    });

    if (!current || current.status !== "OPEN" || current.canceledAt) {
      return tx.cashSession.findFirst({
        where: {
          companyId: input.companyId,
          branchCode: input.branchCode,
          cashierUserId: normalizeText(input.cashierUserId) || input.cashierUserId,
          status: "OPEN",
          canceledAt: null,
        },
        include,
        orderBy: { openedAt: "desc" },
      });
    }

    const closed = await tx.cashSession.updateMany({
      where: {
        id: current.id,
        status: "OPEN",
        canceledAt: null,
      },
      data: {
        status: "CLOSED",
        declaredClosingAmount: finalAmount,
        closeReason: "DAILY_AUTOMATIC",
        closedBy: "SISTEMA",
        closedAt: now,
        updatedBy: "SISTEMA",
      },
    });

    if (!closed.count) {
      return tx.cashSession.findFirst({
        where: {
          companyId: input.companyId,
          branchCode: input.branchCode,
          cashierUserId: normalizeText(input.cashierUserId) || input.cashierUserId,
          status: "OPEN",
          canceledAt: null,
        },
        include,
        orderBy: { openedAt: "desc" },
      });
    }

    return tx.cashSession.create({
      data: {
        companyId: input.companyId,
        branchCode: input.branchCode,
        sourceSystem: normalizeText(input.sourceSystem) || input.sourceSystem,
        sourceTenantId: normalizeText(input.sourceTenantId) || input.sourceTenantId,
        cashierUserId: normalizeText(input.cashierUserId) || input.cashierUserId,
        cashierDisplayName:
          normalizeText(input.cashierDisplayName) ||
          current.cashierDisplayName ||
          "CAIXA",
        status: "OPEN",
        openingAmount: finalAmount,
        totalReceivedAmount: 0,
        expectedClosingAmount: finalAmount,
        notes: "ABERTO AUTOMATICAMENTE APÓS A VIRADA DO DIA.",
        createdBy: "SISTEMA",
        updatedBy: "SISTEMA",
      },
      include,
    });
  });
}

export async function ensureOpenCashSessionReady(
  prisma: CashSessionPolicyClient,
  input: {
    companyId: string;
    branchCode: number;
    sourceSystem: string;
    sourceTenantId: string;
    cashierUserId: string;
    cashierDisplayName?: string | null;
    includeRelations?: boolean;
    allowDailyRequiredClose?: boolean;
  },
) {
  const normalizedCashierUserId =
    normalizeText(input.cashierUserId) || String(input.cashierUserId || "").trim();
  if (!normalizedCashierUserId) {
    throw new BadRequestException("Informe o operador do caixa.");
  }

  const includeRelations = input.includeRelations === true;
  const policy = await getCashOperatorPolicy(prisma, {
    companyId: input.companyId,
    branchCode: input.branchCode,
    cashierUserId: normalizedCashierUserId,
  });
  let session = await prisma.cashSession.findFirst({
    where: {
      companyId: input.companyId,
      branchCode: input.branchCode,
      cashierUserId: normalizedCashierUserId,
      status: "OPEN",
      canceledAt: null,
    },
    include: buildSessionInclude(includeRelations),
    orderBy: { openedAt: "desc" },
  });

  if (!session) {
    return { session: null, policy, closeRequired: false, rolledOver: false };
  }

  const sessionBusinessDate = getCashBusinessDate(session.openedAt, policy.timezone);
  const currentBusinessDate = getCashBusinessDate(new Date(), policy.timezone);
  if (
    policy.closingMode === "MANUAL" ||
    sessionBusinessDate >= currentBusinessDate
  ) {
    return { session, policy, closeRequired: false, rolledOver: false };
  }

  if (policy.closingMode === "DAILY_REQUIRED") {
    if (!input.allowDailyRequiredClose) {
      throw new BadRequestException({
        code: "CASH_SESSION_CLOSE_REQUIRED",
        message:
          "O caixa do dia anterior precisa ser fechado antes de continuar.",
        cashierUserId: normalizedCashierUserId,
        cashSessionId: session.id,
      });
    }

    return { session, policy, closeRequired: true, rolledOver: false };
  }

  session = await rollSessionToNextBusinessDay(prisma, session, {
    ...input,
    cashierUserId: normalizedCashierUserId,
    includeRelations,
  });

  return { session, policy, closeRequired: false, rolledOver: true };
}
