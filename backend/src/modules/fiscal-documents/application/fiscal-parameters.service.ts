import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { normalizeBranchCode } from "../../../common/branch.constants";
import {
  normalizeDigits,
  normalizeEmail,
  normalizePhone,
  normalizeText,
  serializeJson,
} from "../../../common/finance-core.utils";
import {
  assertValidCnpj,
  normalizeTaxId,
} from "../../../common/brazil-tax-id.utils";
import { encryptSecret } from "../../../common/secret-crypto.utils";
import {
  NfeContextDto,
  SaveFiscalBranchDto,
  SaveFiscalBenefitCodeDto,
  SaveFiscalOperationNatureDto,
  SaveFiscalTaxRuleDto,
  SaveNfeProfileDto,
} from "./dto/nfe.dto";

const CURRENT_SCHEMA_VERSION = "PL_010E_V1.02+PL_010D_V1.03";
const CURRENT_CBENEFF_CATALOG_VERSION = "20260626";

@Injectable()
export class FiscalParametersService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadCompany(sourceSystem?: string, sourceTenantId?: string) {
    const normalizedSourceSystem = normalizeText(sourceSystem);
    const normalizedSourceTenantId = normalizeText(sourceTenantId);
    if (!normalizedSourceSystem || !normalizedSourceTenantId) {
      throw new BadRequestException("Informe o sistema de origem e o tenant.");
    }
    const company = await this.prisma.company.findUnique({
      where: {
        sourceSystem_sourceTenantId: {
          sourceSystem: normalizedSourceSystem,
          sourceTenantId: normalizedSourceTenantId,
        },
      },
    });
    if (!company || company.canceledAt) {
      throw new NotFoundException("EMPRESA FINANCEIRA NÃO ENCONTRADA.");
    }
    return company;
  }

  private branchCode(value?: number | null) {
    return Math.max(1, normalizeBranchCode(value, 1));
  }

  private async loadBranch(companyId: string, branchCode: number) {
    const branch = await this.prisma.companyBranch.findFirst({
      where: {
        companyId,
        branchCode,
        isActive: true,
        canceledAt: null,
      },
    });
    if (!branch) {
      throw new NotFoundException("FILIAL ATIVA NÃO ENCONTRADA.");
    }
    return branch;
  }

  private auditData(params: {
    companyId: string;
    branchCode: number;
    entityType: string;
    entityId: string;
    action: string;
    summary: string;
    before?: unknown;
    after?: unknown;
    performedBy?: string | null;
  }) {
    return {
      companyId: params.companyId,
      branchCode: params.branchCode,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      summary: normalizeText(params.summary)!,
      beforeJson: serializeJson(params.before),
      afterJson: serializeJson(params.after),
      occurredAt: new Date(),
      performedBy: params.performedBy || null,
      createdBy: params.performedBy || null,
    };
  }

  private mapBranch(branch: any) {
    if (!branch) return null;
    return {
      id: branch.id,
      companyId: branch.companyId,
      branchCode: branch.branchCode,
      name: branch.name,
      fiscalLegalName: branch.fiscalLegalName || null,
      fiscalTradeName: branch.fiscalTradeName || null,
      fiscalDocument: branch.fiscalDocument || null,
      stateRegistration: branch.stateRegistration || null,
      municipalRegistration: branch.municipalRegistration || null,
      taxRegimeCode: branch.taxRegimeCode || null,
      fiscalStreet: branch.fiscalStreet || null,
      fiscalNumber: branch.fiscalNumber || null,
      fiscalComplement: branch.fiscalComplement || null,
      fiscalNeighborhood: branch.fiscalNeighborhood || null,
      fiscalCity: branch.fiscalCity || null,
      fiscalCityCode: branch.fiscalCityCode || null,
      fiscalState: branch.fiscalState || null,
      fiscalStateCode: branch.fiscalStateCode || null,
      fiscalPostalCode: branch.fiscalPostalCode || null,
      fiscalCountryCode: branch.fiscalCountryCode || "1058",
      fiscalCountryName: branch.fiscalCountryName || "BRASIL",
      fiscalPhone: branch.fiscalPhone || null,
      fiscalEmail: branch.fiscalEmail || null,
      updatedAt: branch.updatedAt?.toISOString?.() || null,
    };
  }

  private mapProfile(profile: any) {
    if (!profile) return null;
    return {
      id: profile.id,
      companyId: profile.companyId,
      branchCode: profile.branchCode,
      certificateId: profile.certificateId,
      certificateAlias: profile.certificate?.aliasName || null,
      certificateValidTo:
        profile.certificate?.validTo?.toISOString?.() || null,
      defaultOperationNatureId: profile.defaultOperationNatureId || null,
      defaultOperationNatureName:
        profile.defaultOperationNature?.name || null,
      status: profile.status,
      environment: profile.environment,
      autoIssueOnSale: Boolean(profile.autoIssueOnSale),
      series: profile.series,
      nextNumber: profile.nextNumber,
      emissionType: profile.emissionType,
      danfeLayout: profile.danfeLayout,
      softwareVersion: profile.softwareVersion,
      schemaVersion: profile.schemaVersion,
      cbenefCatalogVersion: profile.cbenefCatalogVersion,
      sendEmailToRecipient: Boolean(profile.sendEmailToRecipient),
      smtpHost: profile.smtpHost || null,
      smtpPort: profile.smtpPort || null,
      smtpSecure: Boolean(profile.smtpSecure),
      smtpAuthenticate: Boolean(profile.smtpAuthenticate),
      smtpUsername: profile.smtpUsername || null,
      smtpFromEmail: profile.smtpFromEmail || null,
      smtpFromName: profile.smtpFromName || null,
      smtpTimeoutSeconds: profile.smtpTimeoutSeconds || 60,
      homologationEmailRecipient:
        profile.homologationEmailRecipient || null,
      hasSmtpPassword: Boolean(profile.smtpPasswordEncrypted),
      additionalInformation: profile.additionalInformation || null,
      technicalResponsibleCnpj:
        profile.technicalResponsibleCnpj || null,
      technicalResponsibleName:
        profile.technicalResponsibleName || null,
      technicalResponsibleEmail:
        profile.technicalResponsibleEmail || null,
      technicalResponsiblePhone:
        profile.technicalResponsiblePhone || null,
      csrtId: profile.csrtId || null,
      hasCsrtHash: Boolean(profile.csrtHash),
      updatedAt: profile.updatedAt?.toISOString?.() || null,
    };
  }

  private readiness(branch: any, profile: any, operations: any[], rules: any[]) {
    const checks = [
      {
        code: "BRANCH_DOCUMENT",
        label: "CNPJ válido da filial",
        ready: Boolean(
          branch?.fiscalDocument &&
            (() => {
              try {
                assertValidCnpj(branch.fiscalDocument);
                return true;
              } catch {
                return false;
              }
            })(),
        ),
      },
      {
        code: "BRANCH_IDENTITY",
        label: "Razão social, IE e CRT",
        ready: Boolean(
          branch?.fiscalLegalName &&
            branch?.stateRegistration &&
            branch?.taxRegimeCode,
        ),
      },
      {
        code: "BRANCH_ADDRESS",
        label: "Endereço fiscal e códigos IBGE",
        ready: Boolean(
          branch?.fiscalStreet &&
            branch?.fiscalNumber &&
            branch?.fiscalNeighborhood &&
            branch?.fiscalCity &&
            /^\d{7}$/.test(branch?.fiscalCityCode || "") &&
            branch?.fiscalState &&
            /^\d{2}$/.test(branch?.fiscalStateCode || "") &&
            /^\d{8}$/.test(branch?.fiscalPostalCode || ""),
        ),
      },
      {
        code: "CERTIFICATE",
        label: "Certificado A1 ativo e válido",
        ready: Boolean(
          profile?.certificate &&
            profile.certificate.status === "ACTIVE" &&
            !profile.certificate.canceledAt &&
            (!profile.certificate.validTo ||
              profile.certificate.validTo.getTime() > Date.now()),
        ),
      },
      {
        code: "PROFILE",
        label: "Perfil NF-e modelo 55",
        ready: Boolean(profile && profile.status === "ACTIVE"),
      },
      {
        code: "OPERATION",
        label: "Natureza de operação ativa",
        ready: operations.some(
          (operation) =>
            operation.status === "ACTIVE" && !operation.canceledAt,
        ),
      },
      {
        code: "TAX_RULE",
        label: "Regra tributária ativa",
        ready: rules.some(
          (rule) => rule.status === "ACTIVE" && !rule.canceledAt,
        ),
      },
      {
        code: "SCHEMA",
        label: "Schema e catálogo cBenef atuais",
        ready: Boolean(
          profile?.schemaVersion === CURRENT_SCHEMA_VERSION &&
            profile?.cbenefCatalogVersion ===
              CURRENT_CBENEFF_CATALOG_VERSION,
        ),
      },
    ];
    return {
      ready: checks.every((check) => check.ready),
      checks,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      cbenefCatalogVersion: CURRENT_CBENEFF_CATALOG_VERSION,
    };
  }

  async getOverview(query: NfeContextDto) {
    const company = await this.loadCompany(
      query.sourceSystem,
      query.sourceTenantId,
    );
    const branchCode = this.branchCode(query.sourceBranchCode);
    const branch = await this.loadBranch(company.id, branchCode);
    const environment = normalizeText(query.environment) || "HOMOLOGATION";
    const [profiles, operations, rules, benefits, certificates] =
      await Promise.all([
        this.prisma.nfeProfile.findMany({
          where: {
            companyId: company.id,
            branchCode,
            environment,
            canceledAt: null,
          },
          include: {
            certificate: true,
            defaultOperationNature: true,
          },
          orderBy: [{ autoIssueOnSale: "desc" }, { series: "asc" }],
        }),
        this.prisma.fiscalOperationNature.findMany({
          where: { companyId: company.id, branchCode, canceledAt: null },
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        }),
        this.prisma.fiscalTaxRule.findMany({
          where: { companyId: company.id, branchCode, canceledAt: null },
          include: {
            operationNature: { select: { code: true, name: true } },
            product: { select: { id: true, name: true } },
          },
          orderBy: [{ priority: "asc" }, { name: "asc" }],
        }),
        this.prisma.fiscalBenefitCode.findMany({
          where: {
            companyId: company.id,
            branchCode,
            stateCode: branch.fiscalState || "SP",
            canceledAt: null,
          },
          orderBy: [{ code: "asc" }],
        }),
        this.prisma.fiscalCertificate.findMany({
          where: {
            companyId: company.id,
            branchCode: { in: [0, branchCode] },
            environment,
            status: "ACTIVE",
            canceledAt: null,
          },
          select: {
            id: true,
            branchCode: true,
            aliasName: true,
            holderName: true,
            holderDocument: true,
            validFrom: true,
            validTo: true,
            purpose: true,
          },
          orderBy: [{ isDefault: "desc" }, { aliasName: "asc" }],
        }),
      ]);
    const profile = profiles[0] || null;
    return {
      company: {
        id: company.id,
        name: company.name,
        document: company.document || null,
        sourceSystem: company.sourceSystem,
        sourceTenantId: company.sourceTenantId,
      },
      branch: this.mapBranch(branch),
      profile: this.mapProfile(profile),
      profiles: profiles.map((item) => this.mapProfile(item)),
      operations,
      rules,
      benefits,
      certificates: certificates.map((certificate) => ({
        ...certificate,
        validFrom: certificate.validFrom?.toISOString?.() || null,
        validTo: certificate.validTo?.toISOString?.() || null,
      })),
      readiness: this.readiness(branch, profile, operations, rules),
    };
  }

  async saveBranch(payload: SaveFiscalBranchDto) {
    const company = await this.loadCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const branchCode = this.branchCode(payload.sourceBranchCode);
    const branch = await this.loadBranch(company.id, branchCode);
    const fiscalDocument = assertValidCnpj(
      payload.fiscalDocument,
      "o CNPJ da filial",
    );
    const requiredDigits = (
      value: string | undefined,
      length: number,
      label: string,
    ) => {
      const normalized = normalizeDigits(value);
      if (!normalized || normalized.length !== length) {
        throw new BadRequestException(
          `Informe ${label} com ${length} dígitos.`,
        );
      }
      return normalized;
    };
    const data = {
      fiscalLegalName: normalizeText(payload.fiscalLegalName),
      fiscalTradeName: normalizeText(payload.fiscalTradeName),
      fiscalDocument,
      stateRegistration: normalizeDigits(payload.stateRegistration),
      municipalRegistration: normalizeDigits(payload.municipalRegistration),
      taxRegimeCode: payload.taxRegimeCode,
      fiscalStreet: normalizeText(payload.fiscalStreet),
      fiscalNumber: normalizeText(payload.fiscalNumber),
      fiscalComplement: normalizeText(payload.fiscalComplement),
      fiscalNeighborhood: normalizeText(payload.fiscalNeighborhood),
      fiscalCity: normalizeText(payload.fiscalCity),
      fiscalCityCode: requiredDigits(
        payload.fiscalCityCode,
        7,
        "o código IBGE do município",
      ),
      fiscalState: normalizeText(payload.fiscalState),
      fiscalStateCode: requiredDigits(
        payload.fiscalStateCode,
        2,
        "o código IBGE da UF",
      ),
      fiscalPostalCode: requiredDigits(payload.fiscalPostalCode, 8, "o CEP"),
      fiscalCountryCode:
        normalizeDigits(payload.fiscalCountryCode) || "1058",
      fiscalCountryName:
        normalizeText(payload.fiscalCountryName) || "BRASIL",
      fiscalPhone: normalizePhone(payload.fiscalPhone),
      fiscalEmail: normalizeEmail(payload.fiscalEmail),
      updatedBy: payload.requestedBy || null,
    };
    const updated = await this.prisma.$transaction(async (tx: any) => {
      const saved = await tx.companyBranch.update({
        where: { id: branch.id },
        data,
      });
      await tx.fiscalAuditEvent.create({
        data: this.auditData({
          companyId: company.id,
          branchCode,
          entityType: "COMPANY_BRANCH",
          entityId: branch.id,
          action: "UPDATE_FISCAL_IDENTITY",
          summary: "DADOS FISCAIS DA FILIAL ATUALIZADOS",
          before: this.mapBranch(branch),
          after: this.mapBranch(saved),
          performedBy: payload.requestedBy,
        }),
      });
      return saved;
    });
    return this.mapBranch(updated);
  }

  async saveOperation(payload: SaveFiscalOperationNatureDto) {
    const company = await this.loadCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const branchCode = this.branchCode(payload.sourceBranchCode);
    await this.loadBranch(company.id, branchCode);
    const code = normalizeText(payload.code);
    const name = normalizeText(payload.name);
    const cfopCode = normalizeDigits(payload.cfopCode);
    if (!code || !name || !cfopCode || cfopCode.length !== 4) {
      throw new BadRequestException(
        "Informe código, nome e CFOP válido para a natureza de operação.",
      );
    }
    const existing = payload.id
      ? await this.prisma.fiscalOperationNature.findFirst({
          where: { id: payload.id, companyId: company.id, branchCode },
        })
      : await this.prisma.fiscalOperationNature.findUnique({
          where: {
            companyId_branchCode_code: {
              companyId: company.id,
              branchCode,
              code,
            },
          },
        });
    const data = {
      status: "ACTIVE",
      code,
      name,
      documentModel: payload.documentModel || "55",
      operationType: payload.operationType,
      destinationType: payload.destinationType,
      purposeCode: payload.purposeCode,
      cfopCode,
      finalConsumer: Boolean(payload.finalConsumer),
      presenceIndicator:
        normalizeDigits(payload.presenceIndicator) ||
        normalizeText(payload.presenceIndicator)!,
      intermediaryIndicator:
        normalizeDigits(payload.intermediaryIndicator) ||
        normalizeText(payload.intermediaryIndicator),
      freightMode:
        normalizeDigits(payload.freightMode) ||
        normalizeText(payload.freightMode)!,
      isDefault: Boolean(payload.isDefault),
      additionalInformation: normalizeText(payload.additionalInformation),
      canceledAt: null,
      canceledBy: null,
      updatedBy: payload.requestedBy || null,
    };
    const saved = await this.prisma.$transaction(async (tx: any) => {
      if (payload.isDefault) {
        await tx.fiscalOperationNature.updateMany({
          where: {
            companyId: company.id,
            branchCode,
            documentModel: payload.documentModel || "55",
          },
          data: { isDefault: false, updatedBy: payload.requestedBy || null },
        });
      }
      const operation = existing
        ? await tx.fiscalOperationNature.update({
            where: { id: existing.id },
            data,
          })
        : await tx.fiscalOperationNature.create({
            data: {
              companyId: company.id,
              branchCode,
              ...data,
              createdBy: payload.requestedBy || null,
            },
          });
      await tx.fiscalAuditEvent.create({
        data: this.auditData({
          companyId: company.id,
          branchCode,
          entityType: "FISCAL_OPERATION_NATURE",
          entityId: operation.id,
          action: existing ? "UPDATE" : "CREATE",
          summary: existing
            ? "NATUREZA DE OPERAÇÃO ATUALIZADA"
            : "NATUREZA DE OPERAÇÃO CRIADA",
          before: existing,
          after: operation,
          performedBy: payload.requestedBy,
        }),
      });
      return operation;
    });
    return saved;
  }

  async saveTaxRule(payload: SaveFiscalTaxRuleDto) {
    const company = await this.loadCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const branchCode = this.branchCode(payload.sourceBranchCode);
    const branch = await this.loadBranch(company.id, branchCode);
    const operation = await this.prisma.fiscalOperationNature.findFirst({
      where: {
        id: payload.operationNatureId,
        companyId: company.id,
        branchCode,
        status: "ACTIVE",
        canceledAt: null,
      },
    });
    if (!operation) {
      throw new BadRequestException(
        "Natureza de operação ativa não encontrada para a filial.",
      );
    }
    if (payload.productId) {
      const product = await this.prisma.product.findFirst({
        where: {
          id: payload.productId,
          companyId: company.id,
          branchCode,
          canceledAt: null,
        },
      });
      if (!product) {
        throw new BadRequestException(
          "Produto não encontrado para a empresa e filial.",
        );
      }
    }
    const benefitCode = normalizeText(payload.fiscalBenefitCode);
    if (benefitCode === "SEM CBENEF") {
      throw new BadRequestException(
        "SEM CBENEF não é aceito em São Paulo desde 01/07/2026.",
      );
    }
    if (payload.fiscalBenefitRequired && !benefitCode) {
      throw new BadRequestException(
        "A regra marcada com benefício fiscal obrigatório precisa informar cBenef.",
      );
    }
    if (benefitCode) {
      const catalogCode = await this.prisma.fiscalBenefitCode.findFirst({
        where: {
          companyId: company.id,
          branchCode,
          stateCode: branch.fiscalState || "SP",
          code: benefitCode,
          status: "ACTIVE",
          canceledAt: null,
          OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
        },
      });
      if (!catalogCode) {
        throw new BadRequestException(
          `O cBenef ${benefitCode} não está ativo no catálogo fiscal da filial.`,
        );
      }
    }
    const existing = payload.id
      ? await this.prisma.fiscalTaxRule.findFirst({
          where: {
            id: payload.id,
            companyId: company.id,
            branchCode,
          },
        })
      : null;
    const dateValue = (value?: string) => {
      if (!value) return null;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException("Informe uma vigência válida.");
      }
      return parsed;
    };
    const data = {
      operationNatureId: operation.id,
      productId: payload.productId || null,
      status: "ACTIVE",
      name: normalizeText(payload.name)!,
      priority: Number(payload.priority ?? 100),
      originCode: normalizeDigits(payload.originCode) || "0",
      icmsCsosnCode: normalizeDigits(payload.icmsCsosnCode),
      icmsCstCode: normalizeDigits(payload.icmsCstCode),
      icmsBaseMode: normalizeDigits(payload.icmsBaseMode),
      icmsRate: Number(payload.icmsRate || 0),
      icmsBaseReductionRate: Number(payload.icmsBaseReductionRate || 0),
      fiscalBenefitCode: benefitCode,
      fiscalBenefitRequired: Boolean(payload.fiscalBenefitRequired),
      fiscalBenefitLegalBasis: normalizeText(
        payload.fiscalBenefitLegalBasis,
      ),
      pisCstCode: normalizeDigits(payload.pisCstCode) || "49",
      pisRate: Number(payload.pisRate || 0),
      cofinsCstCode: normalizeDigits(payload.cofinsCstCode) || "49",
      cofinsRate: Number(payload.cofinsRate || 0),
      ipiCstCode: normalizeDigits(payload.ipiCstCode),
      ipiFrameworkCode: normalizeDigits(payload.ipiFrameworkCode),
      ipiRate: Number(payload.ipiRate || 0),
      ibsCbsEnabled: Boolean(payload.ibsCbsEnabled),
      ibsCbsCstCode: normalizeDigits(payload.ibsCbsCstCode),
      ibsCbsClassCode: normalizeDigits(payload.ibsCbsClassCode),
      ibsStateRate: Number(payload.ibsStateRate || 0),
      ibsMunicipalRate: Number(payload.ibsMunicipalRate || 0),
      cbsRate: Number(payload.cbsRate || 0),
      validFrom: dateValue(payload.validFrom),
      validTo: dateValue(payload.validTo),
      canceledAt: null,
      canceledBy: null,
      updatedBy: payload.requestedBy || null,
    };
    const saved = await this.prisma.$transaction(async (tx: any) => {
      const rule = existing
        ? await tx.fiscalTaxRule.update({
            where: { id: existing.id },
            data,
          })
        : await tx.fiscalTaxRule.create({
            data: {
              companyId: company.id,
              branchCode,
              ...data,
              createdBy: payload.requestedBy || null,
            },
          });
      await tx.fiscalAuditEvent.create({
        data: this.auditData({
          companyId: company.id,
          branchCode,
          entityType: "FISCAL_TAX_RULE",
          entityId: rule.id,
          action: existing ? "UPDATE" : "CREATE",
          summary: existing
            ? "REGRA TRIBUTÁRIA ATUALIZADA"
            : "REGRA TRIBUTÁRIA CRIADA",
          before: existing,
          after: rule,
          performedBy: payload.requestedBy,
        }),
      });
      return rule;
    });
    return saved;
  }

  async saveBenefit(payload: SaveFiscalBenefitCodeDto) {
    const company = await this.loadCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const branchCode = this.branchCode(payload.sourceBranchCode);
    const branch = await this.loadBranch(company.id, branchCode);
    const stateCode = normalizeText(payload.stateCode || branch.fiscalState);
    const code = normalizeText(payload.code);
    const catalogVersion =
      normalizeDigits(payload.catalogVersion) ||
      CURRENT_CBENEFF_CATALOG_VERSION;
    const description = normalizeText(payload.description);
    if (!stateCode || stateCode.length !== 2 || !code || !description) {
      throw new BadRequestException(
        "Informe UF, código e descrição válidos para o cBenef.",
      );
    }
    if (code === "SEM CBENEF") {
      throw new BadRequestException(
        "SEM CBENEF não é aceito em São Paulo desde 01/07/2026.",
      );
    }
    const dateValue = (value?: string) => {
      if (!value) return null;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException("Informe uma vigência válida.");
      }
      return parsed;
    };
    const cstCodes = String(payload.cstCodes || "")
      .split(/[,;|\s]+/)
      .map((item) => normalizeDigits(item))
      .filter(Boolean);
    const existing = payload.id
      ? await this.prisma.fiscalBenefitCode.findFirst({
          where: {
            id: payload.id,
            companyId: company.id,
            branchCode,
          },
        })
      : await this.prisma.fiscalBenefitCode.findUnique({
          where: {
            companyId_branchCode_stateCode_code_catalogVersion: {
              companyId: company.id,
              branchCode,
              stateCode,
              code,
              catalogVersion,
            },
          },
        });
    const data = {
      stateCode,
      code,
      catalogVersion,
      status: "ACTIVE",
      description,
      legalBasis: normalizeText(payload.legalBasis),
      observations: normalizeText(payload.observations),
      simpleNationalEligible: Boolean(payload.simpleNationalEligible),
      cstCodesJson: cstCodes.length ? serializeJson(cstCodes) : null,
      validFrom: dateValue(payload.validFrom),
      validTo: dateValue(payload.validTo),
      sourceUrl:
        String(payload.sourceUrl || "").trim() ||
        "https://portal.fazenda.sp.gov.br/servicos/nfe/Paginas/cBenef.aspx",
      canceledAt: null,
      canceledBy: null,
      updatedBy: payload.requestedBy || null,
    };
    const saved = await this.prisma.$transaction(async (tx: any) => {
      const benefit = existing
        ? await tx.fiscalBenefitCode.update({
            where: { id: existing.id },
            data,
          })
        : await tx.fiscalBenefitCode.create({
            data: {
              companyId: company.id,
              branchCode,
              ...data,
              createdBy: payload.requestedBy || null,
            },
          });
      await tx.fiscalAuditEvent.create({
        data: this.auditData({
          companyId: company.id,
          branchCode,
          entityType: "FISCAL_BENEFIT_CODE",
          entityId: benefit.id,
          action: existing ? "UPDATE" : "CREATE",
          summary: existing
            ? "CÓDIGO DE BENEFÍCIO FISCAL ATUALIZADO"
            : "CÓDIGO DE BENEFÍCIO FISCAL CRIADO",
          before: existing,
          after: benefit,
          performedBy: payload.requestedBy,
        }),
      });
      return benefit;
    });
    return saved;
  }

  async saveProfile(payload: SaveNfeProfileDto) {
    const company = await this.loadCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const branchCode = this.branchCode(payload.sourceBranchCode);
    const branch = await this.loadBranch(company.id, branchCode);
    const environment = normalizeText(payload.environment) || "HOMOLOGATION";
    const issuerCnpj = assertValidCnpj(
      branch.fiscalDocument,
      "o CNPJ da filial emitente",
    );
    const certificate = await this.prisma.fiscalCertificate.findFirst({
      where: {
        id: payload.certificateId,
        companyId: company.id,
        branchCode: { in: [0, branchCode] },
        environment,
        status: "ACTIVE",
        canceledAt: null,
      },
    });
    if (!certificate) {
      throw new BadRequestException(
        "Certificado A1 ativo não encontrado para a empresa, filial e ambiente.",
      );
    }
    if (normalizeTaxId(certificate.holderDocument) !== issuerCnpj) {
      throw new BadRequestException(
        "O CNPJ do certificado não corresponde ao CNPJ da filial emitente.",
      );
    }
    if (certificate.validTo && certificate.validTo.getTime() <= Date.now()) {
      throw new BadRequestException("O certificado A1 selecionado está vencido.");
    }
    if (payload.defaultOperationNatureId) {
      const operation = await this.prisma.fiscalOperationNature.findFirst({
        where: {
          id: payload.defaultOperationNatureId,
          companyId: company.id,
          branchCode,
          documentModel: "55",
          status: "ACTIVE",
          canceledAt: null,
        },
      });
      if (!operation) {
        throw new BadRequestException(
          "Natureza padrão ativa não encontrada para a filial.",
        );
      }
    }
    const technicalResponsibleCnpj = payload.technicalResponsibleCnpj
      ? assertValidCnpj(
          payload.technicalResponsibleCnpj,
          "o CNPJ do responsável técnico",
        )
      : null;
    const existing = await this.prisma.nfeProfile.findFirst({
      where: {
        companyId: company.id,
        branchCode,
        environment,
        canceledAt: null,
      },
      orderBy: [{ autoIssueOnSale: "desc" }, { createdAt: "asc" }],
    });
    const smtpHost =
      String(payload.smtpHost ?? existing?.smtpHost ?? "")
        .trim()
        .toLowerCase() || null;
    const smtpPort =
      payload.smtpPort !== undefined
        ? Number(payload.smtpPort)
        : existing?.smtpPort || null;
    const smtpSecure =
      payload.smtpSecure ?? existing?.smtpSecure ?? smtpPort === 465;
    const smtpAuthenticate =
      payload.smtpAuthenticate ?? existing?.smtpAuthenticate ?? true;
    const smtpFromEmail = normalizeEmail(
      payload.smtpFromEmail ?? existing?.smtpFromEmail,
    );
    const smtpUsername =
      String(
        payload.smtpUsername ??
          existing?.smtpUsername ??
          smtpFromEmail ??
          "",
      ).trim() || null;
    const smtpPasswordInput = String(payload.smtpPassword || "").trim();
    const smtpPasswordEncrypted = smtpPasswordInput
      ? encryptSecret(smtpPasswordInput)
      : existing?.smtpPasswordEncrypted || null;
    const smtpFromName =
      normalizeText(payload.smtpFromName ?? existing?.smtpFromName) ||
      branch.fiscalTradeName ||
      branch.fiscalLegalName ||
      branch.name;
    const smtpTimeoutSeconds =
      payload.smtpTimeoutSeconds ?? existing?.smtpTimeoutSeconds ?? 60;
    const homologationEmailRecipient = normalizeEmail(
      payload.homologationEmailRecipient ??
        existing?.homologationEmailRecipient,
    );
    if (payload.sendEmailToRecipient) {
      if (!smtpHost || !smtpPort || !smtpFromEmail) {
        throw new BadRequestException(
          "Configure servidor, porta e e-mail remetente para o envio da NF-e.",
        );
      }
      if (smtpAuthenticate && (!smtpUsername || !smtpPasswordEncrypted)) {
        throw new BadRequestException(
          "Configure usuário e senha SMTP para o envio da NF-e.",
        );
      }
      if (environment === "HOMOLOGATION" && !homologationEmailRecipient) {
        throw new BadRequestException(
          "Configure o e-mail fixo que receberá as NF-e de homologação.",
        );
      }
    }
    const data = {
      certificateId: certificate.id,
      defaultOperationNatureId: payload.defaultOperationNatureId || null,
      status: "ACTIVE",
      environment,
      autoIssueOnSale: Boolean(payload.autoIssueOnSale),
      series: Number(payload.series),
      nextNumber: Number(payload.nextNumber),
      emissionType: payload.emissionType || "NORMAL",
      danfeLayout: payload.danfeLayout || "PORTRAIT",
      softwareVersion:
        normalizeText(payload.softwareVersion) || "MSINFOR FIN 1.0",
      schemaVersion: CURRENT_SCHEMA_VERSION,
      cbenefCatalogVersion: CURRENT_CBENEFF_CATALOG_VERSION,
      sendEmailToRecipient: Boolean(payload.sendEmailToRecipient),
      smtpHost,
      smtpPort,
      smtpSecure: Boolean(smtpSecure),
      smtpAuthenticate: Boolean(smtpAuthenticate),
      smtpUsername,
      smtpPasswordEncrypted,
      smtpFromEmail,
      smtpFromName,
      smtpTimeoutSeconds,
      homologationEmailRecipient,
      additionalInformation: normalizeText(payload.additionalInformation),
      technicalResponsibleCnpj,
      technicalResponsibleName: normalizeText(
        payload.technicalResponsibleName,
      ),
      technicalResponsibleEmail: normalizeEmail(
        payload.technicalResponsibleEmail,
      ),
      technicalResponsiblePhone: normalizePhone(
        payload.technicalResponsiblePhone,
      ),
      csrtId: normalizeDigits(payload.csrtId),
      csrtHash:
        String(payload.csrtHash || "").trim() ||
        existing?.csrtHash ||
        null,
      canceledAt: null,
      canceledBy: null,
      updatedBy: payload.requestedBy || null,
    };
    const profile = await this.prisma.$transaction(async (tx: any) => {
      if (payload.autoIssueOnSale) {
        await tx.nfeProfile.updateMany({
          where: { companyId: company.id, branchCode },
          data: {
            autoIssueOnSale: false,
            updatedBy: payload.requestedBy || null,
          },
        });
      }
      const saved = existing
        ? await tx.nfeProfile.update({
            where: { id: existing.id },
            data,
            include: {
              certificate: true,
              defaultOperationNature: true,
            },
          })
        : await tx.nfeProfile.create({
            data: {
              companyId: company.id,
              branchCode,
              ...data,
              createdBy: payload.requestedBy || null,
            },
            include: {
              certificate: true,
              defaultOperationNature: true,
            },
          });
      await tx.fiscalAuditEvent.create({
        data: this.auditData({
          companyId: company.id,
          branchCode,
          entityType: "NFE_PROFILE",
          entityId: saved.id,
          action: existing ? "UPDATE" : "CREATE",
          summary: existing
            ? "PERFIL NF-E ATUALIZADO"
            : "PERFIL NF-E CRIADO",
          before: this.mapProfile(existing),
          after: this.mapProfile(saved),
          performedBy: payload.requestedBy,
        }),
      });
      return saved;
    });
    return this.mapProfile(profile);
  }

  async cancelParameter(
    entityType: "operation" | "rule" | "benefit",
    entityId: string,
    payload: NfeContextDto,
  ) {
    const company = await this.loadCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const branchCode = this.branchCode(payload.sourceBranchCode);
    const model =
      entityType === "operation"
        ? this.prisma.fiscalOperationNature
        : entityType === "rule"
          ? this.prisma.fiscalTaxRule
          : this.prisma.fiscalBenefitCode;
    const existing = await (model as any).findFirst({
      where: {
        id: entityId,
        companyId: company.id,
        branchCode,
        canceledAt: null,
      },
    });
    if (!existing) {
      throw new NotFoundException("PARÂMETRO FISCAL NÃO ENCONTRADO.");
    }
    const canceledAt = new Date();
    const updated = await this.prisma.$transaction(async (tx: any) => {
      const txModel =
        entityType === "operation"
          ? tx.fiscalOperationNature
          : entityType === "rule"
            ? tx.fiscalTaxRule
            : tx.fiscalBenefitCode;
      const saved = await txModel.update({
        where: { id: existing.id },
        data: {
          status: "INACTIVE",
          canceledAt,
          canceledBy: payload.requestedBy || null,
          updatedBy: payload.requestedBy || null,
        },
      });
      await tx.fiscalAuditEvent.create({
        data: this.auditData({
          companyId: company.id,
          branchCode,
          entityType:
            entityType === "operation"
              ? "FISCAL_OPERATION_NATURE"
              : entityType === "rule"
                ? "FISCAL_TAX_RULE"
                : "FISCAL_BENEFIT_CODE",
          entityId: existing.id,
          action: "CANCEL",
          summary: "PARÂMETRO FISCAL CANCELADO LOGICAMENTE",
          before: existing,
          after: saved,
          performedBy: payload.requestedBy,
        }),
      });
      return saved;
    });
    return updated;
  }
}
