import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { promises as fs } from "fs";
import path from "path";
import { PrismaService } from "../../../../prisma/prisma.service";
import { normalizeBranchCode } from "../../../../common/branch.constants";
import {
  normalizeDigits,
  normalizeText,
  parseJson,
  roundMoney,
  serializeJson,
} from "../../../../common/finance-core.utils";
import {
  assertValidCnpj,
  normalizeTaxId,
} from "../../../../common/brazil-tax-id.utils";
import { decryptSecret } from "../../../../common/secret-crypto.utils";
import {
  CancelNfeDto,
  CorrectNfeDto,
  InutilizeNfeNumbersDto,
  IssueManualNfeDto,
  IssueSaleNfeDto,
  NfeContextDto,
  SendNfeEmailDto,
} from "../dto/nfe.dto";
import {
  ManualFiscalReceivablePlan,
  ManualFiscalReceivableService,
  normalizeManualFiscalReceivablePlan,
  serializeManualFiscalReceivablePlan,
} from "../manual-fiscal-receivable.service";
import {
  assertNfceCertificateMatchesIssuer,
  loadNfceCertificateMaterial,
} from "../nfce/nfce-certificate.utils";
import {
  authorizeNfe,
  inutilizeNfeNumbers,
  queryNfeProtocol,
  queryNfeServiceStatus,
  sendNfeEvent,
  signNfeXmlForValidation,
} from "./nfe-sefaz.client";
import { buildNfeXml, formatNfeDateTime } from "./nfe-xml.builder";
import { NfeDanfeService } from "./nfe-danfe.service";
import { NfeEmailService } from "./nfe-email.service";
import { NfeEnvironment } from "./nfe.types";
import {
  activePartyRoleWhere,
  PARTY_ROLE,
  setPartyRoleActive,
} from "../../../../common/party-registry";

const NFE_MODEL = "55";
const HOMOLOGATION_RECIPIENT_NAME =
  "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";
const SIMPLES_IBS_CBS_START = new Date("2027-01-04T00:00:00-03:00");

const PAYMENT_CODES: Record<string, string> = {
  CASH: "01",
  CHECK: "02",
  CREDIT_CARD: "03",
  DEBIT_CARD: "04",
  STORE_CREDIT: "05",
  BOLETO: "15",
  PIX: "17",
  TERM: "14",
  INSTALLMENT: "14",
  NO_PAYMENT: "90",
  OTHER: "99",
};

type NfeIssueIdentity = {
  saleId?: string | null;
  sourceSystem: string;
  sourceTenantId: string;
  sourceEntityType: string;
  sourceEntityId: string;
  idempotencyKey?: string | null;
  receivablePlan?: ManualFiscalReceivablePlan | null;
};

function errorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "response" in error &&
    typeof (error as any).response?.message === "string"
  ) {
    return (error as any).response.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function parseAddressLine(value?: string | null) {
  const normalized = normalizeText(value) || "";
  const match = /^(.*?)[,\s]+(\d+[A-Z0-9/-]*)$/.exec(normalized);
  return {
    street: normalizeText(match?.[1] || normalized),
    number: normalizeText(match?.[2]) || "S/N",
  };
}

@Injectable()
export class NfeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly danfeService: NfeDanfeService,
    private readonly emailService: NfeEmailService,
    private readonly manualReceivableService: ManualFiscalReceivableService,
  ) {}

  private branchCode(value?: number | null, fallback = 1) {
    return Math.max(1, normalizeBranchCode(value, fallback));
  }

  private assertOperator(context: NfeContextDto) {
    const permissions = String(context.permissions || "")
      .split(",")
      .map((item) => normalizeText(item))
      .filter(Boolean);
    if (
      normalizeText(context.userRole) !== "ADMIN" &&
      !permissions.includes("MANAGE_FINANCIAL")
    ) {
      throw new ForbiddenException(
        "A EMISSÃO DA NF-E EXIGE PERFIL ADMIN OU PERMISSÃO MANAGE_FINANCIAL.",
      );
    }
  }

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

  private mapDocument(document: any, includeXml = false) {
    if (!document) return null;
    const totals = parseJson<{ invoice?: number }>(
      document.totalsSnapshotJson,
      {},
    );
    return {
      id: document.id,
      saleId: document.saleId || null,
      receivableTitleId: document.receivableTitleId || null,
      sourceSystem: document.sourceSystem || null,
      sourceTenantId: document.sourceTenantId || null,
      sourceEntityType: document.sourceEntityType || null,
      sourceEntityId: document.sourceEntityId || null,
      idempotencyKey: document.idempotencyKey || null,
      companyId: document.companyId,
      branchCode: document.branchCode,
      model: document.model,
      environment: document.environment as NfeEnvironment,
      series: document.series,
      number: document.number,
      accessKey: document.accessKey || null,
      status: document.status,
      statusCode: document.statusCode || null,
      statusMessage: document.statusMessage || null,
      totalAmount: roundMoney(totals?.invoice || 0),
      protocol: document.protocol || null,
      receivedAt: document.receivedAt?.toISOString?.() || null,
      issuedAt: document.issuedAt?.toISOString?.() || null,
      operationNature: document.operationNatureSnapshot || null,
      schemaVersion: document.schemaVersion || null,
      attemptCount: document.attemptCount,
      lastAttemptAt: document.lastAttemptAt?.toISOString?.() || null,
      lastError: document.lastError || null,
      danfeFileName: document.danfeFileName || null,
      danfeGeneratedAt:
        document.danfeGeneratedAt?.toISOString?.() || null,
      hasDanfe: Boolean(document.danfePdfBlob),
      hasProcessedXml: Boolean(document.processedXml),
      danfeDownloadUrl: document.danfePdfBlob
        ? `/api/v1/fiscal-documents/nfe/documents/${document.id}/danfe`
        : null,
      xmlDownloadUrl: document.processedXml
        ? `/api/v1/fiscal-documents/nfe/documents/${document.id}/xml`
        : null,
      ...(includeXml
        ? {
            signedXml: document.signedXml || null,
            responseXml: document.responseXml || null,
            processedXml: document.processedXml || null,
          }
        : {}),
    };
  }

  private async loadSale(companyId: string, saleId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: {
        id: String(saleId || "").trim(),
        companyId,
        canceledAt: null,
      },
      include: {
        company: true,
        customerParty: true,
        receivableTitle: {
          include: {
            payerParty: true,
          },
        },
        items: {
          where: { canceledAt: null },
          orderBy: { lineNumber: "asc" },
          include: { product: true },
        },
        payments: {
          where: { canceledAt: null },
          orderBy: { createdAt: "asc" },
          include: { superTefPayment: true },
        },
      },
    });
    if (!sale) {
      throw new NotFoundException(
        "VENDA NÃO ENCONTRADA PARA EMISSÃO DA NF-E.",
      );
    }
    if (sale.status !== "CONFIRMED") {
      throw new BadRequestException(
        "Somente vendas confirmadas podem emitir NF-e.",
      );
    }
    if (!sale.items.length) {
      throw new BadRequestException("A venda não possui itens para emissão.");
    }
    return sale;
  }

  private async loadProfile(
    companyId: string,
    branchCode: number,
    environment?: string | null,
    autoOnly = false,
  ) {
    const profile = await this.prisma.nfeProfile.findFirst({
      where: {
        companyId,
        branchCode,
        status: "ACTIVE",
        canceledAt: null,
        ...(environment ? { environment } : {}),
        ...(autoOnly ? { autoIssueOnSale: true } : {}),
      },
      include: {
        certificate: true,
        defaultOperationNature: true,
      },
      orderBy: [
        { autoIssueOnSale: "desc" },
        { environment: "asc" },
        { series: "asc" },
      ],
    });
    return profile;
  }

  private async loadOperation(
    companyId: string,
    branchCode: number,
    profile: any,
    operationNatureId?: string | null,
  ) {
    const operation = await this.prisma.fiscalOperationNature.findFirst({
      where: {
        companyId,
        branchCode,
        id:
          operationNatureId ||
          profile.defaultOperationNatureId ||
          profile.defaultOperationNature?.id,
        documentModel: NFE_MODEL,
        status: "ACTIVE",
        canceledAt: null,
      },
    });
    if (operation) return operation;
    const fallback = await this.prisma.fiscalOperationNature.findFirst({
      where: {
        companyId,
        branchCode,
        documentModel: NFE_MODEL,
        status: "ACTIVE",
        canceledAt: null,
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    if (!fallback) {
      throw new BadRequestException(
        "Nenhuma natureza de operação NF-e ativa foi configurada para a filial.",
      );
    }
    return fallback;
  }

  private async loadIssuer(companyId: string, branchCode: number) {
    const branch = await this.prisma.companyBranch.findFirst({
      where: {
        companyId,
        branchCode,
        isActive: true,
        canceledAt: null,
      },
    });
    if (!branch) {
      throw new BadRequestException("Filial emitente ativa não encontrada.");
    }
    const cnpj = assertValidCnpj(
      branch.fiscalDocument,
      "o CNPJ da filial emitente",
    );
    const required = (value: string | null, label: string) => {
      const normalized = normalizeText(value);
      if (!normalized) {
        throw new BadRequestException(
          `Informe ${label} nos dados fiscais da filial.`,
        );
      }
      return normalized;
    };
    const requiredDigits = (
      value: string | null,
      length: number,
      label: string,
    ) => {
      const normalized = normalizeDigits(value);
      if (!normalized || normalized.length !== length) {
        throw new BadRequestException(
          `Informe ${label} com ${length} dígitos nos dados fiscais da filial.`,
        );
      }
      return normalized;
    };
    return {
      branch,
      issuer: {
        stateCode: requiredDigits(
          branch.fiscalStateCode,
          2,
          "o código da UF",
        ),
        cityCode: requiredDigits(
          branch.fiscalCityCode,
          7,
          "o código do município",
        ),
        cnpj,
        stateRegistration: required(
          branch.stateRegistration,
          "a inscrição estadual",
        ),
        municipalRegistration: branch.municipalRegistration,
        legalName: required(branch.fiscalLegalName, "a razão social"),
        tradeName: branch.fiscalTradeName,
        taxRegimeCode: required(
          branch.taxRegimeCode,
          "o regime tributário",
        ) as "1" | "2" | "3" | "4",
        street: required(branch.fiscalStreet, "o logradouro"),
        number: required(branch.fiscalNumber, "o número"),
        complement: branch.fiscalComplement,
        neighborhood: required(branch.fiscalNeighborhood, "o bairro"),
        city: required(branch.fiscalCity, "o município"),
        state: required(branch.fiscalState, "a UF"),
        postalCode: requiredDigits(branch.fiscalPostalCode, 8, "o CEP"),
        countryCode: branch.fiscalCountryCode || "1058",
        countryName: branch.fiscalCountryName || "BRASIL",
        phone: branch.fiscalPhone,
      },
    };
  }

  private buildRecipient(sale: any) {
    const titlePayer = sale.receivableTitle?.payerParty || null;
    if (sale.receivableTitle && !titlePayer) {
      throw new BadRequestException(
        "O título da venda não possui pagador vinculado para emissão da NF-e.",
      );
    }
    const party = titlePayer || sale.customerParty;
    const document = normalizeTaxId(
      party?.document || sale.customerDocumentSnapshot,
    );
    if (!document) {
      throw new BadRequestException(
        "Informe CPF/CNPJ no cadastro do destinatário.",
      );
    }
    const parsedAddress = parseAddressLine(party?.addressLine1);
    const required = (value: string | null | undefined, label: string) => {
      const normalized = normalizeText(value);
      if (!normalized) {
        throw new BadRequestException(
          `Informe ${label} no cadastro do destinatário.`,
        );
      }
      return normalized;
    };
    const cityCode = normalizeDigits(party?.cityCode);
    const postalCode = normalizeDigits(party?.postalCode);
    if (!cityCode || cityCode.length !== 7) {
      throw new BadRequestException(
        "Informe o código IBGE do município no cadastro do destinatário.",
      );
    }
    if (!postalCode || postalCode.length !== 8) {
      throw new BadRequestException(
        "Informe o CEP no cadastro do destinatário.",
      );
    }
    const indicator = normalizeDigits(party?.stateRegistrationIndicator) || "9";
    return {
      partyId: party?.id || null,
      recipient: {
        name: required(
          party?.name || sale.customerNameSnapshot,
          "o nome",
        ),
        document,
        stateRegistrationIndicator: (
          ["1", "2", "9"].includes(indicator) ? indicator : "9"
        ) as "1" | "2" | "9",
        stateRegistration: party?.stateRegistration,
        email: party?.email,
        street: required(
          party?.street || parsedAddress.street,
          "o logradouro",
        ),
        number: required(
          party?.addressNumber || parsedAddress.number,
          "o número do endereço",
        ),
        complement: party?.addressComplement,
        neighborhood: required(party?.neighborhood, "o bairro"),
        city: required(party?.city, "o município"),
        cityCode,
        state: required(party?.state, "a UF"),
        postalCode,
        countryCode: party?.countryCode || "1058",
        countryName: party?.countryName || "BRASIL",
        phone: party?.phone,
      },
    };
  }

  private async buildItems(
    sale: any,
    operation: any,
    issuerTaxRegimeCode: string,
    issuedAt: Date,
  ) {
    const rules = await this.prisma.fiscalTaxRule.findMany({
      where: {
        companyId: sale.companyId,
        branchCode: sale.branchCode,
        operationNatureId: operation.id,
        status: "ACTIVE",
        canceledAt: null,
        AND: [
          {
            OR: [{ validFrom: null }, { validFrom: { lte: issuedAt } }],
          },
          {
            OR: [{ validTo: null }, { validTo: { gte: issuedAt } }],
          },
        ],
      },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
    if (!rules.length) {
      throw new BadRequestException(
        "Nenhuma regra tributária ativa foi configurada para a natureza da operação.",
      );
    }
    const itemDiscountTotal = roundMoney(
      sale.items.reduce(
        (sum: number, item: any) =>
          sum + Number(item.discountAmount || 0),
        0,
      ),
    );
    const additionalDiscount = Math.max(
      0,
      roundMoney(Number(sale.discountAmount || 0) - itemDiscountTotal),
    );
    const allocationBase = sale.items.reduce(
      (sum: number, item: any) => sum + Number(item.totalAmount || 0),
      0,
    );
    let allocated = 0;
    return sale.items.map((item: any, index: number) => {
      const rule =
        rules.find((candidate: any) => candidate.productId === item.productId) ||
        rules.find((candidate: any) => !candidate.productId);
      if (!rule) {
        throw new BadRequestException(
          `Nenhuma regra tributária atende o produto ${item.productNameSnapshot}.`,
        );
      }
      const product = item.product;
      const ncmCode = normalizeDigits(product?.ncmCode);
      if (!ncmCode || ncmCode.length !== 8 || ncmCode === "00000000") {
        throw new BadRequestException(
          `Informe NCM válido no produto ${item.productNameSnapshot}.`,
        );
      }
      const isLast = index === sale.items.length - 1;
      const share = isLast
        ? roundMoney(additionalDiscount - allocated)
        : allocationBase > 0
          ? roundMoney(
              additionalDiscount *
                (Number(item.totalAmount || 0) / allocationBase),
            )
          : 0;
      allocated = roundMoney(allocated + share);
      const csosn =
        normalizeDigits(rule.icmsCsosnCode) ||
        normalizeDigits(product?.icmsCsosnCode);
      const cst =
        normalizeDigits(rule.icmsCstCode) ||
        normalizeDigits(product?.icmsCstCode);
      if (["1", "2", "4"].includes(issuerTaxRegimeCode) && !csosn) {
        throw new BadRequestException(
          `Informe o CSOSN na regra tributária do produto ${item.productNameSnapshot}.`,
        );
      }
      if (issuerTaxRegimeCode === "3" && !cst) {
        throw new BadRequestException(
          `Informe o CST de ICMS na regra tributária do produto ${item.productNameSnapshot}.`,
        );
      }
      const fiscalBenefitCode =
        normalizeText(rule.fiscalBenefitCode) ||
        normalizeText(product?.fiscalBenefitCode);
      if (rule.fiscalBenefitRequired && !fiscalBenefitCode) {
        throw new BadRequestException(
          `A regra do produto ${item.productNameSnapshot} exige cBenef.`,
        );
      }
      if (fiscalBenefitCode === "SEM CBENEF") {
        throw new BadRequestException(
          "SEM CBENEF não é aceito em São Paulo desde 01/07/2026.",
        );
      }
      const allowIbsCbs =
        issuerTaxRegimeCode === "3" ||
        issuedAt.getTime() >= SIMPLES_IBS_CBS_START.getTime();
      return {
        productId: product?.id || null,
        code:
          item.productCodeSnapshot ||
          product?.internalCode ||
          String(item.lineNumber),
        description:
          normalizeText(product?.fiscalDescription) ||
          item.productNameSnapshot,
        gtinCode: product?.gtinCode || product?.barcode || "SEM GTIN",
        taxableGtinCode:
          product?.taxableGtinCode ||
          product?.gtinCode ||
          product?.barcode ||
          "SEM GTIN",
        ncmCode,
        cestCode: normalizeDigits(product?.cestCode),
        fiscalBenefitCode,
        cfopCode:
          normalizeDigits(product?.defaultCfopCode) || operation.cfopCode,
        unitCode: item.unitCodeSnapshot || product?.unitCode || "UN",
        taxableUnitCode:
          product?.taxableUnitCode ||
          item.unitCodeSnapshot ||
          product?.unitCode ||
          "UN",
        taxableConversionFactor: Number(
          product?.taxableConversionFactor || 1,
        ),
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discountAmount: roundMoney(
          Number(item.discountAmount || 0) + share,
        ),
        originCode:
          normalizeDigits(rule.originCode) ||
          normalizeDigits(product?.fiscalOriginCode) ||
          "0",
        icmsCsosnCode: csosn,
        icmsCstCode: cst,
        icmsRate: Number(rule.icmsRate ?? product?.icmsRate ?? 0),
        pisCstCode:
          normalizeDigits(rule.pisCstCode) ||
          normalizeDigits(product?.pisCstCode) ||
          "49",
        pisRate: Number(rule.pisRate ?? product?.pisRate ?? 0),
        cofinsCstCode:
          normalizeDigits(rule.cofinsCstCode) ||
          normalizeDigits(product?.cofinsCstCode) ||
          "49",
        cofinsRate: Number(rule.cofinsRate ?? product?.cofinsRate ?? 0),
        ipiCstCode:
          normalizeDigits(rule.ipiCstCode) ||
          normalizeDigits(product?.ipiCstCode),
        ipiFrameworkCode:
          normalizeDigits(rule.ipiFrameworkCode) ||
          normalizeDigits(product?.ipiFrameworkCode),
        ipiRate: Number(rule.ipiRate ?? product?.ipiRate ?? 0),
        ibsCbsEnabled: Boolean(rule.ibsCbsEnabled && allowIbsCbs),
        ibsCbsCstCode:
          normalizeDigits(rule.ibsCbsCstCode) ||
          normalizeDigits(product?.ibsCbsCstCode),
        ibsCbsClassCode:
          normalizeDigits(rule.ibsCbsClassCode) ||
          normalizeDigits(product?.ibsCbsClassCode),
        ibsStateRate: Number(rule.ibsStateRate || 0),
        ibsMunicipalRate: Number(rule.ibsMunicipalRate || 0),
        cbsRate: Number(rule.cbsRate || 0),
      };
    });
  }

  private buildPayments(sale: any) {
    const sorted = [...sale.payments].sort((left: any, right: any) => {
      const rank = (payment: any) => {
        const method = normalizeText(payment.paymentMethod);
        if (method === "PIX") return 0;
        if (["CREDIT_CARD", "DEBIT_CARD"].includes(method || "")) return 1;
        return 2;
      };
      return rank(left) - rank(right);
    });
    return sorted.map((payment: any) => {
      const method = normalizeText(payment.paymentMethod) || "";
      const methodCode = PAYMENT_CODES[method];
      if (!methodCode) {
        throw new BadRequestException(
          `Forma de pagamento sem código fiscal: ${payment.paymentMethod}.`,
        );
      }
      return {
        indicator: (["TERM", "INSTALLMENT"].includes(method)
          ? "1"
          : "0") as "0" | "1",
        methodCode,
        amount: Number(payment.amount || 0),
        ...(["03", "04"].includes(methodCode)
          ? {
              cardIntegrationType: (payment.superTefPaymentId
                ? "1"
                : "2") as "1" | "2",
            }
          : {}),
      };
    });
  }

  private buildInstallments(sale: any) {
    return sale.payments
      .filter(
        (payment: any) =>
          ["TERM", "INSTALLMENT"].includes(
            normalizeText(payment.paymentMethod) || "",
          ) && payment.dueDate,
      )
      .map((payment: any, index: number) => ({
        number: String(index + 1).padStart(3, "0"),
        dueDate: payment.dueDate.toISOString().slice(0, 10),
        amount: Number(payment.amount || 0),
      }));
  }

  private async allocateDocument(
    sale: any,
    profile: any,
    operation: any,
    recipientPartyId?: string | null,
    requestedBy?: string | null,
    identity?: NfeIssueIdentity,
  ) {
    const source: NfeIssueIdentity = identity || {
      saleId: sale.id,
      sourceSystem: sale.sourceSystem,
      sourceTenantId: sale.sourceTenantId,
      sourceEntityType: "SALE",
      sourceEntityId: sale.id,
    };
    const existing = source.saleId
      ? await this.prisma.fiscalDocument.findUnique({
          where: { saleId: source.saleId },
        })
      : await this.prisma.fiscalDocument.findFirst({
          where: {
            companyId: sale.companyId,
            branchCode: sale.branchCode,
            idempotencyKey: normalizeText(source.idempotencyKey),
            canceledAt: null,
          },
        });
    if (existing) {
      if (existing.model !== NFE_MODEL) {
        throw new BadRequestException(
          "A origem já possui outro documento fiscal vinculado.",
        );
      }
      return existing;
    }
    return this.prisma.$transaction(async (tx: any) => {
      const concurrent = source.saleId
        ? await tx.fiscalDocument.findUnique({
            where: { saleId: source.saleId },
          })
        : await tx.fiscalDocument.findFirst({
            where: {
              companyId: sale.companyId,
              branchCode: sale.branchCode,
              idempotencyKey: normalizeText(source.idempotencyKey),
            },
          });
      if (concurrent) {
        if (concurrent.model !== NFE_MODEL) {
          throw new BadRequestException(
            "A origem já possui outro documento fiscal vinculado.",
          );
        }
        return concurrent;
      }
      const currentProfile = await tx.nfeProfile.findUnique({
        where: { id: profile.id },
      });
      if (
        !currentProfile ||
        currentProfile.canceledAt ||
        currentProfile.status !== "ACTIVE"
      ) {
        throw new BadRequestException("O perfil NF-e não está ativo.");
      }
      const number = currentProfile.nextNumber;
      await tx.nfeProfile.update({
        where: { id: currentProfile.id },
        data: {
          nextNumber: { increment: 1 },
          updatedBy: requestedBy || null,
        },
      });
      const document = await tx.fiscalDocument.create({
        data: {
          companyId: sale.companyId,
          branchCode: sale.branchCode,
          saleId: source.saleId || null,
          receivableTitleId: sale.receivableTitleId || null,
          sourceSystem: normalizeText(source.sourceSystem),
          sourceTenantId: normalizeText(source.sourceTenantId),
          sourceEntityType: normalizeText(source.sourceEntityType),
          sourceEntityId: normalizeText(source.sourceEntityId),
          idempotencyKey: normalizeText(source.idempotencyKey),
          receivablePlanJson: serializeManualFiscalReceivablePlan(
            source.receivablePlan || null,
          ),
          nfeProfileId: profile.id,
          operationNatureId: operation.id,
          recipientPartyId: recipientPartyId || null,
          certificateId: profile.certificateId,
          model: NFE_MODEL,
          environment: profile.environment,
          series: profile.series,
          number,
          status: "PENDING",
          operationNatureSnapshot: operation.name,
          schemaVersion: profile.schemaVersion,
          issuedAt: new Date(),
          createdBy: requestedBy || null,
          updatedBy: requestedBy || null,
        },
      });
      await tx.fiscalAuditEvent.create({
        data: this.auditData({
          companyId: sale.companyId,
          branchCode: sale.branchCode,
          entityType: "FISCAL_DOCUMENT",
          entityId: document.id,
          action: "ALLOCATE_NUMBER",
          summary: `NF-E ${number}/${profile.series} ALOCADA PARA ${sale.saleNumber}`,
          after: {
            model: NFE_MODEL,
            series: profile.series,
            number,
            saleId: source.saleId || null,
            sourceEntityType: source.sourceEntityType,
            sourceEntityId: source.sourceEntityId,
            idempotencyKey: source.idempotencyKey || null,
          },
          performedBy: requestedBy,
        }),
      });
      return document;
    });
  }

  private async reallocateNumberAfterDuplicate(
    document: any,
    profile: any,
    requestedBy?: string | null,
  ) {
    return this.prisma.$transaction(async (tx: any) => {
      const currentProfile = await tx.nfeProfile.findUnique({
        where: { id: profile.id },
      });
      if (
        !currentProfile ||
        currentProfile.status !== "ACTIVE" ||
        currentProfile.canceledAt
      ) {
        throw new BadRequestException(
          "O perfil NF-e não está ativo para reconciliar a numeração.",
        );
      }
      const nextNumber = currentProfile.nextNumber;
      await tx.nfeProfile.update({
        where: { id: currentProfile.id },
        data: {
          nextNumber: { increment: 1 },
          updatedBy: requestedBy || null,
        },
      });
      const updated = await tx.fiscalDocument.update({
        where: { id: document.id },
        data: {
          number: nextNumber,
          randomCode: null,
          accessKey: null,
          status: "PENDING",
          statusCode: null,
          statusMessage: null,
          protocol: null,
          receivedAt: null,
          issuedAt: new Date(),
          signedXml: null,
          responseXml: null,
          processedXml: null,
          danfeFileName: null,
          danfePdfBlob: null,
          danfeGeneratedAt: null,
          lastError: null,
          updatedBy: requestedBy || null,
        },
      });
      await tx.fiscalAuditEvent.create({
        data: this.auditData({
          companyId: document.companyId,
          branchCode: document.branchCode,
          entityType: "FISCAL_DOCUMENT",
          entityId: document.id,
          action: "REALLOCATE_NUMBER",
          summary: `NUMERAÇÃO NF-E RECONCILIADA DE ${document.number} PARA ${nextNumber} APÓS DUPLICIDADE`,
          before: {
            series: document.series,
            number: document.number,
            statusCode: document.statusCode,
          },
          after: {
            series: updated.series,
            number: updated.number,
          },
          performedBy: requestedBy,
        }),
      });
      return updated;
    });
  }

  private async persistPreparedDocument(
    document: any,
    sale: any,
    profile: any,
    operation: any,
    issuer: any,
    recipient: any,
    built: any,
    payments: any[],
    installments: any[],
    requestedBy?: string | null,
  ) {
    return this.prisma.$transaction(async (tx: any) => {
      const updated = await tx.fiscalDocument.update({
        where: { id: document.id },
        data: {
          randomCode: built.randomCode,
          accessKey: built.accessKey,
          operationNatureSnapshot: operation.name,
          issuerSnapshotJson: serializeJson(issuer),
          recipientSnapshotJson: serializeJson(recipient),
          totalsSnapshotJson: serializeJson(built.totals),
          paymentSnapshotJson: serializeJson(payments),
          schemaVersion: profile.schemaVersion,
          status: "PROCESSING",
          lastAttemptAt: new Date(),
          updatedBy: requestedBy || null,
        },
      });
      for (const item of built.items) {
        await tx.fiscalDocumentItem.upsert({
          where: {
            fiscalDocumentId_lineNumber: {
              fiscalDocumentId: document.id,
              lineNumber: item.lineNumber,
            },
          },
          create: {
            companyId: sale.companyId,
            fiscalDocumentId: document.id,
            productId: item.productId || null,
            lineNumber: item.lineNumber,
            productCode: item.code,
            description: item.description,
            ncmCode: item.ncmCode,
            cestCode: item.cestCode || null,
            cfopCode: item.cfopCode,
            unitCode: item.unitCode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            grossAmount: item.grossAmount,
            discountAmount: item.discountAmount,
            totalAmount: item.totalAmount,
            originCode: item.originCode,
            icmsCode:
              item.icmsCsosnCode || item.icmsCstCode || "",
            pisCstCode: item.pisCstCode,
            cofinsCstCode: item.cofinsCstCode,
            fiscalBenefitCode: item.fiscalBenefitCode || null,
            taxDetailsJson: JSON.stringify(item.taxDetails),
            createdBy: requestedBy || null,
            updatedBy: requestedBy || null,
          },
          update: {
            productId: item.productId || null,
            productCode: item.code,
            description: item.description,
            ncmCode: item.ncmCode,
            cestCode: item.cestCode || null,
            cfopCode: item.cfopCode,
            unitCode: item.unitCode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            grossAmount: item.grossAmount,
            discountAmount: item.discountAmount,
            totalAmount: item.totalAmount,
            originCode: item.originCode,
            icmsCode:
              item.icmsCsosnCode || item.icmsCstCode || "",
            pisCstCode: item.pisCstCode,
            cofinsCstCode: item.cofinsCstCode,
            fiscalBenefitCode: item.fiscalBenefitCode || null,
            taxDetailsJson: JSON.stringify(item.taxDetails),
            updatedBy: requestedBy || null,
          },
        });
      }
      for (const [index, installment] of installments.entries()) {
        await tx.fiscalDocumentInstallment.upsert({
          where: {
            fiscalDocumentId_installmentNumber: {
              fiscalDocumentId: document.id,
              installmentNumber: index + 1,
            },
          },
          create: {
            companyId: sale.companyId,
            fiscalDocumentId: document.id,
            installmentNumber: index + 1,
            reference: installment.number,
            dueDate: new Date(`${installment.dueDate}T12:00:00-03:00`),
            amount: installment.amount,
            createdBy: requestedBy || null,
            updatedBy: requestedBy || null,
          },
          update: {
            reference: installment.number,
            dueDate: new Date(`${installment.dueDate}T12:00:00-03:00`),
            amount: installment.amount,
            updatedBy: requestedBy || null,
          },
        });
      }
      return updated;
    });
  }

  private async saveArtifacts(
    updated: any,
    sale: any,
    operation: any,
    issuer: any,
    recipient: any,
    built: any,
    installments: any[],
    additionalInformation: string,
    requestedBy?: string | null,
  ) {
    if (!updated.processedXml || !updated.protocol) return updated;
    const danfe = await this.danfeService.generate({
      environment: updated.environment,
      accessKey: updated.accessKey!,
      protocol: updated.protocol,
      receivedAt: updated.receivedAt,
      series: updated.series,
      number: updated.number,
      issuedAt: updated.issuedAt,
      operationNature: operation.name,
      issuer: {
        legalName: issuer.legalName,
        tradeName: issuer.tradeName,
        document: issuer.cnpj,
        stateRegistration: issuer.stateRegistration,
        street: issuer.street,
        number: issuer.number,
        neighborhood: issuer.neighborhood,
        city: issuer.city,
        state: issuer.state,
        postalCode: issuer.postalCode,
        phone: issuer.phone,
      },
      recipient: {
        name:
          updated.environment === "HOMOLOGATION"
            ? HOMOLOGATION_RECIPIENT_NAME
            : recipient.name,
        document: recipient.document,
        street: recipient.street,
        number: recipient.number,
        neighborhood: recipient.neighborhood,
        city: recipient.city,
        state: recipient.state,
        postalCode: recipient.postalCode,
        email: recipient.email,
      },
      items: built.items.map((item: any) => ({
        code: item.code,
        description: item.description,
        ncmCode: item.ncmCode,
        cfopCode: item.cfopCode,
        unitCode: item.unitCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalAmount: item.totalAmount,
        icmsCode: item.icmsCsosnCode || item.icmsCstCode || "",
      })),
      totals: built.totals,
      installments,
      additionalInformation,
    });
    const fileName = `DANFE-NFE-${updated.accessKey}.pdf`;
    const issueDate = updated.issuedAt as Date;
    const artifactDirectory = path.resolve(
      process.cwd(),
      "storage",
      "nfe",
      sale.companyId,
      String(sale.branchCode),
      String(issueDate.getFullYear()),
      String(issueDate.getMonth() + 1).padStart(2, "0"),
    );
    await fs.mkdir(artifactDirectory, { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(artifactDirectory, fileName), danfe),
      fs.writeFile(
        path.join(artifactDirectory, `NFE-${updated.accessKey}.xml`),
        updated.processedXml,
        "utf8",
      ),
    ]);
    return this.prisma.$transaction(async (tx: any) => {
      const saved = await tx.fiscalDocument.update({
        where: { id: updated.id },
        data: {
          danfeFileName: fileName,
          danfePdfBlob: danfe,
          danfeGeneratedAt: new Date(),
          updatedBy: requestedBy || null,
        },
      });
      await tx.fiscalAuditEvent.create({
        data: this.auditData({
          companyId: sale.companyId,
          branchCode: sale.branchCode,
          entityType: "FISCAL_DOCUMENT",
          entityId: updated.id,
          action: "GENERATE_ARTIFACTS",
          summary: "XML PROCESSADO E DANFE ARMAZENADOS",
          after: {
            fileName,
            accessKey: updated.accessKey,
          },
          performedBy: requestedBy,
        }),
      });
      return saved;
    });
  }

  private async sendAuthorizedEmailIfEnabled(
    document: any,
    profile: any,
    requestedBy?: string | null,
  ) {
    if (
      !profile?.sendEmailToRecipient ||
      document?.status !== "AUTHORIZED" ||
      !document?.danfePdfBlob ||
      !document?.processedXml
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
      // A falha de e-mail fica auditada e não pode desfazer a autorização fiscal.
      return {
        status: "ERROR",
        errorMessage:
          normalizeText(errorMessage(error)) ||
          "NF-E AUTORIZADA, MAS O E-MAIL NÃO FOI ENVIADO.",
      };
    }
  }

  private async issue(
    sale: any,
    profile: any,
    operationNatureId?: string | null,
    requestedBy?: string | null,
    duplicateRetryCount = 0,
    identity?: NfeIssueIdentity,
  ): Promise<any> {
    const operation = await this.loadOperation(
      sale.companyId,
      sale.branchCode,
      profile,
      operationNatureId,
    );
    const { branch, issuer } = await this.loadIssuer(
      sale.companyId,
      sale.branchCode,
    );
    const { partyId, recipient } = this.buildRecipient(sale);
    if (partyId) {
      await setPartyRoleActive(this.prisma, {
        companyId: sale.companyId,
        partyId,
        branchCode: sale.branchCode,
        roleType: PARTY_ROLE.RECIPIENT,
        active: true,
        requestedBy,
      });
    }
    let document = await this.allocateDocument(
      sale,
      profile,
      operation,
      partyId,
      requestedBy,
      identity,
    );
    if (document.status === "AUTHORIZED") {
      const emailDelivery = await this.sendAuthorizedEmailIfEnabled(
        document,
        profile,
        requestedBy,
      );
      return {
        ...this.mapDocument(document),
        ...(emailDelivery ? { emailDelivery } : {}),
      };
    }
    if (document.statusCode === "539") {
      document = await this.reallocateNumberAfterDuplicate(
        document,
        profile,
        requestedBy,
      );
    }
    const certificate = profile.certificate;
    if (
      !certificate ||
      certificate.status !== "ACTIVE" ||
      certificate.canceledAt
    ) {
      throw new BadRequestException(
        "O certificado A1 do perfil NF-e não está ativo.",
      );
    }
    if (certificate.validTo && certificate.validTo.getTime() <= Date.now()) {
      throw new BadRequestException("O certificado A1 do perfil NF-e está vencido.");
    }
    const pfxBase64 = decryptSecret(certificate.pfxEncryptedBase64);
    const passphrase = decryptSecret(certificate.passwordEncrypted);
    const certificateMaterial = loadNfceCertificateMaterial(
      pfxBase64,
      passphrase,
    );
    assertNfceCertificateMatchesIssuer(certificateMaterial, issuer.cnpj);
    const items = await this.buildItems(
      sale,
      operation,
      issuer.taxRegimeCode,
      document.issuedAt,
    );
    const payments = this.buildPayments(sale);
    const installments = this.buildInstallments(sale);
    const simpleNationalInformation = ["1", "2", "4"].includes(
      issuer.taxRegimeCode,
    )
      ? "DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL. NAO GERA DIREITO A CREDITO FISCAL DE IPI."
      : "";
    const additionalInformation = [
      simpleNationalInformation,
      profile.additionalInformation,
      operation.additionalInformation,
      `VENDA ${sale.saleNumber}`,
    ]
      .filter(Boolean)
      .join(" | ");
    const built = buildNfeXml({
      environment: profile.environment as NfeEnvironment,
      issuer,
      recipient,
      operationNature: operation.name,
      operationType: operation.operationType === "INBOUND" ? "0" : "1",
      destinationType:
        operation.destinationType === "FOREIGN"
          ? "3"
          : operation.destinationType === "INTERSTATE"
            ? "2"
            : "1",
      purposeCode: operation.purposeCode,
      finalConsumer: operation.finalConsumer,
      presenceIndicator: operation.presenceIndicator,
      intermediaryIndicator: operation.intermediaryIndicator,
      freightMode: operation.freightMode,
      series: document.series,
      number: document.number,
      issuedAt: document.issuedAt,
      randomCode: document.randomCode || undefined,
      items,
      payments,
      installments,
      invoiceReference: sale.saleNumber,
      additionalInformation,
      softwareVersion: profile.softwareVersion,
      technicalResponsible:
        profile.technicalResponsibleCnpj &&
        profile.technicalResponsibleName &&
        profile.technicalResponsibleEmail &&
        profile.technicalResponsiblePhone
          ? {
              cnpj: profile.technicalResponsibleCnpj,
              contact: profile.technicalResponsibleName,
              email: profile.technicalResponsibleEmail,
              phone: profile.technicalResponsiblePhone,
              csrtId: profile.csrtId,
              csrtHash: profile.csrtHash,
            }
          : null,
    });
    document = await this.persistPreparedDocument(
      document,
      sale,
      profile,
      operation,
      issuer,
      recipient,
      built,
      payments,
      installments,
      requestedBy,
    );
    const attemptNumber = document.attemptCount + 1;
    try {
      let result: any = null;
      if (document.signedXml && document.accessKey) {
        const queried = await queryNfeProtocol({
          environment: profile.environment,
          accessKey: document.accessKey,
          signedXml: document.signedXml,
          certificate: certificateMaterial,
        });
        if (queried.authorized) {
          result = { ...queried, signedXml: document.signedXml };
        }
      }
      if (!result) {
        result = await authorizeNfe({
          environment: profile.environment,
          accessKey: built.accessKey,
          unsignedXml: built.unsignedXml,
          certificate: certificateMaterial,
        });
      }
      const status = result.authorized ? "AUTHORIZED" : "REJECTED";
      const receivedAt = result.receivedAt
        ? new Date(result.receivedAt)
        : null;
      let updated = await this.prisma.$transaction(async (tx: any) => {
        await tx.fiscalDocumentAttempt.create({
          data: {
            companyId: sale.companyId,
            fiscalDocumentId: document.id,
            attemptNumber,
            status,
            statusCode: result.statusCode,
            statusMessage: normalizeText(result.statusMessage),
            signedXml: result.signedXml,
            responseXml: result.responseXml,
            processedXml: result.processedXml,
            attemptedAt: new Date(),
            createdBy: requestedBy || null,
            updatedBy: requestedBy || null,
          },
        });
        const saved = await tx.fiscalDocument.update({
          where: { id: document.id },
          data: {
            status,
            statusCode: result.statusCode,
            statusMessage: normalizeText(result.statusMessage),
            protocol: result.protocol,
            receivedAt,
            signedXml: result.signedXml,
            responseXml: result.responseXml,
            processedXml: result.processedXml,
            attemptCount: attemptNumber,
            lastAttemptAt: new Date(),
            lastError: null,
            updatedBy: requestedBy || null,
          },
        });
        await tx.fiscalAuditEvent.create({
          data: this.auditData({
            companyId: sale.companyId,
            branchCode: sale.branchCode,
            entityType: "FISCAL_DOCUMENT",
            entityId: document.id,
            action: result.authorized ? "AUTHORIZE" : "REJECT",
            summary: result.authorized
              ? "NF-E AUTORIZADA PELA SEFAZ-SP"
              : "NF-E REJEITADA PELA SEFAZ-SP",
            after: {
              statusCode: result.statusCode,
              statusMessage: result.statusMessage,
              protocol: result.protocol,
              accessKey: built.accessKey,
            },
            performedBy: requestedBy,
          }),
        });
        return saved;
      });
      let emailDelivery: any = null;
      if (result.authorized) {
        updated = await this.saveArtifacts(
          updated,
          sale,
          operation,
          issuer,
          recipient,
          built,
          installments,
          additionalInformation,
          requestedBy,
        );
        emailDelivery = await this.sendAuthorizedEmailIfEnabled(
          updated,
          profile,
          requestedBy,
        );
      }
      if (
        !result.authorized &&
        result.statusCode === "539" &&
        duplicateRetryCount < 20
      ) {
        return this.issue(
          sale,
          profile,
          operation.id,
          requestedBy,
          duplicateRetryCount + 1,
          identity,
        );
      }
      return {
        ...this.mapDocument(updated),
        ...(emailDelivery ? { emailDelivery } : {}),
      };
    } catch (error) {
      const message =
        normalizeText(errorMessage(error)) || "ERRO NA EMISSÃO DA NF-E";
      const updated = await this.prisma.$transaction(async (tx: any) => {
        await tx.fiscalDocumentAttempt.create({
          data: {
            companyId: sale.companyId,
            fiscalDocumentId: document.id,
            attemptNumber,
            status: "ERROR",
            errorMessage: message,
            attemptedAt: new Date(),
            createdBy: requestedBy || null,
            updatedBy: requestedBy || null,
          },
        });
        const saved = await tx.fiscalDocument.update({
          where: { id: document.id },
          data: {
            status: "ERROR",
            attemptCount: attemptNumber,
            lastAttemptAt: new Date(),
            lastError: message,
            updatedBy: requestedBy || null,
          },
        });
        await tx.fiscalAuditEvent.create({
          data: this.auditData({
            companyId: sale.companyId,
            branchCode: sale.branchCode,
            entityType: "FISCAL_DOCUMENT",
            entityId: document.id,
            action: "ERROR",
            summary: "ERRO NA EMISSÃO DA NF-E",
            after: { error: message },
            performedBy: requestedBy,
          }),
        });
        return saved;
      });
      return this.mapDocument(updated);
    }
  }

  private async recordSetupError(
    sale: any,
    requestedBy: string | null | undefined,
    error: unknown,
    identity?: NfeIssueIdentity,
  ) {
    const document = identity?.saleId || !identity
      ? await this.prisma.fiscalDocument.findUnique({
          where: { saleId: identity?.saleId || sale.id },
        })
      : await this.prisma.fiscalDocument.findFirst({
          where: {
            companyId: sale.companyId,
            branchCode: sale.branchCode,
            idempotencyKey: normalizeText(identity.idempotencyKey),
          },
        });
    const message =
      normalizeText(errorMessage(error)) || "ERRO NA PREPARAÇÃO DA NF-E";
    if (!document || document.status === "AUTHORIZED") {
      return { status: "ERROR", statusMessage: message, lastError: message };
    }
    const attemptNumber = document.attemptCount + 1;
    const updated = await this.prisma.$transaction(async (tx: any) => {
      await tx.fiscalDocumentAttempt.create({
        data: {
          companyId: sale.companyId,
          fiscalDocumentId: document.id,
          attemptNumber,
          status: "ERROR",
          errorMessage: message,
          attemptedAt: new Date(),
          createdBy: requestedBy || null,
          updatedBy: requestedBy || null,
        },
      });
      return tx.fiscalDocument.update({
        where: { id: document.id },
        data: {
          status: "ERROR",
          attemptCount: attemptNumber,
          lastAttemptAt: new Date(),
          lastError: message,
          updatedBy: requestedBy || null,
        },
      });
    });
    return this.mapDocument(updated);
  }

  async getManualOverview(query: NfeContextDto) {
    this.assertOperator(query);
    const company = await this.loadCompany(
      query.sourceSystem,
      query.sourceTenantId,
    );
    const branchCode = this.branchCode(query.sourceBranchCode);
    const environment = normalizeText(query.environment) || "HOMOLOGATION";
    const [branch, profile, operations, parties, products, documents] =
      await Promise.all([
        this.prisma.companyBranch.findFirst({
          where: {
            companyId: company.id,
            branchCode,
            isActive: true,
            canceledAt: null,
          },
        }),
        this.loadProfile(company.id, branchCode, environment),
        this.prisma.fiscalOperationNature.findMany({
          where: {
            companyId: company.id,
            branchCode,
            documentModel: NFE_MODEL,
            status: "ACTIVE",
            canceledAt: null,
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
        this.prisma.product.findMany({
          where: {
            companyId: company.id,
            branchCode,
            status: "ACTIVE",
            canceledAt: null,
            productType: "GOODS",
          },
          orderBy: [{ name: "asc" }],
          take: 500,
        }),
        this.prisma.fiscalDocument.findMany({
          where: {
            companyId: company.id,
            branchCode,
            model: NFE_MODEL,
            sourceEntityType: "MANUAL_NFE",
            canceledAt: null,
          },
          include: {
            recipientParty: true,
            receivableTitle: true,
          },
          orderBy: { issuedAt: "desc" },
          take: 30,
        }),
      ]);
    const certificateReady = Boolean(
      profile?.certificate &&
        profile.certificate.status === "ACTIVE" &&
        !profile.certificate.canceledAt &&
        (!profile.certificate.validTo ||
          profile.certificate.validTo.getTime() > Date.now()),
    );
    const readinessChecks = [
      {
        code: "BRANCH",
        ok: Boolean(branch),
        label: "FILIAL EMITENTE",
        message: "CADASTRE UMA FILIAL EMITENTE ATIVA.",
      },
      {
        code: "PROFILE",
        ok: Boolean(profile),
        label: "PERFIL NF-E",
        message: "CONFIGURE UM PERFIL NF-E ATIVO PARA O AMBIENTE.",
      },
      {
        code: "CERTIFICATE",
        ok: certificateReady,
        label: "CERTIFICADO A1",
        message: "VINCULE UM CERTIFICADO A1 ATIVO AO PERFIL NF-E.",
      },
      {
        code: "OPERATION",
        ok: operations.length > 0,
        label: "NATUREZA DE OPERAÇÃO",
        message: "CADASTRE UMA NATUREZA DE OPERAÇÃO NF-E ATIVA.",
      },
      {
        code: "PRODUCT",
        ok: products.length > 0,
        label: "PRODUTOS FISCAIS",
        message: "CADASTRE AO MENOS UM PRODUTO FISCAL ATIVO.",
      },
      {
        code: "PAYER",
        ok: parties.length > 0,
        label: "PAGADOR / DESTINATÁRIO",
        message: "SINCRONIZE AO MENOS UM PAGADOR COM CPF/CNPJ.",
      },
    ];
    return {
      company: {
        id: company.id,
        name: company.name,
      },
      branch: branch
        ? {
            id: branch.id,
            branchCode: branch.branchCode,
            name: branch.name,
            fiscalLegalName: branch.fiscalLegalName,
            fiscalDocument: branch.fiscalDocument,
          }
        : null,
      profile: profile
        ? {
            id: profile.id,
            environment: profile.environment,
            series: profile.series,
            nextNumber: profile.nextNumber,
          }
        : null,
      operations: operations.map((operation) => ({
        id: operation.id,
        code: operation.code,
        name: operation.name,
        cfopCode: operation.cfopCode,
        destinationType: operation.destinationType,
        isDefault: operation.isDefault,
      })),
      parties: parties.map((party) => ({
        id: party.id,
        name: party.name,
        document: party.document,
        email: party.email,
        city: party.city,
        state: party.state,
      })),
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        internalCode: product.internalCode,
        unitCode: product.unitCode,
        salePrice: product.salePrice,
        ncmCode: product.ncmCode,
        fiscalDescription: product.fiscalDescription,
      })),
      documents: documents.map((document) => ({
        ...this.mapDocument(document),
        recipientName: document.recipientParty?.name || null,
        hasReceivable: Boolean(document.receivableTitleId),
      })),
      readiness: {
        ready: readinessChecks.every((check) => check.ok),
        checks: readinessChecks,
      },
    };
  }

  private async buildManualSale(
    company: any,
    branchCode: number,
    payload: IssueManualNfeDto,
  ) {
    const idempotencyKey = normalizeText(payload.idempotencyKey);
    if (!idempotencyKey) {
      throw new BadRequestException("INFORME A CHAVE DE IDEMPOTÊNCIA.");
    }
    const party = await this.prisma.party.findFirst({
      where: {
        id: String(payload.payerPartyId || "").trim(),
        companyId: company.id,
        canceledAt: null,
        ...activePartyRoleWhere(branchCode, [
          PARTY_ROLE.CUSTOMER,
          PARTY_ROLE.PAYER,
          PARTY_ROLE.TAKER,
          PARTY_ROLE.RECIPIENT,
        ]),
      },
    });
    if (!party) {
      throw new NotFoundException(
        "PAGADOR / DESTINATÁRIO NÃO ENCONTRADO NESTA FILIAL.",
      );
    }

    const productIds = Array.from(
      new Set(payload.items.map((item) => String(item.productId || "").trim())),
    );
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        companyId: company.id,
        branchCode,
        status: "ACTIVE",
        canceledAt: null,
        productType: "GOODS",
      },
    });
    const productMap = new Map(products.map((product) => [product.id, product]));
    const items = payload.items.map((input, index) => {
      const product = productMap.get(String(input.productId || "").trim());
      if (!product) {
        throw new NotFoundException(
          `PRODUTO DA LINHA ${index + 1} NÃO ENCONTRADO NESTA FILIAL.`,
        );
      }
      const quantity = Number(input.quantity);
      const unitPrice = roundMoney(input.unitPrice);
      const grossAmount = roundMoney(quantity * unitPrice);
      const discountAmount = roundMoney(input.discountAmount || 0);
      const totalAmount = roundMoney(grossAmount - discountAmount);
      if (
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        unitPrice <= 0 ||
        discountAmount < 0 ||
        totalAmount <= 0
      ) {
        throw new BadRequestException(
          `REVISE QUANTIDADE, PREÇO E DESCONTO DA LINHA ${index + 1}.`,
        );
      }
      return {
        id: `${idempotencyKey}:${index + 1}`,
        companyId: company.id,
        branchCode,
        productId: product.id,
        lineNumber: index + 1,
        productNameSnapshot: product.name,
        productCodeSnapshot: product.internalCode,
        unitCodeSnapshot: product.unitCode,
        quantity,
        unitPrice,
        discountAmount,
        totalAmount,
        product,
      };
    });
    const subtotalAmount = roundMoney(
      items.reduce(
        (sum, item) => sum + roundMoney(item.quantity * item.unitPrice),
        0,
      ),
    );
    const discountAmount = roundMoney(
      items.reduce((sum, item) => sum + item.discountAmount, 0),
    );
    const totalAmount = roundMoney(subtotalAmount - discountAmount);
    const receivablePlan = normalizeManualFiscalReceivablePlan(
      payload.createReceivable,
      totalAmount,
      payload.installments,
    );
    const payments = receivablePlan
      ? receivablePlan.installments.map((installment) => ({
          paymentMethod: "INSTALLMENT",
          amount: installment.amount,
          dueDate: installment.dueDate,
          status: "OPEN",
        }))
      : [
          {
            paymentMethod: payload.paymentMethod,
            amount: totalAmount,
            dueDate: null,
            status: "REGISTERED",
          },
        ];
    const sourceEntityId = idempotencyKey;
    const sale = {
      id: null,
      companyId: company.id,
      branchCode,
      sourceSystem: normalizeText(payload.sourceSystem)!,
      sourceTenantId: normalizeText(payload.sourceTenantId)!,
      saleNumber: `MANUAL-${idempotencyKey.slice(0, 24)}`,
      customerPartyId: party.id,
      customerParty: party,
      customerNameSnapshot: party.name,
      customerDocumentSnapshot: party.document,
      receivableTitleId: null,
      receivableTitle: null,
      subtotalAmount,
      discountAmount,
      totalAmount,
      notes: normalizeText(payload.notes),
      items,
      payments,
    };
    const identity: NfeIssueIdentity = {
      saleId: null,
      sourceSystem: sale.sourceSystem,
      sourceTenantId: sale.sourceTenantId,
      sourceEntityType: "MANUAL_NFE",
      sourceEntityId,
      idempotencyKey,
      receivablePlan,
    };
    return { sale, party, receivablePlan, identity };
  }

  async issueManual(payload: IssueManualNfeDto) {
    this.assertOperator(payload);
    const company = await this.loadCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const branchCode = this.branchCode(payload.sourceBranchCode);
    const profile = await this.loadProfile(
      company.id,
      branchCode,
      normalizeText(payload.environment),
    );
    if (!profile) {
      throw new BadRequestException(
        "PERFIL NF-E ATIVO NÃO CONFIGURADO PARA ESTA FILIAL E AMBIENTE.",
      );
    }
    const { sale, party, receivablePlan, identity } =
      await this.buildManualSale(company, branchCode, payload);
    let result: any;
    try {
      result = await this.issue(
        sale,
        profile,
        payload.operationNatureId,
        payload.requestedBy,
        0,
        identity,
      );
    } catch (error) {
      return this.recordSetupError(
        sale,
        payload.requestedBy,
        error,
        identity,
      );
    }

    if (result.status === "AUTHORIZED" && receivablePlan && result.id) {
      try {
        const receivable =
          await this.manualReceivableService.ensureForAuthorizedDocument({
            documentKind: "NFE",
            documentId: result.id,
            companyId: company.id,
            branchCode,
            sourceSystem: payload.sourceSystem,
            sourceTenantId: payload.sourceTenantId,
            payerPartyId: party.id,
            documentReference: `${result.number}/${result.series}`,
            plan: receivablePlan,
            requestedBy: payload.requestedBy,
          });
        result = {
          ...result,
          receivableTitleId: receivable.id,
          receivable,
        };
      } catch (error) {
        result = {
          ...result,
          receivable: {
            status: "ERROR",
            errorMessage: errorMessage(error),
          },
        };
      }
    }
    return result;
  }

  async issueForSaleAfterConfirmation(
    companyId: string,
    saleId: string,
    requestedBy?: string | null,
  ) {
    const sale = await this.loadSale(companyId, saleId);
    if (
      sale.payments.some(
        (payment: any) =>
          normalizeText(payment.paymentMethod) === "PIX" &&
          normalizeText(payment.status) !== "PAID",
      )
    ) {
      return {
        status: "PENDING_PAYMENT",
        statusMessage:
          "A NF-E SERÁ EMITIDA APÓS A CONFIRMAÇÃO DO PIX.",
      };
    }
    const profile = await this.loadProfile(
      companyId,
      sale.branchCode,
      null,
      true,
    );
    if (!profile) {
      return {
        status: "NOT_CONFIGURED",
        statusMessage:
          "EMISSÃO AUTOMÁTICA DE NF-E NÃO CONFIGURADA PARA A EMPRESA E FILIAL.",
      };
    }
    try {
      return await this.issue(sale, profile, null, requestedBy);
    } catch (error) {
      return this.recordSetupError(sale, requestedBy, error);
    }
  }

  async issueSale(saleId: string, payload: IssueSaleNfeDto) {
    const company = await this.loadCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const sale = await this.loadSale(company.id, saleId);
    const branchCode = this.branchCode(
      payload.sourceBranchCode,
      sale.branchCode,
    );
    if (branchCode !== sale.branchCode) {
      throw new BadRequestException("A venda pertence a outra filial.");
    }
    const environment = normalizeText(payload.environment);
    const profile = await this.loadProfile(
      company.id,
      branchCode,
      environment,
    );
    if (!profile) {
      throw new BadRequestException(
        "Perfil NF-e ativo não configurado para esta venda.",
      );
    }
    try {
      return await this.issue(
        sale,
        profile,
        payload.operationNatureId,
        payload.requestedBy,
      );
    } catch (error) {
      return this.recordSetupError(sale, payload.requestedBy, error);
    }
  }

  async previewSale(saleId: string, payload: IssueSaleNfeDto) {
    const company = await this.loadCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const sale = await this.loadSale(company.id, saleId);
    const branchCode = this.branchCode(
      payload.sourceBranchCode,
      sale.branchCode,
    );
    if (branchCode !== sale.branchCode) {
      throw new BadRequestException("A venda pertence a outra filial.");
    }
    const profile = await this.loadProfile(
      company.id,
      branchCode,
      normalizeText(payload.environment),
    );
    if (!profile) {
      throw new BadRequestException(
        "Perfil NF-e ativo não configurado para esta venda.",
      );
    }
    const operation = await this.loadOperation(
      company.id,
      branchCode,
      profile,
      payload.operationNatureId,
    );
    const { issuer } = await this.loadIssuer(company.id, branchCode);
    const { recipient } = this.buildRecipient(sale);
    const issuedAt = new Date();
    const items = await this.buildItems(
      sale,
      operation,
      issuer.taxRegimeCode,
      issuedAt,
    );
    const payments = this.buildPayments(sale);
    const installments = this.buildInstallments(sale);
    const simpleNationalInformation = ["1", "2", "4"].includes(
      issuer.taxRegimeCode,
    )
      ? "DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL. NAO GERA DIREITO A CREDITO FISCAL DE IPI."
      : "";
    const additionalInformation = [
      simpleNationalInformation,
      profile.additionalInformation,
      operation.additionalInformation,
      `VENDA ${sale.saleNumber}`,
    ]
      .filter(Boolean)
      .join(" | ");
    const built = buildNfeXml({
      environment: profile.environment as NfeEnvironment,
      issuer,
      recipient,
      operationNature: operation.name,
      operationType: operation.operationType === "INBOUND" ? "0" : "1",
      destinationType:
        operation.destinationType === "FOREIGN"
          ? "3"
          : operation.destinationType === "INTERSTATE"
            ? "2"
            : "1",
      purposeCode: operation.purposeCode,
      finalConsumer: operation.finalConsumer,
      presenceIndicator: operation.presenceIndicator,
      intermediaryIndicator: operation.intermediaryIndicator,
      freightMode: operation.freightMode,
      series: profile.series,
      number: profile.nextNumber,
      issuedAt,
      items,
      payments,
      installments,
      invoiceReference: sale.saleNumber,
      additionalInformation,
      softwareVersion: profile.softwareVersion,
      technicalResponsible:
        profile.technicalResponsibleCnpj &&
        profile.technicalResponsibleName &&
        profile.technicalResponsibleEmail &&
        profile.technicalResponsiblePhone
          ? {
              cnpj: profile.technicalResponsibleCnpj,
              contact: profile.technicalResponsibleName,
              email: profile.technicalResponsibleEmail,
              phone: profile.technicalResponsiblePhone,
              csrtId: profile.csrtId,
              csrtHash: profile.csrtHash,
            }
          : null,
    });
    const certificateMaterial = this.certificateMaterial(
      profile,
      issuer.cnpj,
    );
    const signedXml = signNfeXmlForValidation(
      built.unsignedXml,
      certificateMaterial,
    );
    return {
      saleId: sale.id,
      environment: profile.environment,
      series: profile.series,
      number: profile.nextNumber,
      accessKey: built.accessKey,
      schemaVersion: profile.schemaVersion,
      cbenefCatalogVersion: profile.cbenefCatalogVersion,
      totals: built.totals,
      unsignedXml: built.unsignedXml,
      xml: signedXml,
    };
  }

  async getSaleDocument(saleId: string, query: NfeContextDto) {
    const company = await this.loadCompany(
      query.sourceSystem,
      query.sourceTenantId,
    );
    const document = await this.prisma.fiscalDocument.findFirst({
      where: {
        saleId: String(saleId || "").trim(),
        companyId: company.id,
        model: NFE_MODEL,
        canceledAt: null,
      },
      include: {
        attempts: {
          where: { canceledAt: null },
          orderBy: { attemptNumber: "asc" },
        },
        events: {
          where: { canceledAt: null },
          orderBy: [{ eventAt: "asc" }, { sequence: "asc" }],
        },
        items: {
          where: { canceledAt: null },
          orderBy: { lineNumber: "asc" },
        },
        installments: {
          where: { canceledAt: null },
          orderBy: { installmentNumber: "asc" },
        },
      },
    });
    if (!document) return null;
    return {
      ...this.mapDocument(document, true),
      attempts: document.attempts.map((attempt: any) => ({
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        statusCode: attempt.statusCode || null,
        statusMessage: attempt.statusMessage || null,
        errorMessage: attempt.errorMessage || null,
        attemptedAt: attempt.attemptedAt?.toISOString?.() || null,
      })),
      events: document.events.map((event: any) => ({
        id: event.id,
        eventType: event.eventType,
        sequence: event.sequence,
        status: event.status,
        statusCode: event.statusCode || null,
        statusMessage: event.statusMessage || null,
        protocol: event.protocol || null,
        eventAt: event.eventAt?.toISOString?.() || null,
      })),
      items: document.items,
      installments: document.installments.map((installment: any) => ({
        ...installment,
        dueDate: installment.dueDate?.toISOString?.().slice(0, 10),
      })),
    };
  }

  private async loadAuthorizedDocument(
    documentId: string,
    payload: NfeContextDto,
  ) {
    const company = await this.loadCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const document = await this.prisma.fiscalDocument.findFirst({
      where: {
        id: documentId,
        companyId: company.id,
        branchCode: this.branchCode(payload.sourceBranchCode),
        model: NFE_MODEL,
        status: { in: ["AUTHORIZED", "CANCELED"] },
        canceledAt: null,
      },
      include: {
        nfeProfile: { include: { certificate: true } },
      },
    });
    if (!document || !document.nfeProfile) {
      throw new NotFoundException("NF-E AUTORIZADA NÃO ENCONTRADA.");
    }
    return { company, document, profile: document.nfeProfile };
  }

  private certificateMaterial(profile: any, issuerCnpj: string) {
    const certificate = profile.certificate;
    if (
      !certificate ||
      certificate.status !== "ACTIVE" ||
      certificate.canceledAt
    ) {
      throw new BadRequestException("Certificado A1 do perfil não está ativo.");
    }
    const material = loadNfceCertificateMaterial(
      decryptSecret(certificate.pfxEncryptedBase64),
      decryptSecret(certificate.passwordEncrypted),
    );
    assertNfceCertificateMatchesIssuer(material, issuerCnpj);
    return material;
  }

  async cancelDocument(documentId: string, payload: CancelNfeDto) {
    const { document, profile } = await this.loadAuthorizedDocument(
      documentId,
      payload,
    );
    if (document.status === "CANCELED") return this.mapDocument(document);
    const justification = normalizeText(payload.justification)!;
    if (justification.length < 15 || justification.length > 255) {
      throw new BadRequestException(
        "A justificativa deve possuir entre 15 e 255 caracteres.",
      );
    }
    const { issuer } = await this.loadIssuer(
      document.companyId,
      document.branchCode,
    );
    const eventAt = new Date();
    const sequence = 1;
    const result = await sendNfeEvent({
      environment: document.environment as NfeEnvironment,
      stateCode: issuer.stateCode,
      issuerCnpj: issuer.cnpj,
      accessKey: document.accessKey!,
      eventType: "110111",
      sequence,
      eventAt: formatNfeDateTime(eventAt),
      protocol: document.protocol,
      justification,
      certificate: this.certificateMaterial(profile, issuer.cnpj),
    });
    return this.prisma.$transaction(async (tx: any) => {
      const event = await tx.fiscalDocumentEvent.create({
        data: {
          companyId: document.companyId,
          branchCode: document.branchCode,
          fiscalDocumentId: document.id,
          eventType: "CANCELLATION",
          sequence,
          status: result.authorized ? "AUTHORIZED" : "REJECTED",
          statusCode: result.statusCode,
          statusMessage: normalizeText(result.statusMessage),
          protocol: result.protocol,
          eventAt,
          justification,
          signedXml: result.signedXml,
          responseXml: result.responseXml,
          processedXml: result.processedXml,
          createdBy: payload.requestedBy || null,
          updatedBy: payload.requestedBy || null,
        },
      });
      const saved = await tx.fiscalDocument.update({
        where: { id: document.id },
        data: result.authorized
          ? {
              status: "CANCELED",
              statusCode: result.statusCode,
              statusMessage: normalizeText(result.statusMessage),
              updatedBy: payload.requestedBy || null,
            }
          : {
              statusCode: result.statusCode,
              statusMessage: normalizeText(result.statusMessage),
              updatedBy: payload.requestedBy || null,
            },
      });
      await tx.fiscalAuditEvent.create({
        data: this.auditData({
          companyId: document.companyId,
          branchCode: document.branchCode,
          entityType: "FISCAL_DOCUMENT_EVENT",
          entityId: event.id,
          action: result.authorized ? "CANCEL" : "REJECT_CANCELLATION",
          summary: result.authorized
            ? "CANCELAMENTO DA NF-E AUTORIZADO"
            : "CANCELAMENTO DA NF-E REJEITADO",
          after: result,
          performedBy: payload.requestedBy,
        }),
      });
      return this.mapDocument(saved);
    });
  }

  async correctDocument(documentId: string, payload: CorrectNfeDto) {
    const { document, profile } = await this.loadAuthorizedDocument(
      documentId,
      payload,
    );
    if (document.status !== "AUTHORIZED") {
      throw new BadRequestException(
        "Somente NF-e autorizada pode receber Carta de Correção.",
      );
    }
    const correctionText = normalizeText(payload.correctionText)!;
    if (correctionText.length < 15 || correctionText.length > 1000) {
      throw new BadRequestException(
        "A correção deve possuir entre 15 e 1000 caracteres.",
      );
    }
    const sequence =
      (await this.prisma.fiscalDocumentEvent.count({
        where: {
          fiscalDocumentId: document.id,
          eventType: "CORRECTION",
          canceledAt: null,
        },
      })) + 1;
    if (sequence > 20) {
      throw new BadRequestException(
        "O limite de 20 Cartas de Correção foi atingido.",
      );
    }
    const { issuer } = await this.loadIssuer(
      document.companyId,
      document.branchCode,
    );
    const eventAt = new Date();
    const result = await sendNfeEvent({
      environment: document.environment as NfeEnvironment,
      stateCode: issuer.stateCode,
      issuerCnpj: issuer.cnpj,
      accessKey: document.accessKey!,
      eventType: "110110",
      sequence,
      eventAt: formatNfeDateTime(eventAt),
      correctionText,
      certificate: this.certificateMaterial(profile, issuer.cnpj),
    });
    const event = await this.prisma.fiscalDocumentEvent.create({
      data: {
        companyId: document.companyId,
        branchCode: document.branchCode,
        fiscalDocumentId: document.id,
        eventType: "CORRECTION",
        sequence,
        status: result.authorized ? "AUTHORIZED" : "REJECTED",
        statusCode: result.statusCode,
        statusMessage: normalizeText(result.statusMessage),
        protocol: result.protocol,
        eventAt,
        correctionText,
        signedXml: result.signedXml,
        responseXml: result.responseXml,
        processedXml: result.processedXml,
        createdBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
    });
    return {
      id: event.id,
      authorized: result.authorized,
      statusCode: result.statusCode,
      statusMessage: result.statusMessage,
      protocol: result.protocol,
      sequence,
    };
  }

  async inutilizeNumbers(payload: InutilizeNfeNumbersDto) {
    const company = await this.loadCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const branchCode = this.branchCode(payload.sourceBranchCode);
    if (payload.endNumber < payload.startNumber) {
      throw new BadRequestException(
        "O número final deve ser maior ou igual ao inicial.",
      );
    }
    const profile = await this.loadProfile(
      company.id,
      branchCode,
      normalizeText(payload.environment),
    );
    if (!profile) {
      throw new BadRequestException("Perfil NF-e ativo não configurado.");
    }
    const usedNumber = await this.prisma.fiscalDocument.findFirst({
      where: {
        companyId: company.id,
        branchCode,
        model: NFE_MODEL,
        series: payload.series,
        number: { gte: payload.startNumber, lte: payload.endNumber },
        canceledAt: null,
      },
    });
    if (usedNumber) {
      throw new BadRequestException(
        "O intervalo possui número já utilizado por um documento fiscal.",
      );
    }
    const { issuer } = await this.loadIssuer(company.id, branchCode);
    const year = new Date().getFullYear();
    const record = await this.prisma.fiscalNumberInutilization.create({
      data: {
        companyId: company.id,
        branchCode,
        nfeProfileId: profile.id,
        environment: profile.environment,
        model: NFE_MODEL,
        series: payload.series,
        startNumber: payload.startNumber,
        endNumber: payload.endNumber,
        year,
        status: "PENDING",
        justification: normalizeText(payload.justification)!,
        createdBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
    });
    const result = await inutilizeNfeNumbers({
      environment: profile.environment as NfeEnvironment,
      stateCode: issuer.stateCode,
      issuerCnpj: issuer.cnpj,
      year,
      series: payload.series,
      startNumber: payload.startNumber,
      endNumber: payload.endNumber,
      justification: normalizeText(payload.justification)!,
      certificate: this.certificateMaterial(profile, issuer.cnpj),
    });
    return this.prisma.fiscalNumberInutilization.update({
      where: { id: record.id },
      data: {
        status: result.authorized ? "AUTHORIZED" : "REJECTED",
        statusCode: result.statusCode,
        statusMessage: normalizeText(result.statusMessage),
        protocol: result.protocol,
        signedXml: result.signedXml,
        responseXml: result.responseXml,
        processedXml: result.processedXml,
        updatedBy: payload.requestedBy || null,
      },
    });
  }

  async serviceStatus(query: NfeContextDto) {
    const company = await this.loadCompany(
      query.sourceSystem,
      query.sourceTenantId,
    );
    const branchCode = this.branchCode(query.sourceBranchCode);
    const profile = await this.loadProfile(
      company.id,
      branchCode,
      normalizeText(query.environment),
    );
    if (!profile) {
      throw new BadRequestException("Perfil NF-e ativo não configurado.");
    }
    const { issuer } = await this.loadIssuer(company.id, branchCode);
    return queryNfeServiceStatus({
      environment: profile.environment as NfeEnvironment,
      stateCode: issuer.stateCode,
      certificate: this.certificateMaterial(profile, issuer.cnpj),
    });
  }

  async sendDocumentEmail(
    documentId: string,
    payload: SendNfeEmailDto,
  ) {
    const company = await this.loadCompany(
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const branchCode = this.branchCode(payload.sourceBranchCode);
    return this.emailService.sendAuthorizedDocument({
      companyId: company.id,
      branchCode,
      documentId,
      recipientEmail: payload.recipientEmail,
      requestedBy: payload.requestedBy,
      force: true,
    });
  }

  async getArtifact(
    documentId: string,
    query: NfeContextDto,
    type: "danfe" | "xml",
  ) {
    const company = await this.loadCompany(
      query.sourceSystem,
      query.sourceTenantId,
    );
    const document = await this.prisma.fiscalDocument.findFirst({
      where: {
        id: documentId,
        companyId: company.id,
        model: NFE_MODEL,
        canceledAt: null,
      },
    });
    if (!document) throw new NotFoundException("NF-E NÃO ENCONTRADA.");
    if (type === "danfe") {
      if (!document.danfePdfBlob) {
        throw new NotFoundException("DANFE AINDA NÃO GERADO.");
      }
      return {
        body: Buffer.from(document.danfePdfBlob),
        fileName:
          document.danfeFileName || `DANFE-NFE-${document.accessKey}.pdf`,
        contentType: "application/pdf",
      };
    }
    if (!document.processedXml) {
      throw new NotFoundException("XML PROCESSADO AINDA NÃO DISPONÍVEL.");
    }
    return {
      body: Buffer.from(document.processedXml, "utf8"),
      fileName: `NFE-${document.accessKey}.xml`,
      contentType: "application/xml; charset=utf-8",
    };
  }
}
