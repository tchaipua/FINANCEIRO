import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../../prisma/prisma.service";
import { normalizeBranchCode } from "../../../../common/branch.constants";
import { normalizeDigits, normalizeText, roundMoney } from "../../../../common/finance-core.utils";
import { decryptSecret } from "../../../../common/secret-crypto.utils";
import { SaveNfceProfileDto, NfceContextDto } from "../dto/nfce.dto";
import {
  assertNfceCertificateMatchesIssuer,
  loadNfceCertificateMaterial,
} from "./nfce-certificate.utils";
import { authorizeNfce, queryNfceProtocol } from "./nfce-sefaz.client";
import { buildNfceXml } from "./nfce-xml.builder";

const PAYMENT_CODES: Record<string, string> = {
  CASH: "01",
  CREDIT_CARD: "03",
  DEBIT_CARD: "04",
  TERM: "05",
  INSTALLMENT: "05",
  BOLETO: "15",
  PIX: "17",
};

export function mapSalePaymentToNfceCode(paymentMethod: string) {
  return PAYMENT_CODES[normalizeText(paymentMethod) || ""] || null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class NfceService {
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

  private mapProfile(profile: any) {
    if (!profile) return null;
    return {
      id: profile.id,
      companyId: profile.companyId,
      branchCode: profile.branchCode,
      certificateId: profile.certificateId,
      certificateAlias: profile.certificate?.aliasName || null,
      certificateHolderDocument: profile.certificate?.holderDocument || null,
      status: profile.status,
      environment: profile.environment,
      autoIssueOnSale: Boolean(profile.autoIssueOnSale),
      series: profile.series,
      nextNumber: profile.nextNumber,
      stateCode: profile.stateCode,
      cityCode: profile.cityCode,
      stateRegistration: profile.stateRegistration,
      legalName: profile.legalName,
      tradeName: profile.tradeName || null,
      taxRegimeCode: profile.taxRegimeCode,
      street: profile.street,
      number: profile.number,
      complement: profile.complement || null,
      neighborhood: profile.neighborhood,
      city: profile.city,
      state: profile.state,
      postalCode: profile.postalCode,
      phone: profile.phone || null,
      defaultCfopCode: profile.defaultCfopCode,
      defaultOriginCode: profile.defaultOriginCode,
      defaultIcmsCst: profile.defaultIcmsCst,
      defaultIcmsRate: profile.defaultIcmsRate,
      defaultPisCst: profile.defaultPisCst,
      defaultCofinsCst: profile.defaultCofinsCst,
      ibsCbsCst: profile.ibsCbsCst,
      ibsCbsClassCode: profile.ibsCbsClassCode,
      ibsStateRate: profile.ibsStateRate,
      ibsMunicipalRate: profile.ibsMunicipalRate,
      cbsRate: profile.cbsRate,
      additionalInformation: profile.additionalInformation || null,
      createdAt: profile.createdAt?.toISOString?.() || null,
      updatedAt: profile.updatedAt?.toISOString?.() || null,
    };
  }

  private mapDocument(document: any, includeXml = false) {
    if (!document) return null;
    return {
      id: document.id,
      saleId: document.saleId,
      companyId: document.companyId,
      branchCode: document.branchCode,
      model: document.model,
      environment: document.environment,
      series: document.series,
      number: document.number,
      accessKey: document.accessKey || null,
      status: document.status,
      statusCode: document.statusCode || null,
      statusMessage: document.statusMessage || null,
      protocol: document.protocol || null,
      receivedAt: document.receivedAt?.toISOString?.() || null,
      issuedAt: document.issuedAt?.toISOString?.() || null,
      qrCodeUrl: document.qrCodeUrl || null,
      attemptCount: document.attemptCount,
      lastAttemptAt: document.lastAttemptAt?.toISOString?.() || null,
      lastError: document.lastError || null,
      hasProcessedXml: Boolean(document.processedXml),
      ...(includeXml
        ? {
            signedXml: document.signedXml || null,
            responseXml: document.responseXml || null,
            processedXml: document.processedXml || null,
          }
        : {}),
    };
  }

  async getProfile(query: NfceContextDto) {
    const company = await this.loadCompany(query.sourceSystem, query.sourceTenantId);
    const branchCode = Math.max(1, normalizeBranchCode(query.sourceBranchCode, 1));
    const environment = normalizeText(query.environment) || "HOMOLOGATION";
    const profile = await this.prisma.nfceProfile.findFirst({
      where: { companyId: company.id, branchCode, environment, canceledAt: null },
      include: { certificate: true },
    });
    return this.mapProfile(profile);
  }

  async saveProfile(payload: SaveNfceProfileDto) {
    const company = await this.loadCompany(payload.sourceSystem, payload.sourceTenantId);
    const companyDocument = normalizeDigits(company.document);
    const branchCode = Math.max(1, normalizeBranchCode(payload.sourceBranchCode, 1));
    const environment = normalizeText(payload.environment) || "HOMOLOGATION";
    if (!companyDocument || companyDocument.length !== 14) {
      throw new BadRequestException("A empresa precisa possuir CNPJ para configurar a NFC-e.");
    }
    const branch = await this.prisma.companyBranch.findFirst({
      where: { companyId: company.id, branchCode, canceledAt: null, isActive: true },
    });
    if (!branch) throw new BadRequestException("Filial ativa não encontrada para a NFC-e.");
    const certificate = await this.prisma.fiscalCertificate.findFirst({
      where: {
        id: String(payload.certificateId || "").trim(),
        companyId: company.id,
        branchCode: { in: [0, branchCode] },
        status: "ACTIVE",
        environment,
        canceledAt: null,
      },
    });
    if (!certificate) {
      throw new BadRequestException("Certificado A1 ativo não encontrado para empresa, filial e ambiente.");
    }
    if (normalizeDigits(certificate.holderDocument) !== companyDocument) {
      throw new BadRequestException("O CNPJ do certificado não corresponde ao CNPJ da empresa.");
    }
    if (certificate.validTo && certificate.validTo.getTime() < Date.now()) {
      throw new BadRequestException("O certificado A1 selecionado está vencido.");
    }
    const requiredDigits = (value: string | undefined, length: number, label: string) => {
      const normalized = normalizeDigits(value);
      if (!normalized || normalized.length !== length) {
        throw new BadRequestException(`Informe ${label} com ${length} dígitos.`);
      }
      return normalized;
    };
    const data = {
      certificateId: certificate.id,
      status: "ACTIVE",
      environment,
      autoIssueOnSale: Boolean(payload.autoIssueOnSale),
      series: Number(payload.series),
      nextNumber: Number(payload.nextNumber),
      stateCode: requiredDigits(payload.stateCode, 2, "o código da UF"),
      cityCode: requiredDigits(payload.cityCode, 7, "o código do município"),
      stateRegistration: requiredDigits(payload.stateRegistration, 12, "a inscrição estadual"),
      legalName: normalizeText(payload.legalName)!,
      tradeName: normalizeText(payload.tradeName),
      taxRegimeCode: payload.taxRegimeCode,
      street: normalizeText(payload.street)!,
      number: normalizeText(payload.number)!,
      complement: normalizeText(payload.complement),
      neighborhood: normalizeText(payload.neighborhood)!,
      city: normalizeText(payload.city)!,
      state: normalizeText(payload.state)!,
      postalCode: requiredDigits(payload.postalCode, 8, "o CEP"),
      phone: normalizeDigits(payload.phone),
      defaultCfopCode: requiredDigits(payload.defaultCfopCode || "5102", 4, "o CFOP"),
      defaultOriginCode: requiredDigits(payload.defaultOriginCode || "0", 1, "a origem da mercadoria"),
      defaultIcmsCst: requiredDigits(payload.defaultIcmsCst || "00", 2, "o CST de ICMS"),
      defaultIcmsRate: Number(payload.defaultIcmsRate || 0),
      defaultPisCst: requiredDigits(payload.defaultPisCst || "08", 2, "o CST de PIS"),
      defaultCofinsCst: requiredDigits(payload.defaultCofinsCst || "08", 2, "o CST de COFINS"),
      ibsCbsCst: requiredDigits(payload.ibsCbsCst || "000", 3, "o CST de IBS/CBS"),
      ibsCbsClassCode: requiredDigits(payload.ibsCbsClassCode || "000001", 6, "a classificação IBS/CBS"),
      ibsStateRate: Number(payload.ibsStateRate ?? 0.1),
      ibsMunicipalRate: Number(payload.ibsMunicipalRate ?? 0),
      cbsRate: Number(payload.cbsRate ?? 0.9),
      additionalInformation: normalizeText(payload.additionalInformation),
      canceledAt: null,
      canceledBy: null,
      updatedBy: payload.requestedBy || null,
    };
    const profile = await this.prisma.$transaction(async (tx: any) => {
      if (payload.autoIssueOnSale) {
        await tx.nfceProfile.updateMany({
          where: { companyId: company.id, branchCode },
          data: { autoIssueOnSale: false, updatedBy: payload.requestedBy || null },
        });
      }
      return tx.nfceProfile.upsert({
        where: { companyId_branchCode_environment: { companyId: company.id, branchCode, environment } },
        create: {
          companyId: company.id,
          branchCode,
          ...data,
          createdBy: payload.requestedBy || null,
        },
        update: data,
        include: { certificate: true },
      });
    });
    return this.mapProfile(profile);
  }

  private buildSaleItems(sale: any, profile: any) {
    const itemDiscountTotal = roundMoney(
      sale.items.reduce((sum: number, item: any) => sum + Number(item.discountAmount || 0), 0),
    );
    const additionalDiscount = Math.max(0, roundMoney(Number(sale.discountAmount || 0) - itemDiscountTotal));
    const allocationBase = sale.items.reduce((sum: number, item: any) => sum + Number(item.totalAmount || 0), 0);
    let allocated = 0;
    return sale.items.map((item: any, index: number) => {
      const isLast = index === sale.items.length - 1;
      const share = isLast
        ? roundMoney(additionalDiscount - allocated)
        : roundMoney(additionalDiscount * (Number(item.totalAmount || 0) / allocationBase));
      allocated = roundMoney(allocated + share);
      const ncmCode = normalizeDigits(item.product?.ncmCode);
      if (!ncmCode || ncmCode.length !== 8 || (profile.environment === "PRODUCTION" && ncmCode === "00000000")) {
        throw new BadRequestException(`Informe um NCM válido no produto ${item.productNameSnapshot}.`);
      }
      return {
        code: item.productCodeSnapshot || String(item.lineNumber),
        description: item.productNameSnapshot,
        ncmCode,
        cestCode: normalizeDigits(item.product?.cestCode),
        cfopCode: profile.defaultCfopCode,
        unitCode: item.unitCodeSnapshot || "UN",
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discountAmount: roundMoney(Number(item.discountAmount || 0) + share),
        originCode: profile.defaultOriginCode,
        icmsCst: profile.defaultIcmsCst,
        icmsRate: Number(profile.defaultIcmsRate || 0),
        pisCst: profile.defaultPisCst,
        cofinsCst: profile.defaultCofinsCst,
        ibsCbsCst: profile.ibsCbsCst,
        ibsCbsClassCode: profile.ibsCbsClassCode,
        ibsStateRate: Number(profile.ibsStateRate),
        ibsMunicipalRate: Number(profile.ibsMunicipalRate),
        cbsRate: Number(profile.cbsRate),
      };
    });
  }

  private buildPayments(payments: any[]) {
    return payments.map((payment) => {
      const methodCode = mapSalePaymentToNfceCode(payment.paymentMethod);
      if (!methodCode) {
        throw new BadRequestException(`Forma de pagamento sem código NFC-e: ${payment.paymentMethod}.`);
      }
      return {
        methodCode,
        amount: Number(payment.amount || 0),
        ...(["03", "04"].includes(methodCode) ? { cardIntegrationType: "2" as const } : {}),
      };
    });
  }

  private async allocateDocument(sale: any, profile: any, requestedBy?: string | null) {
    const existing = await this.prisma.fiscalDocument.findUnique({ where: { saleId: sale.id } });
    if (existing) return existing;
    return this.prisma.$transaction(async (tx: any) => {
      const concurrent = await tx.fiscalDocument.findUnique({ where: { saleId: sale.id } });
      if (concurrent) return concurrent;
      const currentProfile = await tx.nfceProfile.findUnique({ where: { id: profile.id } });
      if (!currentProfile || currentProfile.canceledAt || currentProfile.status !== "ACTIVE") {
        throw new BadRequestException("O perfil NFC-e não está ativo.");
      }
      const number = currentProfile.nextNumber;
      await tx.nfceProfile.update({
        where: { id: currentProfile.id },
        data: { nextNumber: { increment: 1 }, updatedBy: requestedBy || null },
      });
      return tx.fiscalDocument.create({
        data: {
          companyId: sale.companyId,
          branchCode: sale.branchCode,
          saleId: sale.id,
          profileId: profile.id,
          certificateId: profile.certificateId,
          environment: profile.environment,
          series: profile.series,
          number,
          status: "PENDING",
          issuedAt: sale.confirmedAt,
          createdBy: requestedBy || null,
          updatedBy: requestedBy || null,
        },
      });
    });
  }

  private async issue(sale: any, profile: any, requestedBy?: string | null) {
    let document = await this.allocateDocument(sale, profile, requestedBy);
    if (document.status === "AUTHORIZED") return this.mapDocument(document);
    const certificate = profile.certificate;
    if (!certificate || certificate.status !== "ACTIVE" || certificate.canceledAt) {
      throw new BadRequestException("O certificado A1 da NFC-e não está ativo.");
    }
    if (certificate.validTo && certificate.validTo.getTime() < Date.now()) {
      throw new BadRequestException("O certificado A1 da NFC-e está vencido.");
    }
    const pfxBase64 = decryptSecret(certificate.pfxEncryptedBase64);
    const passphrase = decryptSecret(certificate.passwordEncrypted);
    const certificateMaterial = loadNfceCertificateMaterial(pfxBase64, passphrase);
    const issuerCnpj = normalizeDigits(sale.company.document)!;
    assertNfceCertificateMatchesIssuer(certificateMaterial, issuerCnpj);
    const items = this.buildSaleItems(sale, profile);
    const payments = this.buildPayments(sale.payments);
    const built = buildNfceXml({
      environment: profile.environment,
      issuer: {
        stateCode: profile.stateCode,
        cityCode: profile.cityCode,
        cnpj: issuerCnpj,
        stateRegistration: profile.stateRegistration,
        legalName: profile.legalName,
        tradeName: profile.tradeName,
        taxRegimeCode: profile.taxRegimeCode,
        street: profile.street,
        number: profile.number,
        complement: profile.complement,
        neighborhood: profile.neighborhood,
        city: profile.city,
        state: profile.state,
        postalCode: profile.postalCode,
        phone: profile.phone,
      },
      recipient: sale.customerDocumentSnapshot
        ? { name: sale.customerNameSnapshot, document: sale.customerDocumentSnapshot }
        : null,
      series: document.series,
      number: document.number,
      issuedAt: document.issuedAt,
      randomCode: document.randomCode || undefined,
      items,
      payments,
      additionalInformation: [profile.additionalInformation, `VENDA ${sale.saleNumber}`]
        .filter(Boolean)
        .join(" | "),
    });
    document = await this.prisma.fiscalDocument.update({
      where: { id: document.id },
      data: {
        randomCode: built.randomCode,
        accessKey: built.accessKey,
        qrCodeUrl: built.qrCodeUrl,
        status: "PROCESSING",
        lastAttemptAt: new Date(),
        updatedBy: requestedBy || null,
      },
    });
    const attemptNumber = document.attemptCount + 1;
    try {
      let result: any = null;
      if (document.signedXml && document.accessKey) {
        const queried = await queryNfceProtocol({
          environment: profile.environment,
          accessKey: document.accessKey,
          signedXml: document.signedXml,
          certificate: certificateMaterial,
        });
        if (queried.authorized) result = { ...queried, signedXml: document.signedXml };
      }
      if (!result) {
        result = await authorizeNfce({
          environment: profile.environment,
          accessKey: built.accessKey,
          unsignedXml: built.unsignedXml,
          certificate: certificateMaterial,
        });
      }
      const status = result.authorized ? "AUTHORIZED" : "REJECTED";
      const receivedAt = result.receivedAt ? new Date(result.receivedAt) : null;
      const updated = await this.prisma.$transaction(async (tx: any) => {
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
        return tx.fiscalDocument.update({
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
      });
      return this.mapDocument(updated);
    } catch (error) {
      const message = normalizeText(errorMessage(error)) || "ERRO NA EMISSÃO DA NFC-E";
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
  }

  private async loadSale(companyId: string, saleId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: String(saleId || "").trim(), companyId, canceledAt: null },
      include: {
        company: true,
        items: {
          where: { canceledAt: null },
          orderBy: { lineNumber: "asc" },
          include: { product: true },
        },
        payments: { where: { canceledAt: null }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!sale) throw new NotFoundException("VENDA NÃO ENCONTRADA PARA EMISSÃO DA NFC-E.");
    return sale;
  }

  private async recordSetupError(sale: any, requestedBy: string | null | undefined, error: unknown) {
    const document = await this.prisma.fiscalDocument.findUnique({ where: { saleId: sale.id } });
    const message = normalizeText(errorMessage(error)) || "ERRO NA PREPARAÇÃO DA NFC-E";
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

  async issueForSaleAfterConfirmation(companyId: string, saleId: string, requestedBy?: string | null) {
    const sale = await this.loadSale(companyId, saleId);
    if (sale.payments.some((payment: any) =>
      normalizeText(payment.paymentMethod) === "PIX" && normalizeText(payment.status) !== "PAID"
    )) {
      return {
        status: "PENDING_PAYMENT",
        statusMessage: "A NFC-E SERÁ EMITIDA APÓS A CONFIRMAÇÃO DO PIX.",
      };
    }
    const profile = await this.prisma.nfceProfile.findFirst({
      where: {
        companyId,
        branchCode: sale.branchCode,
        status: "ACTIVE",
        autoIssueOnSale: true,
        canceledAt: null,
      },
      include: { certificate: true },
      orderBy: { environment: "asc" },
    });
    if (!profile) {
      return {
        status: "NOT_CONFIGURED",
        statusMessage: "EMISSÃO AUTOMÁTICA DE NFC-E NÃO CONFIGURADA PARA A EMPRESA E FILIAL.",
      };
    }
    try {
      return await this.issue(sale, profile, requestedBy);
    } catch (error) {
      return this.recordSetupError(sale, requestedBy, error);
    }
  }

  async issueSale(saleId: string, payload: NfceContextDto) {
    const company = await this.loadCompany(payload.sourceSystem, payload.sourceTenantId);
    const sale = await this.loadSale(company.id, saleId);
    const branchCode = Math.max(1, normalizeBranchCode(payload.sourceBranchCode, sale.branchCode));
    if (branchCode !== sale.branchCode) throw new BadRequestException("A venda pertence a outra filial.");
    const environment = normalizeText(payload.environment);
    const profile = await this.prisma.nfceProfile.findFirst({
      where: {
        companyId: company.id,
        branchCode,
        status: "ACTIVE",
        canceledAt: null,
        ...(environment ? { environment } : {}),
      },
      include: { certificate: true },
      orderBy: [{ autoIssueOnSale: "desc" }, { environment: "asc" }],
    });
    if (!profile) throw new BadRequestException("Perfil NFC-e ativo não configurado para esta venda.");
    try {
      return await this.issue(sale, profile, payload.requestedBy);
    } catch (error) {
      return this.recordSetupError(sale, payload.requestedBy, error);
    }
  }

  async getSaleDocument(saleId: string, query: NfceContextDto) {
    const company = await this.loadCompany(query.sourceSystem, query.sourceTenantId);
    const document = await this.prisma.fiscalDocument.findFirst({
      where: { saleId: String(saleId || "").trim(), companyId: company.id, canceledAt: null },
      include: { attempts: { where: { canceledAt: null }, orderBy: { attemptNumber: "asc" } } },
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
    };
  }
}
