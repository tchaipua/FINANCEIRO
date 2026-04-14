import { randomUUID } from "crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  dateToDateOnly,
  isOverdueDate,
  normalizeDigits,
  normalizeEmail,
  normalizePhone,
  normalizeText,
  parseIsoDate,
  parseJson,
  roundMoney,
  serializeJson,
} from "../../../common/finance-core.utils";
import {
  ExistingBusinessKeysDto,
  ListReceivableBatchesDto,
  ListReceivableInstallmentsDto,
  ReceivablesImportDto,
} from "./dto/receivables.dto";

@Injectable()
export class ReceivablesService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveCompany(filters: {
    companyId?: string | null;
    sourceSystem?: string | null;
    sourceTenantId?: string | null;
    companyName?: string | null;
    companyDocument?: string | null;
    requestedBy?: string | null;
  }) {
    const normalizedSourceSystem = normalizeText(filters.sourceSystem);
    const normalizedSourceTenantId = normalizeText(filters.sourceTenantId);

    if (filters.companyId?.trim()) {
      const company = await this.prisma.company.findFirst({
        where: {
          id: filters.companyId.trim(),
          canceledAt: null,
        },
      });

      if (!company) {
        throw new BadRequestException("Empresa financeira inválida.");
      }

      return company;
    }

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

    const normalizedCompanyName =
      normalizeText(filters.companyName) ||
      `${normalizedSourceSystem} ${normalizedSourceTenantId}`;
    const normalizedCompanyDocument = normalizeDigits(filters.companyDocument);

    if (existing) {
      return this.prisma.company.update({
        where: { id: existing.id },
        data: {
          name: normalizedCompanyName,
          document: normalizedCompanyDocument,
          updatedBy: filters.requestedBy || null,
        },
      });
    }

    return this.prisma.company.create({
      data: {
        sourceSystem: normalizedSourceSystem,
        sourceTenantId: normalizedSourceTenantId,
        name: normalizedCompanyName,
        document: normalizedCompanyDocument,
        createdBy: filters.requestedBy || null,
        updatedBy: filters.requestedBy || null,
      },
    });
  }

  private async ensurePayerParty(
    companyId: string,
    payer: {
      externalEntityType: string;
      externalEntityId: string;
      name: string;
      document?: string | null;
      email?: string | null;
      phone?: string | null;
    },
    requestedBy?: string | null,
  ) {
    const externalEntityType = normalizeText(payer.externalEntityType);
    const externalEntityId = normalizeText(payer.externalEntityId);

    if (!externalEntityType || !externalEntityId) {
      throw new BadRequestException("Pagador externo inválido.");
    }

    const existing = await this.prisma.party.findUnique({
      where: {
        companyId_externalEntityType_externalEntityId: {
          companyId,
          externalEntityType,
          externalEntityId,
        },
      },
    });

    const data = {
      name: normalizeText(payer.name) || "PAGADOR NÃO IDENTIFICADO",
      document: normalizeDigits(payer.document),
      email: normalizeEmail(payer.email),
      phone: normalizePhone(payer.phone),
      updatedBy: requestedBy || null,
    };

    if (existing) {
      return this.prisma.party.update({
        where: { id: existing.id },
        data,
      });
    }

    return this.prisma.party.create({
      data: {
        companyId,
        externalEntityType,
        externalEntityId,
        ...data,
        createdBy: requestedBy || null,
      },
    });
  }

  private buildInstallmentFilters(query: ListReceivableInstallmentsDto) {
    const normalizedStatus = normalizeText(query.status) || "ALL";
    const normalizedStudentName = normalizeText(query.studentName);
    const normalizedPayerName = normalizeText(query.payerName);
    const normalizedSearch = normalizeText(query.search);

    const where: Record<string, unknown> = {
      canceledAt: null,
    };

    if (normalizedStatus === "OPEN") {
      where.status = "OPEN";
      where.openAmount = { gt: 0 };
    }

    if (normalizedStatus === "PAID") {
      where.status = "PAID";
    }

    if (normalizedStatus === "OVERDUE") {
      where.status = "OPEN";
      where.openAmount = { gt: 0 };
      where.dueDate = { lt: new Date() };
    }

    if (normalizedStudentName || normalizedPayerName || normalizedSearch) {
      where.OR = [
        ...(normalizedStudentName
          ? [
              {
                title: {
                  sourceEntityName: { contains: normalizedStudentName },
                },
              },
            ]
          : []),
        ...(normalizedPayerName
          ? [{ payerNameSnapshot: { contains: normalizedPayerName } }]
          : []),
        ...(normalizedSearch
          ? [
              {
                title: {
                  sourceEntityName: { contains: normalizedSearch },
                },
              },
              {
                payerNameSnapshot: { contains: normalizedSearch },
              },
              {
                descriptionSnapshot: { contains: normalizedSearch },
              },
            ]
          : []),
      ];
    }

    return where;
  }

  private mapBatch(batch: any) {
    return {
      id: batch.id,
      companyId: batch.companyId,
      sourceSystem: batch.sourceSystem,
      sourceTenantId: batch.sourceTenantId,
      sourceBatchType: batch.sourceBatchType,
      sourceBatchId: batch.sourceBatchId,
      referenceDate: batch.referenceDate?.toISOString() || null,
      status: batch.status,
      itemCount: batch.itemCount,
      processedCount: batch.processedCount,
      duplicateCount: batch.duplicateCount,
      errorCount: batch.errorCount,
      payloadSnapshot: batch.payloadSnapshot || null,
      createdAt: batch.createdAt.toISOString(),
      createdBy: batch.createdBy || null,
      updatedAt: batch.updatedAt.toISOString(),
      updatedBy: batch.updatedBy || null,
      metadata: parseJson<Record<string, unknown> | null>(
        batch.metadataJson,
        null,
      ),
      skippedItems: parseJson<Array<Record<string, unknown>>>(
        batch.skippedItemsJson,
        [],
      ),
      receivableTitles: Array.isArray(batch.receivableTitles)
        ? batch.receivableTitles.map((title: any) => ({
            id: title.id,
            sourceEntityType: title.sourceEntityType,
            sourceEntityId: title.sourceEntityId,
            businessKey: title.businessKey,
            description: title.description,
            totalAmount: title.totalAmount,
            payerNameSnapshot: title.payerNameSnapshot,
            payerDocumentSnapshot: title.payerDocumentSnapshot || null,
            installments: Array.isArray(title.installments)
              ? title.installments.map((installment: any) => ({
                  id: installment.id,
                  sourceInstallmentKey: installment.sourceInstallmentKey,
                  installmentNumber: installment.installmentNumber,
                  installmentCount: installment.installmentCount,
                  dueDate: installment.dueDate.toISOString(),
                  amount: installment.amount,
                  descriptionSnapshot: installment.descriptionSnapshot,
                  payerNameSnapshot: installment.payerNameSnapshot,
                  payerDocumentSnapshot:
                    installment.payerDocumentSnapshot || null,
                }))
              : [],
          }))
        : undefined,
    };
  }

  async existingBusinessKeys(payload: ExistingBusinessKeysDto) {
    const company = await this.prisma.company.findUnique({
      where: {
        sourceSystem_sourceTenantId: {
          sourceSystem: normalizeText(payload.sourceSystem)!,
          sourceTenantId: normalizeText(payload.sourceTenantId)!,
        },
      },
    });

    if (!company) {
      return { existingBusinessKeys: [] };
    }

    const normalizedKeys = payload.businessKeys
      .map((item) => normalizeText(item))
      .filter((item): item is string => Boolean(item));

    const existing = await this.prisma.receivableTitle.findMany({
      where: {
        companyId: company.id,
        businessKey: {
          in: normalizedKeys,
        },
        canceledAt: null,
      },
      select: {
        businessKey: true,
      },
    });

    return {
      existingBusinessKeys: existing.map((item: any) => item.businessKey),
    };
  }

  async import(payload: ReceivablesImportDto) {
    if (!payload.items.length) {
      throw new BadRequestException(
        "Informe pelo menos um item para importação.",
      );
    }

    const company = await this.resolveCompany({
      companyId: payload.companyId,
      sourceSystem: payload.sourceSystem,
      sourceTenantId: payload.sourceTenantId,
      companyName: payload.companyName,
      companyDocument: payload.companyDocument,
      requestedBy: payload.requestedBy,
    });

    const normalizedBatchType =
      normalizeText(payload.sourceBatchType) || "IMPORTACAO";
    const normalizedBatchId = normalizeText(payload.sourceBatchId) || randomUUID();
    const normalizedSourceSystem = normalizeText(payload.sourceSystem)!;
    const normalizedSourceTenantId = normalizeText(payload.sourceTenantId)!;

    const existingBatch = await this.prisma.receivableBatch.findUnique({
      where: {
        companyId_sourceBatchId: {
          companyId: company.id,
          sourceBatchId: normalizedBatchId,
        },
      },
    });

    if (existingBatch) {
      throw new BadRequestException(
        "Este lote de origem já foi processado no Financeiro.",
      );
    }

    const normalizedItems = payload.items.map((item) => ({
      ...item,
      sourceEntityType: normalizeText(item.sourceEntityType) || "REGISTRO",
      sourceEntityId: normalizeText(item.sourceEntityId) || "SEM_ID",
      sourceEntityName: normalizeText(item.sourceEntityName),
      classLabel: normalizeText(item.classLabel),
      businessKey:
        normalizeText(item.businessKey) ||
        `${normalizedSourceSystem}:${normalizedSourceTenantId}:${randomUUID()}`,
      description: normalizeText(item.description) || "LANÇAMENTO FINANCEIRO",
      categoryCode: normalizeText(item.categoryCode),
      issueDate: dateToDateOnly(item.issueDate)!,
      payer: {
        ...item.payer,
        externalEntityType:
          normalizeText(item.payer.externalEntityType) || "PAGADOR",
        externalEntityId:
          normalizeText(item.payer.externalEntityId) || randomUUID(),
        name: normalizeText(item.payer.name) || "PAGADOR NÃO IDENTIFICADO",
        document: normalizeDigits(item.payer.document),
        email: normalizeEmail(item.payer.email),
        phone: normalizePhone(item.payer.phone),
      },
      installments: item.installments.map((installment) => ({
        ...installment,
        dueDate: dateToDateOnly(installment.dueDate)!,
        amount: roundMoney(Number(installment.amount || 0)),
        sourceInstallmentKey:
          normalizeText(installment.sourceInstallmentKey) ||
          `${normalizedBatchId}:${item.businessKey}:${installment.installmentNumber}`,
      })),
    }));

    const existingTitles = await this.prisma.receivableTitle.findMany({
      where: {
        companyId: company.id,
        businessKey: {
          in: normalizedItems.map((item) => item.businessKey),
        },
        canceledAt: null,
      },
      select: {
        businessKey: true,
      },
    });

    const existingKeySet = new Set(existingTitles.map((item: any) => item.businessKey));

    const batch = await this.prisma.receivableBatch.create({
      data: {
        companyId: company.id,
        sourceSystem: normalizedSourceSystem,
        sourceTenantId: normalizedSourceTenantId,
        sourceBatchType: normalizedBatchType,
        sourceBatchId: normalizedBatchId,
        referenceDate: payload.referenceDate
          ? parseIsoDate(payload.referenceDate, "a data de referência")
          : null,
        status: "PROCESSED",
        itemCount: 0,
        processedCount: 0,
        duplicateCount: 0,
        errorCount: 0,
        payloadSnapshot: serializeJson(payload),
        metadataJson: serializeJson(payload.metadata || null),
        skippedItemsJson: serializeJson(payload.skippedItems || []),
        createdBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
    });

    let importedTitles = 0;
    let importedInstallments = 0;
    let duplicates = 0;
    let errors = 0;

    for (const item of normalizedItems) {
      if (existingKeySet.has(item.businessKey)) {
        duplicates += 1;
        continue;
      }

      try {
        const payerParty = await this.ensurePayerParty(
          company.id,
          item.payer,
          payload.requestedBy,
        );

        const totalAmount = roundMoney(
          item.installments.reduce(
            (accumulator, installment) =>
              accumulator + Number(installment.amount || 0),
            0,
          ),
        );

        await this.prisma.$transaction(async (tx: any) => {
          const title = await tx.receivableTitle.create({
            data: {
              companyId: company.id,
              batchId: batch.id,
              payerPartyId: payerParty.id,
              sourceEntityType: item.sourceEntityType,
              sourceEntityId: item.sourceEntityId,
              sourceEntityName: item.sourceEntityName,
              classLabel: item.classLabel,
              businessKey: item.businessKey,
              description: item.description,
              categoryCode: item.categoryCode,
              totalAmount,
              payerNameSnapshot: item.payer.name,
              payerDocumentSnapshot: item.payer.document,
              payerEmailSnapshot: item.payer.email,
              payerPhoneSnapshot: item.payer.phone,
              createdBy: payload.requestedBy || null,
              updatedBy: payload.requestedBy || null,
            },
          });

          if (item.installments.length) {
            await tx.receivableInstallment.createMany({
              data: item.installments.map((installment) => ({
                companyId: company.id,
                batchId: batch.id,
                titleId: title.id,
                sourceInstallmentKey: installment.sourceInstallmentKey,
                installmentNumber: installment.installmentNumber,
                installmentCount: installment.installmentCount,
                dueDate: parseIsoDate(
                  installment.dueDate,
                  "o vencimento da parcela",
                ),
                amount: installment.amount,
                openAmount: installment.amount,
                paidAmount: 0,
                status: "OPEN",
                descriptionSnapshot: item.description,
                payerNameSnapshot: item.payer.name,
                payerDocumentSnapshot: item.payer.document,
                createdBy: payload.requestedBy || null,
                updatedBy: payload.requestedBy || null,
              })),
            });
          }
        });

        importedTitles += 1;
        importedInstallments += item.installments.length;
      } catch {
        errors += 1;
      }
    }

    await this.prisma.receivableBatch.update({
      where: { id: batch.id },
      data: {
        status:
          importedTitles === 0 && (duplicates > 0 || errors > 0)
            ? "FAILED"
            : duplicates > 0 || errors > 0
              ? "PARTIAL"
              : "PROCESSED",
        itemCount: importedTitles,
        processedCount: importedInstallments,
        duplicateCount: duplicates,
        errorCount: errors,
        updatedBy: payload.requestedBy || null,
      },
    });

    return {
      batchId: batch.id,
      importedTitles,
      importedInstallments,
      duplicates,
      errors,
      message:
        importedTitles > 0
          ? `Lote financeiro processado com ${importedTitles} título(s) e ${importedInstallments} parcela(s).`
          : "Nenhum título novo foi criado no Financeiro.",
    };
  }

  async listBatches(query: ListReceivableBatchesDto) {
    const normalizedSourceSystem = normalizeText(query.sourceSystem);
    const normalizedSourceTenantId = normalizeText(query.sourceTenantId);
    const normalizedSearch = normalizeText(query.search);

    const batches = await this.prisma.receivableBatch.findMany({
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
                { sourceBatchType: { contains: normalizedSearch } },
                { sourceSystem: { contains: normalizedSearch } },
                { sourceTenantId: { contains: normalizedSearch } },
                { company: { name: { contains: normalizedSearch } } },
              ],
            }
          : {}),
      },
      include: {
        company: {
          select: {
            name: true,
          },
        },
        receivableTitles: {
          select: {
            totalAmount: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return batches.map((batch: any) => ({
      ...this.mapBatch(batch),
      companyName: batch.company.name,
      receivableTitles: batch.receivableTitles.map((title: any) => ({
        totalAmount: title.totalAmount,
      })),
    }));
  }

  async getBatch(batchId: string, query: ListReceivableBatchesDto) {
    const normalizedBatchId = String(batchId || "").trim();
    if (!normalizedBatchId) {
      throw new BadRequestException("Lote financeiro inválido.");
    }

    const normalizedSourceSystem = normalizeText(query.sourceSystem);
    const normalizedSourceTenantId = normalizeText(query.sourceTenantId);

    const batch = await this.prisma.receivableBatch.findFirst({
      where: {
        id: normalizedBatchId,
        canceledAt: null,
        ...(normalizedSourceSystem
          ? { sourceSystem: normalizedSourceSystem }
          : {}),
        ...(normalizedSourceTenantId
          ? { sourceTenantId: normalizedSourceTenantId }
          : {}),
      },
      include: {
        receivableTitles: {
          where: {
            canceledAt: null,
          },
          include: {
            installments: {
              where: {
                canceledAt: null,
              },
              orderBy: [{ installmentNumber: "asc" }],
            },
          },
          orderBy: [{ sourceEntityName: "asc" }],
        },
      },
    });

    if (!batch) {
      throw new NotFoundException("LOTE NÃO ENCONTRADO.");
    }

    return this.mapBatch(batch);
  }

  async listInstallments(query: ListReceivableInstallmentsDto) {
    const normalizedSourceSystem = normalizeText(query.sourceSystem);
    const normalizedSourceTenantId = normalizeText(query.sourceTenantId);

    const installments = await this.prisma.receivableInstallment.findMany({
      where: {
        ...this.buildInstallmentFilters(query),
        ...(normalizedSourceSystem || normalizedSourceTenantId
          ? {
              batch: {
                ...(normalizedSourceSystem
                  ? { sourceSystem: normalizedSourceSystem }
                  : {}),
                ...(normalizedSourceTenantId
                  ? { sourceTenantId: normalizedSourceTenantId }
                  : {}),
              },
            }
          : {}),
      },
      include: {
        title: {
          select: {
            sourceEntityType: true,
            sourceEntityId: true,
            sourceEntityName: true,
            classLabel: true,
            businessKey: true,
          },
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    });

    return installments.map((installment: any) => ({
      id: installment.id,
      titleId: installment.titleId,
      batchId: installment.batchId,
      sourceEntityType: installment.title.sourceEntityType,
      sourceEntityId: installment.title.sourceEntityId,
      sourceEntityName:
        installment.title.sourceEntityName || installment.title.sourceEntityId,
      classLabel: installment.title.classLabel || null,
      businessKey: installment.title.businessKey,
      sourceInstallmentKey: installment.sourceInstallmentKey,
      description: installment.descriptionSnapshot,
      payerNameSnapshot: installment.payerNameSnapshot,
      payerDocumentSnapshot: installment.payerDocumentSnapshot || null,
      installmentNumber: installment.installmentNumber,
      installmentCount: installment.installmentCount,
      dueDate: installment.dueDate.toISOString(),
      amount: installment.amount,
      openAmount: installment.openAmount,
      paidAmount: installment.paidAmount,
      status: installment.status,
      settlementMethod: installment.settlementMethod || null,
      settledAt: installment.settledAt?.toISOString() || null,
      isOverdue:
        installment.status === "OPEN" && isOverdueDate(installment.dueDate),
    }));
  }
}
