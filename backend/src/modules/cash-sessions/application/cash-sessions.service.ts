import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  normalizeText,
  parseIsoDate,
  roundMoney,
} from "../../../common/finance-core.utils";
import {
  CloseCurrentCashSessionDto,
  CurrentCashSessionQueryDto,
  ListCashSessionsDto,
  OpenCashSessionDto,
  SettleCashInstallmentDto,
} from "./dto/cash-sessions.dto";

@Injectable()
export class CashSessionsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async list(query: ListCashSessionsDto) {
    const normalizedSourceSystem = normalizeText(query.sourceSystem);
    const normalizedSourceTenantId = normalizeText(query.sourceTenantId);
    const normalizedStatus = normalizeText(query.status);
    const normalizedSearch = normalizeText(query.search);

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
    });

    if (!installment) {
      throw new NotFoundException("PARCELA NÃO ENCONTRADA.");
    }

    if (installment.status === "PAID" || installment.openAmount <= 0) {
      throw new BadRequestException("A parcela informada já está liquidada.");
    }

    const discountAmount = roundMoney(Number(payload.discountAmount || 0));
    const interestAmount = roundMoney(Number(payload.interestAmount || 0));
    const penaltyAmount = roundMoney(Number(payload.penaltyAmount || 0));
    const receivedAmount = roundMoney(
      Number(installment.openAmount || 0) -
        discountAmount +
        interestAmount +
        penaltyAmount,
    );

    if (receivedAmount < 0) {
      throw new BadRequestException(
        "O valor recebido não pode ficar negativo após desconto e acréscimos.",
      );
    }

    const settledAt = payload.receivedAt
      ? parseIsoDate(payload.receivedAt, "a data de recebimento")
      : new Date();

    const settlement = await this.prisma.$transaction(async (tx: any) => {
      const createdSettlement = await tx.installmentSettlement.create({
        data: {
          companyId: company.id,
          installmentId: installment.id,
          cashSessionId: openSession.id,
          receivedAmount,
          discountAmount,
          interestAmount,
          penaltyAmount,
          paymentMethod: "CASH",
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
          openAmount: 0,
          paidAmount: roundMoney(
            Number(installment.paidAmount || 0) + receivedAmount,
          ),
          status: "PAID",
          settlementMethod: "CASH",
          settledAt,
          updatedBy: payload.requestedBy || null,
        },
      });

      await tx.cashSession.update({
        where: { id: openSession.id },
        data: {
          totalReceivedAmount: {
            increment: receivedAmount,
          },
          expectedClosingAmount: roundMoney(
            Number(openSession.expectedClosingAmount || 0) + receivedAmount,
          ),
          updatedBy: payload.requestedBy || null,
        },
      });

      await tx.cashMovement.create({
        data: {
          companyId: company.id,
          cashSessionId: openSession.id,
          movementType: "SETTLEMENT",
          direction: "IN",
          paymentMethod: "CASH",
          amount: receivedAmount,
          description: "BAIXA DE PARCELA EM DINHEIRO",
          occurredAt: settledAt,
          referenceType: "INSTALLMENT",
          referenceId: installment.id,
          createdBy: payload.requestedBy || null,
          updatedBy: payload.requestedBy || null,
        },
      });

      return createdSettlement;
    });

    return {
      installmentId: installment.id,
      settlementId: settlement.id,
      cashSessionId: openSession.id,
      status: "PAID",
      openAmount: 0,
      paidAmount: roundMoney(Number(installment.paidAmount || 0) + receivedAmount),
      receivedAmount,
      settledAt: settlement.settledAt.toISOString(),
      paymentMethod: "CASH",
      discountAmount,
      interestAmount,
      penaltyAmount,
      message: "Baixa em dinheiro registrada com sucesso.",
    };
  }
}
