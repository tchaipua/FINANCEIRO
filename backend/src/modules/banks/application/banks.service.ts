import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  normalizeDigits,
  normalizeText,
} from "../../../common/finance-core.utils";
import {
  ChangeBankStatusDto,
  GetBankDto,
  ListBanksDto,
  SaveBankDto,
} from "./dto/banks.dto";

type NormalizedBankPayload = {
  bankCode: string;
  bankName: string;
  branchNumber: string;
  branchDigit: string;
  accountNumber: string;
  accountDigit: string;
  walletCode: string | null;
  agreementCode: string | null;
  pixKey: string | null;
  beneficiaryName: string | null;
  beneficiaryDocument: string | null;
  billingProvider: string | null;
  billingEnvironment: string | null;
  billingApiClientId: string | null;
  billingApiClientSecret: string | null;
  billingCertificateBase64: string | null;
  billingCertificatePassword: string | null;
  billingBeneficiaryCode: string | null;
  billingWalletVariation: string | null;
  billingContractNumber: string | null;
  billingModalityCode: string | null;
  billingDocumentSpeciesCode: string | null;
  billingAcceptanceCode: string | null;
  billingIssueTypeCode: string | null;
  billingDistributionTypeCode: string | null;
  billingNextBoletoNumber: number | null;
  billingRegisterPixCode: number | null;
  billingInstructionLine1: string | null;
  billingInstructionLine2: string | null;
  billingDefaultFinePercent: number | null;
  billingDefaultInterestPercent: number | null;
  billingDefaultDiscountPercent: number | null;
  billingProtestDays: number | null;
  billingNegativeDays: number | null;
  notes: string | null;
};

@Injectable()
export class BanksService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeOptionalRawText(value: string | null | undefined) {
    const normalized = String(value || "").trim();
    return normalized || null;
  }

  private normalizeRequiredText(value: string | null | undefined, label: string) {
    const normalized = normalizeText(value);
    if (!normalized) {
      throw new BadRequestException(`Informe ${label}.`);
    }

    return normalized;
  }

  private normalizeRequiredDigits(
    value: string | null | undefined,
    label: string,
  ) {
    const normalized = normalizeDigits(value);
    if (!normalized) {
      throw new BadRequestException(`Informe ${label}.`);
    }

    return normalized;
  }

  private normalizeOptionalPercent(
    value: number | null | undefined,
    label: string,
  ) {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < 0) {
      throw new BadRequestException(`Informe ${label} válida.`);
    }

    return Number(normalized.toFixed(2));
  }

  private normalizeOptionalInteger(
    value: number | null | undefined,
    label: string,
  ) {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized = Number(value);
    if (
      !Number.isFinite(normalized) ||
      !Number.isInteger(normalized) ||
      normalized < 0
    ) {
      throw new BadRequestException(`Informe ${label} válido.`);
    }

    return normalized;
  }

  private buildNormalizedPayload(payload: SaveBankDto): NormalizedBankPayload {
    return {
      bankCode: this.normalizeRequiredDigits(payload.bankCode, "o código do banco"),
      bankName: this.normalizeRequiredText(payload.bankName, "o nome do banco"),
      branchNumber: this.normalizeRequiredDigits(
        payload.branchNumber,
        "a agência",
      ),
      branchDigit: normalizeDigits(payload.branchDigit) || "",
      accountNumber: this.normalizeRequiredDigits(
        payload.accountNumber,
        "a conta",
      ),
      accountDigit: normalizeDigits(payload.accountDigit) || "",
      walletCode: normalizeText(payload.walletCode),
      agreementCode: normalizeText(payload.agreementCode),
      pixKey: normalizeText(payload.pixKey),
      beneficiaryName: normalizeText(payload.beneficiaryName),
      beneficiaryDocument: normalizeDigits(payload.beneficiaryDocument),
      billingProvider: normalizeText(payload.billingProvider),
      billingEnvironment: normalizeText(payload.billingEnvironment),
      billingApiClientId: this.normalizeOptionalRawText(payload.billingApiClientId),
      billingApiClientSecret: this.normalizeOptionalRawText(
        payload.billingApiClientSecret,
      ),
      billingCertificateBase64: this.normalizeOptionalRawText(
        payload.billingCertificateBase64,
      ),
      billingCertificatePassword: this.normalizeOptionalRawText(
        payload.billingCertificatePassword,
      ),
      billingBeneficiaryCode: normalizeText(payload.billingBeneficiaryCode),
      billingWalletVariation: normalizeText(payload.billingWalletVariation),
      billingContractNumber: normalizeText(payload.billingContractNumber),
      billingModalityCode: normalizeText(payload.billingModalityCode),
      billingDocumentSpeciesCode: normalizeText(
        payload.billingDocumentSpeciesCode,
      ),
      billingAcceptanceCode: normalizeText(payload.billingAcceptanceCode),
      billingIssueTypeCode: normalizeText(payload.billingIssueTypeCode),
      billingDistributionTypeCode: normalizeText(
        payload.billingDistributionTypeCode,
      ),
      billingNextBoletoNumber: this.normalizeOptionalInteger(
        payload.billingNextBoletoNumber,
        "o próximo boleto",
      ),
      billingRegisterPixCode: this.normalizeOptionalInteger(
        payload.billingRegisterPixCode,
        "o código de PIX",
      ),
      billingInstructionLine1: normalizeText(payload.billingInstructionLine1),
      billingInstructionLine2: normalizeText(payload.billingInstructionLine2),
      billingDefaultFinePercent: this.normalizeOptionalPercent(
        payload.billingDefaultFinePercent,
        "a multa padrão",
      ),
      billingDefaultInterestPercent: this.normalizeOptionalPercent(
        payload.billingDefaultInterestPercent,
        "o juro padrão",
      ),
      billingDefaultDiscountPercent: this.normalizeOptionalPercent(
        payload.billingDefaultDiscountPercent,
        "o desconto padrão",
      ),
      billingProtestDays: this.normalizeOptionalInteger(
        payload.billingProtestDays,
        "os dias de protesto",
      ),
      billingNegativeDays: this.normalizeOptionalInteger(
        payload.billingNegativeDays,
        "os dias de negativação",
      ),
      notes: normalizeText(payload.notes),
    };
  }

  private async findCompany(sourceSystem: string, sourceTenantId: string) {
    return this.prisma.company.findUnique({
      where: {
        sourceSystem_sourceTenantId: {
          sourceSystem: this.normalizeRequiredText(
            sourceSystem,
            "o sistema de origem",
          ),
          sourceTenantId: this.normalizeRequiredText(
            sourceTenantId,
            "o tenant de origem",
          ),
        },
      },
    });
  }

  private async resolveOrCreateCompany(payload: SaveBankDto) {
    const normalizedSourceSystem = this.normalizeRequiredText(
      payload.sourceSystem,
      "o sistema de origem",
    );
    const normalizedSourceTenantId = this.normalizeRequiredText(
      payload.sourceTenantId,
      "o tenant de origem",
    );

    const existingCompany = await this.findCompany(
      normalizedSourceSystem,
      normalizedSourceTenantId,
    );

    if (existingCompany) {
      return existingCompany;
    }

    const normalizedCompanyName =
      normalizeText(payload.companyName) ||
      `EMPRESA ${normalizedSourceTenantId}`;

    return this.prisma.company.create({
      data: {
        sourceSystem: normalizedSourceSystem,
        sourceTenantId: normalizedSourceTenantId,
        name: normalizedCompanyName,
        document: normalizeDigits(payload.companyDocument),
        status: "ACTIVE",
        createdBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
    });
  }

  private mapBank(bank: any, includeSecrets = false) {
    const normalizedProvider = normalizeText(bank.billingProvider);
    const hasBillingApiCredentials =
      normalizedProvider === "SICOOB"
        ? Boolean(bank.billingApiClientId)
        : Boolean(bank.billingApiClientId && bank.billingApiClientSecret);

    return {
      id: bank.id,
      companyId: bank.companyId,
      companyName: bank.company?.name || null,
      sourceSystem: bank.company?.sourceSystem || null,
      sourceTenantId: bank.company?.sourceTenantId || null,
      status: bank.status,
      bankCode: bank.bankCode,
      bankName: bank.bankName,
      branchNumber: bank.branchNumber,
      branchDigit: bank.branchDigit || null,
      accountNumber: bank.accountNumber,
      accountDigit: bank.accountDigit || null,
      walletCode: bank.walletCode || null,
      agreementCode: bank.agreementCode || null,
      pixKey: bank.pixKey || null,
      beneficiaryName: bank.beneficiaryName || null,
      beneficiaryDocument: bank.beneficiaryDocument || null,
      billingProvider: bank.billingProvider || null,
      billingEnvironment: bank.billingEnvironment || null,
      billingBeneficiaryCode: bank.billingBeneficiaryCode || null,
      billingWalletVariation: bank.billingWalletVariation || null,
      billingContractNumber: bank.billingContractNumber || null,
      billingModalityCode: bank.billingModalityCode || null,
      billingDocumentSpeciesCode: bank.billingDocumentSpeciesCode || null,
      billingAcceptanceCode: bank.billingAcceptanceCode || null,
      billingIssueTypeCode: bank.billingIssueTypeCode || null,
      billingDistributionTypeCode: bank.billingDistributionTypeCode || null,
      billingNextBoletoNumber:
        typeof bank.billingNextBoletoNumber === "number"
          ? bank.billingNextBoletoNumber
          : null,
      billingRegisterPixCode:
        typeof bank.billingRegisterPixCode === "number"
          ? bank.billingRegisterPixCode
          : null,
      billingInstructionLine1: bank.billingInstructionLine1 || null,
      billingInstructionLine2: bank.billingInstructionLine2 || null,
      billingDefaultFinePercent:
        typeof bank.billingDefaultFinePercent === "number"
          ? bank.billingDefaultFinePercent
          : null,
      billingDefaultInterestPercent:
        typeof bank.billingDefaultInterestPercent === "number"
          ? bank.billingDefaultInterestPercent
          : null,
      billingDefaultDiscountPercent:
        typeof bank.billingDefaultDiscountPercent === "number"
          ? bank.billingDefaultDiscountPercent
          : null,
      billingProtestDays:
        typeof bank.billingProtestDays === "number"
          ? bank.billingProtestDays
          : null,
      billingNegativeDays:
        typeof bank.billingNegativeDays === "number"
          ? bank.billingNegativeDays
          : null,
      hasBillingApiCredentials,
      hasBillingCertificate: Boolean(
        bank.billingCertificateBase64 && bank.billingCertificatePassword,
      ),
      ...(includeSecrets
        ? {
            billingApiClientId: bank.billingApiClientId || null,
            billingApiClientSecret: bank.billingApiClientSecret || null,
            billingCertificateBase64: bank.billingCertificateBase64 || null,
            billingCertificatePassword:
              bank.billingCertificatePassword || null,
          }
        : {}),
      notes: bank.notes || null,
      createdAt: bank.createdAt.toISOString(),
      createdBy: bank.createdBy || null,
      updatedAt: bank.updatedAt.toISOString(),
      updatedBy: bank.updatedBy || null,
      canceledAt: bank.canceledAt?.toISOString() || null,
      canceledBy: bank.canceledBy || null,
    };
  }

  private async loadScopedBank(
    bankId: string,
    sourceSystem: string,
    sourceTenantId: string,
  ) {
    const company = await this.findCompany(sourceSystem, sourceTenantId);
    if (!company) {
      throw new NotFoundException("EMPRESA FINANCEIRA NÃO ENCONTRADA.");
    }

    const bank = await this.prisma.bankAccount.findFirst({
      where: {
        id: String(bankId || "").trim(),
        companyId: company.id,
      },
      include: {
        company: true,
      },
    });

    if (!bank) {
      throw new NotFoundException("BANCO NÃO ENCONTRADO.");
    }

    return {
      company,
      bank,
    };
  }

  private async ensureNoDuplicateBank(
    companyId: string,
    payload: NormalizedBankPayload,
    ignoredBankId?: string,
  ) {
    const duplicatedBank = await this.prisma.bankAccount.findFirst({
      where: {
        companyId,
        bankCode: payload.bankCode,
        branchNumber: payload.branchNumber,
        branchDigit: payload.branchDigit,
        accountNumber: payload.accountNumber,
        accountDigit: payload.accountDigit,
        ...(ignoredBankId
          ? {
              id: {
                not: ignoredBankId,
              },
            }
          : {}),
      },
    });

    if (!duplicatedBank) {
      return;
    }

    if (duplicatedBank.status === "INACTIVE") {
      throw new BadRequestException(
        "Já existe um cadastro inativo para este banco/agência/conta. Reative o registro existente.",
      );
    }

    throw new BadRequestException(
      "Já existe um cadastro para este banco/agência/conta.",
    );
  }

  async list(query: ListBanksDto) {
    const company = await this.findCompany(query.sourceSystem, query.sourceTenantId);
    if (!company) {
      return [];
    }

    const normalizedSearch = normalizeText(query.search);
    const normalizedStatus = normalizeText(query.status);
    const normalizedSearchDigits =
      normalizeDigits(normalizedSearch) || normalizedSearch;

    const banks = await this.prisma.bankAccount.findMany({
      where: {
        companyId: company.id,
        ...(normalizedStatus && normalizedStatus !== "ALL"
          ? { status: normalizedStatus }
          : {}),
        ...(normalizedSearch
          ? {
              OR: [
                { bankName: { contains: normalizedSearch } },
                { bankCode: { contains: normalizedSearchDigits || normalizedSearch } },
                { branchNumber: { contains: normalizedSearchDigits || normalizedSearch } },
                {
                  accountNumber: {
                    contains: normalizedSearchDigits || normalizedSearch,
                  },
                },
                { beneficiaryName: { contains: normalizedSearch } },
                {
                  beneficiaryDocument: {
                    contains: normalizedSearchDigits || normalizedSearch,
                  },
                },
                { pixKey: { contains: normalizedSearch } },
              ],
            }
          : {}),
      },
      include: {
        company: true,
      },
      orderBy: [{ bankName: "asc" }, { branchNumber: "asc" }, { accountNumber: "asc" }],
    });

    return banks.map((bank) => this.mapBank(bank));
  }

  async get(bankId: string, query: GetBankDto) {
    const { bank } = await this.loadScopedBank(
      bankId,
      query.sourceSystem,
      query.sourceTenantId,
    );

    return this.mapBank(bank, true);
  }

  async create(payload: SaveBankDto) {
    const company = await this.resolveOrCreateCompany(payload);
    const normalizedPayload = this.buildNormalizedPayload(payload);

    await this.ensureNoDuplicateBank(company.id, normalizedPayload);

    const bank = await this.prisma.bankAccount.create({
      data: {
        companyId: company.id,
        status: "ACTIVE",
        ...normalizedPayload,
        createdBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
      include: {
        company: true,
      },
    });

    return this.mapBank(bank, true);
  }

  async update(bankId: string, payload: SaveBankDto) {
    const { bank } = await this.loadScopedBank(
      bankId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const normalizedPayload = this.buildNormalizedPayload(payload);

    await this.ensureNoDuplicateBank(bank.companyId, normalizedPayload, bank.id);

    const updatedBank = await this.prisma.bankAccount.update({
      where: { id: bank.id },
      data: {
        ...normalizedPayload,
        updatedBy: payload.requestedBy || null,
      },
      include: {
        company: true,
      },
    });

    return this.mapBank(updatedBank, true);
  }

  async activate(bankId: string, payload: ChangeBankStatusDto) {
    const { bank } = await this.loadScopedBank(
      bankId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    const updatedBank = await this.prisma.bankAccount.update({
      where: { id: bank.id },
      data: {
        status: "ACTIVE",
        canceledAt: null,
        canceledBy: null,
        updatedBy: payload.requestedBy || null,
      },
      include: {
        company: true,
      },
    });

    return this.mapBank(updatedBank);
  }

  async inactivate(bankId: string, payload: ChangeBankStatusDto) {
    const { bank } = await this.loadScopedBank(
      bankId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    const updatedBank = await this.prisma.bankAccount.update({
      where: { id: bank.id },
      data: {
        status: "INACTIVE",
        canceledAt: new Date(),
        canceledBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
      include: {
        company: true,
      },
    });

    return this.mapBank(updatedBank);
  }
}
