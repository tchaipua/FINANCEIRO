import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  isOverdueDate,
  normalizeText,
  roundMoney,
} from "../../../common/finance-core.utils";
import { DashboardOverviewQueryDto } from "./dto/dashboard.dto";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(query: DashboardOverviewQueryDto) {
    const normalizedSourceSystem = normalizeText(query.sourceSystem);
    const normalizedSourceTenantId = normalizeText(query.sourceTenantId);
    const hasScopedCompanyFilter = Boolean(
      normalizedSourceSystem || normalizedSourceTenantId,
    );

    const scopedCompanies = hasScopedCompanyFilter
      ? await this.prisma.company.findMany({
          where: {
            canceledAt: null,
            ...(normalizedSourceSystem
              ? { sourceSystem: normalizedSourceSystem }
              : {}),
            ...(normalizedSourceTenantId
              ? { sourceTenantId: normalizedSourceTenantId }
              : {}),
          },
          select: {
            id: true,
          },
        })
      : [];

    const scopedCompanyIds = scopedCompanies.map((company: any) => company.id);
    const companyScopeFilter = hasScopedCompanyFilter
      ? {
          companyId: {
            in: scopedCompanyIds.length ? scopedCompanyIds : ["__NO_MATCH__"],
          },
        }
      : {};

    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    );

    const [
      companyCount,
      batchCount,
      openCashSessionCount,
      openInstallments,
      recentBatches,
      recentSessions,
      settledThisMonth,
    ] = await Promise.all([
      hasScopedCompanyFilter
        ? Promise.resolve(scopedCompanyIds.length)
        : this.prisma.company.count({ where: { canceledAt: null } }),
      this.prisma.receivableBatch.count({
        where: {
          canceledAt: null,
          ...companyScopeFilter,
        },
      }),
      this.prisma.cashSession.count({
        where: {
          canceledAt: null,
          status: "OPEN",
          ...companyScopeFilter,
        },
      }),
      this.prisma.receivableInstallment.findMany({
        where: {
          canceledAt: null,
          status: "OPEN",
          ...companyScopeFilter,
        },
        select: {
          id: true,
          dueDate: true,
          openAmount: true,
        },
      }),
      this.prisma.receivableBatch.findMany({
        where: {
          canceledAt: null,
          ...companyScopeFilter,
        },
        include: {
          company: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      this.prisma.cashSession.findMany({
        where: {
          canceledAt: null,
          ...companyScopeFilter,
        },
        include: {
          company: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { openedAt: "desc" },
        take: 6,
      }),
      this.prisma.installmentSettlement.aggregate({
        _sum: {
          receivedAmount: true,
        },
        where: {
          canceledAt: null,
          settledAt: {
            gte: startOfMonth,
          },
          ...companyScopeFilter,
        },
      }),
    ]);

    const overdueInstallmentCount = openInstallments.filter((installment: any) =>
      isOverdueDate(installment.dueDate),
    ).length;

    const openInstallmentAmount = roundMoney(
      openInstallments.reduce(
        (accumulator: number, current: any) =>
          accumulator + Number(current.openAmount || 0),
        0,
      ),
    );

    return {
      companyCount,
      batchCount,
      openCashSessionCount,
      openInstallmentCount: openInstallments.length,
      overdueInstallmentCount,
      openInstallmentAmount,
      settledAmountThisMonth: roundMoney(
        Number(settledThisMonth._sum.receivedAmount || 0),
      ),
      recentBatches: recentBatches.map((batch: any) => ({
        id: batch.id,
        companyName: batch.company.name,
        sourceSystem: batch.sourceSystem,
        sourceBatchType: batch.sourceBatchType,
        itemCount: batch.itemCount,
        processedCount: batch.processedCount,
        duplicateCount: batch.duplicateCount,
        errorCount: batch.errorCount,
        createdAt: batch.createdAt.toISOString(),
      })),
      recentCashSessions: recentSessions.map((session: any) => ({
        id: session.id,
        companyName: session.company.name,
        cashierDisplayName: session.cashierDisplayName,
        status: session.status,
        openingAmount: session.openingAmount,
        totalReceivedAmount: session.totalReceivedAmount,
        expectedClosingAmount: session.expectedClosingAmount,
        openedAt: session.openedAt.toISOString(),
        closedAt: session.closedAt?.toISOString() || null,
      })),
    };
  }
}
