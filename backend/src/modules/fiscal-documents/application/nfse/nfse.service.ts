import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { XMLParser } from "fast-xml-parser";
import { PrismaService } from "../../../../prisma/prisma.service";
import {
  getVisibleBranchCodes,
  normalizeBranchCode,
  SHARED_BRANCH_CODE,
} from "../../../../common/branch.constants";
import {
  normalizeDigits,
  normalizeEmail,
  normalizeText,
  parseJson,
  roundMoney,
  serializeJson,
} from "../../../../common/finance-core.utils";
import {
  assertValidBrazilTaxId,
  assertValidCnpj,
  normalizeTaxId,
} from "../../../../common/brazil-tax-id.utils";
import {
  decryptSecret,
  encryptSecret,
} from "../../../../common/secret-crypto.utils";
import {
  IssueNfseDto,
  NfseContextDto,
  SaveNfseProfileDto,
  SaveNfseServiceItemDto,
  SendNfseEmailDto,
  SyncNfseMunicipalParametersDto,
} from "../dto/nfse.dto";
import {
  assertNfceCertificateMatchesIssuer,
  loadNfceCertificateMaterial,
} from "../nfce/nfce-certificate.utils";
import {
  downloadNationalDanfse,
  issueNfseNational,
  NfseMunicipalParameterType,
  nfseResponseMessage,
  queryNfseMunicipalParameter,
  consultNfseByDps,
} from "./nfse-national.client";
import {
  buildNfseDpsId,
  buildNfseDpsXml,
  signNfseDpsXml,
} from "./nfse-xml.builder";
import {
  NfseEnvironment,
  NfseIssuer,
  NfseServiceDefinition,
  NfseTaker,
} from "./nfse.types";
import { NfseEmailService } from "./nfse-email.service";
import {
  ManualFiscalReceivablePlan,
  ManualFiscalReceivableService,
  normalizeManualFiscalReceivablePlan,
  serializeManualFiscalReceivablePlan,
} from "../manual-fiscal-receivable.service";
import {
  activePartyRoleWhere,
  PARTY_ROLE,
  setPartyRoleActive,
} from "../../../../common/party-registry";

function errorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "response" in error &&
    typeof (error as any).response?.message === "string"
  ) {
    return normalizeText((error as any).response.message) || "ERRO NA NFS-E";
  }
  return (
    normalizeText(error instanceof Error ? error.message : String(error)) ||
    "ERRO NÃO IDENTIFICADO NA NFS-E"
  );
}

function dateOnly(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseCompetence(value: string) {
  const normalized = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new BadRequestException("INFORME A COMPETÊNCIA NO FORMATO AAAA-MM-DD.");
  }
  const parsed = new Date(`${normalized}T12:00:00-03:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException("INFORME UMA COMPETÊNCIA VÁLIDA.");
  }
  return parsed;
}

function requiredText(value: string | null | undefined, label: string) {
  const normalized = normalizeText(value);
  if (!normalized) throw new BadRequestException(`INFORME ${label}.`);
  return normalized;
}

function requiredDigits(
  value: string | null | undefined,
  length: number,
  label: string,
) {
  const normalized = normalizeDigits(value);
  if (!normalized || normalized.length !== length) {
    throw new BadRequestException(`INFORME ${label} COM ${length} DÍGITOS.`);
  }
  return normalized;
}

function statusOk(httpStatus: number) {
  return httpStatus >= 200 && httpStatus < 300;
}

export function normalizeNfseServiceDescriptions(
  description: string | null | undefined,
  descriptions?: string[] | null,
) {
  const source = descriptions?.length ? descriptions : [description || ""];
  const unique = Array.from(
    new Set(
      source
        .map((item) => normalizeText(item))
        .filter((item): item is string => Boolean(item)),
    ),
  );
  if (!unique.length) {
    throw new BadRequestException(
      "CADASTRE AO MENOS UMA DESCRIÇÃO PARA O SERVIÇO.",
    );
  }
  if (unique.length > 30) {
    throw new BadRequestException(
      "UM SERVIÇO PODE TER NO MÁXIMO 30 DESCRIÇÕES.",
    );
  }
  if (unique.some((item) => item.length > 2000)) {
    throw new BadRequestException(
      "CADA DESCRIÇÃO DO SERVIÇO PODE TER NO MÁXIMO 2000 CARACTERES.",
    );
  }
  return unique;
}

@Injectable()
export class NfseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: NfseEmailService,
    private readonly manualReceivableService: ManualFiscalReceivableService,
  ) {}

  private branchCode(value?: number | null, fallback = 1) {
    return Math.max(1, normalizeBranchCode(value, fallback));
  }

  private assertAdmin(context: NfseContextDto) {
    if (normalizeText(context.userRole) !== "ADMIN") {
      throw new ForbiddenException(
        "A CONFIGURAÇÃO DA NFS-E EXIGE PERFIL ADMIN.",
      );
    }
  }

  private assertOperator(context: NfseContextDto) {
    const permissions = String(context.permissions || "")
      .split(",")
      .map((item) => normalizeText(item))
      .filter(Boolean);
    if (
      normalizeText(context.userRole) !== "ADMIN" &&
      !permissions.includes("MANAGE_FINANCIAL")
    ) {
      throw new ForbiddenException(
        "A EMISSÃO DA NFS-E EXIGE PERFIL ADMIN OU PERMISSÃO MANAGE_FINANCIAL.",
      );
    }
  }

  private async loadCompany(sourceSystem?: string, sourceTenantId?: string) {
    const normalizedSourceSystem = normalizeText(sourceSystem);
    const normalizedSourceTenantId = normalizeText(sourceTenantId);
    if (!normalizedSourceSystem || !normalizedSourceTenantId) {
      throw new BadRequestException("INFORME O SISTEMA DE ORIGEM E O TENANT.");
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
      throw new NotFoundException("FILIAL EMITENTE ATIVA NÃO ENCONTRADA.");
    }
    return branch;
  }

  private async loadProfile(
    companyId: string,
    branchCode: number,
    environment?: string | null,
  ) {
    return this.prisma.nfseProfile.findFirst({
      where: {
        companyId,
        branchCode,
        status: "ACTIVE",
        canceledAt: null,
        ...(environment ? { environment } : {}),
      },
      include: {
        certificate: true,
        defaultServiceItem: true,
      },
      orderBy: [{ environment: "asc" }, { series: "asc" }],
    });
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
    metadata?: unknown;
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
      metadataJson: serializeJson(params.metadata),
      occurredAt: new Date(),
      performedBy: params.performedBy || null,
      createdBy: params.performedBy || null,
    };
  }

  private mapProfile(profile: any) {
    if (!profile) return null;
    return {
      id: profile.id,
      companyId: profile.companyId,
      branchCode: profile.branchCode,
      certificateId: profile.certificateId,
      defaultServiceItemId: profile.defaultServiceItemId || null,
      status: profile.status,
      environment: profile.environment,
      autoIssueOnSale: Boolean(profile.autoIssueOnSale),
      series: profile.series,
      nextNumber: profile.nextNumber,
      softwareVersion: profile.softwareVersion,
      schemaVersion: profile.schemaVersion,
      simpleNationalOption: profile.simpleNationalOption,
      simpleNationalTaxRegime: profile.simpleNationalTaxRegime,
      specialTaxRegime: profile.specialTaxRegime,
      sendEmailToRecipient: Boolean(profile.sendEmailToRecipient),
      smtpHost: profile.smtpHost || null,
      smtpPort: profile.smtpPort || null,
      smtpSecure: Boolean(profile.smtpSecure),
      smtpAuthenticate: Boolean(profile.smtpAuthenticate),
      smtpUsername: profile.smtpUsername || null,
      smtpFromEmail: profile.smtpFromEmail || null,
      smtpFromName: profile.smtpFromName || null,
      smtpTimeoutSeconds: profile.smtpTimeoutSeconds,
      homologationEmailRecipient:
        profile.homologationEmailRecipient || null,
      hasSmtpPassword: Boolean(profile.smtpPasswordEncrypted),
      lastMunicipalCheckAt:
        profile.lastMunicipalCheckAt?.toISOString?.() || null,
      lastMunicipalCheckStatus: profile.lastMunicipalCheckStatus || null,
      lastMunicipalCheckMessage: profile.lastMunicipalCheckMessage || null,
    };
  }

  private mapServiceItem(item: any) {
    const registeredDescriptions = Array.isArray(item.descriptions)
      ? item.descriptions
          .filter(
            (description: any) =>
              description.status === "ACTIVE" && !description.canceledAt,
          )
          .sort(
            (left: any, right: any) =>
              Number(left.sortOrder) - Number(right.sortOrder),
          )
          .map((description: any) => ({
            id: description.id,
            text: description.text,
            sortOrder: description.sortOrder,
          }))
      : [];
    const descriptions = registeredDescriptions.length
      ? registeredDescriptions
      : [{ id: null, text: item.description, sortOrder: 0 }];
    return {
      id: item.id,
      branchCode: item.branchCode,
      availableToAllBranches:
        Number(item.branchCode) === SHARED_BRANCH_CODE,
      internalCode: item.internalCode,
      name: item.name,
      description: descriptions[0]?.text || item.description,
      descriptions,
      cnaeCode: item.cnaeCode || null,
      nationalTaxCode: item.nationalTaxCode,
      municipalTaxCode: item.municipalTaxCode || null,
      nbsCode: item.nbsCode || null,
      serviceCityCode: item.serviceCityCode,
      issTaxationCode: item.issTaxationCode,
      issWithholdingCode: item.issWithholdingCode,
      issRate: item.issRate,
      pisCofinsCst: item.pisCofinsCst,
      pisRate: item.pisRate,
      cofinsRate: item.cofinsRate,
      simpleNationalTotalTaxRate: item.simpleNationalTotalTaxRate,
      ibsCbsEnabled: Boolean(item.ibsCbsEnabled),
      ibsCbsCst: item.ibsCbsCst || null,
      ibsCbsClassCode: item.ibsCbsClassCode || null,
      isDefault: Boolean(item.isDefault),
      status: item.status,
      updatedAt: item.updatedAt?.toISOString?.() || null,
    };
  }

  private mapDocument(document: any) {
    if (!document) return null;
    const taker = parseJson<any>(document.takerSnapshotJson, {});
    const service = parseJson<any>(document.serviceSnapshotJson, {});
    return {
      id: document.id,
      companyId: document.companyId,
      branchCode: document.branchCode,
      profileId: document.profileId,
      serviceItemId: document.serviceItemId || null,
      takerPartyId: document.takerPartyId,
      receivableTitleId: document.receivableTitleId || null,
      saleId: document.saleId || null,
      sourceEntityType: document.sourceEntityType,
      sourceEntityId: document.sourceEntityId,
      environment: document.environment,
      series: document.series,
      number: document.number,
      dpsId: document.dpsId,
      accessKey: document.accessKey || null,
      nationalNfseNumber: document.nationalNfseNumber || null,
      status: document.status,
      statusCode: document.statusCode || null,
      statusMessage: document.statusMessage || null,
      competence: dateOnly(document.competenceDate),
      issuedAt: document.issuedAt?.toISOString?.() || null,
      serviceCityCode: document.serviceCityCode,
      grossAmount: document.grossAmount,
      discountAmount: document.discountAmount,
      deductionAmount: document.deductionAmount,
      netAmount: document.netAmount,
      takerName: taker?.name || null,
      takerDocument: taker?.document || null,
      serviceName: service?.name || null,
      serviceDescription: service?.description || null,
      attemptCount: document.attemptCount,
      lastAttemptAt: document.lastAttemptAt?.toISOString?.() || null,
      lastError: document.lastError || null,
      hasXml: Boolean(document.authorizedXml),
      hasDanfse: Boolean(document.danfsePdfBlob),
      danfseDownloadUrl: document.danfsePdfBlob
        ? `/fiscal-documents/nfse/documents/${document.id}/danfse`
        : null,
      xmlDownloadUrl: document.authorizedXml
        ? `/fiscal-documents/nfse/documents/${document.id}/xml`
        : null,
      emailSentAt: document.emailSentAt?.toISOString?.() || null,
      emailError: document.emailError || null,
    };
  }

  private issuerFrom(branch: any, profile: any): NfseIssuer {
    const document = assertValidCnpj(
      branch.fiscalDocument,
      "O CNPJ DA FILIAL EMITENTE",
    );
    if (!/^\d{14}$/.test(document)) {
      throw new BadRequestException(
        "O LEIAUTE NFS-E NACIONAL 1.01 AINDA EXIGE CNPJ NUMÉRICO COM 14 DÍGITOS.",
      );
    }
    return {
      document,
      municipalRegistration: normalizeText(branch.municipalRegistration),
      legalName: requiredText(branch.fiscalLegalName, "A RAZÃO SOCIAL DA FILIAL"),
      address: {
        cityCode: requiredDigits(
          branch.fiscalCityCode,
          7,
          "O CÓDIGO IBGE DA FILIAL",
        ),
        postalCode: requiredDigits(branch.fiscalPostalCode, 8, "O CEP DA FILIAL"),
        street: requiredText(branch.fiscalStreet, "O LOGRADOURO DA FILIAL"),
        number: requiredText(branch.fiscalNumber, "O NÚMERO DA FILIAL"),
        complement: normalizeText(branch.fiscalComplement),
        neighborhood: requiredText(
          branch.fiscalNeighborhood,
          "O BAIRRO DA FILIAL",
        ),
      },
      phone: normalizeDigits(branch.fiscalPhone),
      email: normalizeEmail(branch.fiscalEmail),
      simpleNationalOption: profile.simpleNationalOption,
      simpleNationalTaxRegime: profile.simpleNationalTaxRegime,
      specialTaxRegime: profile.specialTaxRegime,
    } as NfseIssuer;
  }

  private takerFrom(party: any): NfseTaker {
    const document = assertValidBrazilTaxId(
      party.document,
      "O CPF/CNPJ DO PAGADOR",
    );
    if (document.length === 14 && !/^\d{14}$/.test(document)) {
      throw new BadRequestException(
        "O LEIAUTE NFS-E NACIONAL 1.01 AINDA EXIGE CNPJ NUMÉRICO PARA O TOMADOR.",
      );
    }
    const addressLine = String(party.addressLine1 || "").trim();
    const addressMatch = /^(.*?)[,\s]+(\d+[A-Z0-9/-]*)$/.exec(addressLine);
    return {
      document,
      municipalRegistration: normalizeText(party.municipalRegistration),
      name: requiredText(party.name, "O NOME DO PAGADOR"),
      address: {
        cityCode: requiredDigits(
          party.cityCode,
          7,
          "O CÓDIGO IBGE DO PAGADOR",
        ),
        postalCode: requiredDigits(party.postalCode, 8, "O CEP DO PAGADOR"),
        street: requiredText(
          party.street || addressMatch?.[1],
          "O LOGRADOURO DO PAGADOR",
        ),
        number: requiredText(
          party.addressNumber || addressMatch?.[2],
          "O NÚMERO DO PAGADOR",
        ),
        complement: normalizeText(party.addressComplement),
        neighborhood: requiredText(party.neighborhood, "O BAIRRO DO PAGADOR"),
      },
      phone: normalizeDigits(party.phone),
      email: normalizeEmail(party.email),
    };
  }

  private serviceFrom(item: any, description?: string | null): NfseServiceDefinition {
    const internalCode = requiredText(item.internalCode, "O CÓDIGO INTERNO DO SERVIÇO");
    if (!/^[A-Z0-9]{1,20}$/.test(internalCode)) {
      throw new BadRequestException(
        "O CÓDIGO INTERNO DO SERVIÇO DEVE TER ATÉ 20 LETRAS OU NÚMEROS.",
      );
    }
    return {
      internalCode,
      nationalTaxCode: requiredDigits(
        item.nationalTaxCode,
        6,
        "O CÓDIGO DE TRIBUTAÇÃO NACIONAL",
      ),
      municipalTaxCode: item.municipalTaxCode
        ? requiredDigits(
            item.municipalTaxCode,
            3,
            "O CÓDIGO DE TRIBUTAÇÃO MUNICIPAL",
          )
        : null,
      description: requiredText(
        description || item.description,
        "A DESCRIÇÃO DO SERVIÇO",
      ),
      nbsCode: item.nbsCode
        ? requiredDigits(item.nbsCode, 9, "O CÓDIGO NBS")
        : null,
      serviceCityCode: requiredDigits(
        item.serviceCityCode,
        7,
        "O MUNICÍPIO DA PRESTAÇÃO",
      ),
      issTaxationCode: item.issTaxationCode,
      issWithholdingCode: item.issWithholdingCode,
      issRate: item.issRate,
      pisCofinsCst: item.pisCofinsCst,
      pisRate: item.pisRate,
      cofinsRate: item.cofinsRate,
      simpleNationalTotalTaxRate: item.simpleNationalTotalTaxRate,
      ibsCbsEnabled: Boolean(item.ibsCbsEnabled),
    } as NfseServiceDefinition;
  }

  private certificateMaterial(profile: any, issuerDocument: string) {
    const certificate = profile?.certificate;
    if (!certificate || certificate.status !== "ACTIVE" || certificate.canceledAt) {
      throw new BadRequestException(
        "O CERTIFICADO A1 DO PERFIL NFS-E NÃO ESTÁ ATIVO.",
      );
    }
    if (certificate.validTo && certificate.validTo.getTime() <= Date.now()) {
      throw new BadRequestException("O CERTIFICADO A1 DO PERFIL NFS-E ESTÁ VENCIDO.");
    }
    const material = loadNfceCertificateMaterial(
      decryptSecret(certificate.pfxEncryptedBase64),
      decryptSecret(certificate.passwordEncrypted),
    );
    assertNfceCertificateMatchesIssuer(material, issuerDocument);
    return material;
  }

  async getOverview(query: NfseContextDto) {
    this.assertAdmin(query);
    const company = await this.loadCompany(query.sourceSystem, query.sourceTenantId);
    const branchCode = this.branchCode(query.sourceBranchCode);
    const branch = await this.loadBranch(company.id, branchCode);
    const environment = (normalizeText(query.environment) ||
      "HOMOLOGATION") as NfseEnvironment;
    const [profile, services, certificates, documents, parties, lastNfe, parameters] =
      await Promise.all([
        this.loadProfile(company.id, branchCode, environment),
        this.prisma.nfseServiceItem.findMany({
          where: {
            companyId: company.id,
            branchCode: { in: getVisibleBranchCodes(branchCode) },
            status: "ACTIVE",
            canceledAt: null,
          },
          include: {
            descriptions: {
              where: { status: "ACTIVE", canceledAt: null },
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            },
          },
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        }),
        this.prisma.fiscalCertificate.findMany({
          where: {
            companyId: company.id,
            branchCode,
            status: "ACTIVE",
            canceledAt: null,
          },
          orderBy: [{ isDefault: "desc" }, { validTo: "desc" }],
        }),
        this.prisma.nfseDocument.findMany({
          where: { companyId: company.id, branchCode, canceledAt: null },
          orderBy: { issuedAt: "desc" },
          take: 30,
        }),
        this.prisma.party.findMany({
          where: {
            companyId: company.id,
            canceledAt: null,
            document: { not: null },
            ...activePartyRoleWhere(branchCode, [
              PARTY_ROLE.CUSTOMER,
              PARTY_ROLE.PAYER,
              PARTY_ROLE.TAKER,
              PARTY_ROLE.RECIPIENT,
            ]),
          },
          orderBy: { updatedAt: "desc" },
          take: 100,
        }),
        this.prisma.fiscalDocument.findFirst({
          where: {
            companyId: company.id,
            branchCode,
            model: "55",
            status: "AUTHORIZED",
            recipientPartyId: { not: null },
            canceledAt: null,
          },
          orderBy: { issuedAt: "desc" },
        }),
        this.prisma.nfseMunicipalParameter.findMany({
          where: {
            companyId: company.id,
            branchCode,
            environment,
            canceledAt: null,
          },
          orderBy: { fetchedAt: "desc" },
          take: 20,
        }),
      ]);

    const issuerDocument = normalizeTaxId(branch.fiscalDocument);
    const certificateReady = Boolean(
      profile?.certificate &&
        profile.certificate.status === "ACTIVE" &&
        !profile.certificate.canceledAt &&
        (!profile.certificate.validTo || profile.certificate.validTo > new Date()) &&
        normalizeTaxId(profile.certificate.holderDocument) === issuerDocument,
    );
    const convention = parameters.find(
      (item) => item.parameterType === "CONVENTION" && item.status === "SUCCESS",
    );
    const conventionBody = parseJson<any>(convention?.responseJson, {});
    const municipalityEnabled = Boolean(
      convention &&
        Number(conventionBody?.aderenteAmbienteNacional) === 1 &&
        Number(conventionBody?.aderenteEmissorNacional) === 1,
    );
    const checks = [
      {
        code: "ISSUER",
        ok: Boolean(
          issuerDocument && /^\d{14}$/.test(issuerDocument) && branch.fiscalCityCode,
        ),
        label: "IDENTIDADE FISCAL DA FILIAL",
        message: "CNPJ NUMÉRICO E MUNICÍPIO IBGE DEVEM ESTAR PREENCHIDOS.",
      },
      {
        code: "MUNICIPAL_REGISTRATION",
        ok: Boolean(normalizeText(branch.municipalRegistration)),
        label: "INSCRIÇÃO MUNICIPAL",
        message: "A INSCRIÇÃO MUNICIPAL DO PRESTADOR AINDA NÃO FOI INFORMADA.",
      },
      {
        code: "PROFILE",
        ok: Boolean(profile),
        label: "PERFIL NFS-E",
        message: "CONFIGURE O PERFIL NFS-E DA FILIAL.",
      },
      {
        code: "CERTIFICATE",
        ok: certificateReady,
        label: "CERTIFICADO A1",
        message: "VINCULE CERTIFICADO A1 ATIVO DO MESMO CNPJ.",
      },
      {
        code: "SERVICE",
        ok: services.length > 0,
        label: "SERVIÇO FISCAL",
        message: "CADASTRE AO MENOS UM SERVIÇO COM TRIBUTAÇÃO NACIONAL.",
      },
      {
        code: "MUNICIPALITY",
        ok: municipalityEnabled,
        label: "MUNICÍPIO NO EMISSOR NACIONAL",
        message:
          profile?.lastMunicipalCheckMessage ||
          "CONSULTE A ADESÃO DO MUNICÍPIO NO AMBIENTE SELECIONADO.",
      },
    ];
    return {
      company: {
        id: company.id,
        name: company.name,
        sourceSystem: company.sourceSystem,
        sourceTenantId: company.sourceTenantId,
      },
      branch: {
        id: branch.id,
        branchCode: branch.branchCode,
        name: branch.name,
        fiscalLegalName: branch.fiscalLegalName,
        fiscalTradeName: branch.fiscalTradeName,
        fiscalDocument: branch.fiscalDocument,
        municipalRegistration: branch.municipalRegistration,
        fiscalCity: branch.fiscalCity,
        fiscalCityCode: branch.fiscalCityCode,
        fiscalState: branch.fiscalState,
        fiscalPostalCode: branch.fiscalPostalCode,
        fiscalEmail: branch.fiscalEmail,
      },
      profile: this.mapProfile(profile),
      services: services.map((item) => this.mapServiceItem(item)),
      certificates: certificates.map((item) => ({
        id: item.id,
        aliasName: item.aliasName,
        holderName: item.holderName,
        holderDocument: item.holderDocument,
        validTo: item.validTo?.toISOString?.() || null,
        purpose: item.purpose,
      })),
      parties: parties.map((party) => ({
        id: party.id,
        name: party.name,
        document: party.document,
        email: party.email,
        city: party.city,
        cityCode: party.cityCode,
        recommended: party.id === lastNfe?.recipientPartyId,
      })),
      lastAuthorizedNfeRecipientPartyId: lastNfe?.recipientPartyId || null,
      documents: documents.map((item) => this.mapDocument(item)),
      municipalParameters: parameters.map((item) => ({
        id: item.id,
        type: item.parameterType,
        status: item.status,
        httpStatus: item.httpStatus,
        message: item.errorMessage || null,
        fetchedAt: item.fetchedAt.toISOString(),
      })),
      readiness: {
        ready: checks.every((item) => item.ok),
        municipalityEnabled,
        checks,
        officialLayoutVersion: "1.01",
      },
    };
  }

  async getManualOverview(query: NfseContextDto) {
    this.assertOperator(query);
    const company = await this.loadCompany(
      query.sourceSystem,
      query.sourceTenantId,
    );
    const branchCode = this.branchCode(query.sourceBranchCode);
    const branch = await this.loadBranch(company.id, branchCode);
    const environment = (normalizeText(query.environment) ||
      "HOMOLOGATION") as NfseEnvironment;
    const [profile, services, parties, documents, convention] =
      await Promise.all([
        this.loadProfile(company.id, branchCode, environment),
        this.prisma.nfseServiceItem.findMany({
          where: {
            companyId: company.id,
            branchCode: { in: getVisibleBranchCodes(branchCode) },
            status: "ACTIVE",
            canceledAt: null,
          },
          include: {
            descriptions: {
              where: { status: "ACTIVE", canceledAt: null },
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            },
          },
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        }),
        this.prisma.party.findMany({
          where: {
            companyId: company.id,
            canceledAt: null,
            document: { not: null },
            ...activePartyRoleWhere(branchCode, [
              PARTY_ROLE.CUSTOMER,
              PARTY_ROLE.PAYER,
              PARTY_ROLE.TAKER,
              PARTY_ROLE.RECIPIENT,
            ]),
          },
          orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
          take: 200,
        }),
        this.prisma.nfseDocument.findMany({
          where: {
            companyId: company.id,
            branchCode,
            sourceEntityType: "MANUAL_NFSE",
            canceledAt: null,
          },
          orderBy: { issuedAt: "desc" },
          take: 30,
        }),
        this.prisma.nfseMunicipalParameter.findFirst({
          where: {
            companyId: company.id,
            branchCode,
            environment,
            municipalityCode: branch.fiscalCityCode || "",
            parameterType: "CONVENTION",
            status: "SUCCESS",
            canceledAt: null,
          },
          orderBy: { fetchedAt: "desc" },
        }),
      ]);
    const conventionBody = parseJson<any>(convention?.responseJson, {});
    const municipalityEnabled = Boolean(
      convention &&
        Number(conventionBody?.aderenteAmbienteNacional) === 1 &&
        Number(conventionBody?.aderenteEmissorNacional) === 1,
    );
    const issuerDocument = normalizeTaxId(branch.fiscalDocument);
    const certificateReady = Boolean(
      profile?.certificate &&
        profile.certificate.status === "ACTIVE" &&
        !profile.certificate.canceledAt &&
        (!profile.certificate.validTo ||
          profile.certificate.validTo.getTime() > Date.now()) &&
        normalizeTaxId(profile.certificate.holderDocument) === issuerDocument,
    );
    const readinessChecks = [
      {
        code: "PROFILE",
        ok: Boolean(profile),
        label: "PERFIL NFS-E",
        message: "CONFIGURE UM PERFIL NFS-E ATIVO PARA O AMBIENTE.",
      },
      {
        code: "CERTIFICATE",
        ok: certificateReady,
        label: "CERTIFICADO A1",
        message: "VINCULE UM CERTIFICADO A1 ATIVO DO MESMO CNPJ.",
      },
      {
        code: "SERVICE",
        ok: services.length > 0,
        label: "SERVIÇO FISCAL",
        message: "CADASTRE AO MENOS UM SERVIÇO FISCAL ATIVO.",
      },
      {
        code: "PAYER",
        ok: parties.length > 0,
        label: "PAGADOR / TOMADOR",
        message: "SINCRONIZE AO MENOS UM PAGADOR COM CPF/CNPJ.",
      },
      {
        code: "MUNICIPALITY",
        ok: municipalityEnabled,
        label: "MUNICÍPIO CONVENIADO",
        message:
          profile?.lastMunicipalCheckMessage ||
          "CONSULTE A ADESÃO DO MUNICÍPIO AO EMISSOR NACIONAL.",
      },
    ];
    return {
      company: { id: company.id, name: company.name },
      branch: {
        id: branch.id,
        branchCode: branch.branchCode,
        name: branch.name,
        fiscalLegalName: branch.fiscalLegalName,
        fiscalDocument: branch.fiscalDocument,
        municipalRegistration: branch.municipalRegistration,
        fiscalCity: branch.fiscalCity,
        fiscalCityCode: branch.fiscalCityCode,
      },
      profile: this.mapProfile(profile),
      services: services.map((service) => this.mapServiceItem(service)),
      parties: parties.map((party) => ({
        id: party.id,
        name: party.name,
        document: party.document,
        email: party.email,
        city: party.city,
        state: party.state,
      })),
      documents: documents.map((document) => this.mapDocument(document)),
      readiness: {
        ready: readinessChecks.every((check) => check.ok),
        municipalityEnabled,
        checks: readinessChecks,
      },
    };
  }

  async saveProfile(payload: SaveNfseProfileDto) {
    this.assertAdmin(payload);
    const company = await this.loadCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const branchCode = this.branchCode(payload.sourceBranchCode);
    const branch = await this.loadBranch(company.id, branchCode);
    const environment = (normalizeText(payload.environment) ||
      "HOMOLOGATION") as NfseEnvironment;
    const certificate = await this.prisma.fiscalCertificate.findFirst({
      where: {
        id: payload.certificateId,
        companyId: company.id,
        branchCode,
        status: "ACTIVE",
        canceledAt: null,
      },
    });
    if (!certificate) {
      throw new BadRequestException(
        "CERTIFICADO A1 ATIVO NÃO ENCONTRADO NESTA EMPRESA E FILIAL.",
      );
    }
    if (
      normalizeTaxId(certificate.holderDocument) !==
      normalizeTaxId(branch.fiscalDocument)
    ) {
      throw new BadRequestException(
        "O CNPJ DO CERTIFICADO NÃO CORRESPONDE À FILIAL EMITENTE.",
      );
    }
    if (payload.defaultServiceItemId) {
      const service = await this.prisma.nfseServiceItem.findFirst({
        where: {
          id: payload.defaultServiceItemId,
          companyId: company.id,
          branchCode: { in: getVisibleBranchCodes(branchCode) },
          status: "ACTIVE",
          canceledAt: null,
        },
      });
      if (!service) {
        throw new BadRequestException(
          "SERVIÇO PADRÃO NÃO ENCONTRADO NESTA EMPRESA E FILIAL.",
        );
      }
    }
    const existing = await this.prisma.nfseProfile.findFirst({
      where: {
        companyId: company.id,
        branchCode,
        environment,
        status: "ACTIVE",
        canceledAt: null,
      },
      orderBy: { createdAt: "asc" },
    });
    const nfeProfile = await this.prisma.nfeProfile.findFirst({
      where: {
        companyId: company.id,
        branchCode,
        environment,
        status: "ACTIVE",
        canceledAt: null,
      },
      orderBy: { createdAt: "asc" },
    });
    const smtpPasswordEncrypted = payload.smtpPassword
      ? encryptSecret(payload.smtpPassword)
      : existing?.smtpPasswordEncrypted ||
        nfeProfile?.smtpPasswordEncrypted ||
        null;
    const data = {
      certificateId: certificate.id,
      defaultServiceItemId: payload.defaultServiceItemId || null,
      status: "ACTIVE",
      environment,
      autoIssueOnSale: Boolean(payload.autoIssueOnSale),
      series: payload.series,
      nextNumber: payload.nextNumber,
      softwareVersion:
        requiredText(payload.softwareVersion || "MSINFOR FIN 1.0", "A VERSÃO DO APLICATIVO").slice(0, 20),
      schemaVersion: "1.01",
      simpleNationalOption: payload.simpleNationalOption,
      simpleNationalTaxRegime:
        payload.simpleNationalOption === 3
          ? payload.simpleNationalTaxRegime || 1
          : null,
      specialTaxRegime: payload.specialTaxRegime,
      sendEmailToRecipient: Boolean(payload.sendEmailToRecipient),
      smtpHost:
        String(payload.smtpHost || existing?.smtpHost || nfeProfile?.smtpHost || "")
          .trim()
          .toLowerCase() || null,
      smtpPort:
        payload.smtpPort || existing?.smtpPort || nfeProfile?.smtpPort || null,
      smtpSecure:
        payload.smtpSecure ?? existing?.smtpSecure ?? nfeProfile?.smtpSecure ?? true,
      smtpAuthenticate:
        payload.smtpAuthenticate ??
        existing?.smtpAuthenticate ??
        nfeProfile?.smtpAuthenticate ??
        true,
      smtpUsername:
        String(
          payload.smtpUsername ||
            existing?.smtpUsername ||
            nfeProfile?.smtpUsername ||
            "",
        ).trim() || null,
      smtpPasswordEncrypted,
      smtpFromEmail: normalizeEmail(
        payload.smtpFromEmail ||
          existing?.smtpFromEmail ||
          nfeProfile?.smtpFromEmail,
      ),
      smtpFromName: normalizeText(
        payload.smtpFromName ||
          existing?.smtpFromName ||
          nfeProfile?.smtpFromName,
      ),
      smtpTimeoutSeconds:
        payload.smtpTimeoutSeconds ||
        existing?.smtpTimeoutSeconds ||
        nfeProfile?.smtpTimeoutSeconds ||
        60,
      homologationEmailRecipient: normalizeEmail(
        payload.homologationEmailRecipient ||
          existing?.homologationEmailRecipient ||
          nfeProfile?.homologationEmailRecipient,
      ),
      updatedBy: payload.requestedBy || null,
    };
    if (
      data.sendEmailToRecipient &&
      (!data.smtpHost ||
        !data.smtpPort ||
        !data.smtpFromEmail ||
        !data.smtpPasswordEncrypted ||
        (environment === "HOMOLOGATION" &&
          !data.homologationEmailRecipient))
    ) {
      throw new BadRequestException(
        "CONFIGURE SMTP E O DESTINATÁRIO FIXO DE HOMOLOGAÇÃO PARA ENVIAR A NFS-E.",
      );
    }
    const saved = await this.prisma.$transaction(async (tx: any) => {
      const profile = existing
        ? await tx.nfseProfile.update({
            where: { id: existing.id },
            data,
          })
        : await tx.nfseProfile.create({
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
          entityType: "NFSE_PROFILE",
          entityId: profile.id,
          action: existing ? "UPDATE" : "CREATE",
          summary: "PERFIL NFS-E NACIONAL SALVO",
          before: existing ? this.mapProfile(existing) : null,
          after: this.mapProfile(profile),
          performedBy: payload.requestedBy,
        }),
      });
      return profile;
    });
    return this.mapProfile(saved);
  }

  async saveServiceItem(payload: SaveNfseServiceItemDto) {
    this.assertAdmin(payload);
    const company = await this.loadCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const branchCode = this.branchCode(payload.sourceBranchCode);
    await this.loadBranch(company.id, branchCode);
    const visibleBranchCodes = getVisibleBranchCodes(branchCode);
    const internalCode = requiredText(payload.internalCode, "O CÓDIGO INTERNO");
    if (!/^[A-Z0-9]{1,20}$/.test(internalCode)) {
      throw new BadRequestException(
        "O CÓDIGO INTERNO DEVE POSSUIR SOMENTE LETRAS E NÚMEROS.",
      );
    }
    const existing = payload.id
      ? await this.prisma.nfseServiceItem.findFirst({
          where: {
            id: payload.id,
            companyId: company.id,
            branchCode: { in: visibleBranchCodes },
            canceledAt: null,
          },
          include: {
            descriptions: {
              orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            },
          },
        })
      : null;
    if (payload.id && !existing) {
      throw new NotFoundException(
        "SERVIÇO NFS-E NÃO ENCONTRADO NESTA FILIAL OU ENTRE OS COMPARTILHADOS.",
      );
    }
    const targetBranchCode =
      payload.availableToAllBranches === undefined && existing
        ? existing.branchCode
        : payload.availableToAllBranches
          ? SHARED_BRANCH_CODE
          : branchCode;
    const serviceDescriptions = normalizeNfseServiceDescriptions(
      payload.description,
      payload.descriptions,
    );
    const data = {
      branchCode: targetBranchCode,
      status: "ACTIVE",
      internalCode,
      name: requiredText(payload.name, "O NOME DO SERVIÇO"),
      description: serviceDescriptions[0],
      cnaeCode: payload.cnaeCode
        ? requiredDigits(payload.cnaeCode, 7, "O CNAE")
        : null,
      nationalTaxCode: requiredDigits(
        payload.nationalTaxCode,
        6,
        "O CÓDIGO DE TRIBUTAÇÃO NACIONAL",
      ),
      municipalTaxCode: payload.municipalTaxCode
        ? requiredDigits(
            payload.municipalTaxCode,
            3,
            "O CÓDIGO DE TRIBUTAÇÃO MUNICIPAL",
          )
        : null,
      nbsCode: payload.nbsCode
        ? requiredDigits(payload.nbsCode, 9, "O NBS")
        : null,
      serviceCityCode: requiredDigits(
        payload.serviceCityCode,
        7,
        "O MUNICÍPIO DA PRESTAÇÃO",
      ),
      issTaxationCode: payload.issTaxationCode,
      issWithholdingCode: payload.issWithholdingCode,
      issRate: payload.issRate ?? null,
      pisCofinsCst: normalizeDigits(payload.pisCofinsCst) || "00",
      pisRate: payload.pisRate ?? null,
      cofinsRate: payload.cofinsRate ?? null,
      simpleNationalTotalTaxRate:
        payload.simpleNationalTotalTaxRate ?? null,
      ibsCbsEnabled: Boolean(payload.ibsCbsEnabled),
      ibsCbsCst: normalizeText(payload.ibsCbsCst),
      ibsCbsClassCode: normalizeText(payload.ibsCbsClassCode),
      isDefault: Boolean(payload.isDefault),
      updatedBy: payload.requestedBy || null,
    };
    const conflicting = await this.prisma.nfseServiceItem.findFirst({
      where: {
        companyId: company.id,
        internalCode,
        canceledAt: null,
        ...(existing ? { id: { not: existing.id } } : {}),
        ...(targetBranchCode === SHARED_BRANCH_CODE
          ? {}
          : {
              branchCode: {
                in: [SHARED_BRANCH_CODE, targetBranchCode],
              },
            }),
      },
    });
    if (conflicting) {
      throw new BadRequestException(
        "JÁ EXISTE UM SERVIÇO NFS-E COM ESTE CÓDIGO NO ESCOPO SELECIONADO.",
      );
    }
    if (
      existing &&
      existing.branchCode === SHARED_BRANCH_CODE &&
      targetBranchCode !== SHARED_BRANCH_CODE
    ) {
      const usedByAnotherBranch = await this.prisma.nfseProfile.findFirst({
        where: {
          companyId: company.id,
          branchCode: { not: branchCode },
          defaultServiceItemId: existing.id,
          status: "ACTIVE",
          canceledAt: null,
        },
      });
      if (usedByAnotherBranch) {
        throw new BadRequestException(
          "ESTE SERVIÇO É PADRÃO EM OUTRA FILIAL E NÃO PODE DEIXAR DE SER COMPARTILHADO.",
        );
      }
    }
    const saved = await this.prisma.$transaction(async (tx: any) => {
      if (data.isDefault) {
        await tx.nfseServiceItem.updateMany({
          where: {
            companyId: company.id,
            branchCode: { in: visibleBranchCodes },
            status: "ACTIVE",
            canceledAt: null,
          },
          data: { isDefault: false, updatedBy: payload.requestedBy || null },
        });
      }
      const item = existing
        ? await tx.nfseServiceItem.update({
            where: { id: existing.id },
            data,
          })
        : await tx.nfseServiceItem.create({
            data: {
              companyId: company.id,
              ...data,
              createdBy: payload.requestedBy || null,
            },
          });
      const previousDescriptions = Array.isArray(existing?.descriptions)
        ? existing.descriptions
        : [];
      const retainedDescriptionIds: string[] = [];
      for (const [sortOrder, text] of serviceDescriptions.entries()) {
        const previous = previousDescriptions.find(
          (description: any) => description.text === text,
        );
        if (previous) {
          retainedDescriptionIds.push(previous.id);
          await tx.nfseServiceDescription.update({
            where: { id: previous.id },
            data: {
              branchCode: targetBranchCode,
              status: "ACTIVE",
              sortOrder,
              canceledAt: null,
              canceledBy: null,
              updatedBy: payload.requestedBy || null,
            },
          });
        } else {
          const created = await tx.nfseServiceDescription.create({
            data: {
              companyId: company.id,
              branchCode: targetBranchCode,
              serviceItemId: item.id,
              status: "ACTIVE",
              text,
              sortOrder,
              createdBy: payload.requestedBy || null,
              updatedBy: payload.requestedBy || null,
            },
          });
          retainedDescriptionIds.push(created.id);
        }
      }
      await tx.nfseServiceDescription.updateMany({
        where: {
          companyId: company.id,
          serviceItemId: item.id,
          canceledAt: null,
          id: { notIn: retainedDescriptionIds },
        },
        data: {
          status: "CANCELED",
          canceledAt: new Date(),
          canceledBy: payload.requestedBy || null,
          updatedBy: payload.requestedBy || null,
        },
      });
      if (item.isDefault) {
        await tx.nfseProfile.updateMany({
          where: {
            companyId: company.id,
            branchCode,
            status: "ACTIVE",
            canceledAt: null,
          },
          data: {
            defaultServiceItemId: item.id,
            updatedBy: payload.requestedBy || null,
          },
        });
      }
      const populatedItem = await tx.nfseServiceItem.findUnique({
        where: { id: item.id },
        include: {
          descriptions: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      });
      await tx.fiscalAuditEvent.create({
        data: this.auditData({
          companyId: company.id,
          branchCode,
          entityType: "NFSE_SERVICE_ITEM",
          entityId: item.id,
          action: existing ? "UPDATE" : "CREATE",
          summary: "SERVIÇO FISCAL DA NFS-E SALVO",
          before: existing ? this.mapServiceItem(existing) : null,
          after: this.mapServiceItem(populatedItem || item),
          performedBy: payload.requestedBy,
        }),
      });
      return populatedItem || item;
    });
    return this.mapServiceItem(saved);
  }

  async cancelServiceItem(serviceItemId: string, payload: NfseContextDto) {
    this.assertAdmin(payload);
    const company = await this.loadCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const branchCode = this.branchCode(payload.sourceBranchCode);
    const item = await this.prisma.nfseServiceItem.findFirst({
      where: {
        id: serviceItemId,
        companyId: company.id,
        branchCode: { in: getVisibleBranchCodes(branchCode) },
        canceledAt: null,
      },
      include: {
        descriptions: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    });
    if (!item) throw new NotFoundException("SERVIÇO NFS-E NÃO ENCONTRADO.");
    const canceledAt = new Date();
    await this.prisma.$transaction(async (tx: any) => {
      await tx.nfseServiceItem.update({
        where: { id: item.id },
        data: {
          status: "CANCELED",
          isDefault: false,
          canceledAt,
          canceledBy: payload.requestedBy || null,
          updatedBy: payload.requestedBy || null,
        },
      });
      await tx.nfseServiceDescription.updateMany({
        where: {
          companyId: company.id,
          serviceItemId: item.id,
          canceledAt: null,
        },
        data: {
          status: "CANCELED",
          canceledAt,
          canceledBy: payload.requestedBy || null,
          updatedBy: payload.requestedBy || null,
        },
      });
      await tx.nfseProfile.updateMany({
        where: {
          companyId: company.id,
          defaultServiceItemId: item.id,
        },
        data: {
          defaultServiceItemId: null,
          updatedBy: payload.requestedBy || null,
        },
      });
      await tx.fiscalAuditEvent.create({
        data: this.auditData({
          companyId: company.id,
          branchCode,
          entityType: "NFSE_SERVICE_ITEM",
          entityId: item.id,
          action: "CANCEL",
          summary: "SERVIÇO FISCAL DA NFS-E CANCELADO LOGICAMENTE",
          before: this.mapServiceItem(item),
          after: { status: "CANCELED", canceledAt: canceledAt.toISOString() },
          performedBy: payload.requestedBy,
        }),
      });
    });
    return { id: item.id, status: "CANCELED" };
  }

  async syncMunicipalParameters(payload: SyncNfseMunicipalParametersDto) {
    this.assertAdmin(payload);
    const company = await this.loadCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const branchCode = this.branchCode(payload.sourceBranchCode);
    const branch = await this.loadBranch(company.id, branchCode);
    const environment = (normalizeText(payload.environment) ||
      "HOMOLOGATION") as NfseEnvironment;
    const profile = await this.loadProfile(company.id, branchCode, environment);
    if (!profile) {
      throw new BadRequestException("CONFIGURE O PERFIL NFS-E ANTES DA CONSULTA.");
    }
    const service = payload.serviceItemId
        ? await this.prisma.nfseServiceItem.findFirst({
          where: {
            id: payload.serviceItemId,
            companyId: company.id,
            branchCode: { in: getVisibleBranchCodes(branchCode) },
            status: "ACTIVE",
            canceledAt: null,
          },
        })
      : profile.defaultServiceItem;
    const municipalityCode = requiredDigits(
      branch.fiscalCityCode,
      7,
      "O MUNICÍPIO DA FILIAL",
    );
    const issuerDocument = assertValidCnpj(branch.fiscalDocument, "O CNPJ DA FILIAL");
    const certificate = this.certificateMaterial(profile, issuerDocument);
    const competence = payload.competence
      ? dateOnly(parseCompetence(payload.competence))
      : dateOnly(new Date());
    const definitions: Array<{
      type: NfseMunicipalParameterType;
      nationalTaxCode?: string | null;
      competence?: string | null;
    }> = [
      { type: "CONVENTION" },
      ...(service
        ? [
            {
              type: "RATE" as const,
              nationalTaxCode: `${service.nationalTaxCode}${service.municipalTaxCode || "000"}`,
              competence,
            },
            {
              type: "SPECIAL_REGIMES" as const,
              nationalTaxCode: `${service.nationalTaxCode}${service.municipalTaxCode || "000"}`,
              competence,
            },
            {
              type: "WITHHOLDINGS" as const,
              competence,
            },
          ]
        : []),
    ];
    const settled = await Promise.allSettled(
      definitions.map((definition) =>
        queryNfseMunicipalParameter({
          environment,
          municipalityCode,
          nationalTaxCode: definition.nationalTaxCode,
          competence: definition.competence,
          type: definition.type,
          certificate,
          timeoutSeconds: profile.smtpTimeoutSeconds || 60,
        }),
      ),
    );
    const results: any[] = [];
    for (let index = 0; index < settled.length; index += 1) {
      const definition = definitions[index];
      const result = settled[index];
      const cacheKey = [
        company.id,
        branchCode,
        environment,
        municipalityCode,
        definition.type,
        definition.nationalTaxCode || "-",
        definition.competence || "-",
      ].join(":");
      const response =
        result.status === "fulfilled" ? result.value : null;
      const message =
        result.status === "rejected"
          ? errorMessage(result.reason)
          : response?.statusMessage ||
            (!statusOk(response?.httpStatus || 0)
              ? `API NACIONAL RESPONDEU HTTP ${response?.httpStatus || 0}`
              : null);
      const status = response && statusOk(response.httpStatus) ? "SUCCESS" : "ERROR";
      const saved = await this.prisma.nfseMunicipalParameter.upsert({
        where: { cacheKey },
        create: {
          cacheKey,
          companyId: company.id,
          branchCode,
          environment,
          municipalityCode,
          nationalTaxCode: definition.nationalTaxCode || null,
          competence: definition.competence || null,
          parameterType: definition.type,
          requestPath: response?.path || "NÃO EXECUTADO",
          status,
          httpStatus: response?.httpStatus || null,
          responseJson: serializeJson(response?.body),
          errorMessage: message,
          fetchedAt: new Date(),
          createdBy: payload.requestedBy || null,
          updatedBy: payload.requestedBy || null,
        },
        update: {
          requestPath: response?.path || "NÃO EXECUTADO",
          status,
          httpStatus: response?.httpStatus || null,
          responseJson: serializeJson(response?.body),
          errorMessage: message,
          fetchedAt: new Date(),
          updatedBy: payload.requestedBy || null,
        },
      });
      results.push(saved);
    }
    const convention = results.find(
      (item) => item.parameterType === "CONVENTION",
    );
    const body = parseJson<any>(convention?.responseJson, {});
    const enabled = Boolean(
      convention?.status === "SUCCESS" &&
        Number(body?.aderenteAmbienteNacional) === 1 &&
        Number(body?.aderenteEmissorNacional) === 1,
    );
    const conventionError = convention?.errorMessage
      ?.replace(/CONVÊNIO DO O MUNICÍPIO/gi, "CONVÊNIO DO MUNICÍPIO")
      .replace(/[<>]/g, "");
    const checkMessage = enabled
      ? "MUNICÍPIO HABILITADO PARA O EMISSOR PÚBLICO NACIONAL."
      : conventionError ||
        "O MUNICÍPIO NÃO ESTÁ HABILITADO PARA ESTE EMISSOR/AMBIENTE NACIONAL.";
    await this.prisma.$transaction(async (tx: any) => {
      await tx.nfseProfile.update({
        where: { id: profile.id },
        data: {
          lastMunicipalCheckAt: new Date(),
          lastMunicipalCheckStatus: enabled ? "READY" : "BLOCKED",
          lastMunicipalCheckMessage: normalizeText(checkMessage),
          updatedBy: payload.requestedBy || null,
        },
      });
      await tx.fiscalAuditEvent.create({
        data: this.auditData({
          companyId: company.id,
          branchCode,
          entityType: "NFSE_PROFILE",
          entityId: profile.id,
          action: "SYNC_MUNICIPAL_PARAMETERS",
          summary: "PARÂMETROS MUNICIPAIS DA NFS-E CONSULTADOS",
          after: {
            environment,
            municipalityCode,
            enabled,
            results: results.map((item) => ({
              type: item.parameterType,
              status: item.status,
              httpStatus: item.httpStatus,
              errorMessage: item.errorMessage,
            })),
          },
          performedBy: payload.requestedBy,
        }),
      });
    });
    return {
      environment,
      municipalityCode,
      enabled,
      message: normalizeText(checkMessage),
      results: results.map((item) => ({
        type: item.parameterType,
        status: item.status,
        httpStatus: item.httpStatus,
        message: item.errorMessage || null,
        response: parseJson(item.responseJson, null),
      })),
    };
  }

  async serviceStatus(query: NfseContextDto) {
    this.assertAdmin(query);
    const company = await this.loadCompany(query.sourceSystem, query.sourceTenantId);
    const branchCode = this.branchCode(query.sourceBranchCode);
    const branch = await this.loadBranch(company.id, branchCode);
    const environment = (normalizeText(query.environment) ||
      "HOMOLOGATION") as NfseEnvironment;
    const profile = await this.loadProfile(company.id, branchCode, environment);
    if (!profile) throw new BadRequestException("PERFIL NFS-E NÃO CONFIGURADO.");
    const issuerDocument = assertValidCnpj(branch.fiscalDocument, "O CNPJ DA FILIAL");
    const certificate = this.certificateMaterial(profile, issuerDocument);
    const municipalityCode = requiredDigits(
      branch.fiscalCityCode,
      7,
      "O MUNICÍPIO DA FILIAL",
    );
    const response = await queryNfseMunicipalParameter({
      environment,
      municipalityCode,
      type: "CONVENTION",
      certificate,
      timeoutSeconds: 60,
    });
    const body = response.body as any;
    const enabled = Boolean(
      statusOk(response.httpStatus) &&
        Number(body?.aderenteAmbienteNacional) === 1 &&
        Number(body?.aderenteEmissorNacional) === 1,
    );
    return {
      available: statusOk(response.httpStatus),
      enabled,
      environment,
      municipalityCode,
      httpStatus: response.httpStatus,
      message:
        response.statusMessage ||
        (enabled
          ? "MUNICÍPIO HABILITADO."
          : "MUNICÍPIO NÃO HABILITADO PARA O EMISSOR NACIONAL."),
      convention: body,
    };
  }

  private async resolveTaker(
    companyId: string,
    branchCode: number,
    payload: IssueNfseDto,
  ) {
    const title = payload.receivableTitleId
      ? await this.prisma.receivableTitle.findFirst({
          where: {
            id: payload.receivableTitleId,
            companyId,
            branchCode,
            canceledAt: null,
          },
          include: { payerParty: true },
        })
      : null;
    if (payload.receivableTitleId && !title) {
      throw new NotFoundException("TÍTULO A RECEBER NÃO ENCONTRADO NESTA FILIAL.");
    }
    const sale = payload.saleId
      ? await this.prisma.sale.findFirst({
          where: {
            id: payload.saleId,
            companyId,
            branchCode,
            canceledAt: null,
          },
          include: {
            customerParty: true,
            receivableTitle: { include: { payerParty: true } },
          },
        })
      : null;
    if (payload.saleId && !sale) {
      throw new NotFoundException("VENDA NÃO ENCONTRADA NESTA FILIAL.");
    }
    const explicitParty = payload.payerPartyId
      ? await this.prisma.party.findFirst({
          where: {
            id: payload.payerPartyId,
            companyId,
            canceledAt: null,
            ...activePartyRoleWhere(branchCode, [
              PARTY_ROLE.CUSTOMER,
              PARTY_ROLE.PAYER,
              PARTY_ROLE.TAKER,
              PARTY_ROLE.RECIPIENT,
            ]),
          },
        })
      : null;
    if (payload.payerPartyId && !explicitParty) {
      throw new NotFoundException("PAGADOR NÃO ENCONTRADO NESTA FILIAL.");
    }
    const titleParty = title?.payerParty || null;
    const saleParty =
      sale?.receivableTitle?.payerParty || sale?.customerParty || null;
    if (title && !titleParty) {
      throw new BadRequestException(
        "O TÍTULO NÃO POSSUI PARTY DO PAGADOR VINCULADO; NÃO SERÁ CRIADO DESTINATÁRIO SEPARADO.",
      );
    }
    if (sale?.receivableTitle && !sale.receivableTitle.payerParty) {
      throw new BadRequestException(
        "A DUPLICATA DA VENDA NÃO POSSUI PARTY DO PAGADOR VINCULADO.",
      );
    }
    const candidates = [titleParty, saleParty, explicitParty].filter(
      (item): item is NonNullable<typeof item> => Boolean(item),
    );
    const different = candidates.some((item) => item.id !== candidates[0]?.id);
    if (different) {
      throw new BadRequestException(
        "VENDA, TÍTULO E PAGADOR INFORMADOS NÃO APONTAM PARA A MESMA PESSOA.",
      );
    }
    const party = candidates[0];
    if (!party) {
      throw new BadRequestException(
        "INFORME O PAGADOR, O TÍTULO OU A VENDA PARA IDENTIFICAR O TOMADOR.",
      );
    }
    return {
      party,
      receivableTitleId: title?.id || sale?.receivableTitleId || null,
      saleId: sale?.id || null,
    };
  }

  private async allocateDocument(
    company: any,
    branch: any,
    profile: any,
    serviceItem: any,
    payload: IssueNfseDto,
    receivablePlan: ManualFiscalReceivablePlan | null,
  ) {
    const branchCode = branch.branchCode;
    const idempotencyKey = requiredText(
      payload.idempotencyKey,
      "A CHAVE DE IDEMPOTÊNCIA",
    );
    const reused = await this.prisma.nfseDocument.findFirst({
      where: {
        companyId: company.id,
        branchCode,
        idempotencyKey,
        canceledAt: null,
      },
    });
    if (reused) return reused;
    const { party, receivableTitleId, saleId } = await this.resolveTaker(
      company.id,
      branchCode,
      payload,
    );
    const issuer = this.issuerFrom(branch, profile);
    const taker = this.takerFrom(party);
    const service = this.serviceFrom(serviceItem, payload.description);
    const competenceDate = parseCompetence(payload.competence);
    const grossAmount = roundMoney(payload.amount);
    const discountAmount = roundMoney(payload.discountAmount || 0);
    const deductionAmount = roundMoney(payload.deductionAmount || 0);
    const netAmount = roundMoney(
      grossAmount - discountAmount - deductionAmount,
    );
    if (grossAmount <= 0 || netAmount <= 0) {
      throw new BadRequestException("O VALOR LÍQUIDO DA NFS-E DEVE SER POSITIVO.");
    }
    return this.prisma.$transaction(async (tx: any) => {
      const duplicate = await tx.nfseDocument.findFirst({
        where: { companyId: company.id, branchCode, idempotencyKey },
      });
      if (duplicate) return duplicate;
      const currentProfile = await tx.nfseProfile.findFirst({
        where: {
          id: profile.id,
          companyId: company.id,
          branchCode,
          status: "ACTIVE",
          canceledAt: null,
        },
      });
      if (!currentProfile) {
        throw new BadRequestException("PERFIL NFS-E NÃO ESTÁ MAIS ATIVO.");
      }
      const latest = await tx.nfseDocument.aggregate({
        where: {
          companyId: company.id,
          branchCode,
          environment: currentProfile.environment,
          series: currentProfile.series,
        },
        _max: { number: true },
      });
      const number = Math.max(
        currentProfile.nextNumber,
        Number(latest._max.number || 0) + 1,
      );
      const dpsId = buildNfseDpsId({
        municipalityCode: issuer.address.cityCode,
        issuerDocument: issuer.document,
        series: currentProfile.series,
        number,
      });
      const document = await tx.nfseDocument.create({
        data: {
          companyId: company.id,
          branchCode,
          profileId: currentProfile.id,
          serviceItemId: serviceItem.id,
          takerPartyId: party.id,
          receivableTitleId,
          saleId,
          sourceSystem: normalizeText(payload.sourceSystem)!,
          sourceTenantId: normalizeText(payload.sourceTenantId)!,
          sourceEntityType: requiredText(
            payload.sourceEntityType,
            "O TIPO DA ENTIDADE DE ORIGEM",
          ),
          sourceEntityId: requiredText(
            payload.sourceEntityId,
            "O ID DA ENTIDADE DE ORIGEM",
          ),
          idempotencyKey,
          receivablePlanJson:
            serializeManualFiscalReceivablePlan(receivablePlan),
          environment: currentProfile.environment,
          series: currentProfile.series,
          number,
          dpsId,
          status: "PENDING",
          competenceDate,
          issuedAt: new Date(),
          serviceCityCode: service.serviceCityCode,
          grossAmount,
          discountAmount,
          deductionAmount,
          netAmount,
          issuerSnapshotJson: serializeJson(issuer)!,
          takerSnapshotJson: serializeJson(taker)!,
          serviceSnapshotJson: serializeJson({
            ...service,
            name: serviceItem.name,
          })!,
          taxSnapshotJson: serializeJson({
            issTaxationCode: service.issTaxationCode,
            issWithholdingCode: service.issWithholdingCode,
            issRate: service.issRate,
            simpleNationalOption: issuer.simpleNationalOption,
            simpleNationalTaxRegime: issuer.simpleNationalTaxRegime,
            specialTaxRegime: issuer.specialTaxRegime,
            schemaVersion: currentProfile.schemaVersion,
          })!,
          createdBy: payload.requestedBy || null,
          updatedBy: payload.requestedBy || null,
        },
      });
      await tx.nfseProfile.update({
        where: { id: currentProfile.id },
        data: {
          nextNumber: number + 1,
          updatedBy: payload.requestedBy || null,
        },
      });
      await tx.fiscalAuditEvent.create({
        data: this.auditData({
          companyId: company.id,
          branchCode,
          entityType: "NFSE_DOCUMENT",
          entityId: document.id,
          action: "ALLOCATE_NUMBER",
          summary: "NÚMERO DA DPS ALOCADO PARA A NFS-E",
          after: {
            series: document.series,
            number: document.number,
            dpsId: document.dpsId,
            takerPartyId: document.takerPartyId,
            receivableTitleId: document.receivableTitleId,
          },
          performedBy: payload.requestedBy,
        }),
      });
      return document;
    });
  }

  private nationalNumber(authorizedXml?: string | null) {
    if (!authorizedXml) return null;
    const match = authorizedXml.match(/<(?:\w+:)?nNFSe>([^<]+)<\/(?:\w+:)?nNFSe>/i);
    if (match?.[1]) return String(match[1]).trim();
    try {
      const parser = new XMLParser({
        ignoreAttributes: false,
        removeNSPrefix: true,
        parseTagValue: false,
      });
      const parsed = parser.parse(authorizedXml);
      return String(parsed?.NFSe?.infNFSe?.nNFSe || "").trim() || null;
    } catch {
      return null;
    }
  }

  private async sendEmailIfEnabled(document: any, profile: any, requestedBy?: string) {
    if (
      !profile.sendEmailToRecipient ||
      document.status !== "AUTHORIZED" ||
      !document.authorizedXml ||
      !document.danfsePdfBlob
    ) {
      return null;
    }
    try {
      return await this.emailService.sendAuthorizedDocument({
        companyId: document.companyId,
        branchCode: document.branchCode,
        documentId: document.id,
        requestedBy,
        force: false,
      });
    } catch (error) {
      return { status: "ERROR", errorMessage: errorMessage(error) };
    }
  }

  private async attachReceivableIfRequested(
    document: any,
    company: any,
    payload: IssueNfseDto,
    plan: ManualFiscalReceivablePlan | null,
  ) {
    if (!plan) return null;
    if (document.receivableTitleId) {
      return {
        id: document.receivableTitleId,
        status: "EXISTING",
      };
    }
    try {
      return await this.manualReceivableService.ensureForAuthorizedDocument({
        documentKind: "NFSE",
        documentId: document.id,
        companyId: company.id,
        branchCode: document.branchCode,
        sourceSystem: payload.sourceSystem,
        sourceTenantId: payload.sourceTenantId,
        payerPartyId: document.takerPartyId,
        documentReference: `${document.nationalNfseNumber || document.number}/${document.series}`,
        plan,
        requestedBy: payload.requestedBy,
      });
    } catch (error) {
      return {
        status: "ERROR",
        errorMessage: errorMessage(error),
      };
    }
  }

  async issue(payload: IssueNfseDto) {
    this.assertOperator(payload);
    const company = await this.loadCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const branchCode = this.branchCode(payload.sourceBranchCode);
    const branch = await this.loadBranch(company.id, branchCode);
    const environment = (normalizeText(payload.environment) ||
      "HOMOLOGATION") as NfseEnvironment;
    const profile = await this.loadProfile(company.id, branchCode, environment);
    if (!profile) {
      throw new BadRequestException("PERFIL NFS-E ATIVO NÃO CONFIGURADO.");
    }
    const serviceItem = await this.prisma.nfseServiceItem.findFirst({
      where: {
        id: payload.serviceItemId,
        companyId: company.id,
        branchCode: { in: getVisibleBranchCodes(branchCode) },
        status: "ACTIVE",
        canceledAt: null,
      },
    });
    if (!serviceItem) {
      throw new NotFoundException("SERVIÇO NFS-E NÃO ENCONTRADO NESTA FILIAL.");
    }
    const requestedNetAmount = roundMoney(
      Number(payload.amount || 0) -
        Number(payload.discountAmount || 0) -
        Number(payload.deductionAmount || 0),
    );
    const receivablePlan = normalizeManualFiscalReceivablePlan(
      payload.createReceivable,
      requestedNetAmount,
      payload.installments,
    );
    let document = await this.allocateDocument(
      company,
      branch,
      profile,
      serviceItem,
      payload,
      receivablePlan,
    );
    await setPartyRoleActive(this.prisma, {
      companyId: company.id,
      partyId: document.takerPartyId,
      branchCode: document.branchCode,
      roleType: PARTY_ROLE.TAKER,
      active: true,
      requestedBy: payload.requestedBy,
    });
    if (document.status === "AUTHORIZED") {
      const receivable = await this.attachReceivableIfRequested(
        document,
        company,
        payload,
        receivablePlan,
      );
      const emailDelivery = await this.sendEmailIfEnabled(
        document,
        profile,
        payload.requestedBy,
      );
      return {
        ...this.mapDocument(document),
        ...(receivable
          ? {
              receivableTitleId:
                receivable.id || document.receivableTitleId || null,
              receivable,
            }
          : {}),
        ...(emailDelivery ? { emailDelivery } : {}),
      };
    }
    const issuer = parseJson<NfseIssuer>(document.issuerSnapshotJson)!;
    const taker = parseJson<NfseTaker>(document.takerSnapshotJson)!;
    const service = parseJson<NfseServiceDefinition>(
      document.serviceSnapshotJson,
    )!;
    const certificate = this.certificateMaterial(profile, issuer.document);
    const built = buildNfseDpsXml({
      environment: document.environment as NfseEnvironment,
      schemaVersion: "1.01",
      softwareVersion: profile.softwareVersion,
      series: document.series,
      number: document.number,
      issuedAt: document.issuedAt,
      competenceDate: document.competenceDate,
      issuer,
      taker,
      service,
      grossAmount: document.grossAmount,
      discountAmount: document.discountAmount,
      deductionAmount: document.deductionAmount,
    });
    if (built.dpsId !== document.dpsId) {
      throw new BadRequestException(
        "O IDENTIFICADOR DA DPS DIVERGE DA NUMERAÇÃO PERSISTIDA.",
      );
    }
    const signedXml = signNfseDpsXml(built.xml, certificate);
    const attemptNumber = Number(document.attemptCount || 0) + 1;
    const attemptedAt = new Date();
    await this.prisma.nfseDocument.update({
      where: { id: document.id },
      data: {
        status: "SIGNED",
        signedDpsXml: signedXml,
        attemptCount: attemptNumber,
        lastAttemptAt: attemptedAt,
        lastError: null,
        updatedBy: payload.requestedBy || null,
      },
    });
    try {
      let response = await issueNfseNational({
        environment: document.environment as NfseEnvironment,
        signedDpsXml: signedXml,
        certificate,
        timeoutSeconds: 60,
      });
      let reconciled = false;
      if (
        !(response.httpStatus === 201 && response.accessKey && response.authorizedXml)
      ) {
        try {
          const consultation = await consultNfseByDps({
            environment: document.environment as NfseEnvironment,
            dpsId: document.dpsId,
            certificate,
            timeoutSeconds: 60,
          });
          if (
            statusOk(consultation.httpStatus) &&
            consultation.accessKey &&
            consultation.authorizedXml
          ) {
            response = {
              ...response,
              ...consultation,
              requestBody: response.requestBody,
            } as typeof response;
            reconciled = true;
          }
        } catch {
          // A rejeição original é mantida quando a consulta idempotente falha.
        }
      }
      const authorized = Boolean(response.accessKey && response.authorizedXml);
      let danfse: Buffer | null = null;
      let danfseError: string | null = null;
      if (authorized) {
        try {
          const downloaded = await downloadNationalDanfse({
            environment: document.environment as NfseEnvironment,
            accessKey: response.accessKey!,
            certificate,
            timeoutSeconds: 60,
          });
          if (
            downloaded.httpStatus === 200 &&
            downloaded.buffer.subarray(0, 4).toString("ascii") === "%PDF"
          ) {
            danfse = downloaded.buffer;
          } else {
            danfseError = `DANFSE OFICIAL NÃO DISPONÍVEL: HTTP ${downloaded.httpStatus}.`;
          }
        } catch (error) {
          danfseError = errorMessage(error);
        }
      }
      const status = authorized ? "AUTHORIZED" : "REJECTED";
      const statusMessage = authorized
        ? danfseError || "NFS-E AUTORIZADA NO SISTEMA NACIONAL."
        : response.statusMessage ||
          nfseResponseMessage(response.body) ||
          `API NACIONAL RESPONDEU HTTP ${response.httpStatus}.`;
      document = await this.prisma.$transaction(async (tx: any) => {
        const updated = await tx.nfseDocument.update({
          where: { id: document.id },
          data: {
            status,
            statusCode: String(response.httpStatus || "") || null,
            statusMessage: normalizeText(statusMessage),
            accessKey: response.accessKey || null,
            nationalNfseNumber: this.nationalNumber(response.authorizedXml),
            requestJson: response.requestBody,
            responseJson: serializeJson(response.body),
            authorizedXml: response.authorizedXml,
            danfseFileName:
              danfse && response.accessKey
                ? `DANFSE-${response.accessKey}.pdf`
                : null,
            danfsePdfBlob: danfse,
            danfseDownloadedAt: danfse ? new Date() : null,
            lastError: authorized ? danfseError : normalizeText(statusMessage),
            updatedBy: payload.requestedBy || null,
          },
        });
        await tx.nfseDocumentAttempt.create({
          data: {
            companyId: company.id,
            nfseDocumentId: document.id,
            attemptNumber,
            operation: "ISSUE",
            status,
            httpStatus: response.httpStatus || null,
            statusCode: String(response.httpStatus || "") || null,
            statusMessage: normalizeText(statusMessage),
            requestJson: response.requestBody,
            responseJson: serializeJson(response.body),
            errorMessage: authorized ? danfseError : normalizeText(statusMessage),
            attemptedAt,
            createdBy: payload.requestedBy || null,
            updatedBy: payload.requestedBy || null,
          },
        });
        await tx.fiscalAuditEvent.create({
          data: this.auditData({
            companyId: company.id,
            branchCode,
            entityType: "NFSE_DOCUMENT",
            entityId: document.id,
            action: authorized ? "AUTHORIZE" : "REJECT",
            summary: authorized
              ? "NFS-E AUTORIZADA NO SISTEMA NACIONAL"
              : "NFS-E REJEITADA PELO SISTEMA NACIONAL",
            after: {
              status,
              httpStatus: response.httpStatus,
              statusMessage,
              accessKey: response.accessKey,
              dpsId: document.dpsId,
              reconciled,
              hasDanfse: Boolean(danfse),
            },
            performedBy: payload.requestedBy,
          }),
        });
        return updated;
      });
      const receivable = authorized
        ? await this.attachReceivableIfRequested(
            document,
            company,
            payload,
            receivablePlan,
          )
        : null;
      const emailDelivery = await this.sendEmailIfEnabled(
        document,
        profile,
        payload.requestedBy,
      );
      return {
        ...this.mapDocument(document),
        ...(receivable
          ? {
              receivableTitleId:
                receivable.id || document.receivableTitleId || null,
              receivable,
            }
          : {}),
        ...(emailDelivery ? { emailDelivery } : {}),
      };
    } catch (error) {
      const message = errorMessage(error);
      document = await this.prisma.$transaction(async (tx: any) => {
        const updated = await tx.nfseDocument.update({
          where: { id: document.id },
          data: {
            status: "ERROR",
            statusMessage: message,
            lastError: message,
            updatedBy: payload.requestedBy || null,
          },
        });
        await tx.nfseDocumentAttempt.create({
          data: {
            companyId: company.id,
            nfseDocumentId: document.id,
            attemptNumber,
            operation: "ISSUE",
            status: "ERROR",
            statusMessage: message,
            errorMessage: message,
            attemptedAt,
            createdBy: payload.requestedBy || null,
            updatedBy: payload.requestedBy || null,
          },
        });
        await tx.fiscalAuditEvent.create({
          data: this.auditData({
            companyId: company.id,
            branchCode,
            entityType: "NFSE_DOCUMENT",
            entityId: document.id,
            action: "TRANSMISSION_ERROR",
            summary: "FALHA NA TRANSMISSÃO DA NFS-E NACIONAL",
            after: { status: "ERROR", error: message },
            performedBy: payload.requestedBy,
          }),
        });
        return updated;
      });
      throw new BadRequestException(message);
    }
  }

  async listDocuments(query: NfseContextDto) {
    this.assertOperator(query);
    const company = await this.loadCompany(query.sourceSystem, query.sourceTenantId);
    const branchCode = this.branchCode(query.sourceBranchCode);
    const documents = await this.prisma.nfseDocument.findMany({
      where: { companyId: company.id, branchCode, canceledAt: null },
      orderBy: { issuedAt: "desc" },
      take: 100,
    });
    return documents.map((item) => this.mapDocument(item));
  }

  async sendDocumentEmail(documentId: string, payload: SendNfseEmailDto) {
    this.assertOperator(payload);
    const company = await this.loadCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const branchCode = this.branchCode(payload.sourceBranchCode);
    const document = await this.prisma.nfseDocument.findFirst({
      where: {
        id: documentId,
        companyId: company.id,
        branchCode,
        canceledAt: null,
      },
    });
    if (!document) throw new NotFoundException("NFS-E NÃO ENCONTRADA.");
    return this.emailService.sendAuthorizedDocument({
      companyId: company.id,
      branchCode,
      documentId: document.id,
      recipientEmail: payload.recipientEmail,
      requestedBy: payload.requestedBy,
      force: true,
    });
  }

  async getArtifact(
    documentId: string,
    query: NfseContextDto,
    type: "xml" | "danfse",
  ) {
    this.assertOperator(query);
    const company = await this.loadCompany(query.sourceSystem, query.sourceTenantId);
    const branchCode = this.branchCode(query.sourceBranchCode);
    const document = await this.prisma.nfseDocument.findFirst({
      where: {
        id: documentId,
        companyId: company.id,
        branchCode,
        canceledAt: null,
      },
    });
    if (!document) throw new NotFoundException("NFS-E NÃO ENCONTRADA.");
    if (type === "xml") {
      if (!document.authorizedXml) {
        throw new NotFoundException("XML AUTORIZADO DA NFS-E NÃO DISPONÍVEL.");
      }
      return {
        contentType: "application/xml; charset=utf-8",
        fileName: `NFSE-${document.accessKey || document.dpsId}.xml`,
        body: Buffer.from(document.authorizedXml, "utf8"),
      };
    }
    if (!document.danfsePdfBlob) {
      throw new NotFoundException("DANFSE OFICIAL NÃO DISPONÍVEL.");
    }
    return {
      contentType: "application/pdf",
      fileName:
        document.danfseFileName ||
        `DANFSE-${document.accessKey || document.dpsId}.pdf`,
      body: Buffer.from(document.danfsePdfBlob),
    };
  }
}
