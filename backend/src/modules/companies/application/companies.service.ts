import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  normalizeDigits,
  normalizeText,
  roundMoney,
} from "../../../common/finance-core.utils";
import {
  ListCompaniesDto,
  SyncCompanyFinancialSettingsDto,
  UpdateCompanyFinancialSettingsDto,
} from "./dto/companies.dto";

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  private mapCompany(company: any) {
    return {
      id: company.id,
      sourceSystem: company.sourceSystem,
      sourceTenantId: company.sourceTenantId,
      name: company.name,
      document: company.document,
      status: company.status,
      interestRate: company.interestRate,
      interestGracePeriod: company.interestGracePeriod,
      penaltyRate: company.penaltyRate,
      penaltyValue: company.penaltyValue,
      penaltyGracePeriod: company.penaltyGracePeriod,
      createdAt: company.createdAt.toISOString(),
      receivableTitleCount: company._count?.receivableTitles ?? 0,
      installmentCount: company._count?.receivableInstallments ?? 0,
      cashSessionCount: company._count?.cashSessions ?? 0,
    };
  }

  private normalizeOptionalInt(value?: number | null) {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = Number(value);
    if (!Number.isFinite(normalized)) {
      return null;
    }

    return Math.max(0, Math.trunc(normalized));
  }

  private normalizeOptionalMoney(value?: number | null) {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = Number(value);
    if (!Number.isFinite(normalized)) {
      return null;
    }

    return roundMoney(Math.max(0, normalized));
  }

  async list(query: ListCompaniesDto) {
    const normalizedSearch = normalizeText(query.search);
    const normalizedSourceSystem = normalizeText(query.sourceSystem);
    const normalizedSourceTenantId = normalizeText(query.sourceTenantId);

    if (!normalizedSourceTenantId) {
      return [];
    }

    const companies = await this.prisma.company.findMany({
      where: {
        canceledAt: null,
        ...(normalizedSourceSystem
          ? { sourceSystem: normalizedSourceSystem }
          : {}),
        ...(normalizedSourceTenantId
          ? { sourceTenantId: normalizedSourceTenantId }
          : {}),
        ...(normalizedSearch
          ? {
              OR: [
                { name: { contains: normalizedSearch } },
                {
                  document: {
                    contains:
                      normalizeDigits(normalizedSearch) || normalizedSearch,
                  },
                },
                { sourceTenantId: { contains: normalizedSearch } },
                { sourceSystem: { contains: normalizedSearch } },
              ],
            }
          : {}),
      },
      include: {
        _count: {
          select: {
            receivableTitles: true,
            receivableInstallments: true,
            cashSessions: true,
          },
        },
      },
      orderBy: [{ name: "asc" }],
    });

    return companies.map((company: any) => this.mapCompany(company));
  }

  async syncFinancialSettings(payload: SyncCompanyFinancialSettingsDto) {
    const normalizedSourceSystem = normalizeText(payload.sourceSystem);
    const normalizedSourceTenantId = normalizeText(payload.sourceTenantId);

    const existing = await this.prisma.company.findUnique({
      where: {
        sourceSystem_sourceTenantId: {
          sourceSystem: normalizedSourceSystem!,
          sourceTenantId: normalizedSourceTenantId!,
        },
      },
    });

    const normalizedCompanyName = normalizeText(payload.companyName);
    const normalizedCompanyDocument = normalizeDigits(payload.companyDocument);
    const data = {
      ...(normalizedCompanyName ? { name: normalizedCompanyName } : {}),
      ...(normalizedCompanyDocument ? { document: normalizedCompanyDocument } : {}),
      interestRate: this.normalizeOptionalMoney(payload.interestRate),
      interestGracePeriod: this.normalizeOptionalInt(payload.interestGracePeriod),
      penaltyRate: this.normalizeOptionalMoney(payload.penaltyRate),
      penaltyValue: this.normalizeOptionalMoney(payload.penaltyValue),
      penaltyGracePeriod: this.normalizeOptionalInt(payload.penaltyGracePeriod),
      updatedBy: payload.requestedBy || null,
    };

    if (existing) {
      const company = await this.prisma.company.update({
        where: { id: existing.id },
        data,
      });

      return {
        id: company.id,
        sourceSystem: company.sourceSystem,
        sourceTenantId: company.sourceTenantId,
        name: company.name,
      };
    }

    const company = await this.prisma.company.create({
      data: {
        sourceSystem: normalizedSourceSystem!,
        sourceTenantId: normalizedSourceTenantId!,
        name:
          normalizedCompanyName ||
          `${normalizedSourceSystem} ${normalizedSourceTenantId}`,
        document: normalizedCompanyDocument,
        interestRate: this.normalizeOptionalMoney(payload.interestRate),
        interestGracePeriod: this.normalizeOptionalInt(payload.interestGracePeriod),
        penaltyRate: this.normalizeOptionalMoney(payload.penaltyRate),
        penaltyValue: this.normalizeOptionalMoney(payload.penaltyValue),
        penaltyGracePeriod: this.normalizeOptionalInt(payload.penaltyGracePeriod),
        createdBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
    });

    return {
      id: company.id,
      sourceSystem: company.sourceSystem,
      sourceTenantId: company.sourceTenantId,
      name: company.name,
    };
  }

  async updateFinancialSettings(
    id: string,
    scope: ListCompaniesDto,
    payload: UpdateCompanyFinancialSettingsDto,
  ) {
    const normalizedCompanyId = String(id || "").trim();
    const normalizedSourceSystem = normalizeText(scope.sourceSystem);
    const normalizedSourceTenantId = normalizeText(scope.sourceTenantId);

    if (!normalizedCompanyId) {
      throw new BadRequestException("Empresa financeira inválida.");
    }

    if (!normalizedSourceTenantId) {
      throw new BadRequestException("Informe o tenant de origem da empresa.");
    }

    const company = await this.prisma.company.findFirst({
      where: {
        id: normalizedCompanyId,
        canceledAt: null,
        sourceTenantId: normalizedSourceTenantId,
        ...(normalizedSourceSystem
          ? { sourceSystem: normalizedSourceSystem }
          : {}),
      },
      include: {
        _count: {
          select: {
            receivableTitles: true,
            receivableInstallments: true,
            cashSessions: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException(
        "Empresa financeira não encontrada para o tenant informado.",
      );
    }

    const updatedCompany = await this.prisma.company.update({
      where: { id: company.id },
      data: {
        interestRate: this.normalizeOptionalMoney(payload.interestRate),
        interestGracePeriod: this.normalizeOptionalInt(payload.interestGracePeriod),
        penaltyRate: this.normalizeOptionalMoney(payload.penaltyRate),
        penaltyValue: this.normalizeOptionalMoney(payload.penaltyValue),
        penaltyGracePeriod: this.normalizeOptionalInt(payload.penaltyGracePeriod),
        updatedBy: payload.requestedBy || null,
      },
      include: {
        _count: {
          select: {
            receivableTitles: true,
            receivableInstallments: true,
            cashSessions: true,
          },
        },
      },
    });

    return this.mapCompany(updatedCompany);
  }
}
