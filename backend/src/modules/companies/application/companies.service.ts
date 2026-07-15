import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  normalizeDigits,
  normalizeText,
  roundMoney,
} from "../../../common/finance-core.utils";
import {
  ListCompaniesDto,
  SaveCompanyBranchDto,
  SaveSalesScreenParametersDto,
  SyncCompanyFinancialSettingsDto,
  UpdateCompanyFinancialSettingsDto,
} from "./dto/companies.dto";
import {
  ensureDefaultCompanyBranch,
  listCompanyBranches,
  mapCompanyBranchSummary,
} from "../../../common/company-branches";
import { DEFAULT_BRANCH_CODE, normalizeBranchCode } from "../../../common/branch.constants";

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly salesScreenId = "PRINCIPAL_FINANCEIRO_VENDAS";

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

  private async findScopedCompany(
    id: string,
    sourceSystem?: string | null,
    sourceTenantId?: string | null,
  ) {
    const normalizedCompanyId = String(id || "").trim();
    const normalizedSourceSystem = normalizeText(sourceSystem);
    const normalizedSourceTenantId = normalizeText(sourceTenantId);

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
    });

    if (!company) {
      throw new NotFoundException(
        "Empresa financeira não encontrada para o tenant informado.",
      );
    }

    await ensureDefaultCompanyBranch(this.prisma, company.id);
    return company;
  }

  private async findScopedBranch(
    companyId: string,
    branchId: string,
    scope: ListCompaniesDto,
  ) {
    const company = await this.findScopedCompany(
      companyId,
      scope.sourceSystem,
      scope.sourceTenantId,
    );
    const branch = await this.prisma.companyBranch.findFirst({
      where: {
        id: String(branchId || "").trim(),
        companyId: company.id,
        canceledAt: null,
      },
    });

    if (!branch) {
      throw new BadRequestException("Filial não encontrada para esta empresa.");
    }

    return { company, branch };
  }

  private mapSalesScreenParameters(parametersJson?: string | null) {
    try {
      const parsed = JSON.parse(String(parametersJson || "{}"));
      return {
        allowSaleUnitPriceEdit: parsed?.allowSaleUnitPriceEdit !== false,
        allowSaleItemDiscount: parsed?.allowSaleItemDiscount !== false,
        groupSameProduct: parsed?.groupSameProduct !== false,
      };
    } catch {
      return {
        allowSaleUnitPriceEdit: true,
        allowSaleItemDiscount: true,
        groupSameProduct: true,
      };
    }
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

  private normalizeInventoryControlType(value?: string | null) {
    const normalized = normalizeText(value) || "TRADITIONAL";
    return ["TRADITIONAL", "COLOR_SIZE", "LOT"].includes(normalized)
      ? normalized
      : "TRADITIONAL";
  }

  private normalizeQuantityPrecision(value?: string | null) {
    const normalized = normalizeText(value) || "INTEGER_ONLY";
    return ["INTEGER_ONLY", "DECIMAL_ALLOWED", "PRODUCT_DEFINED"].includes(
      normalized,
    )
      ? normalized
      : "INTEGER_ONLY";
  }

  private normalizeBranchStockParameterMode(value?: string | null) {
    const normalized = normalizeText(value) || "BY_PRODUCT";
    return ["NO", "YES", "BY_PRODUCT"].includes(normalized)
      ? normalized
      : "BY_PRODUCT";
  }

  private getStockModesFromBranchPayload(
    payload: SaveCompanyBranchDto,
    fallback?: {
      stockControlMode?: string | null;
      stockIntegerQuantityMode?: string | null;
      stockLotControlMode?: string | null;
      stockExpirationControlMode?: string | null;
      stockGridControlMode?: string | null;
      stockNegativeControlMode?: string | null;
      inventoryControlType?: string | null;
      quantityPrecision?: string | null;
    },
  ) {
    const inventoryControlType = this.normalizeInventoryControlType(
      payload.inventoryControlType || fallback?.inventoryControlType,
    );
    const quantityPrecision = this.normalizeQuantityPrecision(
      payload.quantityPrecision || fallback?.quantityPrecision,
    );
    const derivedIntegerMode =
      quantityPrecision === "DECIMAL_ALLOWED"
        ? "NO"
        : quantityPrecision === "PRODUCT_DEFINED"
          ? "BY_PRODUCT"
          : "YES";
    const derivedLotMode =
      inventoryControlType === "LOT" ? "BY_PRODUCT" : "NO";
    const derivedGridMode =
      inventoryControlType === "COLOR_SIZE" ? "BY_PRODUCT" : "NO";

    return {
      stockControlMode: this.normalizeBranchStockParameterMode(
        payload.stockControlMode || fallback?.stockControlMode || "BY_PRODUCT",
      ),
      stockIntegerQuantityMode: this.normalizeBranchStockParameterMode(
        payload.stockIntegerQuantityMode ||
          (payload.quantityPrecision
            ? derivedIntegerMode
            : fallback?.stockIntegerQuantityMode || derivedIntegerMode),
      ),
      stockLotControlMode: this.normalizeBranchStockParameterMode(
        payload.stockLotControlMode ||
          (payload.inventoryControlType
            ? derivedLotMode
            : fallback?.stockLotControlMode || derivedLotMode),
      ),
      stockExpirationControlMode: this.normalizeBranchStockParameterMode(
        payload.stockExpirationControlMode ||
          (payload.inventoryControlType
            ? derivedLotMode
            : fallback?.stockExpirationControlMode || derivedLotMode),
      ),
      stockGridControlMode: this.normalizeBranchStockParameterMode(
        payload.stockGridControlMode ||
          (payload.inventoryControlType
            ? derivedGridMode
            : fallback?.stockGridControlMode || derivedGridMode),
      ),
      stockNegativeControlMode: this.normalizeBranchStockParameterMode(
        payload.stockNegativeControlMode ||
          fallback?.stockNegativeControlMode ||
          "NO",
      ),
    };
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
      await ensureDefaultCompanyBranch(
        this.prisma,
        company.id,
        payload.requestedBy || null,
      );

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

    await ensureDefaultCompanyBranch(
      this.prisma,
      company.id,
      payload.requestedBy || null,
    );

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
    const company = await this.findScopedCompany(
      id,
      scope.sourceSystem,
      scope.sourceTenantId,
    );

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

  async listBranches(id: string, scope: ListCompaniesDto) {
    const company = await this.findScopedCompany(
      id,
      scope.sourceSystem,
      scope.sourceTenantId,
    );
    const branches = await listCompanyBranches(this.prisma, company.id);
    return branches.map(mapCompanyBranchSummary);
  }

  async getSalesScreenParameters(
    id: string,
    branchId: string,
    scope: ListCompaniesDto,
  ) {
    const { company, branch } = await this.findScopedBranch(id, branchId, scope);
    const screenParameter = await this.prisma.screenParameter.findFirst({
      where: {
        companyId: company.id,
        branchId: branch.id,
        screenId: this.salesScreenId,
        canceledAt: null,
      },
    });

    return {
      screenId: this.salesScreenId,
      ...this.mapSalesScreenParameters(
        screenParameter?.parametersJson ||
          JSON.stringify({
            allowSaleUnitPriceEdit: branch.allowSaleUnitPriceEdit !== false,
            allowSaleItemDiscount: branch.allowSaleItemDiscount !== false,
            groupSameProduct: true,
          }),
      ),
    };
  }

  async updateSalesScreenParameters(
    id: string,
    branchId: string,
    scope: ListCompaniesDto,
    payload: SaveSalesScreenParametersDto,
  ) {
    const { company, branch } = await this.findScopedBranch(id, branchId, scope);
    const current = await this.getSalesScreenParameters(id, branchId, scope);
    const parameters = {
      allowSaleUnitPriceEdit:
        payload.allowSaleUnitPriceEdit ?? current.allowSaleUnitPriceEdit,
      allowSaleItemDiscount:
        payload.allowSaleItemDiscount ?? current.allowSaleItemDiscount,
      groupSameProduct: payload.groupSameProduct ?? current.groupSameProduct,
    };
    const now = new Date();

    await this.prisma.screenParameter.upsert({
      where: {
        companyId_branchId_screenId: {
          companyId: company.id,
          branchId: branch.id,
          screenId: this.salesScreenId,
        },
      },
      create: {
        companyId: company.id,
        branchId: branch.id,
        screenId: this.salesScreenId,
        parametersJson: JSON.stringify(parameters),
        createdBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
      update: {
        parametersJson: JSON.stringify(parameters),
        updatedAt: now,
        updatedBy: payload.requestedBy || null,
        canceledAt: null,
        canceledBy: null,
      },
    });

    return {
      screenId: this.salesScreenId,
      ...parameters,
    };
  }

  async createBranch(
    id: string,
    scope: ListCompaniesDto,
    payload: SaveCompanyBranchDto,
  ) {
    const company = await this.findScopedCompany(
      id,
      scope.sourceSystem,
      scope.sourceTenantId,
    );
    const branches = await listCompanyBranches(this.prisma, company.id);
    const requestedBranchCode =
      payload.branchCode === undefined || payload.branchCode === null
        ? Math.max(...branches.map((branch) => branch.branchCode), 0) + 1
        : normalizeBranchCode(payload.branchCode, -1);

    if (requestedBranchCode < DEFAULT_BRANCH_CODE) {
      throw new BadRequestException("A filial deve usar código maior ou igual a 1.");
    }

    const alreadyExists = branches.some(
      (branch) => branch.branchCode === requestedBranchCode,
    );
    if (alreadyExists) {
      throw new BadRequestException("Já existe uma filial com este código.");
    }

    const inventoryControlType = this.normalizeInventoryControlType(
      payload.inventoryControlType,
    );
    const quantityPrecision = this.normalizeQuantityPrecision(
      payload.quantityPrecision,
    );
    const stockModes = this.getStockModesFromBranchPayload(payload, {
      inventoryControlType,
      quantityPrecision,
    });

    const createdBranch = await this.prisma.companyBranch.create({
      data: {
        companyId: company.id,
        branchCode: requestedBranchCode,
        name: String(payload.name || `FILIAL ${requestedBranchCode}`)
          .trim()
          .toUpperCase(),
        isActive: true,
        isDefault: false,
        inventoryControlType,
        quantityPrecision,
        ...stockModes,
        allowSaleUnitPriceEdit: payload.allowSaleUnitPriceEdit ?? true,
        allowSaleItemDiscount: payload.allowSaleItemDiscount ?? true,
        createdBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
    });

    await this.prisma.screenParameter.create({
      data: {
        companyId: company.id,
        branchId: createdBranch.id,
        screenId: this.salesScreenId,
        parametersJson: JSON.stringify({
          allowSaleUnitPriceEdit: payload.allowSaleUnitPriceEdit ?? true,
          allowSaleItemDiscount: payload.allowSaleItemDiscount ?? true,
          groupSameProduct: true,
        }),
        createdBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
    });

    return mapCompanyBranchSummary(createdBranch);
  }

  async updateBranch(
    id: string,
    branchId: string,
    scope: ListCompaniesDto,
    payload: SaveCompanyBranchDto,
  ) {
    const company = await this.findScopedCompany(
      id,
      scope.sourceSystem,
      scope.sourceTenantId,
    );
    const branch = await this.prisma.companyBranch.findFirst({
      where: {
        id: branchId,
        companyId: company.id,
        canceledAt: null,
      },
    });

    if (!branch) {
      throw new BadRequestException("Filial não encontrada para esta empresa.");
    }

    const inventoryControlType = this.normalizeInventoryControlType(
      payload.inventoryControlType || branch.inventoryControlType,
    );
    const quantityPrecision = this.normalizeQuantityPrecision(
      payload.quantityPrecision || branch.quantityPrecision,
    );
    const stockModes = this.getStockModesFromBranchPayload(payload, {
      ...branch,
      inventoryControlType,
      quantityPrecision,
    });

    const updatedBranch = await this.prisma.companyBranch.update({
      where: { id: branch.id },
      data: {
        ...(payload.name
          ? { name: String(payload.name).trim().toUpperCase() }
          : {}),
        inventoryControlType,
        quantityPrecision,
        ...stockModes,
        allowSaleUnitPriceEdit:
          payload.allowSaleUnitPriceEdit ?? branch.allowSaleUnitPriceEdit ?? true,
        allowSaleItemDiscount:
          payload.allowSaleItemDiscount ?? branch.allowSaleItemDiscount ?? true,
        updatedBy: payload.requestedBy || null,
      },
    });

    if (
      payload.allowSaleUnitPriceEdit !== undefined ||
      payload.allowSaleItemDiscount !== undefined
    ) {
      const currentScreenParameters = await this.getSalesScreenParameters(
        id,
        branchId,
        scope,
      );
      const parameters = {
        allowSaleUnitPriceEdit:
          payload.allowSaleUnitPriceEdit ??
          currentScreenParameters.allowSaleUnitPriceEdit,
        allowSaleItemDiscount:
          payload.allowSaleItemDiscount ??
          currentScreenParameters.allowSaleItemDiscount,
        groupSameProduct: currentScreenParameters.groupSameProduct,
      };

      await this.prisma.screenParameter.upsert({
        where: {
          companyId_branchId_screenId: {
            companyId: company.id,
            branchId: branch.id,
            screenId: this.salesScreenId,
          },
        },
        create: {
          companyId: company.id,
          branchId: branch.id,
          screenId: this.salesScreenId,
          parametersJson: JSON.stringify(parameters),
          createdBy: payload.requestedBy || null,
          updatedBy: payload.requestedBy || null,
        },
        update: {
          parametersJson: JSON.stringify(parameters),
          updatedBy: payload.requestedBy || null,
          canceledAt: null,
          canceledBy: null,
        },
      });
    }

    return mapCompanyBranchSummary(updatedBranch);
  }
}
