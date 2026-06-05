import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  normalizeDigits,
  normalizeText,
  parseIsoDate,
  roundMoney,
} from "../../../common/finance-core.utils";
import {
  buildInstallmentSettlementSuggestion,
  resolveFinancialRuleSettings,
} from "../../../common/manual-settlement.utils";
import {
  CloseCurrentCashSessionDto,
  CreateCustomerCreditDto,
  CreateCashMovementDto,
  CurrentCashSessionQueryDto,
  ListInstallmentSettlementHistoryDto,
  ListCustomerCreditsDto,
  ListCashSessionsDto,
  OpenCashSessionDto,
  ReverseSettlementGroupDto,
  ReverseManualSettlementDto,
  SettleCashInstallmentDto,
  SettleManualInstallmentDto,
} from "./dto/cash-sessions.dto";

const CASH_SESSION_PAYMENT_METHOD_METADATA = {
  CASH: {
    label: "DINHEIRO",
    affectsDrawer: true,
    description: "BAIXA MANUAL DE PARCELA - DINHEIRO",
    successMessage: "Baixa em dinheiro registrada com sucesso.",
  },
  PIX: {
    label: "PIX",
    affectsDrawer: false,
    description: "BAIXA MANUAL DE PARCELA - PIX",
    successMessage: "Baixa por pix registrada com sucesso.",
  },
  CREDIT_CARD: {
    label: "CARTÃO DE CRÉDITO",
    affectsDrawer: false,
    description: "BAIXA MANUAL DE PARCELA - CARTÃO DE CRÉDITO",
    successMessage: "Baixa por cartão de crédito registrada com sucesso.",
  },
  DEBIT_CARD: {
    label: "CARTÃO DE DÉBITO",
    affectsDrawer: false,
    description: "BAIXA MANUAL DE PARCELA - CARTÃO DE DÉBITO",
    successMessage: "Baixa por cartão de débito registrada com sucesso.",
  },
  CHECK: {
    label: "CHEQUE",
    affectsDrawer: true,
    description: "BAIXA MANUAL DE PARCELA - CHEQUE",
    successMessage: "Baixa por cheque registrada com sucesso.",
  },
  CUSTOMER_CREDIT: {
    label: "CRÉDITO DO CLIENTE",
    affectsDrawer: true,
    description: "BAIXA MANUAL DE PARCELA - CRÉDITO DO CLIENTE",
    successMessage: "Baixa por crédito do cliente registrada com sucesso.",
  },
} as const;

function hasRepeatedDigits(value: string) {
  return /^(\d)\1+$/.test(value);
}

function isValidCpf(value: string) {
  const digits = normalizeDigits(value) || "";
  if (!/^\d{11}$/.test(digits) || hasRepeatedDigits(digits)) return false;

  const calculateDigit = (baseLength: number) => {
    const sum = digits
      .slice(0, baseLength)
      .split("")
      .reduce(
        (total, digit, index) =>
          total + Number(digit) * (baseLength + 1 - index),
        0,
      );
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };

  return calculateDigit(9) === Number(digits[9]) && calculateDigit(10) === Number(digits[10]);
}

function isValidCnpj(value: string) {
  const digits = normalizeDigits(value) || "";
  if (!/^\d{14}$/.test(digits) || hasRepeatedDigits(digits)) return false;

  const calculateDigit = (baseLength: number) => {
    const weights =
      baseLength === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = digits
      .slice(0, baseLength)
      .split("")
      .reduce(
        (total, digit, index) => total + Number(digit) * (weights[index] ?? 0),
        0,
      );
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return calculateDigit(12) === Number(digits[12]) && calculateDigit(13) === Number(digits[13]);
}

function isValidBrazilDocument(value: string | null | undefined) {
  const digits = normalizeDigits(value) || "";
  if (!digits) return true;
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}

@Injectable()
export class CashSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildInstallmentFinancialSettingsSnapshot(installment: any) {
    return resolveFinancialRuleSettings({
      interestRate:
        installment.interestRate ?? installment.company?.interestRate ?? null,
      interestGracePeriod:
        installment.interestGracePeriod ??
        installment.company?.interestGracePeriod ??
        null,
      penaltyRate:
        installment.penaltyRate ?? installment.company?.penaltyRate ?? null,
      penaltyValue:
        installment.penaltyValue ?? installment.company?.penaltyValue ?? null,
      penaltyGracePeriod:
        installment.penaltyGracePeriod ??
        installment.company?.penaltyGracePeriod ??
        null,
    });
  }

  private buildReceivedByPaymentMethod(session: any) {
    const totals = {
      cash: 0,
      pix: 0,
      creditCard: 0,
      debitCard: 0,
      check: 0,
      customerCreditSettlement: 0,
      customerCreditGenerated: 0,
      customerCreditUsed: 0,
    };

    if (!Array.isArray(session?.movements)) {
      return totals;
    }

    for (const movement of session.movements) {
      const amount = roundMoney(Number(movement?.amount || 0));

      if (
        movement?.movementType === "CUSTOMER_CREDIT_GENERATED" &&
        movement?.direction === "IN"
      ) {
        totals.customerCreditGenerated = roundMoney(
          totals.customerCreditGenerated + amount,
        );
        continue;
      }

      if (
        movement?.movementType === "CUSTOMER_CREDIT_USAGE" &&
        movement?.direction === "OUT"
      ) {
        totals.customerCreditUsed = roundMoney(totals.customerCreditUsed + amount);
        continue;
      }

      if (
        movement?.movementType !== "SETTLEMENT" ||
        movement?.direction !== "IN"
      ) {
        continue;
      }

      const normalizedPaymentMethod = normalizeText(movement?.paymentMethod);

      if (normalizedPaymentMethod === "CASH") {
        totals.cash = roundMoney(totals.cash + amount);
      } else if (normalizedPaymentMethod === "PIX") {
        totals.pix = roundMoney(totals.pix + amount);
      } else if (normalizedPaymentMethod === "CREDIT_CARD") {
        totals.creditCard = roundMoney(totals.creditCard + amount);
      } else if (normalizedPaymentMethod === "DEBIT_CARD") {
        totals.debitCard = roundMoney(totals.debitCard + amount);
      } else if (normalizedPaymentMethod === "CHECK") {
        totals.check = roundMoney(totals.check + amount);
      } else if (normalizedPaymentMethod === "CUSTOMER_CREDIT") {
        totals.customerCreditSettlement = roundMoney(
          totals.customerCreditSettlement + amount,
        );
      }
    }

    return totals;
  }

  private resolvePaymentMethodMetadata(paymentMethod?: string | null) {
    const normalizedPaymentMethod = normalizeText(paymentMethod);

    if (
      !normalizedPaymentMethod ||
      !(normalizedPaymentMethod in CASH_SESSION_PAYMENT_METHOD_METADATA)
    ) {
      throw new BadRequestException(
        "Informe uma forma de recebimento válida.",
      );
    }

    return {
      code: normalizedPaymentMethod,
      ...CASH_SESSION_PAYMENT_METHOD_METADATA[
        normalizedPaymentMethod as keyof typeof CASH_SESSION_PAYMENT_METHOD_METADATA
      ],
    };
  }

  private async resolveCompany(sourceSystem: string, sourceTenantId: string) {
    const company = await this.prisma.company.findUnique({
      where: {
        sourceSystem_sourceTenantId: {
          sourceSystem: normalizeText(sourceSystem)!,
          sourceTenantId: normalizeText(sourceTenantId)!,
        },
      },
    });

    if (!company) {
      throw new NotFoundException("EMPRESA FINANCEIRA NÃO ENCONTRADA.");
    }

    return company;
  }

  private async loadOpenSession(
    companyId: string,
    cashierUserId: string,
    includeRelations = true,
  ) {
    const normalizedCashierUserId =
      normalizeText(cashierUserId) || String(cashierUserId || "").trim();

    return this.prisma.cashSession.findFirst({
      where: {
        companyId,
        cashierUserId: normalizedCashierUserId,
        status: "OPEN",
        canceledAt: null,
      },
      include: includeRelations
        ? {
            movements: {
              where: { canceledAt: null },
              orderBy: [{ occurredAt: "asc" }],
            },
            settlements: {
              where: { canceledAt: null },
            },
          }
        : undefined,
      orderBy: { openedAt: "desc" },
    });
  }

  private mapCashSession(session: any) {
    if (!session) return null;

    const receivedByPaymentMethod = this.buildReceivedByPaymentMethod(session);

    return {
      id: session.id,
      companyId: session.companyId,
      sourceSystem: session.sourceSystem,
      sourceTenantId: session.sourceTenantId,
      cashierUserId: session.cashierUserId,
      cashierDisplayName: session.cashierDisplayName,
      status: session.status,
      openingAmount: session.openingAmount,
      totalReceivedAmount: session.totalReceivedAmount,
      expectedClosingAmount: session.expectedClosingAmount,
      declaredClosingAmount: session.declaredClosingAmount,
      openedAt: session.openedAt.toISOString(),
      closedAt: session.closedAt?.toISOString() || null,
      notes: session.notes || null,
      createdAt: session.createdAt.toISOString(),
      createdBy: session.createdBy || null,
      updatedAt: session.updatedAt.toISOString(),
      updatedBy: session.updatedBy || null,
      receivedByPaymentMethod,
      movementCount: Array.isArray(session.movements) ? session.movements.length : 0,
      settlementCount: Array.isArray(session.settlements)
        ? session.settlements.length
        : 0,
      movements: Array.isArray(session.movements)
        ? session.movements.map((movement: any) => ({
            id: movement.id,
            movementType: movement.movementType,
            direction: movement.direction,
            paymentMethod: movement.paymentMethod || null,
            amount: movement.amount,
            description: movement.description,
            occurredAt: movement.occurredAt.toISOString(),
            referenceType: movement.referenceType || null,
            referenceId: movement.referenceId || null,
          }))
        : [],
    };
  }

  async getCurrent(query: CurrentCashSessionQueryDto) {
    const company = await this.resolveCompany(
      query.sourceSystem,
      query.sourceTenantId,
    );

    const session = await this.loadOpenSession(company.id, query.cashierUserId);
    return this.mapCashSession(session);
  }

  async getById(sessionId: string, query: ListCashSessionsDto) {
    const normalizedSessionId = String(sessionId || "").trim();
    const normalizedSourceSystem = normalizeText(query.sourceSystem);
    const normalizedSourceTenantId = normalizeText(query.sourceTenantId);

    if (!normalizedSessionId || !normalizedSourceTenantId) {
      throw new BadRequestException("Caixa inválido para consulta.");
    }

    const session = await this.prisma.cashSession.findFirst({
      where: {
        id: normalizedSessionId,
        canceledAt: null,
        ...(normalizedSourceSystem
          ? { sourceSystem: normalizedSourceSystem }
          : {}),
        sourceTenantId: normalizedSourceTenantId,
      },
      include: {
        company: {
          select: {
            name: true,
          },
        },
        movements: {
          where: { canceledAt: null },
          orderBy: [{ occurredAt: "asc" }],
        },
        settlements: {
          where: { canceledAt: null },
        },
      },
    });

    if (!session) {
      throw new NotFoundException("CAIXA NÃO ENCONTRADO.");
    }

    return {
      ...this.mapCashSession(session),
      companyName: session.company.name,
    };
  }

  private buildBankAccountLabel(bank: any) {
    const agency = `${bank.branchNumber}${bank.branchDigit ? `-${bank.branchDigit}` : ""}`;
    const account = `${bank.accountNumber}${bank.accountDigit ? `-${bank.accountDigit}` : ""}`;
    return `${bank.bankName} - AG ${agency} - CC ${account}`;
  }

  private async resolvePixBankAccount(companyId: string, bankAccountId?: string | null) {
    const normalizedBankAccountId = String(bankAccountId || "").trim();

    if (!normalizedBankAccountId) {
      throw new BadRequestException(
        "Selecione o banco onde o PIX será creditado.",
      );
    }

    const bank = await this.prisma.bankAccount.findFirst({
      where: {
        id: normalizedBankAccountId,
        companyId,
        status: "ACTIVE",
        canceledAt: null,
      },
    });

    if (!bank) {
      throw new NotFoundException("BANCO DO PIX NÃO ENCONTRADO.");
    }

    return {
      id: bank.id,
      label: this.buildBankAccountLabel(bank),
    };
  }

  async list(query: ListCashSessionsDto) {
    const normalizedSourceSystem = normalizeText(query.sourceSystem);
    const normalizedSourceTenantId = normalizeText(query.sourceTenantId);
    const normalizedStatus = normalizeText(query.status);
    const normalizedSearch = normalizeText(query.search);
    const normalizedCashierUserId = normalizeText(query.cashierUserId);

    if (!normalizedSourceTenantId) {
      return [];
    }

    const sessions = await this.prisma.cashSession.findMany({
      where: {
        canceledAt: null,
        ...(normalizedSourceSystem
          ? { sourceSystem: normalizedSourceSystem }
          : {}),
        ...(normalizedSourceTenantId
          ? { sourceTenantId: normalizedSourceTenantId }
          : {}),
        ...(normalizedStatus ? { status: normalizedStatus as any } : {}),
        ...(normalizedCashierUserId
          ? { cashierUserId: normalizedCashierUserId }
          : {}),
        ...(normalizedSearch
          ? {
              OR: [
                { cashierDisplayName: { contains: normalizedSearch } },
                { sourceTenantId: { contains: normalizedSearch } },
                { company: { name: { contains: normalizedSearch } } },
              ],
            }
          : {}),
      },
      include: {
        company: {
          select: {
            name: true,
          },
        },
        movements: {
          where: { canceledAt: null },
        },
        settlements: {
          where: { canceledAt: null },
        },
      },
      orderBy: [{ openedAt: "desc" }],
    });

    return sessions.map((session: any) => ({
      ...this.mapCashSession(session),
      companyName: session.company.name,
    }));
  }

  async open(payload: OpenCashSessionDto) {
    const company = await this.resolveCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    const existingOpenSession = await this.loadOpenSession(
      company.id,
      payload.cashierUserId,
      false,
    );

    if (existingOpenSession) {
      throw new BadRequestException(
        "Já existe um caixa aberto para este usuário nesta empresa.",
      );
    }

    const normalizedOpeningAmount = roundMoney(Number(payload.openingAmount || 0));
    const normalizedCashierDisplayName =
      normalizeText(payload.cashierDisplayName) || "CAIXA";

    const session = await this.prisma.$transaction(async (tx: any) => {
      const createdSession = await tx.cashSession.create({
        data: {
          companyId: company.id,
          sourceSystem: normalizeText(payload.sourceSystem)!,
          sourceTenantId: normalizeText(payload.sourceTenantId)!,
          cashierUserId: normalizeText(payload.cashierUserId)!,
          cashierDisplayName: normalizedCashierDisplayName,
          openingAmount: normalizedOpeningAmount,
          totalReceivedAmount: 0,
          expectedClosingAmount: normalizedOpeningAmount,
          notes: normalizeText(payload.notes),
          createdBy: payload.requestedBy || null,
          updatedBy: payload.requestedBy || null,
        },
      });

      if (normalizedOpeningAmount > 0) {
        await tx.cashMovement.create({
          data: {
            companyId: company.id,
            cashSessionId: createdSession.id,
            movementType: "OPENING",
            direction: "IN",
            paymentMethod: "CASH",
            amount: normalizedOpeningAmount,
            description: "ABERTURA DE CAIXA",
            occurredAt: createdSession.openedAt,
            createdBy: payload.requestedBy || null,
            updatedBy: payload.requestedBy || null,
          },
        });
      }

      return tx.cashSession.findUnique({
        where: { id: createdSession.id },
        include: {
          movements: {
            where: { canceledAt: null },
            orderBy: [{ occurredAt: "asc" }],
          },
          settlements: {
            where: { canceledAt: null },
          },
        },
      });
    });

    return this.mapCashSession(session);
  }

  async closeCurrent(payload: CloseCurrentCashSessionDto) {
    const company = await this.resolveCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    const openSession = await this.loadOpenSession(company.id, payload.cashierUserId);

    if (!openSession) {
      throw new BadRequestException(
        "Não existe caixa aberto para o usuário informado.",
      );
    }

    const declaredClosingAmount =
      payload.declaredClosingAmount !== undefined
        ? roundMoney(payload.declaredClosingAmount)
        : undefined;

    const closedAt = payload.closedAt
      ? parseIsoDate(payload.closedAt, "a data de fechamento")
      : new Date();

    const session = await this.prisma.$transaction(async (tx: any) => {
      await tx.cashSession.update({
        where: { id: openSession.id },
        data: {
          status: "CLOSED",
          declaredClosingAmount,
          closedAt,
          notes: normalizeText(payload.notes) || openSession.notes || null,
          updatedBy: payload.requestedBy || null,
        },
      });

      if (
        declaredClosingAmount !== undefined &&
        declaredClosingAmount !== openSession.expectedClosingAmount
      ) {
        const difference = roundMoney(
          declaredClosingAmount - openSession.expectedClosingAmount,
        );

        await tx.cashMovement.create({
          data: {
            companyId: company.id,
            cashSessionId: openSession.id,
            movementType: "CLOSING_ADJUSTMENT",
            direction: difference >= 0 ? "IN" : "OUT",
            paymentMethod: "CASH",
            amount: Math.abs(difference),
            description: "AJUSTE DE FECHAMENTO",
            occurredAt: closedAt,
            createdBy: payload.requestedBy || null,
            updatedBy: payload.requestedBy || null,
          },
        });
      }

      const nextOpeningAmount =
        declaredClosingAmount !== undefined
          ? declaredClosingAmount
          : openSession.expectedClosingAmount;

      await tx.cashSession.create({
        data: {
          companyId: company.id,
          sourceSystem: normalizeText(payload.sourceSystem)!,
          sourceTenantId: normalizeText(payload.sourceTenantId)!,
          cashierUserId: normalizeText(payload.cashierUserId)!,
          cashierDisplayName: openSession.cashierDisplayName,
          openingAmount: nextOpeningAmount,
          totalReceivedAmount: 0,
          expectedClosingAmount: nextOpeningAmount,
          notes: null,
          createdBy: payload.requestedBy || null,
          updatedBy: payload.requestedBy || null,
        },
      });

      return tx.cashSession.findUnique({
        where: { id: openSession.id },
        include: {
          movements: {
            where: { canceledAt: null },
            orderBy: [{ occurredAt: "asc" }],
          },
          settlements: {
            where: { canceledAt: null },
          },
        },
      });
    });

    return this.mapCashSession(session);
  }

  private mapCustomerCredit(credit: any) {
    return {
      id: credit.id,
      companyId: credit.companyId,
      partyId: credit.partyId || null,
      customerName: credit.customerName,
      customerDocument: credit.customerDocument || null,
      status: credit.status,
      originalAmount: credit.originalAmount,
      availableAmount: credit.availableAmount,
      sourceType: credit.sourceType || "MANUAL",
      sourceReference: credit.sourceReference || null,
      notes: credit.notes || null,
      createdAt: credit.createdAt.toISOString(),
      createdBy: credit.createdBy || null,
      updatedAt: credit.updatedAt.toISOString(),
      updatedBy: credit.updatedBy || null,
      movementCount: Array.isArray(credit.movements) ? credit.movements.length : 0,
    };
  }

  async listCustomerCredits(query: ListCustomerCreditsDto) {
    const normalizedSourceSystem = normalizeText(query.sourceSystem);
    const normalizedSourceTenantId = normalizeText(query.sourceTenantId);

    if (!normalizedSourceSystem || !normalizedSourceTenantId) {
      throw new BadRequestException(
        "Informe o sistema e o tenant de origem para consultar créditos.",
      );
    }

    const company = await this.resolveCompany(
      normalizedSourceSystem,
      normalizedSourceTenantId,
    );
    const normalizedStatus = normalizeText(query.status) || "OPEN";
    const normalizedSearch = normalizeText(query.search);
    const normalizedSearchDigits = normalizeDigits(query.search);

    const where: any = {
      companyId: company.id,
      canceledAt: null,
    };

    if (normalizedStatus !== "ALL") {
      where.status = normalizedStatus;
    }

    if (normalizedStatus === "OPEN") {
      where.availableAmount = { gt: 0 };
    }

    if (normalizedSearch || normalizedSearchDigits) {
      where.OR = [
        ...(normalizedSearch
          ? [{ customerName: { contains: normalizedSearch } }]
          : []),
        ...(normalizedSearchDigits
          ? [{ customerDocument: { contains: normalizedSearchDigits } }]
          : []),
      ];
    }

    const credits = await this.prisma.customerCredit.findMany({
      where,
      include: {
        movements: {
          where: { canceledAt: null },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    return credits.map((credit: any) => this.mapCustomerCredit(credit));
  }

  async createCustomerCredit(payload: CreateCustomerCreditDto) {
    const company = await this.resolveCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const openSession = await this.loadOpenSession(company.id, payload.cashierUserId);

    if (!openSession) {
      throw new BadRequestException(
        "O usuário informado precisa abrir o caixa antes de lançar crédito.",
      );
    }

    const customerName = normalizeText(payload.customerName);
    const customerDocument = normalizeDigits(payload.customerDocument);
    const partyId = normalizeText(payload.partyId);
    const amount = roundMoney(Number(payload.amount || 0));
    const occurredAt = payload.occurredAt
      ? parseIsoDate(payload.occurredAt, "a data do crédito")
      : new Date();
    const requestedBy =
      normalizeText(payload.requestedBy) ||
      normalizeText(payload.cashierUserId) ||
      null;

    if (!customerName) {
      throw new BadRequestException("Informe o cliente para lançar o crédito.");
    }

    if (!isValidBrazilDocument(customerDocument)) {
      throw new BadRequestException("CPF/CNPJ inválido.");
    }

    if (amount <= 0) {
      throw new BadRequestException("Informe um valor de crédito maior que zero.");
    }

    const credit = await this.prisma.$transaction(async (tx: any) => {
      const createdCredit = await tx.customerCredit.create({
        data: {
          companyId: company.id,
          partyId,
          customerName,
          customerDocument,
          originalAmount: amount,
          availableAmount: amount,
          sourceType: "MANUAL",
          notes: normalizeText(payload.notes),
          createdBy: requestedBy,
          updatedBy: requestedBy,
        },
      });

      await tx.customerCreditMovement.create({
        data: {
          companyId: company.id,
          creditId: createdCredit.id,
          cashSessionId: openSession.id,
          movementType: "GENERATED",
          direction: "IN",
          amount,
          referenceType: "CUSTOMER_CREDIT",
          referenceId: createdCredit.id,
          notes: normalizeText(payload.notes),
          occurredAt,
          createdBy: requestedBy,
          updatedBy: requestedBy,
        },
      });

      await tx.cashMovement.create({
        data: {
          companyId: company.id,
          cashSessionId: openSession.id,
          movementType: "CUSTOMER_CREDIT_GENERATED",
          direction: "IN",
          paymentMethod: "CUSTOMER_CREDIT",
          amount,
          description: "CRÉDITO GERADO/RETIDO PARA CLIENTE",
          occurredAt,
          referenceType: "CUSTOMER_CREDIT",
          referenceId: createdCredit.id,
          createdBy: requestedBy,
          updatedBy: requestedBy,
        },
      });

      await tx.cashSession.update({
        where: { id: openSession.id },
        data: {
          expectedClosingAmount: roundMoney(
            Number(openSession.expectedClosingAmount || 0) + amount,
          ),
          updatedBy: requestedBy,
        },
      });

      return tx.customerCredit.findUnique({
        where: { id: createdCredit.id },
        include: {
          movements: {
            where: { canceledAt: null },
          },
        },
      });
    });

    return {
      ...this.mapCustomerCredit(credit),
      message: "Crédito lançado para o cliente com sucesso.",
    };
  }

  async createMovement(payload: CreateCashMovementDto) {
    const company = await this.resolveCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    const openSession = await this.loadOpenSession(company.id, payload.cashierUserId);

    if (!openSession) {
      throw new BadRequestException(
        "Não existe caixa aberto para o usuário informado.",
      );
    }

    const movementType = normalizeText(payload.movementType);
    const direction = normalizeText(payload.direction);
    const amount = roundMoney(Number(payload.amount || 0));

    if (!["ENTRY", "EXIT", "ADJUSTMENT"].includes(movementType || "")) {
      throw new BadRequestException("Tipo de movimento inválido.");
    }

    if (!["IN", "OUT"].includes(direction || "")) {
      throw new BadRequestException("Direção de movimento inválida.");
    }

    if (movementType === "ENTRY" && direction !== "IN") {
      throw new BadRequestException("Entrada de dinheiro deve somar no caixa.");
    }

    if (movementType === "EXIT" && direction !== "OUT") {
      throw new BadRequestException("Saída de dinheiro deve subtrair do caixa.");
    }

    if (amount <= 0) {
      throw new BadRequestException("Informe um valor maior que zero.");
    }

    const occurredAt = payload.occurredAt
      ? parseIsoDate(payload.occurredAt, "a data do movimento")
      : new Date();
    const normalizedNotes = normalizeText(payload.notes);
    const movementLabel =
      movementType === "ENTRY"
        ? "ENTRADA DINHEIRO"
        : movementType === "EXIT"
          ? "SAÍDA DINHEIRO"
          : "AJUSTE CAIXA";
    const expectedClosingDelta = direction === "OUT" ? -amount : amount;

    const session = await this.prisma.$transaction(async (tx: any) => {
      await tx.cashMovement.create({
        data: {
          companyId: company.id,
          cashSessionId: openSession.id,
          movementType,
          direction,
          paymentMethod: "CASH",
          amount,
          description: normalizedNotes
            ? `${movementLabel} - ${normalizedNotes}`
            : movementLabel,
          occurredAt,
          createdBy: payload.requestedBy || null,
          updatedBy: payload.requestedBy || null,
        },
      });

      await tx.cashSession.update({
        where: { id: openSession.id },
        data: {
          expectedClosingAmount: roundMoney(
            Number(openSession.expectedClosingAmount || 0) + expectedClosingDelta,
          ),
          updatedBy: payload.requestedBy || null,
        },
      });

      return tx.cashSession.findUnique({
        where: { id: openSession.id },
        include: {
          movements: {
            where: { canceledAt: null },
            orderBy: [{ occurredAt: "asc" }],
          },
          settlements: {
            where: { canceledAt: null },
          },
        },
      });
    });

    return this.mapCashSession(session);
  }

  async settleInstallment(
    installmentId: string,
    payload: SettleCashInstallmentDto,
  ) {
    return this.settleManualInstallment(installmentId, {
      ...payload,
      paymentMethod: "CASH",
    });
  }

  private buildSettlementHistoryGroupId(settlement: any) {
    if (settlement.settlementGroupId) {
      return settlement.settlementGroupId;
    }

    return [
      "LEGADO",
      settlement.cashSessionId,
      new Date(settlement.settledAt).getTime(),
      settlement.paymentMethod,
      settlement.bankMovementGroupId || "SEM_BANCO",
    ].join("|");
  }

  async listSettlementHistory(query: ListInstallmentSettlementHistoryDto) {
    if (!query.sourceSystem || !query.sourceTenantId) {
      throw new BadRequestException(
        "Informe o sistema e o tenant de origem para consultar as baixas.",
      );
    }

    const company = await this.resolveCompany(
      query.sourceSystem,
      query.sourceTenantId,
    );
    const settlements = await this.prisma.installmentSettlement.findMany({
      where: {
        companyId: company.id,
      },
      include: {
        cashSession: {
          select: {
            id: true,
            cashierUserId: true,
            cashierDisplayName: true,
          },
        },
        installment: {
          select: {
            id: true,
            sourceInstallmentKey: true,
            installmentNumber: true,
            installmentCount: true,
            dueDate: true,
            amount: true,
            openAmount: true,
            paidAmount: true,
            status: true,
            descriptionSnapshot: true,
            payerNameSnapshot: true,
            title: {
              select: {
                sourceEntityName: true,
              },
            },
          },
        },
      },
      orderBy: [{ settledAt: "desc" }, { createdAt: "desc" }],
    });

    const groups = new Map<string, any>();

    for (const settlement of settlements) {
      const groupId = this.buildSettlementHistoryGroupId(settlement);
      const paymentMethod = this.resolvePaymentMethodMetadata(
        settlement.paymentMethod,
      );
      const current = groups.get(groupId) || {
        id: groupId,
        settlementGroupId: groupId,
        settledAt: settlement.settledAt,
        paymentMethod: settlement.paymentMethod,
        paymentMethodLabel: paymentMethod.label,
        cashierUserId: settlement.cashSession?.cashierUserId || null,
        cashierDisplayName:
          settlement.cashSession?.cashierDisplayName || settlement.requestedBy || "---",
        customerNames: new Set<string>(),
        receivedAmount: 0,
        discountAmount: 0,
        interestAmount: 0,
        penaltyAmount: 0,
        installmentCount: 0,
        activeSettlementCount: 0,
        canceledSettlementCount: 0,
        installments: [],
      };

      if (settlement.settledAt > current.settledAt) {
        current.settledAt = settlement.settledAt;
      }

      const customerName =
        normalizeText(settlement.installment?.payerNameSnapshot) ||
        normalizeText(settlement.installment?.title?.sourceEntityName) ||
        "CLIENTE NÃO INFORMADO";
      current.customerNames.add(customerName);
      current.receivedAmount = roundMoney(
        current.receivedAmount + Number(settlement.receivedAmount || 0),
      );
      current.discountAmount = roundMoney(
        current.discountAmount + Number(settlement.discountAmount || 0),
      );
      current.interestAmount = roundMoney(
        current.interestAmount + Number(settlement.interestAmount || 0),
      );
      current.penaltyAmount = roundMoney(
        current.penaltyAmount + Number(settlement.penaltyAmount || 0),
      );
      current.installmentCount += 1;

      if (settlement.canceledAt) {
        current.canceledSettlementCount += 1;
      } else {
        current.activeSettlementCount += 1;
      }

      current.installments.push({
        settlementId: settlement.id,
        installmentId: settlement.installmentId,
        sourceInstallmentKey: settlement.installment?.sourceInstallmentKey || null,
        description: settlement.installment?.descriptionSnapshot || "---",
        customerName,
        dueDate: settlement.installment?.dueDate?.toISOString() || null,
        installmentNumber: settlement.installment?.installmentNumber || 0,
        installmentCount: settlement.installment?.installmentCount || 0,
        receivedAmount: roundMoney(Number(settlement.receivedAmount || 0)),
        discountAmount: roundMoney(Number(settlement.discountAmount || 0)),
        interestAmount: roundMoney(Number(settlement.interestAmount || 0)),
        penaltyAmount: roundMoney(Number(settlement.penaltyAmount || 0)),
        paymentMethod: settlement.paymentMethod,
        paymentMethodLabel: paymentMethod.label,
        status: settlement.canceledAt ? "REVERSED" : "ACTIVE",
        settledAt: settlement.settledAt.toISOString(),
        canceledAt: settlement.canceledAt?.toISOString() || null,
      });

      groups.set(groupId, current);
    }

    const normalizedStatus = normalizeText(query.status) || "ALL";
    const normalizedSearch = normalizeText(query.search);

    return Array.from(groups.values())
      .map((group) => {
        const customerNames = Array.from(group.customerNames) as string[];
        const status =
          group.activeSettlementCount > 0 ? "ACTIVE" : "REVERSED";

        return {
          id: group.id,
          settlementGroupId: group.settlementGroupId,
          settledAt: group.settledAt.toISOString(),
          customerName:
            customerNames.length === 1
              ? customerNames[0]
              : `${customerNames.length} CLIENTES`,
          customerNames,
          installmentCount: group.installmentCount,
          activeSettlementCount: group.activeSettlementCount,
          canceledSettlementCount: group.canceledSettlementCount,
          receivedAmount: roundMoney(group.receivedAmount),
          discountAmount: roundMoney(group.discountAmount),
          interestAmount: roundMoney(group.interestAmount),
          penaltyAmount: roundMoney(group.penaltyAmount),
          paymentMethod: group.paymentMethod,
          paymentMethodLabel: group.paymentMethodLabel,
          cashierUserId: group.cashierUserId,
          cashierDisplayName: group.cashierDisplayName,
          status,
          statusLabel: status === "ACTIVE" ? "ATIVA" : "ESTORNADA",
          canReverse: status === "ACTIVE",
          installments: group.installments.sort((left: any, right: any) => {
            const leftDate = new Date(left.dueDate || "").getTime() || 0;
            const rightDate = new Date(right.dueDate || "").getTime() || 0;
            return leftDate - rightDate;
          }),
        };
      })
      .filter((group) => {
        if (normalizedStatus === "ACTIVE" && group.status !== "ACTIVE") {
          return false;
        }
        if (normalizedStatus === "INACTIVE" && group.status !== "REVERSED") {
          return false;
        }

        if (!normalizedSearch) return true;

        return normalizeText(
          [
            group.customerName,
            group.paymentMethodLabel,
            group.cashierDisplayName,
            group.statusLabel,
            group.receivedAmount,
            group.settlementGroupId,
          ].join(" "),
        )?.includes(normalizedSearch);
      })
      .sort(
        (left, right) =>
          new Date(right.settledAt).getTime() - new Date(left.settledAt).getTime(),
      );
  }

  async reverseSettlementGroup(
    settlementGroupId: string,
    payload: ReverseSettlementGroupDto,
  ) {
    const normalizedSettlementGroupId = String(settlementGroupId || "").trim();
    if (!normalizedSettlementGroupId) {
      throw new BadRequestException("Baixa inválida para estorno.");
    }

    const company = await this.resolveCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    const legacyParts = normalizedSettlementGroupId.startsWith("LEGADO|")
      ? normalizedSettlementGroupId.split("|")
      : null;
    const legacySettledAt =
      legacyParts && legacyParts[2] ? new Date(Number(legacyParts[2])) : null;
    const legacyWhere =
      legacyParts && legacyParts.length >= 5 && legacySettledAt && !Number.isNaN(legacySettledAt.getTime())
        ? {
            cashSessionId: legacyParts[1],
            settledAt: legacySettledAt,
            paymentMethod: legacyParts[3],
            settlementGroupId: null,
            bankMovementGroupId:
              legacyParts[4] === "SEM_BANCO" ? null : legacyParts[4],
          }
        : null;

    const settlements = await this.prisma.installmentSettlement.findMany({
      where: {
        companyId: company.id,
        canceledAt: null,
        OR: legacyWhere
          ? [legacyWhere]
          : [
              { settlementGroupId: normalizedSettlementGroupId },
              { id: normalizedSettlementGroupId },
            ],
      },
      include: {
        installment: true,
      },
      orderBy: [{ settledAt: "desc" }, { createdAt: "desc" }],
    });

    if (!settlements.length) {
      throw new NotFoundException("NENHUMA BAIXA ATIVA FOI ENCONTRADA.");
    }

    for (const settlement of settlements) {
      const latestSettlement = await this.prisma.installmentSettlement.findFirst({
        where: {
          companyId: company.id,
          installmentId: settlement.installmentId,
          canceledAt: null,
        },
        orderBy: [{ settledAt: "desc" }, { createdAt: "desc" }],
      });

      if (latestSettlement?.id !== settlement.id) {
        throw new BadRequestException(
          "Existe baixa posterior em uma das parcelas. Estorne primeiro a baixa mais recente.",
        );
      }
    }

    const canceledAt = new Date();
    const canceledBy =
      normalizeText(payload.requestedBy) ||
      normalizeText(payload.cashierUserId) ||
      null;

    const result = await this.prisma.$transaction(async (tx: any) => {
      let reversedAmount = 0;
      let reversedCount = 0;

      for (const settlement of settlements) {
        const currentSettlement = await tx.installmentSettlement.findFirst({
          where: {
            id: settlement.id,
            companyId: company.id,
            canceledAt: null,
          },
          include: {
            installment: true,
          },
        });

        if (!currentSettlement || currentSettlement.installment?.canceledAt) {
          throw new NotFoundException("NENHUMA BAIXA ATIVA FOI ENCONTRADA.");
        }

        const paymentMethod = this.resolvePaymentMethodMetadata(
          currentSettlement.paymentMethod,
        );
        const restoreOpenAmount = roundMoney(
          Math.max(
            0,
            Number(currentSettlement.receivedAmount || 0) +
              Number(currentSettlement.discountAmount || 0) -
              Number(currentSettlement.interestAmount || 0) -
              Number(currentSettlement.penaltyAmount || 0),
          ),
        );
        const nextOpenAmount = roundMoney(
          Number(currentSettlement.installment.openAmount || 0) + restoreOpenAmount,
        );
        const nextPaidAmount = roundMoney(
          Math.max(
            0,
            Number(currentSettlement.installment.paidAmount || 0) -
              Number(currentSettlement.receivedAmount || 0),
          ),
        );

        await tx.installmentSettlement.update({
          where: { id: currentSettlement.id },
          data: {
            canceledAt,
            canceledBy,
            notes: normalizeText(
              [currentSettlement.notes, payload.reason || payload.notes]
                .filter(Boolean)
                .join(" | ESTORNO: "),
            ),
            updatedBy: canceledBy,
          },
        });

        const movement = await tx.cashMovement.findFirst({
          where: {
            companyId: company.id,
            cashSessionId: currentSettlement.cashSessionId,
            movementType: "SETTLEMENT",
            direction: "IN",
            referenceType: "INSTALLMENT",
            referenceId: currentSettlement.installmentId,
            paymentMethod: currentSettlement.paymentMethod,
            amount: currentSettlement.receivedAmount,
            canceledAt: null,
            ...(currentSettlement.bankMovementGroupId
              ? { bankMovementGroupId: currentSettlement.bankMovementGroupId }
              : {}),
          },
          orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        });

        if (movement) {
          await tx.cashMovement.update({
            where: { id: movement.id },
            data: {
              canceledAt,
              canceledBy,
              updatedBy: canceledBy,
            },
          });
        }

        const creditMovement =
          paymentMethod.code === "CUSTOMER_CREDIT"
            ? await tx.customerCreditMovement.findFirst({
                where: {
                  companyId: company.id,
                  movementType: "USED",
                  direction: "OUT",
                  referenceType: "INSTALLMENT_SETTLEMENT",
                  referenceId: currentSettlement.id,
                  canceledAt: null,
                },
                orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
              })
            : null;

        if (creditMovement) {
          await tx.customerCreditMovement.update({
            where: { id: creditMovement.id },
            data: {
              canceledAt,
              canceledBy,
              updatedBy: canceledBy,
            },
          });

          const credit = await tx.customerCredit.findFirst({
            where: {
              id: creditMovement.creditId,
              companyId: company.id,
              canceledAt: null,
            },
          });

          if (credit) {
            await tx.customerCredit.update({
              where: { id: credit.id },
              data: {
                availableAmount: roundMoney(
                  Number(credit.availableAmount || 0) +
                    Number(creditMovement.amount || 0),
                ),
                status: "OPEN",
                updatedBy: canceledBy,
              },
            });
          }

          const customerCreditUsageMovement = await tx.cashMovement.findFirst({
            where: {
              companyId: company.id,
              cashSessionId: currentSettlement.cashSessionId,
              movementType: "CUSTOMER_CREDIT_USAGE",
              direction: "OUT",
              paymentMethod: "CUSTOMER_CREDIT",
              referenceType: "INSTALLMENT_SETTLEMENT",
              referenceId: currentSettlement.id,
              canceledAt: null,
            },
            orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
          });

          if (customerCreditUsageMovement) {
            await tx.cashMovement.update({
              where: { id: customerCreditUsageMovement.id },
              data: {
                canceledAt,
                canceledBy,
                updatedBy: canceledBy,
              },
            });
          }
        }

        const remainingSettlement = await tx.installmentSettlement.findFirst({
          where: {
            companyId: company.id,
            installmentId: currentSettlement.installmentId,
            canceledAt: null,
          },
          orderBy: [{ settledAt: "desc" }, { createdAt: "desc" }],
        });
        const nextStatus = nextOpenAmount > 0 ? "OPEN" : "PAID";

        await tx.receivableInstallment.update({
          where: { id: currentSettlement.installmentId },
          data: {
            openAmount: nextOpenAmount,
            paidAmount: nextPaidAmount,
            status: nextStatus,
            settlementMethod: remainingSettlement?.paymentMethod || null,
            settledAt: remainingSettlement?.settledAt || null,
            bankAccountId: remainingSettlement?.bankAccountId || null,
            bankAccountLabel: remainingSettlement?.bankAccountLabel || null,
            bankAssignedAt: remainingSettlement?.bankAccountId
              ? remainingSettlement.settledAt
              : null,
            bankAssignedBy: remainingSettlement?.bankAccountId
              ? remainingSettlement.requestedBy || null
              : null,
            bankMovementGroupId:
              remainingSettlement?.bankMovementGroupId || null,
            bankMovementStatus: remainingSettlement?.bankMovementGroupId
              ? "OPEN"
              : null,
            bankMovementCreatedAt: remainingSettlement?.bankMovementGroupId
              ? remainingSettlement.settledAt
              : null,
            bankMovementConvertedAt: null,
            bankMovementConvertedBy: null,
            updatedBy: canceledBy,
          },
        });

        const cashSessionUpdateData: any = {
          totalReceivedAmount: {
            decrement: currentSettlement.receivedAmount,
          },
          updatedBy: canceledBy,
        };

        if (paymentMethod.affectsDrawer && paymentMethod.code !== "CUSTOMER_CREDIT") {
          cashSessionUpdateData.expectedClosingAmount = {
            decrement: currentSettlement.receivedAmount,
          };
        }

        await tx.cashSession.update({
          where: { id: currentSettlement.cashSessionId },
          data: cashSessionUpdateData,
        });

        reversedAmount = roundMoney(
          reversedAmount + Number(currentSettlement.receivedAmount || 0),
        );
        reversedCount += 1;
      }

      return {
        reversedAmount,
        reversedCount,
      };
    });

    return {
      settlementGroupId: normalizedSettlementGroupId,
      reversedCount: result.reversedCount,
      reversedAmount: result.reversedAmount,
      message:
        result.reversedCount === 1
          ? "Estorno da baixa realizado com sucesso."
          : `${result.reversedCount} baixas estornadas com sucesso.`,
    };
  }

  async settleManualInstallment(
    installmentId: string,
    payload: SettleManualInstallmentDto,
  ) {
    const normalizedInstallmentId = String(installmentId || "").trim();
    if (!normalizedInstallmentId) {
      throw new BadRequestException("Parcela inválida para baixa.");
    }

    const company = await this.resolveCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    const openSession = await this.loadOpenSession(company.id, payload.cashierUserId);
    if (!openSession) {
      throw new BadRequestException(
        "O usuário informado precisa abrir o caixa antes da baixa.",
      );
    }

    const installment = await this.prisma.receivableInstallment.findFirst({
      where: {
        id: normalizedInstallmentId,
        companyId: company.id,
        canceledAt: null,
      },
      include: {
        company: {
          select: {
            interestRate: true,
            interestGracePeriod: true,
            penaltyRate: true,
            penaltyValue: true,
            penaltyGracePeriod: true,
          },
        },
      },
    });

    if (!installment) {
      throw new NotFoundException("PARCELA NÃO ENCONTRADA.");
    }

    if (installment.status === "PAID" || installment.openAmount <= 0) {
      throw new BadRequestException("A parcela informada já está liquidada.");
    }

    const paymentMethod = this.resolvePaymentMethodMetadata(
      payload.paymentMethod,
    );
    const pixBankAccount =
      paymentMethod.code === "PIX"
        ? await this.resolvePixBankAccount(company.id, payload.bankAccountId)
        : null;
    const customerCredit =
      paymentMethod.code === "CUSTOMER_CREDIT"
        ? await this.prisma.customerCredit.findFirst({
            where: {
              id: String(payload.customerCreditId || "").trim(),
              companyId: company.id,
              status: "OPEN",
              availableAmount: { gt: 0 },
              canceledAt: null,
            },
          })
        : null;

    if (paymentMethod.code === "CUSTOMER_CREDIT" && !customerCredit) {
      throw new BadRequestException(
        "Selecione um crédito aberto do cliente para usar na baixa.",
      );
    }

    const bankMovementGroupId = pixBankAccount
      ? normalizeText(payload.bankMovementGroupId) || `PIX-${randomUUID().toUpperCase()}`
      : null;
    const settlementGroupId =
      normalizeText(payload.settlementGroupId) || `BAIXA-${randomUUID().toUpperCase()}`;
    const settledAt = payload.receivedAt
      ? parseIsoDate(payload.receivedAt, "a data de recebimento")
      : new Date();

    const installmentFinancialSettings =
      this.buildInstallmentFinancialSettingsSnapshot(installment);
    const settlementSuggestion = buildInstallmentSettlementSuggestion({
      dueDate: installment.dueDate,
      openAmount: installment.openAmount,
      referenceDate: settledAt,
      settings: installmentFinancialSettings,
    });
    const discountAmount = roundMoney(
      Number(payload.discountAmount ?? settlementSuggestion.suggestedDiscountAmount ?? 0),
    );
    const interestAmount = roundMoney(
      Number(payload.interestAmount ?? settlementSuggestion.suggestedInterestAmount ?? 0),
    );
    const penaltyAmount = roundMoney(
      Number(payload.penaltyAmount ?? settlementSuggestion.suggestedPenaltyAmount ?? 0),
    );
    const amountDue = roundMoney(
      Number(installment.openAmount || 0) -
        discountAmount +
        interestAmount +
        penaltyAmount,
    );
    const receivedAmount = roundMoney(
      payload.receivedAmount === undefined
        ? amountDue
        : Number(payload.receivedAmount || 0),
    );

    if (amountDue < 0) {
      throw new BadRequestException(
        "O valor recebido não pode ficar negativo após desconto e acréscimos.",
      );
    }

    if (receivedAmount < 0) {
      throw new BadRequestException("O valor recebido não pode ser negativo.");
    }

    if (payload.receivedAmount !== undefined && receivedAmount <= 0) {
      throw new BadRequestException(
        "Informe um valor recebido maior que zero para baixa parcial.",
      );
    }

    if (receivedAmount > amountDue) {
      throw new BadRequestException(
        "O valor recebido não pode ser maior que o saldo final da parcela.",
      );
    }

    if (
      customerCredit &&
      receivedAmount > roundMoney(Number(customerCredit.availableAmount || 0))
    ) {
      throw new BadRequestException(
        "O valor recebido não pode ser maior que o saldo disponível do crédito.",
      );
    }

    const openReductionAmount = roundMoney(
      Math.min(
        Number(installment.openAmount || 0),
        Math.max(0, receivedAmount + discountAmount - interestAmount - penaltyAmount),
      ),
    );
    const nextOpenAmount = roundMoney(
      Math.max(0, Number(installment.openAmount || 0) - openReductionAmount),
    );
    const nextPaidAmount = roundMoney(
      Number(installment.paidAmount || 0) + receivedAmount,
    );
    const nextStatus = nextOpenAmount > 0 ? "OPEN" : "PAID";

    const paidOnlyCharges =
      receivedAmount > 0 &&
      openReductionAmount <= 0 &&
      interestAmount + penaltyAmount > 0;

    if (
      Number(installment.openAmount || 0) > 0 &&
      openReductionAmount <= 0 &&
      !paidOnlyCharges
    ) {
      throw new BadRequestException(
        "O valor recebido não reduz o saldo aberto da parcela.",
      );
    }

    const settlement = await this.prisma.$transaction(async (tx: any) => {
      const createdSettlement = await tx.installmentSettlement.create({
        data: {
          companyId: company.id,
          branchCode: installment.branchCode,
          installmentId: installment.id,
          cashSessionId: openSession.id,
          settlementGroupId,
          receivedAmount,
          discountAmount,
          interestAmount,
          penaltyAmount,
          paymentMethod: paymentMethod.code,
          bankAccountId: pixBankAccount?.id || null,
          bankAccountLabel: pixBankAccount?.label || null,
          bankMovementGroupId,
          settledAt,
          requestedBy: payload.requestedBy || null,
          notes: normalizeText(payload.notes),
          createdBy: payload.requestedBy || null,
          updatedBy: payload.requestedBy || null,
        },
      });

      await tx.receivableInstallment.update({
        where: { id: installment.id },
        data: {
          openAmount: nextOpenAmount,
          paidAmount: nextPaidAmount,
          status: nextStatus,
          settlementMethod: paymentMethod.code,
          settledAt,
          ...(pixBankAccount
            ? {
                bankAccountId: pixBankAccount.id,
                bankAccountLabel: pixBankAccount.label,
                bankAssignedAt: settledAt,
                bankAssignedBy: payload.requestedBy || null,
                bankMovementGroupId,
                bankMovementStatus: "OPEN",
                bankMovementCreatedAt: settledAt,
                bankMovementConvertedAt: null,
                bankMovementConvertedBy: null,
              }
            : {}),
          updatedBy: payload.requestedBy || null,
        },
      });

      const cashSessionUpdateData: any = {
        totalReceivedAmount: {
          increment: receivedAmount,
        },
        updatedBy: payload.requestedBy || null,
      };

      if (paymentMethod.affectsDrawer) {
        cashSessionUpdateData.expectedClosingAmount = roundMoney(
          Number(openSession.expectedClosingAmount || 0) + receivedAmount,
        );
      }

      await tx.cashSession.update({
        where: { id: openSession.id },
        data: cashSessionUpdateData,
      });

      await tx.cashMovement.create({
        data: {
          companyId: company.id,
          branchCode: installment.branchCode,
          cashSessionId: openSession.id,
          movementType: "SETTLEMENT",
          direction: "IN",
          paymentMethod: paymentMethod.code,
          bankAccountId: pixBankAccount?.id || null,
          bankAccountLabel: pixBankAccount?.label || null,
          bankMovementGroupId,
          amount: receivedAmount,
          description: paymentMethod.description,
          occurredAt: settledAt,
          referenceType: "INSTALLMENT",
          referenceId: installment.id,
          createdBy: payload.requestedBy || null,
          updatedBy: payload.requestedBy || null,
        },
      });

      if (customerCredit) {
        const nextCreditAvailableAmount = roundMoney(
          Number(customerCredit.availableAmount || 0) - receivedAmount,
        );

        await tx.customerCredit.update({
          where: { id: customerCredit.id },
          data: {
            availableAmount: nextCreditAvailableAmount,
            status: nextCreditAvailableAmount > 0 ? "OPEN" : "USED",
            updatedBy: payload.requestedBy || null,
          },
        });

        await tx.customerCreditMovement.create({
          data: {
            companyId: company.id,
            branchCode: installment.branchCode,
            creditId: customerCredit.id,
            cashSessionId: openSession.id,
            movementType: "USED",
            direction: "OUT",
            amount: receivedAmount,
            referenceType: "INSTALLMENT_SETTLEMENT",
            referenceId: createdSettlement.id,
            notes: normalizeText(payload.notes),
            occurredAt: settledAt,
            createdBy: payload.requestedBy || null,
            updatedBy: payload.requestedBy || null,
          },
        });

        await tx.cashMovement.create({
          data: {
            companyId: company.id,
            branchCode: installment.branchCode,
            cashSessionId: openSession.id,
            movementType: "CUSTOMER_CREDIT_USAGE",
            direction: "OUT",
            paymentMethod: "CUSTOMER_CREDIT",
            amount: receivedAmount,
            description: "UTILIZAÇÃO DE CRÉDITO DO CLIENTE",
            occurredAt: settledAt,
            referenceType: "INSTALLMENT_SETTLEMENT",
            referenceId: createdSettlement.id,
            createdBy: payload.requestedBy || null,
            updatedBy: payload.requestedBy || null,
          },
        });

        await tx.cashSession.update({
          where: { id: openSession.id },
          data: {
            expectedClosingAmount: {
              decrement: receivedAmount,
            },
            updatedBy: payload.requestedBy || null,
          },
        });
      }

      return createdSettlement;
    });

    return {
      installmentId: installment.id,
      settlementId: settlement.id,
      cashSessionId: openSession.id,
      status: nextStatus,
      openAmount: nextOpenAmount,
      paidAmount: nextPaidAmount,
      receivedAmount,
      settledAt: settlement.settledAt.toISOString(),
      paymentMethod: paymentMethod.code,
      bankAccountId: pixBankAccount?.id || null,
      bankAccountLabel: pixBankAccount?.label || null,
      bankMovementGroupId,
      settlementGroupId,
      discountAmount,
      interestAmount,
      penaltyAmount,
      message: paymentMethod.successMessage,
    };
  }

  async reverseLatestSettlement(
    installmentId: string,
    payload: ReverseManualSettlementDto,
  ) {
    const normalizedInstallmentId = String(installmentId || "").trim();
    if (!normalizedInstallmentId) {
      throw new BadRequestException("Parcela inválida para estorno.");
    }

    const company = await this.resolveCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    const settlement = await this.prisma.installmentSettlement.findFirst({
      where: {
        companyId: company.id,
        installmentId: normalizedInstallmentId,
        canceledAt: null,
      },
      include: {
        installment: true,
      },
      orderBy: [{ settledAt: "desc" }, { createdAt: "desc" }],
    });

    if (!settlement || settlement.installment?.canceledAt) {
      throw new NotFoundException("NENHUMA BAIXA ATIVA FOI ENCONTRADA.");
    }

    const paymentMethod = this.resolvePaymentMethodMetadata(
      settlement.paymentMethod,
    );
    const canceledAt = new Date();
    const canceledBy =
      normalizeText(payload.requestedBy) ||
      normalizeText(payload.cashierUserId) ||
      null;
    const restoreOpenAmount = roundMoney(
      Math.max(
        0,
        Number(settlement.receivedAmount || 0) +
          Number(settlement.discountAmount || 0) -
          Number(settlement.interestAmount || 0) -
          Number(settlement.penaltyAmount || 0),
      ),
    );
    const nextOpenAmount = roundMoney(
      Number(settlement.installment.openAmount || 0) + restoreOpenAmount,
    );
    const nextPaidAmount = roundMoney(
      Math.max(
        0,
        Number(settlement.installment.paidAmount || 0) -
          Number(settlement.receivedAmount || 0),
      ),
    );

    const result = await this.prisma.$transaction(async (tx: any) => {
      await tx.installmentSettlement.update({
        where: { id: settlement.id },
        data: {
          canceledAt,
          canceledBy,
          notes: normalizeText(
            [settlement.notes, payload.reason || payload.notes]
              .filter(Boolean)
              .join(" | ESTORNO: "),
          ),
          updatedBy: canceledBy,
        },
      });

      const movement = await tx.cashMovement.findFirst({
        where: {
          companyId: company.id,
          cashSessionId: settlement.cashSessionId,
          movementType: "SETTLEMENT",
          direction: "IN",
          referenceType: "INSTALLMENT",
          referenceId: settlement.installmentId,
          paymentMethod: settlement.paymentMethod,
          amount: settlement.receivedAmount,
          canceledAt: null,
          ...(settlement.bankMovementGroupId
            ? { bankMovementGroupId: settlement.bankMovementGroupId }
            : {}),
        },
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      });

      if (movement) {
        await tx.cashMovement.update({
          where: { id: movement.id },
          data: {
            canceledAt,
            canceledBy,
            updatedBy: canceledBy,
          },
        });
      }

      const creditMovement =
        paymentMethod.code === "CUSTOMER_CREDIT"
          ? await tx.customerCreditMovement.findFirst({
              where: {
                companyId: company.id,
                movementType: "USED",
                direction: "OUT",
                referenceType: "INSTALLMENT_SETTLEMENT",
                referenceId: settlement.id,
                canceledAt: null,
              },
              orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
            })
          : null;

      if (creditMovement) {
        await tx.customerCreditMovement.update({
          where: { id: creditMovement.id },
          data: {
            canceledAt,
            canceledBy,
            updatedBy: canceledBy,
          },
        });

        const credit = await tx.customerCredit.findFirst({
          where: {
            id: creditMovement.creditId,
            companyId: company.id,
            canceledAt: null,
          },
        });

        if (credit) {
          await tx.customerCredit.update({
            where: { id: credit.id },
            data: {
              availableAmount: roundMoney(
                Number(credit.availableAmount || 0) +
                  Number(creditMovement.amount || 0),
              ),
              status: "OPEN",
              updatedBy: canceledBy,
            },
          });
        }

        const customerCreditUsageMovement = await tx.cashMovement.findFirst({
          where: {
            companyId: company.id,
            cashSessionId: settlement.cashSessionId,
            movementType: "CUSTOMER_CREDIT_USAGE",
            direction: "OUT",
            paymentMethod: "CUSTOMER_CREDIT",
            referenceType: "INSTALLMENT_SETTLEMENT",
            referenceId: settlement.id,
            canceledAt: null,
          },
          orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        });

        if (customerCreditUsageMovement) {
          await tx.cashMovement.update({
            where: { id: customerCreditUsageMovement.id },
            data: {
              canceledAt,
              canceledBy,
              updatedBy: canceledBy,
            },
          });
        }
      }

      const remainingSettlement = await tx.installmentSettlement.findFirst({
        where: {
          companyId: company.id,
          installmentId: settlement.installmentId,
          canceledAt: null,
        },
        orderBy: [{ settledAt: "desc" }, { createdAt: "desc" }],
      });
      const nextStatus = nextOpenAmount > 0 ? "OPEN" : "PAID";

      await tx.receivableInstallment.update({
        where: { id: settlement.installmentId },
        data: {
          openAmount: nextOpenAmount,
          paidAmount: nextPaidAmount,
          status: nextStatus,
          settlementMethod: remainingSettlement?.paymentMethod || null,
          settledAt: remainingSettlement?.settledAt || null,
          bankAccountId: remainingSettlement?.bankAccountId || null,
          bankAccountLabel: remainingSettlement?.bankAccountLabel || null,
          bankAssignedAt: remainingSettlement?.bankAccountId
            ? remainingSettlement.settledAt
            : null,
          bankAssignedBy: remainingSettlement?.bankAccountId
            ? remainingSettlement.requestedBy || null
            : null,
          bankMovementGroupId:
            remainingSettlement?.bankMovementGroupId || null,
          bankMovementStatus: remainingSettlement?.bankMovementGroupId
            ? "OPEN"
            : null,
          bankMovementCreatedAt: remainingSettlement?.bankMovementGroupId
            ? remainingSettlement.settledAt
            : null,
          bankMovementConvertedAt: null,
          bankMovementConvertedBy: null,
          updatedBy: canceledBy,
        },
      });

      const cashSessionUpdateData: any = {
        totalReceivedAmount: {
          decrement: settlement.receivedAmount,
        },
        updatedBy: canceledBy,
      };

      if (paymentMethod.affectsDrawer && paymentMethod.code !== "CUSTOMER_CREDIT") {
        cashSessionUpdateData.expectedClosingAmount = {
          decrement: settlement.receivedAmount,
        };
      }

      await tx.cashSession.update({
        where: { id: settlement.cashSessionId },
        data: cashSessionUpdateData,
      });

      return {
        remainingSettlement,
        movementId: movement?.id || null,
        nextStatus,
      };
    });

    return {
      installmentId: settlement.installmentId,
      reversedSettlementId: settlement.id,
      reversedMovementId: result.movementId,
      status: result.nextStatus,
      openAmount: nextOpenAmount,
      paidAmount: nextPaidAmount,
      restoredOpenAmount: restoreOpenAmount,
      message: "Estorno da baixa realizado com sucesso.",
    };
  }
}
