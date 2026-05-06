import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { decryptSecret, encryptSecret } from "../../../common/secret-crypto.utils";
import { normalizeDigits, normalizeText } from "../../../common/finance-core.utils";
import {
  ChangeFiscalCertificateStatusDto,
  GetFiscalCertificateDto,
  ListFiscalCertificatesDto,
  SaveFiscalCertificateDto,
  SyncFiscalCertificateDfeDto,
} from "./dto/fiscal-certificates.dto";
import { parsePfxMetadata } from "./fiscal-certificate-metadata";
import { fetchDfeDistributionBatch } from "./nfe-dfe-distribution.client";
import { PayablesService } from "../../payables/application/payables.service";

@Injectable()
export class FiscalCertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payablesService: PayablesService,
  ) {}

  private normalizeEnvironment(value?: string | null) {
    return normalizeText(value) === "HOMOLOGATION" ? "HOMOLOGATION" : "PRODUCTION";
  }

  private normalizePurpose(value?: string | null) {
    return normalizeText(value) || "NFE_DFE";
  }

  private normalizeRequiredStateCode(value?: string | null) {
    const normalized = normalizeDigits(value);
    if (!normalized || normalized.length !== 2) {
      throw new BadRequestException("Informe o código IBGE da UF do autor.");
    }

    return normalized;
  }

  private async resolveCompany(filters: {
    sourceSystem?: string | null;
    sourceTenantId?: string | null;
    companyName?: string | null;
    companyDocument?: string | null;
    requestedBy?: string | null;
  }) {
    const normalizedSourceSystem = normalizeText(filters.sourceSystem);
    const normalizedSourceTenantId = normalizeText(filters.sourceTenantId);

    if (!normalizedSourceSystem || !normalizedSourceTenantId) {
      throw new BadRequestException(
        "Informe o sistema e o tenant de origem para localizar a empresa.",
      );
    }

    const existing = await this.prisma.company.findUnique({
      where: {
        sourceSystem_sourceTenantId: {
          sourceSystem: normalizedSourceSystem,
          sourceTenantId: normalizedSourceTenantId,
        },
      },
    });

    const normalizedCompanyName = normalizeText(filters.companyName);
    const normalizedCompanyDocument = normalizeDigits(filters.companyDocument);

    if (existing) {
      return this.prisma.company.update({
        where: { id: existing.id },
        data: {
          ...(normalizedCompanyName ? { name: normalizedCompanyName } : {}),
          ...(normalizedCompanyDocument
            ? { document: normalizedCompanyDocument }
            : {}),
          updatedBy: filters.requestedBy || null,
        },
      });
    }

    return this.prisma.company.create({
      data: {
        sourceSystem: normalizedSourceSystem,
        sourceTenantId: normalizedSourceTenantId,
        name:
          normalizedCompanyName ||
          `${normalizedSourceSystem} ${normalizedSourceTenantId}`,
        document: normalizedCompanyDocument,
        createdBy: filters.requestedBy || null,
        updatedBy: filters.requestedBy || null,
      },
    });
  }

  private async findCompany(
    sourceSystem?: string | null,
    sourceTenantId?: string | null,
  ) {
    const normalizedSourceSystem = normalizeText(sourceSystem);
    const normalizedSourceTenantId = normalizeText(sourceTenantId);

    if (!normalizedSourceSystem || !normalizedSourceTenantId) {
      return null;
    }

    return this.prisma.company.findUnique({
      where: {
        sourceSystem_sourceTenantId: {
          sourceSystem: normalizedSourceSystem,
          sourceTenantId: normalizedSourceTenantId,
        },
      },
    });
  }

  private mapCertificate(certificate: any, includeSecrets = false) {
    const validTo = certificate.validTo ? new Date(certificate.validTo) : null;
    const now = new Date();

    return {
      id: certificate.id,
      companyId: certificate.companyId,
      companyName: certificate.company?.name || null,
      sourceSystem: certificate.company?.sourceSystem || null,
      sourceTenantId: certificate.company?.sourceTenantId || null,
      status: certificate.status,
      certificateType: certificate.certificateType,
      environment: certificate.environment,
      purpose: certificate.purpose,
      isDefault: Boolean(certificate.isDefault),
      aliasName: certificate.aliasName,
      authorStateCode: certificate.authorStateCode,
      holderName: certificate.holderName,
      holderDocument: certificate.holderDocument,
      serialNumber: certificate.serialNumber || null,
      thumbprint: certificate.thumbprint || null,
      validFrom: certificate.validFrom ? certificate.validFrom.toISOString() : null,
      validTo: validTo ? validTo.toISOString() : null,
      expired: validTo ? validTo.getTime() < now.getTime() : false,
      hasStoredCertificate: Boolean(
        certificate.pfxEncryptedBase64 && certificate.passwordEncrypted,
      ),
      lastNsu: certificate.lastNsu || null,
      lastMaxNsu: certificate.lastMaxNsu || null,
      lastSyncAt: certificate.lastSyncAt ? certificate.lastSyncAt.toISOString() : null,
      lastSyncStatus: certificate.lastSyncStatus || null,
      lastSyncMessage: certificate.lastSyncMessage || null,
      createdAt: certificate.createdAt.toISOString(),
      createdBy: certificate.createdBy || null,
      updatedAt: certificate.updatedAt.toISOString(),
      updatedBy: certificate.updatedBy || null,
      canceledAt: certificate.canceledAt ? certificate.canceledAt.toISOString() : null,
      canceledBy: certificate.canceledBy || null,
      ...(includeSecrets
        ? {
            pfxEncryptedBase64: certificate.pfxEncryptedBase64,
            passwordEncrypted: certificate.passwordEncrypted,
          }
        : {}),
    };
  }

  private async loadScopedCertificate(
    certificateId: string,
    sourceSystem?: string | null,
    sourceTenantId?: string | null,
  ) {
    const normalizedCertificateId = String(certificateId || "").trim();
    if (!normalizedCertificateId) {
      throw new BadRequestException("Certificado fiscal inválido.");
    }

    const company = await this.findCompany(sourceSystem, sourceTenantId);
    if (!company) {
      throw new NotFoundException("EMPRESA FINANCEIRA NÃO ENCONTRADA.");
    }

    const certificate = await this.prisma.fiscalCertificate.findFirst({
      where: {
        id: normalizedCertificateId,
        companyId: company.id,
      },
      include: {
        company: true,
      },
    });

    if (!certificate) {
      throw new NotFoundException("CERTIFICADO FISCAL NÃO ENCONTRADO.");
    }

    return {
      company,
      certificate,
    };
  }

  private async ensureSingleDefault(
    tx: any,
    companyId: string,
    environment: string,
    purpose: string,
    keepCertificateId?: string,
  ) {
    await tx.fiscalCertificate.updateMany({
      where: {
        companyId,
        environment,
        purpose,
        ...(keepCertificateId ? { id: { not: keepCertificateId } } : {}),
      },
      data: {
        isDefault: false,
      },
    });
  }

  async list(query: ListFiscalCertificatesDto) {
    const company = await this.findCompany(
      query.sourceSystem,
      query.sourceTenantId,
    );

    if (!company) {
      return [];
    }

    const normalizedStatus = normalizeText(query.status);

    const certificates = await this.prisma.fiscalCertificate.findMany({
      where: {
        companyId: company.id,
        ...(normalizedStatus && normalizedStatus !== "ALL"
          ? { status: normalizedStatus }
          : {}),
      },
      include: {
        company: true,
      },
      orderBy: [
        { isDefault: "desc" },
        { environment: "asc" },
        { aliasName: "asc" },
      ],
    });

    return certificates.map((certificate) => this.mapCertificate(certificate));
  }

  async get(certificateId: string, query: GetFiscalCertificateDto) {
    const { certificate } = await this.loadScopedCertificate(
      certificateId,
      query.sourceSystem,
      query.sourceTenantId,
    );

    return {
      ...this.mapCertificate(certificate),
      certificatePassword: certificate.passwordEncrypted
        ? decryptSecret(certificate.passwordEncrypted)
        : "",
    };
  }

  async create(payload: SaveFiscalCertificateDto) {
    const company = await this.resolveCompany({
      sourceSystem: payload.sourceSystem,
      sourceTenantId: payload.sourceTenantId,
      companyName: payload.companyName,
      companyDocument: payload.companyDocument,
      requestedBy: payload.requestedBy,
    });

    if (!payload.pfxBase64 || !payload.certificatePassword) {
      throw new BadRequestException(
        "Informe o arquivo PFX e a senha para cadastrar o certificado fiscal.",
      );
    }

    const metadata = parsePfxMetadata(payload.pfxBase64, payload.certificatePassword);
    const environment = this.normalizeEnvironment(payload.environment);
    const purpose = this.normalizePurpose(payload.purpose);

    const created = await this.prisma.$transaction(async (tx: any) => {
      const shouldBeDefault = Boolean(payload.isDefault);
      if (shouldBeDefault) {
        await this.ensureSingleDefault(tx, company.id, environment, purpose);
      }

      const certificate = await tx.fiscalCertificate.create({
        data: {
          companyId: company.id,
          status: "ACTIVE",
          certificateType: "A1",
          environment,
          purpose,
          isDefault: shouldBeDefault,
          aliasName: normalizeText(payload.aliasName) || `CERTIFICADO ${environment}`,
          authorStateCode: this.normalizeRequiredStateCode(payload.authorStateCode),
          holderName: metadata.holderName,
          holderDocument: metadata.holderDocument,
          serialNumber: metadata.serialNumber,
          thumbprint: metadata.thumbprint,
          validFrom: metadata.validFrom,
          validTo: metadata.validTo,
          pfxEncryptedBase64: encryptSecret(payload.pfxBase64!),
          passwordEncrypted: encryptSecret(payload.certificatePassword!),
          createdBy: payload.requestedBy || null,
          updatedBy: payload.requestedBy || null,
        },
        include: {
          company: true,
        },
      });

      return certificate;
    });

    return this.mapCertificate(created);
  }

  async update(certificateId: string, payload: SaveFiscalCertificateDto) {
    const { certificate } = await this.loadScopedCertificate(
      certificateId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    const environment = this.normalizeEnvironment(
      payload.environment || certificate.environment,
    );
    const purpose = this.normalizePurpose(payload.purpose || certificate.purpose);
    const shouldReplacePfx = Boolean(payload.pfxBase64);

    if (shouldReplacePfx && !payload.certificatePassword) {
      throw new BadRequestException(
        "Ao trocar o certificado fiscal, envie o PFX e a senha juntos.",
      );
    }

    const metadata = shouldReplacePfx
      ? parsePfxMetadata(payload.pfxBase64!, payload.certificatePassword!)
      : null;

    const updated = await this.prisma.$transaction(async (tx: any) => {
      const shouldBeDefault =
        typeof payload.isDefault === "boolean"
          ? payload.isDefault
          : Boolean(certificate.isDefault);

      if (shouldBeDefault) {
        await this.ensureSingleDefault(
          tx,
          certificate.companyId,
          environment,
          purpose,
          certificate.id,
        );
      }

      return tx.fiscalCertificate.update({
        where: { id: certificate.id },
        data: {
          environment,
          purpose,
          isDefault: shouldBeDefault,
          aliasName:
            normalizeText(payload.aliasName) || certificate.aliasName,
          authorStateCode: this.normalizeRequiredStateCode(
            payload.authorStateCode || certificate.authorStateCode,
          ),
          ...(metadata
            ? {
                holderName: metadata.holderName,
                holderDocument: metadata.holderDocument,
                serialNumber: metadata.serialNumber,
                thumbprint: metadata.thumbprint,
                validFrom: metadata.validFrom,
                validTo: metadata.validTo,
                pfxEncryptedBase64: encryptSecret(payload.pfxBase64!),
                passwordEncrypted: encryptSecret(payload.certificatePassword!),
              }
            : {}),
          updatedBy: payload.requestedBy || null,
        },
        include: {
          company: true,
        },
      });
    });

    return this.mapCertificate(updated);
  }

  async activate(certificateId: string, payload: ChangeFiscalCertificateStatusDto) {
    const { certificate } = await this.loadScopedCertificate(
      certificateId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    const updated = await this.prisma.fiscalCertificate.update({
      where: { id: certificate.id },
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

    return this.mapCertificate(updated);
  }

  async inactivate(certificateId: string, payload: ChangeFiscalCertificateStatusDto) {
    const { certificate } = await this.loadScopedCertificate(
      certificateId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    const updated = await this.prisma.fiscalCertificate.update({
      where: { id: certificate.id },
      data: {
        status: "INACTIVE",
        isDefault: false,
        canceledAt: new Date(),
        canceledBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
      include: {
        company: true,
      },
    });

    return this.mapCertificate(updated);
  }

  async setDefault(certificateId: string, payload: ChangeFiscalCertificateStatusDto) {
    const { certificate } = await this.loadScopedCertificate(
      certificateId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    const updated = await this.prisma.$transaction(async (tx: any) => {
      await this.ensureSingleDefault(
        tx,
        certificate.companyId,
        certificate.environment,
        certificate.purpose,
        certificate.id,
      );

      return tx.fiscalCertificate.update({
        where: { id: certificate.id },
        data: {
          isDefault: true,
          updatedBy: payload.requestedBy || null,
        },
        include: {
          company: true,
        },
      });
    });

    return this.mapCertificate(updated);
  }

  async syncDfe(certificateId: string, payload: SyncFiscalCertificateDfeDto) {
    const { company, certificate } = await this.loadScopedCertificate(
      certificateId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    if (normalizeText(certificate.status) !== "ACTIVE") {
      throw new BadRequestException(
        "Ative o certificado fiscal antes de consultar a SEFAZ.",
      );
    }

    if (!certificate.holderDocument) {
      throw new BadRequestException(
        "O certificado fiscal não possui documento do titular para consultar a SEFAZ.",
      );
    }

    const pfxBase64 = decryptSecret(certificate.pfxEncryptedBase64);
    const passphrase = decryptSecret(certificate.passwordEncrypted);
    const pfxBuffer = Buffer.from(pfxBase64, "base64");
    const maxBatches = Math.max(1, Math.min(20, Number(payload.maxBatches || 5)));

    let runningLastNsu = certificate.lastNsu || "000000000000000";
    let finalMaxNsu = certificate.lastMaxNsu || runningLastNsu;
    let finalStatusCode = "137";
    let finalStatusMessage = "Nenhum documento localizado.";
    let importedNotes = 0;
    let duplicateNotes = 0;
    let summaryOnlyDocuments = 0;
    let otherDocuments = 0;
    const importedNoteIds: string[] = [];

    try {
      for (let currentBatch = 0; currentBatch < maxBatches; currentBatch += 1) {
        const batch = await fetchDfeDistributionBatch({
          environment: this.normalizeEnvironment(certificate.environment) as
            | "PRODUCTION"
            | "HOMOLOGATION",
          authorStateCode: certificate.authorStateCode,
          interestedDocument:
            company.document || certificate.holderDocument,
          lastNsu: runningLastNsu,
          pfxBuffer,
          passphrase,
        });

        finalStatusCode = batch.statusCode;
        finalStatusMessage = batch.statusMessage || finalStatusMessage;
        runningLastNsu = batch.lastNsu;
        finalMaxNsu = batch.maxNsu;

        for (const document of batch.documents) {
          const normalizedSchema = normalizeText(document.schema) || "";
          const normalizedXml = String(document.xml || "").trim();

          if (
            normalizedSchema.includes("RESNFE") &&
            !normalizedXml.toLowerCase().includes("<nfeproc")
          ) {
            summaryOnlyDocuments += 1;
            continue;
          }

          if (
            normalizedSchema.includes("PROCNFE") ||
            normalizedXml.toLowerCase().includes("<nfeproc") ||
            normalizedXml.toLowerCase().includes("<procnfe")
          ) {
            const imported = await this.payablesService.importXmlDocumentForCompany(
              {
                id: company.id,
                name: company.name,
                document: company.document,
                sourceSystem: company.sourceSystem,
                sourceTenantId: company.sourceTenantId,
              },
              normalizedXml,
              {
                requestedBy: payload.requestedBy || null,
                importType: "SEFAZ_DISTRIBUTION",
                fiscalCertificateId: certificate.id,
                distributionNsu: document.nsu,
              },
            );

            if (imported.alreadyImported) {
              duplicateNotes += 1;
            } else {
              importedNotes += 1;
              importedNoteIds.push(imported.id);
            }

            continue;
          }

          otherDocuments += 1;
        }

        if (
          batch.statusCode === "137" ||
          batch.statusCode === "656" ||
          batch.lastNsu === batch.maxNsu
        ) {
          break;
        }
      }

      await this.prisma.fiscalCertificate.update({
        where: { id: certificate.id },
        data: {
          lastNsu: runningLastNsu,
          lastMaxNsu: finalMaxNsu,
          lastSyncAt: new Date(),
          lastSyncStatus: finalStatusCode,
          lastSyncMessage: finalStatusMessage,
          updatedBy: payload.requestedBy || null,
        },
      });

      return {
        certificateId: certificate.id,
        statusCode: finalStatusCode,
        statusMessage: finalStatusMessage,
        lastNsu: runningLastNsu,
        maxNsu: finalMaxNsu,
        importedNotes,
        duplicateNotes,
        summaryOnlyDocuments,
        otherDocuments,
        importedNoteIds,
        message:
          importedNotes > 0
            ? `${importedNotes} nota(s) completas foram importadas da SEFAZ.`
            : summaryOnlyDocuments > 0
              ? "A SEFAZ retornou apenas resumos de NF-e. O XML completo depende da disponibilidade do DF-e para o destinatário."
              : "Nenhuma nova NF-e completa foi importada nesta consulta.",
      };
    } catch (error) {
      await this.prisma.fiscalCertificate.update({
        where: { id: certificate.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: "ERROR",
          lastSyncMessage:
            error instanceof Error
              ? String(error.message || "").slice(0, 500)
              : "Falha na consulta da SEFAZ.",
          updatedBy: payload.requestedBy || null,
        },
      });

      throw error;
    }
  }
}
