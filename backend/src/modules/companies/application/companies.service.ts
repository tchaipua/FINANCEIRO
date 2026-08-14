import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  normalizeDigits,
  normalizeText,
  roundMoney,
} from "../../../common/finance-core.utils";
import {
  ListCompaniesDto,
  CentralBranchEditorLaunchDto,
  ProvisionSourceTenantDto,
  SaveCompanyBranchDto,
  SaveSalesScreenParametersDto,
  SyncSourceIntegrationSettingsDto,
  UpdateCompanyFinancialSettingsDto,
} from "./dto/companies.dto";
import {
  ensureDefaultCompanyBranch,
  hasSourceOwnedBranchStockChanges,
  listCompanyBranches,
  mapCompanyBranchSummary,
} from "../../../common/company-branches";
import { DEFAULT_BRANCH_CODE, normalizeBranchCode } from "../../../common/branch.constants";
import { normalizeTaxId } from "../../../common/brazil-tax-id.utils";
import { encryptSecret } from "../../../common/secret-crypto.utils";
import { pushSourceCompanyBranchParameters } from "../../../common/source-system-parameters.client";
import {
  getFinanceContext,
  hasAuthenticatedFinanceScope,
  runWithAdministrativeBranchScope,
  runWithCompanyWideBranchDirectoryRead,
} from "../../../common/finance-context";
import {
  CentralBranchEditorClient,
  type CentralBranchConfiguration,
} from "./central-branch-editor.client";
import { ensureDefaultProductClassification } from "../../../common/product-classification";

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly centralBranchEditor: CentralBranchEditorClient,
  ) {}

  private readonly salesScreenId = "PRINCIPAL_FINANCEIRO_VENDAS";

  private assertFinanceAdmin() {
    if (!hasAuthenticatedFinanceScope("FINANCE_ADMIN")) {
      throw new ForbiddenException(
        "A ALTERAÇÃO DE PARÂMETROS EXIGE O ESCOPO FINANCE_ADMIN.",
      );
    }
  }

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
        allowProductImageEdit: parsed?.allowProductImageEdit !== false,
        requirePasswordToRemoveSaleItems: parsed?.requirePasswordToRemoveSaleItems === true,
      };
    } catch {
      return {
        allowSaleUnitPriceEdit: true,
        allowSaleItemDiscount: true,
        groupSameProduct: true,
        allowProductImageEdit: true,
        requirePasswordToRemoveSaleItems: false,
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

  private normalizeStockClassificationMode(value?: string | null) {
    const normalized = normalizeText(value) || "GROUP_ONLY";
    return ["NONE", "GROUP_ONLY", "GROUP_AND_SUBGROUP"].includes(normalized)
      ? normalized
      : "GROUP_ONLY";
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
      stockClassificationMode?: string | null;
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
      stockClassificationMode: this.normalizeStockClassificationMode(
        payload.stockClassificationMode || fallback?.stockClassificationMode,
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
    this.assertFinanceAdmin();
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
    if (!hasAuthenticatedFinanceScope("SOURCE_SETTINGS_SYNC")) {
      throw new ForbiddenException(
        "A SINCRONIZAÇÃO DE CONFIGURAÇÕES EXIGE O ESCOPO SOURCE_SETTINGS_SYNC.",
      );
    }

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
    const mappedCompany = await this.prisma.company.findUnique({
      where: {
        sourceSystem_sourceTenantId: { sourceSystem, sourceTenantId },
      },
    });
    if (!mappedCompany) {
      throw new NotFoundException(
        "O VÍNCULO DA EMPRESA DEVE SER PROVISIONADO ANTES DA SINCRONIZAÇÃO.",
      );
    }
    const company = await this.prisma.company.update({
      where: { id: mappedCompany.id },
      data: {
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
    if (!existingCompanyBranch) {
      throw new NotFoundException(
        "O VÍNCULO DA FILIAL DEVE SER PROVISIONADO ANTES DA SINCRONIZAÇÃO.",
      );
    }
    const companyBranch = await this.prisma.companyBranch.update({
      where: { id: existingCompanyBranch.id },
      data: {
        name: normalizeText(payload.branchName) || `FILIAL ${branchCode}`,
        isActive: true,
        isDefault: branchCode === DEFAULT_BRANCH_CODE,
        inventoryControlType,
        quantityPrecision,
        ...stockModes,
        stockClassificationMode: this.normalizeStockClassificationMode(
          payload.stockClassificationMode ||
            existingCompanyBranch.stockClassificationMode,
        ),
        notifyMinimumStockOnMovement:
          payload.notifyMinimumStockOnMovement ?? false,
        allowSaleUnitPriceEdit: payload.allowSaleUnitPriceEdit ?? true,
        allowSaleItemDiscount: payload.allowSaleItemDiscount ?? true,
        allowProductImageEdit: payload.allowProductImageEdit ?? true,
        requirePasswordToRemoveSaleItems: payload.requirePasswordToRemoveSaleItems ?? false,
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

    const classificationBackfill = await ensureDefaultProductClassification(
      this.prisma,
      {
        companyId: company.id,
        branchCode,
        mode: companyBranch.stockClassificationMode,
        requestedBy: actor,
      },
    );

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
          allowProductImageEdit: payload.allowProductImageEdit ?? true,
          requirePasswordToRemoveSaleItems: payload.requirePasswordToRemoveSaleItems ?? false,
        }),
        createdBy: actor,
        updatedBy: actor,
      },
      update: {
        parametersJson: JSON.stringify({
          allowSaleUnitPriceEdit: payload.allowSaleUnitPriceEdit ?? true,
          allowSaleItemDiscount: payload.allowSaleItemDiscount ?? true,
          groupSameProduct: payload.groupSameProduct ?? true,
          allowProductImageEdit: payload.allowProductImageEdit ?? true,
          requirePasswordToRemoveSaleItems: payload.requirePasswordToRemoveSaleItems ?? false,
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
          classificationBackfill,
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

  async provisionSourceTenant(payload: ProvisionSourceTenantDto) {
    if (!hasAuthenticatedFinanceScope("SOURCE_TENANT_PROVISION")) {
      throw new ForbiddenException(
        "A PROVISÃO INICIAL EXIGE O ESCOPO SOURCE_TENANT_PROVISION.",
      );
    }

    const sourceSystem = normalizeText(payload.sourceSystem);
    const sourceTenantId = normalizeText(payload.sourceTenantId);
    const companyName =
      normalizeText(payload.companyName) || `${sourceSystem} ${sourceTenantId}`;
    const companyDocument = normalizeTaxId(payload.companyDocument);
    const branches = Array.from(
      new Map(
        payload.branches.map((branch) => [
          Number(branch.code),
          {
            branchCode: Number(branch.code),
            name: normalizeText(branch.branchName) || "",
          },
        ]),
      ).values(),
    );

    if (
      !sourceSystem ||
      !sourceTenantId ||
      !branches.length ||
      branches.some(
        (branch) =>
          !Number.isSafeInteger(branch.branchCode) ||
          branch.branchCode < 1 ||
          !branch.name,
      )
    ) {
      throw new BadRequestException("CONTEXTO DA PROVISÃO INICIAL INVÁLIDO.");
    }

    const actor = String(payload.requestedBy || "INTEGRACAO_ORIGEM").trim();
    return this.prisma.$transaction(async (transaction) => {
      let company = await transaction.company.findUnique({
        where: {
          sourceSystem_sourceTenantId: {
            sourceSystem,
            sourceTenantId,
          },
        },
      });
      const companyCreated = !company;

      if (company && (company.status !== "ACTIVE" || company.canceledAt)) {
        throw new ForbiddenException(
          "O vínculo da empresa existe, mas está inativo ou cancelado.",
        );
      }

      if (!company) {
        company = await transaction.company.create({
          data: {
            sourceSystem,
            sourceTenantId,
            name: companyName,
            document: companyDocument,
            status: "ACTIVE",
            createdBy: actor,
            updatedBy: actor,
          },
        });
      }

      const provisionedBranches: Array<{
        branchCode: number;
        branchId: string;
        name: string;
        created: boolean;
      }> = [];

      for (const branchInput of branches) {
        let branch = await transaction.companyBranch.findUnique({
          where: {
            companyId_branchCode: {
              companyId: company.id,
              branchCode: branchInput.branchCode,
            },
          },
        });
        const branchCreated = !branch;

        if (branch && (!branch.isActive || branch.canceledAt)) {
          throw new ForbiddenException(
            `O vínculo da filial ${branchInput.branchCode} existe, mas está inativo ou cancelado.`,
          );
        }

        if (!branch) {
          branch = await transaction.companyBranch.create({
            data: {
              companyId: company.id,
              branchCode: branchInput.branchCode,
              name: branchInput.name,
              isActive: true,
              isDefault: branchInput.branchCode === DEFAULT_BRANCH_CODE,
              createdBy: actor,
              updatedBy: actor,
            },
          });
        }

        provisionedBranches.push({
          branchCode: branch.branchCode,
          branchId: branch.id,
          name: branch.name,
          created: branchCreated,
        });
      }

      return {
        provisioned: true,
        companyCreated,
        sourceSystem: company.sourceSystem,
        sourceTenantId: company.sourceTenantId,
        companyId: company.id,
        branches: provisionedBranches,
      };
    });
  }

  async listBranches(id: string, scope: ListCompaniesDto) {
    const company = await this.findScopedCompany(
      id,
      scope.sourceSystem,
      scope.sourceTenantId,
    );
    const branches = await runWithCompanyWideBranchDirectoryRead(() =>
      listCompanyBranches(this.prisma, company.id),
    );
    const centralTenantId = String(scope.centralTenantId || "")
      .trim()
      .toLowerCase();
    if (hasAuthenticatedFinanceScope("FINANCE_ADMIN") && centralTenantId) {
      await Promise.all(
        branches.map((branch) =>
          this.synchronizeBranchFromCentral(
            company,
            branch,
            centralTenantId,
          ),
        ),
      );
      const synchronized = await runWithCompanyWideBranchDirectoryRead(() =>
        listCompanyBranches(this.prisma, company.id),
      );
      return synchronized.map(mapCompanyBranchSummary);
    }
    return branches.map(mapCompanyBranchSummary);
  }

  async createCentralBranchEditorLaunch(
    id: string,
    branchId: string,
    scope: ListCompaniesDto,
    launchContext: CentralBranchEditorLaunchDto,
  ) {
    this.assertFinanceAdmin();
    const { company, branch } = await runWithCompanyWideBranchDirectoryRead(
      () => this.findScopedBranch(id, branchId, scope),
    );
    const context = getFinanceContext();
    const requestedBy =
      String(context?.sourceUserId || "FINANCEIRO_EMPRESAS").trim() ||
      "FINANCEIRO_EMPRESAS";
    const centralTenantId = String(launchContext?.centralTenantId || "")
      .trim()
      .toLowerCase();
    if (!centralTenantId) {
      throw new BadRequestException(
        "O vínculo global da empresa com a Central não foi informado.",
      );
    }
    const launch = await this.centralBranchEditor.createLaunch({
      tenantId: centralTenantId,
      branchCode: branch.branchCode,
      requestedBy,
    });
    await runWithAdministrativeBranchScope(
      branch.id,
      branch.branchCode,
      () =>
        this.prisma.sourceIntegrationAuditEvent.create({
          data: {
            companyId: company.id,
            branchCode: branch.branchCode,
            action: "CENTRAL_BRANCH_EDITOR_OPENED",
            summary:
              "MANUTENÇÃO ÚNICA DA FILIAL ABERTA NO SISTEMA CENTRAL MSINFOR.",
            metadataJson: JSON.stringify({
              sourceSystem: company.sourceSystem,
              sourceTenantId: company.sourceTenantId,
              centralTenantId,
              branchCode: branch.branchCode,
            }),
            performedBy: requestedBy,
            createdBy: requestedBy,
          },
        }),
    );
    return launch;
  }

  async refreshCentralBranchConfiguration(
    id: string,
    branchId: string,
    scope: ListCompaniesDto,
  ) {
    this.assertFinanceAdmin();
    const { company, branch } = await runWithCompanyWideBranchDirectoryRead(
      () => this.findScopedBranch(id, branchId, scope),
    );
    const centralTenantId = String(scope.centralTenantId || "")
      .trim()
      .toLowerCase();
    if (!centralTenantId) {
      throw new BadRequestException(
        "O vínculo global da empresa com a Central não foi informado.",
      );
    }
    await this.synchronizeBranchFromCentral(
      company,
      branch,
      centralTenantId,
      true,
    );
    const updated = await runWithCompanyWideBranchDirectoryRead(() =>
      this.prisma.companyBranch.findFirstOrThrow({
        where: { id: branch.id, companyId: company.id, canceledAt: null },
      }),
    );
    return mapCompanyBranchSummary(updated);
  }

  private mergeCentralCompany(configuration: CentralBranchConfiguration) {
    const tenant = configuration.tenant.company || {};
    const branch = configuration.branch?.company || {};
    const value = (branchValue?: string, tenantValue?: string) =>
      String(branchValue || tenantValue || "").trim() || null;
    return {
      legalName: value(branch.legalName, tenant.legalName),
      tradeName: value(branch.tradeName, tenant.tradeName),
      documentNumber: value(branch.documentNumber, tenant.documentNumber),
      stateRegistration: value(branch.stateRegistration, tenant.stateRegistration),
      municipalRegistration: value(branch.municipalRegistration, tenant.municipalRegistration),
      address: {
        postalCode: value(branch.address?.postalCode, tenant.address?.postalCode),
        street: value(branch.address?.street, tenant.address?.street),
        number: value(branch.address?.number, tenant.address?.number),
        complement: value(branch.address?.complement, tenant.address?.complement),
        district: value(branch.address?.district, tenant.address?.district),
        city: value(branch.address?.city, tenant.address?.city),
        state: value(branch.address?.state, tenant.address?.state),
        country: value(branch.address?.country, tenant.address?.country),
      },
      contacts: {
        phone: value(
          branch.contacts?.phone || branch.contacts?.mobile || branch.contacts?.whatsapp,
          tenant.contacts?.phone || tenant.contacts?.mobile || tenant.contacts?.whatsapp,
        ),
        email: value(branch.contacts?.email, tenant.contacts?.email),
      },
    };
  }

  private async synchronizeBranchFromCentral(
    company: any,
    branch: any,
    centralTenantId: string,
    forceAudit = false,
  ) {
    const configuration = await this.centralBranchEditor.findConfiguration(
      centralTenantId,
      branch.branchCode,
    );
    if (!configuration.branch || configuration.branch.branchCode !== branch.branchCode) {
      throw new BadRequestException("A CENTRAL RETORNOU UMA FILIAL DIFERENTE DA SOLICITADA.");
    }
    const commerce = configuration.effective.commerce;
    const master = this.mergeCentralCompany(configuration);
    const parameters = {
      allowSaleUnitPriceEdit: commerce?.allowSaleUnitPriceEdit ?? true,
      allowSaleItemDiscount: commerce?.allowSaleItemDiscount ?? true,
      groupSameProduct: commerce?.groupSameProduct ?? true,
      allowProductImageEdit: commerce?.allowProductImageEdit ?? true,
      requirePasswordToRemoveSaleItems:
        commerce?.requirePasswordToRemoveSaleItems ?? false,
    };
    const currentScreenParameter = await runWithAdministrativeBranchScope(
      branch.id,
      branch.branchCode,
      () =>
        this.prisma.screenParameter.findFirst({
          where: {
            companyId: company.id,
            branchId: branch.id,
            screenId: this.salesScreenId,
            canceledAt: null,
          },
        }),
    );
    const currentParameters = this.mapSalesScreenParameters(
      currentScreenParameter?.parametersJson,
    );
    const data = {
      name: configuration.branch.displayName,
      isActive: configuration.branch.status === "ACTIVE",
      stockControlMode: this.normalizeBranchStockParameterMode(commerce?.stockControlMode),
      stockIntegerQuantityMode: this.normalizeBranchStockParameterMode(commerce?.stockIntegerQuantityMode),
      stockLotControlMode: this.normalizeBranchStockParameterMode(commerce?.stockLotControlMode),
      stockExpirationControlMode: this.normalizeBranchStockParameterMode(commerce?.stockExpirationControlMode),
      stockGridControlMode: this.normalizeBranchStockParameterMode(commerce?.stockGridControlMode),
      stockNegativeControlMode: this.normalizeBranchStockParameterMode(commerce?.stockNegativeControlMode),
      stockClassificationMode: this.normalizeStockClassificationMode(
        commerce?.stockClassificationMode,
      ),
      notifyMinimumStockOnMovement: commerce?.notifyMinimumStockOnMovement === true,
      allowSaleUnitPriceEdit: parameters.allowSaleUnitPriceEdit,
      allowSaleItemDiscount: parameters.allowSaleItemDiscount,
      allowProductImageEdit: parameters.allowProductImageEdit,
      requirePasswordToRemoveSaleItems: parameters.requirePasswordToRemoveSaleItems,
      fiscalLegalName: master.legalName,
      fiscalTradeName: master.tradeName,
      fiscalDocument: master.documentNumber,
      stateRegistration: master.stateRegistration,
      municipalRegistration: master.municipalRegistration,
      fiscalStreet: master.address.street,
      fiscalNumber: master.address.number,
      fiscalComplement: master.address.complement,
      fiscalNeighborhood: master.address.district,
      fiscalCity: master.address.city,
      fiscalState: master.address.state,
      fiscalPostalCode: master.address.postalCode,
      fiscalCountryName: master.address.country,
      fiscalPhone: master.contacts.phone,
      fiscalEmail: master.contacts.email,
      updatedBy: "CENTRAL_API_SYNC",
    };
    const before = {
      name: branch.name,
      stockControlMode: branch.stockControlMode,
      stockIntegerQuantityMode: branch.stockIntegerQuantityMode,
      stockLotControlMode: branch.stockLotControlMode,
      stockExpirationControlMode: branch.stockExpirationControlMode,
      stockGridControlMode: branch.stockGridControlMode,
      stockNegativeControlMode: branch.stockNegativeControlMode,
      stockClassificationMode: branch.stockClassificationMode,
      notifyMinimumStockOnMovement: branch.notifyMinimumStockOnMovement,
      allowSaleUnitPriceEdit: branch.allowSaleUnitPriceEdit,
      allowSaleItemDiscount: branch.allowSaleItemDiscount,
      allowProductImageEdit: branch.allowProductImageEdit,
      requirePasswordToRemoveSaleItems: branch.requirePasswordToRemoveSaleItems,
      fiscalLegalName: branch.fiscalLegalName,
      fiscalTradeName: branch.fiscalTradeName,
      fiscalDocument: branch.fiscalDocument,
      stateRegistration: branch.stateRegistration,
      municipalRegistration: branch.municipalRegistration,
      fiscalStreet: branch.fiscalStreet,
      fiscalNumber: branch.fiscalNumber,
      fiscalComplement: branch.fiscalComplement,
      fiscalNeighborhood: branch.fiscalNeighborhood,
      fiscalCity: branch.fiscalCity,
      fiscalState: branch.fiscalState,
      fiscalPostalCode: branch.fiscalPostalCode,
      fiscalCountryName: branch.fiscalCountryName,
      fiscalPhone: branch.fiscalPhone,
      fiscalEmail: branch.fiscalEmail,
      screenParameters: currentParameters,
    };
    const after = {
      name: data.name,
      stockControlMode: data.stockControlMode,
      stockIntegerQuantityMode: data.stockIntegerQuantityMode,
      stockLotControlMode: data.stockLotControlMode,
      stockExpirationControlMode: data.stockExpirationControlMode,
      stockGridControlMode: data.stockGridControlMode,
      stockNegativeControlMode: data.stockNegativeControlMode,
      stockClassificationMode: data.stockClassificationMode,
      notifyMinimumStockOnMovement: data.notifyMinimumStockOnMovement,
      allowSaleUnitPriceEdit: data.allowSaleUnitPriceEdit,
      allowSaleItemDiscount: data.allowSaleItemDiscount,
      allowProductImageEdit: data.allowProductImageEdit,
      requirePasswordToRemoveSaleItems: data.requirePasswordToRemoveSaleItems,
      fiscalLegalName: data.fiscalLegalName,
      fiscalTradeName: data.fiscalTradeName,
      fiscalDocument: data.fiscalDocument,
      stateRegistration: data.stateRegistration,
      municipalRegistration: data.municipalRegistration,
      fiscalStreet: data.fiscalStreet,
      fiscalNumber: data.fiscalNumber,
      fiscalComplement: data.fiscalComplement,
      fiscalNeighborhood: data.fiscalNeighborhood,
      fiscalCity: data.fiscalCity,
      fiscalState: data.fiscalState,
      fiscalPostalCode: data.fiscalPostalCode,
      fiscalCountryName: data.fiscalCountryName,
      fiscalPhone: data.fiscalPhone,
      fiscalEmail: data.fiscalEmail,
      screenParameters: parameters,
    };
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    if (!changed && !forceAudit) return branch;

    return runWithAdministrativeBranchScope(branch.id, branch.branchCode, () =>
      this.prisma.$transaction(async (tx) => {
        const updated = await tx.companyBranch.update({
          where: { id: branch.id },
          data,
        });
        const classificationBackfill = await ensureDefaultProductClassification(
          tx,
          {
            companyId: company.id,
            branchCode: branch.branchCode,
            mode: updated.stockClassificationMode,
            requestedBy: "CENTRAL_API_SYNC",
          },
        );
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
            createdBy: "CENTRAL_API_SYNC",
            updatedBy: "CENTRAL_API_SYNC",
          },
          update: {
            parametersJson: JSON.stringify(parameters),
            updatedBy: "CENTRAL_API_SYNC",
            canceledAt: null,
            canceledBy: null,
          },
        });
        await tx.sourceIntegrationAuditEvent.create({
          data: {
            companyId: company.id,
            branchCode: branch.branchCode,
            action: "CENTRAL_BRANCH_CONFIGURATION_SYNCHRONIZED",
            summary:
              "CONFIGURAÇÃO EFETIVA DA FILIAL SINCRONIZADA A PARTIR DA API CENTRAL.",
            metadataJson: JSON.stringify({
              sourceSystem: company.sourceSystem,
              sourceTenantId: company.sourceTenantId,
              centralTenantId,
              branchCode: branch.branchCode,
              changed,
              before,
              after,
              classificationBackfill,
            }),
            performedBy: "CENTRAL_API_SYNC",
            createdBy: "CENTRAL_API_SYNC",
          },
        });
        return updated;
      }),
    );
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
            allowProductImageEdit: branch.allowProductImageEdit !== false,
            requirePasswordToRemoveSaleItems: branch.requirePasswordToRemoveSaleItems === true,
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
    this.assertFinanceAdmin();
    const { company, branch } = await this.findScopedBranch(id, branchId, scope);
    const current = await this.getSalesScreenParameters(id, branchId, scope);
    const parameters = {
      allowSaleUnitPriceEdit:
        payload.allowSaleUnitPriceEdit ?? current.allowSaleUnitPriceEdit,
      allowSaleItemDiscount:
        payload.allowSaleItemDiscount ?? current.allowSaleItemDiscount,
      groupSameProduct: payload.groupSameProduct ?? current.groupSameProduct,
      allowProductImageEdit:
        payload.allowProductImageEdit ?? current.allowProductImageEdit,
      requirePasswordToRemoveSaleItems:
        payload.requirePasswordToRemoveSaleItems ?? current.requirePasswordToRemoveSaleItems,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.companyBranch.update({
        where: { id: branch.id },
        data: {
          allowSaleUnitPriceEdit: parameters.allowSaleUnitPriceEdit,
          allowSaleItemDiscount: parameters.allowSaleItemDiscount,
          allowProductImageEdit: parameters.allowProductImageEdit,
          requirePasswordToRemoveSaleItems: parameters.requirePasswordToRemoveSaleItems,
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
    this.assertFinanceAdmin();
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
    const sourceStockParametersChanged = hasSourceOwnedBranchStockChanges(
      payload,
      branch,
    );
    const stockModes = this.getStockModesFromBranchPayload(
      sourceStockParametersChanged ? payload : {},
      {
        ...branch,
        inventoryControlType,
        quantityPrecision,
      },
    );
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
      allowProductImageEdit: currentScreenParameters.allowProductImageEdit,
      requirePasswordToRemoveSaleItems: payload.requirePasswordToRemoveSaleItems ?? currentScreenParameters.requirePasswordToRemoveSaleItems,
    };

    if (sourceStockParametersChanged) {
      await pushSourceCompanyBranchParameters({
        sourceSystem: company.sourceSystem,
        sourceTenantId: company.sourceTenantId,
        sourceBranchCode: branch.branchCode,
        entityType: "BRANCH",
        requestedBy: payload.requestedBy,
        parameters: stockModes,
      });
    }

    const updatedBranch = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.companyBranch.update({
        where: { id: branch.id },
        data: {
          inventoryControlType,
          quantityPrecision,
          ...stockModes,
          allowSaleUnitPriceEdit: parameters.allowSaleUnitPriceEdit,
          allowSaleItemDiscount: parameters.allowSaleItemDiscount,
          allowProductImageEdit: parameters.allowProductImageEdit,
          requirePasswordToRemoveSaleItems: parameters.requirePasswordToRemoveSaleItems,
          updatedBy: payload.requestedBy || null,
        },
      });

      const classificationBackfill = await ensureDefaultProductClassification(
        tx,
        {
          companyId: company.id,
          branchCode: branch.branchCode,
          mode: updated.stockClassificationMode,
          requestedBy: payload.requestedBy,
        },
      );

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
          action: sourceStockParametersChanged
            ? "BRANCH_PARAMETERS_UPDATED_AT_SOURCE"
            : "BRANCH_PARAMETERS_UPDATED_IN_FINANCEIRO",
          summary: sourceStockParametersChanged
            ? "PARÂMETROS DE ESTOQUE CONFIRMADOS NO SISTEMA DE ORIGEM E ESPELHADOS NO FINANCEIRO."
            : "PARÂMETROS EXCLUSIVOS DA FILIAL ATUALIZADOS NO FINANCEIRO.",
          metadataJson: JSON.stringify({
            sourceSystem: company.sourceSystem,
            sourceTenantId: company.sourceTenantId,
            sourceStockParametersChanged,
            parameters,
            classificationBackfill,
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
