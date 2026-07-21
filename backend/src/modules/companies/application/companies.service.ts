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
  SyncSourceIntegrationSettingsDto,
  UpdateCompanyFinancialSettingsDto,
} from "./dto/companies.dto";
import {
  ensureDefaultCompanyBranch,
  listCompanyBranches,
  mapCompanyBranchSummary,
} from "../../../common/company-branches";
import { DEFAULT_BRANCH_CODE, normalizeBranchCode } from "../../../common/branch.constants";
import { normalizeTaxId } from "../../../common/brazil-tax-id.utils";
import { encryptSecret } from "../../../common/secret-crypto.utils";
import { pushSourceCompanyBranchParameters } from "../../../common/source-system-parameters.client";

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
                      normalizeTaxId(normalizedSearch) || normalizedSearch,
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

    const parameters = {
      interestRate: this.normalizeOptionalMoney(payload.interestRate),
      interestGracePeriod: this.normalizeOptionalInt(payload.interestGracePeriod),
      penaltyRate: this.normalizeOptionalMoney(payload.penaltyRate),
      penaltyValue: this.normalizeOptionalMoney(payload.penaltyValue),
      penaltyGracePeriod: this.normalizeOptionalInt(payload.penaltyGracePeriod),
    };

    await pushSourceCompanyBranchParameters({
      sourceSystem: company.sourceSystem,
      sourceTenantId: company.sourceTenantId,
      entityType: "COMPANY",
      requestedBy: payload.requestedBy,
      parameters,
    });

    const updatedCompany = await this.prisma.company.update({
      where: { id: company.id },
      data: {
        ...parameters,
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

    await this.prisma.sourceIntegrationAuditEvent.create({
      data: {
        companyId: company.id,
        action: "COMPANY_PARAMETERS_UPDATED_AT_SOURCE",
        summary:
          "PARÂMETROS DA EMPRESA CONFIRMADOS NO SISTEMA DE ORIGEM E ESPELHADOS NO FINANCEIRO.",
        metadataJson: JSON.stringify({
          sourceSystem: company.sourceSystem,
          sourceTenantId: company.sourceTenantId,
          parameters,
        }),
        performedBy: payload.requestedBy || null,
        createdBy: payload.requestedBy || null,
      },
    });

    return this.mapCompany(updatedCompany);
  }

  async syncSourceIntegrationSettings(
    payload: SyncSourceIntegrationSettingsDto,
  ) {
    const sourceSystem = normalizeText(payload.sourceSystem);
    const sourceTenantId = normalizeText(payload.sourceTenantId);
    const branchCode = normalizeBranchCode(payload.sourceBranchCode, -1);
    const actor = String(payload.requestedBy || "INTEGRACAO_ORIGEM").trim();

    if (!sourceSystem || !sourceTenantId || branchCode < DEFAULT_BRANCH_CODE) {
      throw new BadRequestException(
        "CONTEXTO DA EMPRESA E FILIAL DE ORIGEM INVÁLIDO.",
      );
    }

    const companyName =
      normalizeText(payload.companyName) || `${sourceSystem} ${sourceTenantId}`;
    const companyDocument = normalizeTaxId(payload.companyDocument);
    const company = await this.prisma.company.upsert({
      where: {
        sourceSystem_sourceTenantId: { sourceSystem, sourceTenantId },
      },
      create: {
        sourceSystem,
        sourceTenantId,
        name: companyName,
        document: companyDocument,
        interestRate: this.normalizeOptionalMoney(payload.interestRate),
        interestGracePeriod: this.normalizeOptionalInt(payload.interestGracePeriod),
        penaltyRate: this.normalizeOptionalMoney(payload.penaltyRate),
        penaltyValue: this.normalizeOptionalMoney(payload.penaltyValue),
        penaltyGracePeriod: this.normalizeOptionalInt(payload.penaltyGracePeriod),
        createdBy: actor,
        updatedBy: actor,
      },
      update: {
        name: companyName,
        ...(companyDocument ? { document: companyDocument } : {}),
        interestRate: this.normalizeOptionalMoney(payload.interestRate),
        interestGracePeriod: this.normalizeOptionalInt(payload.interestGracePeriod),
        penaltyRate: this.normalizeOptionalMoney(payload.penaltyRate),
        penaltyValue: this.normalizeOptionalMoney(payload.penaltyValue),
        penaltyGracePeriod: this.normalizeOptionalInt(payload.penaltyGracePeriod),
        status: "ACTIVE",
        updatedBy: actor,
        canceledAt: null,
        canceledBy: null,
      },
    });

    const existingCompanyBranch = await this.prisma.companyBranch.findUnique({
      where: { companyId_branchCode: { companyId: company.id, branchCode } },
    });
    const stockModes = this.getStockModesFromBranchPayload(
      payload,
      existingCompanyBranch || undefined,
    );
    const inventoryControlType =
      stockModes.stockGridControlMode !== "NO"
        ? "COLOR_SIZE"
        : stockModes.stockLotControlMode !== "NO"
          ? "LOT"
          : "TRADITIONAL";
    const quantityPrecision =
      stockModes.stockIntegerQuantityMode === "YES"
        ? "INTEGER_ONLY"
        : stockModes.stockIntegerQuantityMode === "NO"
          ? "DECIMAL_ALLOWED"
          : "PRODUCT_DEFINED";
    const companyBranch = await this.prisma.companyBranch.upsert({
      where: { companyId_branchCode: { companyId: company.id, branchCode } },
      create: {
        companyId: company.id,
        branchCode,
        name: normalizeText(payload.branchName) || `FILIAL ${branchCode}`,
        isActive: true,
        isDefault: branchCode === DEFAULT_BRANCH_CODE,
        inventoryControlType,
        quantityPrecision,
        ...stockModes,
        allowSaleUnitPriceEdit: payload.allowSaleUnitPriceEdit ?? true,
        allowSaleItemDiscount: payload.allowSaleItemDiscount ?? true,
        fiscalLegalName: normalizeText(payload.branchLegalName),
        fiscalTradeName: normalizeText(payload.branchTradeName),
        fiscalDocument: normalizeTaxId(payload.branchDocument),
        fiscalStreet: normalizeText(payload.branchStreet),
        fiscalNumber: normalizeText(payload.branchNumber),
        fiscalComplement: normalizeText(payload.branchComplement),
        fiscalNeighborhood: normalizeText(payload.branchNeighborhood),
        fiscalCity: normalizeText(payload.branchCity),
        fiscalState: normalizeText(payload.branchState),
        fiscalPostalCode: normalizeDigits(payload.branchPostalCode) || null,
        fiscalPhone: normalizeText(payload.branchPhone),
        fiscalEmail:
          String(payload.branchEmail || "").trim().toLowerCase() || null,
        createdBy: actor,
        updatedBy: actor,
      },
      update: {
        name: normalizeText(payload.branchName) || `FILIAL ${branchCode}`,
        isActive: true,
        isDefault: branchCode === DEFAULT_BRANCH_CODE,
        inventoryControlType,
        quantityPrecision,
        ...stockModes,
        allowSaleUnitPriceEdit: payload.allowSaleUnitPriceEdit ?? true,
        allowSaleItemDiscount: payload.allowSaleItemDiscount ?? true,
        fiscalLegalName: normalizeText(payload.branchLegalName),
        fiscalTradeName: normalizeText(payload.branchTradeName),
        fiscalDocument: normalizeTaxId(payload.branchDocument),
        fiscalStreet: normalizeText(payload.branchStreet),
        fiscalNumber: normalizeText(payload.branchNumber),
        fiscalComplement: normalizeText(payload.branchComplement),
        fiscalNeighborhood: normalizeText(payload.branchNeighborhood),
        fiscalCity: normalizeText(payload.branchCity),
        fiscalState: normalizeText(payload.branchState),
        fiscalPostalCode: normalizeDigits(payload.branchPostalCode) || null,
        fiscalPhone: normalizeText(payload.branchPhone),
        fiscalEmail:
          String(payload.branchEmail || "").trim().toLowerCase() || null,
        updatedBy: actor,
        canceledAt: null,
        canceledBy: null,
      },
    });

    const activeBranchCodes = Array.from(
      new Set(
        (payload.activeBranchCodes || [])
          .map((code) => normalizeBranchCode(code, -1))
          .filter((code) => code >= DEFAULT_BRANCH_CODE),
      ),
    );
    if (activeBranchCodes.length) {
      const now = new Date();
      await this.prisma.companyBranch.updateMany({
        where: {
          companyId: company.id,
          branchCode: { gte: DEFAULT_BRANCH_CODE, notIn: activeBranchCodes },
          canceledAt: null,
        },
        data: {
          isActive: false,
          canceledAt: now,
          canceledBy: actor,
          updatedBy: actor,
        },
      });
    }

    await this.prisma.screenParameter.upsert({
      where: {
        companyId_branchId_screenId: {
          companyId: company.id,
          branchId: companyBranch.id,
          screenId: this.salesScreenId,
        },
      },
      create: {
        companyId: company.id,
        branchId: companyBranch.id,
        screenId: this.salesScreenId,
        parametersJson: JSON.stringify({
          allowSaleUnitPriceEdit: payload.allowSaleUnitPriceEdit ?? true,
          allowSaleItemDiscount: payload.allowSaleItemDiscount ?? true,
          groupSameProduct: payload.groupSameProduct ?? true,
        }),
        createdBy: actor,
        updatedBy: actor,
      },
      update: {
        parametersJson: JSON.stringify({
          allowSaleUnitPriceEdit: payload.allowSaleUnitPriceEdit ?? true,
          allowSaleItemDiscount: payload.allowSaleItemDiscount ?? true,
          groupSameProduct: payload.groupSameProduct ?? true,
        }),
        updatedBy: actor,
        canceledAt: null,
        canceledBy: null,
      },
    });

    const smtpPassword = String(payload.smtpPassword || "").trim();
    const telegramBotToken = String(payload.telegramBotToken || "").trim();
    const sourceConfiguration = await this.prisma.sourceIntegrationConfiguration.upsert({
      where: { companyId_branchCode: { companyId: company.id, branchCode } },
      create: {
        companyId: company.id,
        branchCode,
        status: "ACTIVE",
        smtpHost: String(payload.smtpHost || "").trim().toLowerCase() || null,
        smtpPort: payload.smtpPort || null,
        smtpTimeout: payload.smtpTimeout || null,
        smtpAuthenticate: payload.smtpAuthenticate ?? null,
        smtpSecure: payload.smtpSecure ?? null,
        smtpAuthType: normalizeText(payload.smtpAuthType),
        smtpEmail: String(payload.smtpEmail || "").trim().toLowerCase() || null,
        smtpPasswordEncrypted: smtpPassword ? encryptSecret(smtpPassword) : null,
        smtpSourceScope: normalizeText(payload.smtpSourceScope),
        telegramEnabled: payload.telegramEnabled ?? null,
        telegramBotTokenEncrypted: telegramBotToken
          ? encryptSecret(telegramBotToken)
          : null,
        telegramBotUsername:
          String(payload.telegramBotUsername || "").trim() || null,
        telegramSourceScope: normalizeText(payload.telegramSourceScope),
        storageDefaultAcl: normalizeText(payload.storageDefaultAcl),
        storageDefaultExpiration: payload.storageDefaultExpiration || null,
        storageSourceScope: normalizeText(payload.storageSourceScope),
        lastSyncedAt: new Date(),
        createdBy: actor,
        updatedBy: actor,
      },
      update: {
        status: "ACTIVE",
        smtpHost: String(payload.smtpHost || "").trim().toLowerCase() || null,
        smtpPort: payload.smtpPort || null,
        smtpTimeout: payload.smtpTimeout || null,
        smtpAuthenticate: payload.smtpAuthenticate ?? null,
        smtpSecure: payload.smtpSecure ?? null,
        smtpAuthType: normalizeText(payload.smtpAuthType),
        smtpEmail: String(payload.smtpEmail || "").trim().toLowerCase() || null,
        smtpPasswordEncrypted: smtpPassword ? encryptSecret(smtpPassword) : null,
        smtpSourceScope: normalizeText(payload.smtpSourceScope),
        telegramEnabled: payload.telegramEnabled ?? null,
        telegramBotTokenEncrypted: telegramBotToken
          ? encryptSecret(telegramBotToken)
          : null,
        telegramBotUsername:
          String(payload.telegramBotUsername || "").trim() || null,
        telegramSourceScope: normalizeText(payload.telegramSourceScope),
        storageDefaultAcl: normalizeText(payload.storageDefaultAcl),
        storageDefaultExpiration: payload.storageDefaultExpiration || null,
        storageSourceScope: normalizeText(payload.storageSourceScope),
        lastSyncedAt: new Date(),
        updatedBy: actor,
        canceledAt: null,
        canceledBy: null,
      },
    });

    const s3AccessKey = String(payload.s3AccessKey || "").trim();
    const s3SecretKey = String(payload.s3SecretKey || "").trim();
    const s3Bucket = String(payload.s3Bucket || "").trim();
    const s3BasePrefix = String(payload.s3BasePrefix || "")
      .trim()
      .replace(/^\/+|\/+$/g, "");
    const hasS3Configuration = Boolean(
      s3AccessKey && s3SecretKey && s3Bucket && s3BasePrefix,
    );

    if (hasS3Configuration) {
      const s3Configuration = await this.prisma.s3Configuration.upsert({
        where: { companyId_branchCode: { companyId: company.id, branchCode } },
        create: {
          companyId: company.id,
          branchCode,
          status: "ACTIVE",
          endpoint: String(payload.s3Endpoint || "").trim() || null,
          region: String(payload.s3Region || "us-east-1").trim(),
          bucket: s3Bucket,
          basePrefix: s3BasePrefix,
          capacityGb: this.normalizeOptionalMoney(payload.s3CapacityGb),
          imagesFolder: String(payload.s3ImagesFolderName || "").trim() || null,
          sourceScope: normalizeText(payload.storageSourceScope),
          accessKeyEncrypted: encryptSecret(s3AccessKey),
          secretKeyEncrypted: encryptSecret(s3SecretKey),
          forcePathStyle: payload.s3ForcePathStyle ?? true,
          createdBy: actor,
          updatedBy: actor,
        },
        update: {
          status: "ACTIVE",
          endpoint: String(payload.s3Endpoint || "").trim() || null,
          region: String(payload.s3Region || "us-east-1").trim(),
          bucket: s3Bucket,
          basePrefix: s3BasePrefix,
          capacityGb: this.normalizeOptionalMoney(payload.s3CapacityGb),
          imagesFolder: String(payload.s3ImagesFolderName || "").trim() || null,
          sourceScope: normalizeText(payload.storageSourceScope),
          accessKeyEncrypted: encryptSecret(s3AccessKey),
          secretKeyEncrypted: encryptSecret(s3SecretKey),
          forcePathStyle: payload.s3ForcePathStyle ?? true,
          updatedBy: actor,
          canceledAt: null,
          canceledBy: null,
        },
      });

      await this.prisma.s3AuditEvent.create({
        data: {
          companyId: company.id,
          branchCode,
          entityType: "S3_CONFIGURATION",
          entityId: s3Configuration.id,
          action: "CONFIGURATION_SYNCED_FROM_SOURCE",
          summary: "CONFIGURAÇÃO S3 SINCRONIZADA PELO SISTEMA DE ORIGEM.",
          metadataJson: JSON.stringify({
            bucket: s3Bucket,
            basePrefix: s3BasePrefix,
            sourceSystem,
            sourceScope: normalizeText(payload.storageSourceScope),
          }),
          performedBy: actor,
          createdBy: actor,
        },
      });
    } else {
      const existingS3 = await this.prisma.s3Configuration.findUnique({
        where: { companyId_branchCode: { companyId: company.id, branchCode } },
      });

      if (existingS3 && !existingS3.canceledAt) {
        const now = new Date();
        await this.prisma.s3Configuration.update({
          where: { id: existingS3.id },
          data: {
            status: "INACTIVE",
            canceledAt: now,
            canceledBy: actor,
            updatedBy: actor,
          },
        });
        await this.prisma.s3AuditEvent.create({
          data: {
            companyId: company.id,
            branchCode,
            entityType: "S3_CONFIGURATION",
            entityId: existingS3.id,
            action: "CONFIGURATION_DISABLED_BY_SOURCE",
            summary:
              "CONFIGURAÇÃO S3 DESATIVADA APÓS REMOÇÃO NO SISTEMA DE ORIGEM.",
            metadataJson: JSON.stringify({ sourceSystem }),
            performedBy: actor,
            createdBy: actor,
          },
        });
      }
    }

    await this.prisma.sourceIntegrationAuditEvent.create({
      data: {
        companyId: company.id,
        branchCode,
        action: "SOURCE_SETTINGS_SYNCED",
        summary:
          "CONFIGURAÇÕES DA EMPRESA E FILIAL SINCRONIZADAS PELO SISTEMA DE ORIGEM.",
        metadataJson: JSON.stringify({
          sourceSystem,
          sourceTenantId,
          branchCode,
          s3Configured: hasS3Configuration,
          smtpConfigured: Boolean(payload.smtpHost && payload.smtpEmail),
          telegramConfigured: Boolean(payload.telegramBotToken),
          sourceConfigurationId: sourceConfiguration.id,
        }),
        performedBy: actor,
        createdBy: actor,
      },
    });

    return {
      companyId: company.id,
      branchCode,
      s3Configured: hasS3Configuration,
      smtpConfigured: Boolean(payload.smtpHost && payload.smtpEmail),
      telegramConfigured: Boolean(payload.telegramBotToken),
      synchronizedAt: new Date().toISOString(),
    };
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

    await pushSourceCompanyBranchParameters({
      sourceSystem: company.sourceSystem,
      sourceTenantId: company.sourceTenantId,
      sourceBranchCode: branch.branchCode,
      entityType: "BRANCH",
      requestedBy: payload.requestedBy,
      parameters,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.companyBranch.update({
        where: { id: branch.id },
        data: {
          allowSaleUnitPriceEdit: parameters.allowSaleUnitPriceEdit,
          allowSaleItemDiscount: parameters.allowSaleItemDiscount,
          updatedBy: payload.requestedBy || null,
        },
      });

      await tx.screenParameter.upsert({
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

      await tx.sourceIntegrationAuditEvent.create({
        data: {
          companyId: company.id,
          branchCode: branch.branchCode,
          action: "BRANCH_PARAMETERS_UPDATED_AT_SOURCE",
          summary:
            "PARÂMETROS DA FILIAL CONFIRMADOS NO SISTEMA DE ORIGEM E ESPELHADOS NO FINANCEIRO.",
          metadataJson: JSON.stringify({
            sourceSystem: company.sourceSystem,
            sourceTenantId: company.sourceTenantId,
            parameters,
          }),
          performedBy: payload.requestedBy || null,
          createdBy: payload.requestedBy || null,
        },
      });
    });

    return {
      screenId: this.salesScreenId,
      ...parameters,
    };
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
    const currentScreenParameters = await this.getSalesScreenParameters(
      id,
      branchId,
      scope,
    );
    const parameters = {
      ...stockModes,
      allowSaleUnitPriceEdit:
        payload.allowSaleUnitPriceEdit ??
        currentScreenParameters.allowSaleUnitPriceEdit,
      allowSaleItemDiscount:
        payload.allowSaleItemDiscount ??
        currentScreenParameters.allowSaleItemDiscount,
      groupSameProduct: currentScreenParameters.groupSameProduct,
    };

    await pushSourceCompanyBranchParameters({
      sourceSystem: company.sourceSystem,
      sourceTenantId: company.sourceTenantId,
      sourceBranchCode: branch.branchCode,
      entityType: "BRANCH",
      requestedBy: payload.requestedBy,
      parameters,
    });

    const updatedBranch = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.companyBranch.update({
        where: { id: branch.id },
        data: {
          inventoryControlType,
          quantityPrecision,
          ...stockModes,
          allowSaleUnitPriceEdit: parameters.allowSaleUnitPriceEdit,
          allowSaleItemDiscount: parameters.allowSaleItemDiscount,
          updatedBy: payload.requestedBy || null,
        },
      });

      await tx.screenParameter.upsert({
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

      await tx.sourceIntegrationAuditEvent.create({
        data: {
          companyId: company.id,
          branchCode: branch.branchCode,
          action: "BRANCH_PARAMETERS_UPDATED_AT_SOURCE",
          summary:
            "PARÂMETROS DA FILIAL CONFIRMADOS NO SISTEMA DE ORIGEM E ESPELHADOS NO FINANCEIRO.",
          metadataJson: JSON.stringify({
            sourceSystem: company.sourceSystem,
            sourceTenantId: company.sourceTenantId,
            parameters,
          }),
          performedBy: payload.requestedBy || null,
          createdBy: payload.requestedBy || null,
        },
      });

      return updated;
    });

    return mapCompanyBranchSummary(updatedBranch);
  }
}
