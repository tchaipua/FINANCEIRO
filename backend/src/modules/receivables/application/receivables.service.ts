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
  buildInstallmentSettlementSuggestion,
  resolveFinancialRuleSettings,
} from "../../../common/manual-settlement.utils";
import {
  ApplyBankReturnLiquidationsDto,
  AssignBankToInstallmentsDto,
  ExistingBusinessKeysDto,
  GetBankReturnImportDto,
  ImportBankReturnDto,
  IssueBankSlipsDto,
  ListBankReturnImportsDto,
  ListReceivableBatchesDto,
  ListReceivableInstallmentsDto,
  ReceivablesImportDto,
} from "./dto/receivables.dto";
import { SicoobBillingService } from "./sicoob-billing.service";
import {
  buildImportedBankReturnItem,
  evaluateBankReturnForInstallment,
  resolveBankReturnMovementStatus,
  SICOOB_MOVEMENT_TYPE_CODES,
} from "./bank-return.utils";

@Injectable()
export class ReceivablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sicoobBillingService: SicoobBillingService,
  ) {}

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

  private buildFinancialSettingsPersistenceData(
    settings?: {
      interestRate?: number | null;
      interestGracePeriod?: number | null;
      penaltyRate?: number | null;
      penaltyValue?: number | null;
      penaltyGracePeriod?: number | null;
    } | null,
  ) {
    return {
      interestRate: this.normalizeOptionalMoney(settings?.interestRate),
      interestGracePeriod: this.normalizeOptionalInt(
        settings?.interestGracePeriod,
      ),
      penaltyRate: this.normalizeOptionalMoney(settings?.penaltyRate),
      penaltyValue: this.normalizeOptionalMoney(settings?.penaltyValue),
      penaltyGracePeriod: this.normalizeOptionalInt(
        settings?.penaltyGracePeriod,
      ),
    };
  }

  private async resolveCompany(filters: {
    companyId?: string | null;
    sourceSystem?: string | null;
    sourceTenantId?: string | null;
    companyName?: string | null;
    companyDocument?: string | null;
    financialSettings?: {
      interestRate?: number | null;
      interestGracePeriod?: number | null;
      penaltyRate?: number | null;
      penaltyValue?: number | null;
      penaltyGracePeriod?: number | null;
    } | null;
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

    const normalizedCompanyName = normalizeText(filters.companyName);
    const normalizedCompanyDocument = normalizeDigits(filters.companyDocument);

    if (existing) {
      const updateData: Record<string, unknown> = {
        updatedBy: filters.requestedBy || null,
      };

      if (filters.financialSettings !== undefined) {
        Object.assign(
          updateData,
          this.buildFinancialSettingsPersistenceData(filters.financialSettings),
        );
      }

      if (normalizedCompanyName) {
        updateData.name = normalizedCompanyName;
      }

      if (normalizedCompanyDocument) {
        updateData.document = normalizedCompanyDocument;
      }

      return this.prisma.company.update({
        where: { id: existing.id },
        data: updateData,
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
        ...(filters.financialSettings !== undefined
          ? this.buildFinancialSettingsPersistenceData(filters.financialSettings)
          : {}),
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
      addressLine1?: string | null;
      neighborhood?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
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
      addressLine1: normalizeText(payer.addressLine1),
      neighborhood: normalizeText(payer.neighborhood),
      city: normalizeText(payer.city),
      state: normalizeText(payer.state),
      postalCode: normalizeDigits(payer.postalCode),
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

  private buildBankAccountLabel(bank: {
    bankName: string;
    branchNumber: string;
    branchDigit?: string | null;
    accountNumber: string;
    accountDigit?: string | null;
  }) {
    const agencyLabel = `${bank.branchNumber}${bank.branchDigit ? `-${bank.branchDigit}` : ""}`;
    const accountLabel = `${bank.accountNumber}${bank.accountDigit ? `-${bank.accountDigit}` : ""}`;
    return `${bank.bankName} - AG ${agencyLabel} - CC ${accountLabel}`;
  }

  private buildInstallmentFinancialSettingsSnapshot(installment: any) {
    return resolveFinancialRuleSettings({
      interestRate:
        installment.interestRate ?? installment.company?.interestRate ?? null,
      interestGracePeriod:
        installment.interestGracePeriod ??
        installment.company?.interestGracePeriod ??
        null,
      penaltyRate:
        installment.penaltyRate ?? installment.company?.penaltyRate ?? null,
      penaltyValue:
        installment.penaltyValue ?? installment.company?.penaltyValue ?? null,
      penaltyGracePeriod:
        installment.penaltyGracePeriod ??
        installment.company?.penaltyGracePeriod ??
        null,
    });
  }

  private buildSicoobAccountNumber(bank: {
    accountNumber: string;
    accountDigit?: string | null;
  }) {
    return normalizeDigits(`${bank.accountNumber || ""}${bank.accountDigit || ""}`);
  }

  private parseBankSlipSequence(value: number | null | undefined) {
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized <= 0) {
      throw new BadRequestException(
        "Configure o próximo número do boleto no cadastro do banco.",
      );
    }

    return normalized;
  }

  private parseBankReturnPeriod(
    periodStart?: string | null,
    periodEnd?: string | null,
  ) {
    const parseDateOnly = (value?: string | null, label = "a data") => {
      const normalized = String(value || "").trim();

      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        throw new BadRequestException(`Informe ${label} válida.`);
      }

      const [year, month, day] = normalized.split("-").map((item) => Number(item));
      const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));

      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException(`Informe ${label} válida.`);
      }

      return parsed;
    };

    const parsedStart = parseDateOnly(periodStart, "a data inicial");
    const parsedEnd = parseDateOnly(periodEnd, "a data final");

    if (parsedStart > parsedEnd) {
      throw new BadRequestException(
        "A data inicial do retorno bancário não pode ser maior que a data final.",
      );
    }

    const rangeInDays =
      Math.floor(
        (parsedEnd.getTime() - parsedStart.getTime()) / (24 * 60 * 60 * 1000),
      ) + 1;

    if (rangeInDays > 31) {
      throw new BadRequestException(
        "Importe no máximo 31 dias por vez no retorno bancário.",
      );
    }

    return {
      parsedStart,
      parsedEnd,
      rangeInDays,
    };
  }

  private buildDateRangeArray(start: Date, end: Date) {
    const current = new Date(start);
    const dates: Date[] = [];

    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  private buildBankReturnInstallmentMaps(
    installments: Array<{
      id: string;
      sourceInstallmentKey: string;
      status: string;
      openAmount: number;
      paidAmount: number;
      settledAt?: Date | null;
      bankSlipOurNumber?: string | null;
      bankSlipBarcode?: string | null;
    }>,
  ) {
    const byOurNumber = new Map<string, (typeof installments)[number]>();
    const byBarcode = new Map<string, (typeof installments)[number]>();

    for (const installment of installments) {
      const normalizedOurNumber = normalizeDigits(installment.bankSlipOurNumber);
      const normalizedBarcode = normalizeDigits(installment.bankSlipBarcode);

      if (normalizedOurNumber && !byOurNumber.has(normalizedOurNumber)) {
        byOurNumber.set(normalizedOurNumber, installment);
      }

      if (normalizedBarcode && !byBarcode.has(normalizedBarcode)) {
        byBarcode.set(normalizedBarcode, installment);
      }
    }

    return {
      byOurNumber,
      byBarcode,
    };
  }

  private evaluateBankReturnImportItem(item: {
    movementStatus: string;
    appliedStatus?: string | null;
    matchedInstallment?: {
      id: string;
      sourceInstallmentKey: string;
      status: string;
      openAmount: number;
      paidAmount: number;
      settledAt?: Date | null;
    } | null;
  }) {
    return evaluateBankReturnForInstallment({
      movementStatus: item.movementStatus,
      appliedStatus: item.appliedStatus,
      installment: item.matchedInstallment
        ? {
            id: item.matchedInstallment.id,
            sourceInstallmentKey: item.matchedInstallment.sourceInstallmentKey,
            status: item.matchedInstallment.status,
            openAmount: item.matchedInstallment.openAmount,
            paidAmount: item.matchedInstallment.paidAmount,
            settledAt: item.matchedInstallment.settledAt || null,
          }
        : null,
    });
  }

  private summarizeBankReturnImportItems(
    items: Array<{
      movementStatus: string;
      appliedStatus?: string | null;
      matchedInstallment?: {
        id: string;
        sourceInstallmentKey: string;
        status: string;
        openAmount: number;
        paidAmount: number;
        settledAt?: Date | null;
      } | null;
    }>,
  ) {
    let importedItemCount = 0;
    let matchedItemCount = 0;
    let liquidatedItemCount = 0;
    let bankClosedItemCount = 0;
    let readyToApplyCount = 0;
    let appliedItemCount = 0;
    let unmatchedItemCount = 0;

    for (const item of items) {
      importedItemCount += 1;
      if (item.matchedInstallment) {
        matchedItemCount += 1;
      } else {
        unmatchedItemCount += 1;
      }

      if (normalizeText(item.movementStatus) === "LIQUIDATED") {
        liquidatedItemCount += 1;
      }

      if (normalizeText(item.movementStatus) === "WRITE_OFF") {
        bankClosedItemCount += 1;
      }

      if (normalizeText(item.appliedStatus) === "APPLIED") {
        appliedItemCount += 1;
      }

      const evaluation = this.evaluateBankReturnImportItem(item);
      if (evaluation.canApply) {
        readyToApplyCount += 1;
      }
    }

    return {
      importedItemCount,
      matchedItemCount,
      liquidatedItemCount,
      bankClosedItemCount,
      readyToApplyCount,
      appliedItemCount,
      unmatchedItemCount,
      status:
        appliedItemCount > 0
          ? readyToApplyCount > 0
            ? "PARTIAL"
            : "APPLIED"
          : "IMPORTED",
    };
  }

  private mapBankReturnImport(item: any) {
    return {
      id: item.id,
      provider: item.provider,
      status: item.status,
      periodStart: item.periodStart.toISOString(),
      periodEnd: item.periodEnd.toISOString(),
      importedItemCount: item.importedItemCount,
      matchedItemCount: item.matchedItemCount,
      liquidatedItemCount: item.liquidatedItemCount,
      bankClosedItemCount: item.bankClosedItemCount,
      readyToApplyCount: item.readyToApplyCount,
      appliedItemCount: item.appliedItemCount,
      unmatchedItemCount: item.unmatchedItemCount,
      bankAccountId: item.bankAccountId,
      bankAccountLabel: item.bankAccount
        ? this.buildBankAccountLabel(item.bankAccount)
        : null,
      companyName: item.company?.name || null,
      createdAt: item.createdAt.toISOString(),
      summary: parseJson<Record<string, unknown>>(item.summaryJson, {}),
    };
  }

  private mapBankReturnImportItem(item: any) {
    const evaluation = this.evaluateBankReturnImportItem({
      movementStatus: item.movementStatus,
      appliedStatus: item.appliedStatus,
      matchedInstallment: item.matchedInstallment || null,
    });

    return {
      id: item.id,
      movementTypeCode: item.movementTypeCode,
      movementStatus: item.movementStatus,
      dueDate: item.dueDate?.toISOString() || null,
      movementDate: item.movementDate?.toISOString() || null,
      paymentDate: item.paymentDate?.toISOString() || null,
      expectedCreditDate: item.expectedCreditDate?.toISOString() || null,
      ourNumber: item.ourNumber || null,
      yourNumber: item.yourNumber || null,
      barcode: item.barcode || null,
      contractNumber: item.contractNumber || null,
      amount: item.amount,
      settledAmount: item.settledAmount,
      discountAmount: item.discountAmount,
      interestAmount: item.interestAmount,
      feeAmount: item.feeAmount,
      appliedAt: item.appliedAt?.toISOString() || null,
      appliedStatus: item.appliedStatus || null,
      suggestionCode: evaluation.suggestionCode,
      suggestionLabel: evaluation.suggestionLabel,
      noteText: evaluation.noteText,
      canApply: evaluation.canApply,
      matchedInstallment: item.matchedInstallment
        ? {
            id: item.matchedInstallment.id,
            sourceInstallmentKey: item.matchedInstallment.sourceInstallmentKey,
            status: item.matchedInstallment.status,
            openAmount: item.matchedInstallment.openAmount,
            paidAmount: item.matchedInstallment.paidAmount,
            settledAt: item.matchedInstallment.settledAt?.toISOString() || null,
          }
        : null,
    };
  }

  private buildInstallmentBankSlipReference(sequenceNumber: number) {
    const normalized = this.parseBankSlipSequence(sequenceNumber);
    return String(normalized);
  }

  private mapBatch(batch: any) {
    return {
      id: batch.id,
      companyId: batch.companyId,
      companyName: batch.company?.name || null,
      companyDocument: batch.company?.document || null,
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
                bankAccountId: installment.bankAccountId || null,
                bankAccountLabel: installment.bankAccountLabel || null,
                bankAssignedAt: installment.bankAssignedAt?.toISOString() || null,
                bankAssignedBy: installment.bankAssignedBy || null,
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
      financialSettings: payload.financialSettings,
      requestedBy: payload.requestedBy,
    });
    const companyFinancialSettings = resolveFinancialRuleSettings(company);

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
                interestRate: companyFinancialSettings.interestRate,
                interestGracePeriod:
                  companyFinancialSettings.interestGracePeriod,
                penaltyRate: companyFinancialSettings.penaltyRate,
                penaltyValue: companyFinancialSettings.penaltyValue,
                penaltyGracePeriod:
                  companyFinancialSettings.penaltyGracePeriod,
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
            document: true,
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
        company: {
          select: {
            name: true,
            document: true,
          },
        },
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
    const normalizedBatchId = String(query.batchId || "").trim();

    const installments = await this.prisma.receivableInstallment.findMany({
      where: {
        ...this.buildInstallmentFilters(query),
        ...(normalizedBatchId ? { batchId: normalizedBatchId } : {}),
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
        company: {
          select: {
            interestRate: true,
            interestGracePeriod: true,
            penaltyRate: true,
            penaltyValue: true,
            penaltyGracePeriod: true,
          },
        },
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

    return installments.map((installment: any) => {
      const financialSettings =
        this.buildInstallmentFinancialSettingsSnapshot(installment);
      const settlementSuggestion = buildInstallmentSettlementSuggestion({
        dueDate: installment.dueDate,
        openAmount: installment.openAmount,
        settings: financialSettings,
      });

      return {
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
        interestRate: financialSettings.interestRate,
        interestGracePeriod: financialSettings.interestGracePeriod,
        penaltyRate: financialSettings.penaltyRate,
        penaltyValue: financialSettings.penaltyValue,
        penaltyGracePeriod: financialSettings.penaltyGracePeriod,
        suggestedDiscountAmount: settlementSuggestion.suggestedDiscountAmount,
        suggestedInterestAmount: settlementSuggestion.suggestedInterestAmount,
        suggestedPenaltyAmount: settlementSuggestion.suggestedPenaltyAmount,
        suggestedReceivedAmount: settlementSuggestion.suggestedReceivedAmount,
        overdueDays: settlementSuggestion.overdueDays,
        interestDays: settlementSuggestion.interestDays,
        penaltyApplied: settlementSuggestion.penaltyApplied,
        status: installment.status,
        settlementMethod: installment.settlementMethod || null,
        settledAt: installment.settledAt?.toISOString() || null,
        bankAccountId: installment.bankAccountId || null,
        bankAccountLabel: installment.bankAccountLabel || null,
        bankAssignedAt: installment.bankAssignedAt?.toISOString() || null,
        bankAssignedBy: installment.bankAssignedBy || null,
        bankSlipStatus: installment.bankSlipStatus || null,
        bankSlipMessage: installment.bankSlipMessage || null,
        bankSlipProvider: installment.bankSlipProvider || null,
        bankSlipOurNumber: installment.bankSlipOurNumber || null,
        bankSlipYourNumber: installment.bankSlipYourNumber || null,
        bankSlipDigitableLine: installment.bankSlipDigitableLine || null,
        bankSlipBarcode: installment.bankSlipBarcode || null,
        bankSlipQrCode: installment.bankSlipQrCode || null,
        bankSlipIssuedAt: installment.bankSlipIssuedAt?.toISOString() || null,
        hasBankSlipPdf: Boolean(installment.bankSlipPdfBase64),
        isOverdue:
          installment.status === "OPEN" && isOverdueDate(installment.dueDate),
      };
    });
  }

  async assignBankToInstallments(
    batchId: string,
    payload: AssignBankToInstallmentsDto,
  ) {
    const normalizedBatchId = String(batchId || "").trim();
    if (!normalizedBatchId) {
      throw new BadRequestException("Lote financeiro inválido.");
    }

    const normalizedSourceSystem = normalizeText(payload.sourceSystem);
    const normalizedSourceTenantId = normalizeText(payload.sourceTenantId);
    const normalizedBankAccountId = String(payload.bankAccountId || "").trim();
    const installmentIds = Array.from(
      new Set(
        payload.installmentIds
          .map((item) => String(item || "").trim())
          .filter((item): item is string => Boolean(item)),
      ),
    );

    if (!normalizedSourceSystem || !normalizedSourceTenantId) {
      throw new BadRequestException(
        "Informe o sistema e o tenant de origem para localizar o lote.",
      );
    }

    if (!normalizedBankAccountId) {
      throw new BadRequestException("Selecione o banco que enviará os boletos.");
    }

    if (!installmentIds.length) {
      throw new BadRequestException(
        "Selecione ao menos uma parcela para vincular ao banco.",
      );
    }

    const batch = await this.prisma.receivableBatch.findFirst({
      where: {
        id: normalizedBatchId,
        sourceSystem: normalizedSourceSystem,
        sourceTenantId: normalizedSourceTenantId,
        canceledAt: null,
      },
      select: {
        id: true,
        companyId: true,
      },
    });

    if (!batch) {
      throw new NotFoundException("LOTE NÃO ENCONTRADO.");
    }

    const bank = await this.prisma.bankAccount.findFirst({
      where: {
        id: normalizedBankAccountId,
        companyId: batch.companyId,
        status: "ACTIVE",
        canceledAt: null,
      },
      select: {
        id: true,
        bankName: true,
        branchNumber: true,
        branchDigit: true,
        accountNumber: true,
        accountDigit: true,
      },
    });

    if (!bank) {
      throw new BadRequestException(
        "Selecione um banco ativo válido para este lote financeiro.",
      );
    }

    const installments = await this.prisma.receivableInstallment.findMany({
      where: {
        id: { in: installmentIds },
        companyId: batch.companyId,
        batchId: batch.id,
        canceledAt: null,
      },
      select: {
        id: true,
        status: true,
        openAmount: true,
      },
    });

    if (installments.length !== installmentIds.length) {
      throw new BadRequestException(
        "Uma ou mais parcelas selecionadas não pertencem a este lançamento.",
      );
    }

    const blockedInstallments = installments.filter(
      (installment) =>
        installment.status !== "OPEN" || Number(installment.openAmount || 0) <= 0,
    );

    if (blockedInstallments.length) {
      throw new BadRequestException(
        "Selecione apenas parcelas em aberto para vincular ao banco de boletos.",
      );
    }

    const bankAccountLabel = this.buildBankAccountLabel(bank);

    const result = await this.prisma.receivableInstallment.updateMany({
      where: {
        id: { in: installmentIds },
        companyId: batch.companyId,
        batchId: batch.id,
        canceledAt: null,
      },
      data: {
        bankAccountId: bank.id,
        bankAccountLabel,
        bankAssignedAt: new Date(),
        bankAssignedBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
    });

    return {
      batchId: batch.id,
      bankAccountId: bank.id,
      bankAccountLabel,
      updatedCount: result.count,
      message:
        result.count === 1
          ? "1 parcela vinculada ao banco de envio de boletos."
          : `${result.count} parcelas vinculadas ao banco de envio de boletos.`,
    };
  }

  async issueBankSlips(batchId: string, payload: IssueBankSlipsDto) {
    const normalizedBatchId = String(batchId || "").trim();
    if (!normalizedBatchId) {
      throw new BadRequestException("Lote financeiro inválido.");
    }

    const normalizedSourceSystem = normalizeText(payload.sourceSystem);
    const normalizedSourceTenantId = normalizeText(payload.sourceTenantId);
    const normalizedBankAccountId = String(payload.bankAccountId || "").trim();
    const installmentIds = Array.from(
      new Set(
        payload.installmentIds
          .map((item) => String(item || "").trim())
          .filter((item): item is string => Boolean(item)),
      ),
    );

    if (!normalizedSourceSystem || !normalizedSourceTenantId) {
      throw new BadRequestException(
        "Informe o sistema e o tenant de origem para localizar o lote.",
      );
    }

    if (!normalizedBankAccountId) {
      throw new BadRequestException("Selecione o banco emissor dos boletos.");
    }

    if (!installmentIds.length) {
      throw new BadRequestException(
        "Selecione ao menos uma parcela para emitir o boleto.",
      );
    }

    const batch = await this.prisma.receivableBatch.findFirst({
      where: {
        id: normalizedBatchId,
        sourceSystem: normalizedSourceSystem,
        sourceTenantId: normalizedSourceTenantId,
        canceledAt: null,
      },
      select: {
        id: true,
        companyId: true,
      },
    });

    if (!batch) {
      throw new NotFoundException("LOTE NÃO ENCONTRADO.");
    }

    const bank = await this.prisma.bankAccount.findFirst({
      where: {
        id: normalizedBankAccountId,
        companyId: batch.companyId,
        status: "ACTIVE",
        canceledAt: null,
      },
      select: {
        id: true,
        bankCode: true,
        bankName: true,
        branchNumber: true,
        branchDigit: true,
        accountNumber: true,
        accountDigit: true,
        billingProvider: true,
        billingEnvironment: true,
        billingApiClientId: true,
        billingApiClientSecret: true,
        billingCertificateBase64: true,
        billingCertificatePassword: true,
        billingBeneficiaryCode: true,
        billingWalletVariation: true,
        billingContractNumber: true,
        billingModalityCode: true,
        billingDocumentSpeciesCode: true,
        billingAcceptanceCode: true,
        billingIssueTypeCode: true,
        billingDistributionTypeCode: true,
        billingNextBoletoNumber: true,
        billingRegisterPixCode: true,
        billingInstructionLine1: true,
        billingInstructionLine2: true,
        billingDefaultFinePercent: true,
        billingDefaultInterestPercent: true,
        billingProtestDays: true,
        billingNegativeDays: true,
      },
    });

    if (!bank) {
      throw new BadRequestException(
        "Selecione um banco ativo válido para este lote financeiro.",
      );
    }

    if (normalizeText(bank.billingProvider) !== "SICOOB") {
      throw new BadRequestException(
        "A emissão automática disponível no momento atende apenas bancos configurados como SICOOB.",
      );
    }

    if (!bank.billingApiClientId) {
      throw new BadRequestException(
        "Client ID não configurado no cadastro do banco.",
      );
    }

    if (!bank.billingCertificateBase64 || !bank.billingCertificatePassword) {
      throw new BadRequestException(
        "Certificado digital não configurado no cadastro do banco.",
      );
    }

    if (!bank.billingBeneficiaryCode) {
      throw new BadRequestException(
        "Código do beneficiário não configurado no cadastro do banco.",
      );
    }

    const installments = await this.prisma.receivableInstallment.findMany({
      where: {
        id: { in: installmentIds },
        companyId: batch.companyId,
        batchId: batch.id,
        canceledAt: null,
      },
      include: {
        title: {
          select: {
            sourceEntityName: true,
            payerParty: {
              select: {
                name: true,
                document: true,
                email: true,
                addressLine1: true,
                neighborhood: true,
                city: true,
                state: true,
                postalCode: true,
              },
            },
          },
        },
      },
      orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }],
    });

    if (installments.length !== installmentIds.length) {
      throw new BadRequestException(
        "Uma ou mais parcelas selecionadas não pertencem a este lançamento.",
      );
    }

    const blockedInstallments = installments.filter(
      (installment) =>
        installment.status !== "OPEN" ||
        Number(installment.openAmount || 0) <= 0 ||
        normalizeText(installment.bankSlipStatus) === "ISSUED",
    );

    if (blockedInstallments.length) {
      throw new BadRequestException(
        "Selecione apenas parcelas abertas e ainda não emitidas.",
      );
    }

    const installmentsWithoutAddress = installments.filter((installment) => {
      const payer = installment.title?.payerParty;
      return !(
        normalizeText(payer?.addressLine1) &&
        normalizeText(payer?.neighborhood) &&
        normalizeText(payer?.city) &&
        normalizeText(payer?.state) &&
        normalizeDigits(payer?.postalCode)
      );
    });

    if (installmentsWithoutAddress.length) {
      throw new BadRequestException(
        "O pagador precisa ter endereço completo cadastrado para emitir boletos.",
      );
    }

    let nextBoletoNumber = this.parseBankSlipSequence(bank.billingNextBoletoNumber);
    const bankAccountLabel = this.buildBankAccountLabel(bank);
    const issuedItems: Array<Record<string, unknown>> = [];
    const failedItems: Array<Record<string, unknown>> = [];
    let discoveredContractNumber: string | null = null;

    for (const installment of installments) {
      const payerParty = installment.title?.payerParty;

      try {
        let sequenceNumber = nextBoletoNumber;
        let response: Awaited<
          ReturnType<SicoobBillingService["issueBankSlip"]>
        > | null = null;
        let lastEmissionError: unknown = null;

        for (let attempt = 0; attempt < 20; attempt += 1) {
          sequenceNumber = nextBoletoNumber;

          try {
            response = await this.sicoobBillingService.issueBankSlip(
              {
                environment: bank.billingEnvironment,
                clientId: bank.billingApiClientId,
                certificateBase64: bank.billingCertificateBase64,
                certificatePassword: bank.billingCertificatePassword,
                beneficiaryCode: bank.billingBeneficiaryCode,
                accountNumber: this.buildSicoobAccountNumber(bank) || "",
                contractNumber: bank.billingContractNumber,
                modalityCode:
                  bank.billingModalityCode || bank.billingWalletVariation,
                documentSpeciesCode: bank.billingDocumentSpeciesCode,
                acceptanceCode: bank.billingAcceptanceCode,
                issueTypeCode: bank.billingIssueTypeCode,
                distributionTypeCode: bank.billingDistributionTypeCode,
                registerPixCode: bank.billingRegisterPixCode,
                instructionLine1: bank.billingInstructionLine1,
                instructionLine2: bank.billingInstructionLine2,
                defaultFinePercent: bank.billingDefaultFinePercent,
                defaultInterestPercent: bank.billingDefaultInterestPercent,
                protestDays: bank.billingProtestDays,
                negativeDays: bank.billingNegativeDays,
              },
              {
                sequenceNumber,
                amount: installment.openAmount,
                dueDate: installment.dueDate,
                installmentNumber: installment.installmentNumber,
                payer: {
                  name: payerParty?.name || installment.payerNameSnapshot,
                  document:
                    payerParty?.document ||
                    installment.payerDocumentSnapshot ||
                    "",
                  email: payerParty?.email || null,
                  addressLine1: payerParty?.addressLine1 || "",
                  neighborhood: payerParty?.neighborhood || "",
                  city: payerParty?.city || "",
                  state: payerParty?.state || "",
                  postalCode: payerParty?.postalCode || "",
                },
              },
            );
            break;
          } catch (error) {
            lastEmissionError = error;
            const errorMessage = normalizeText(
              error instanceof Error ? error.message : "",
            );

            if (
              errorMessage &&
              errorMessage.includes("EXISTE BOLETO CADASTRADO")
            ) {
              nextBoletoNumber += 1;
              continue;
            }

            throw error;
          }
        }

        if (!response) {
          throw lastEmissionError instanceof Error
            ? lastEmissionError
            : new Error("Não foi possível emitir o boleto no banco.");
        }

        await this.prisma.receivableInstallment.update({
          where: { id: installment.id },
          data: {
            bankAccountId: bank.id,
            bankAccountLabel,
            bankAssignedAt: new Date(),
            bankAssignedBy: payload.requestedBy || null,
            bankSlipStatus: "ISSUED",
            bankSlipMessage: "BOLETO EMITIDO COM SUCESSO.",
            bankSlipProvider: "SICOOB",
            bankSlipOurNumber:
              response.nossoNumero ||
              this.buildInstallmentBankSlipReference(sequenceNumber),
            bankSlipYourNumber:
              response.seuNumero ||
              this.buildInstallmentBankSlipReference(sequenceNumber),
            bankSlipDigitableLine: response.linhaDigitavel,
            bankSlipBarcode: response.codigoBarras,
            bankSlipQrCode: response.qrCode,
            bankSlipPdfBase64: response.pdfBoleto,
            bankSlipPayloadJson: response.payloadJson,
            bankSlipResponseJson: response.rawResponseJson,
            bankSlipIssuedAt: new Date(),
            bankSlipIssuedBy: payload.requestedBy || null,
            updatedBy: payload.requestedBy || null,
          },
        });

        issuedItems.push({
          installmentId: installment.id,
          sourceInstallmentKey: installment.sourceInstallmentKey,
          nossoNumero:
            response.nossoNumero ||
            this.buildInstallmentBankSlipReference(sequenceNumber),
          linhaDigitavel: response.linhaDigitavel,
        });

        if (!discoveredContractNumber && response.numeroContratoCobranca) {
          discoveredContractNumber = response.numeroContratoCobranca;
        }

        nextBoletoNumber += 1;
      } catch (error) {
        const failureMessage =
          normalizeText(error instanceof Error ? error.message : "") ||
          "ERRO NA EMISSÃO DO BOLETO.";

        await this.prisma.receivableInstallment.update({
          where: { id: installment.id },
          data: {
            bankAccountId: bank.id,
            bankAccountLabel,
            bankAssignedAt: new Date(),
            bankAssignedBy: payload.requestedBy || null,
            bankSlipStatus: "ERROR",
            bankSlipMessage: failureMessage,
            bankSlipProvider: "SICOOB",
            updatedBy: payload.requestedBy || null,
          },
        });

        failedItems.push({
          installmentId: installment.id,
          sourceInstallmentKey: installment.sourceInstallmentKey,
          message: failureMessage,
        });

        break;
      }
    }

    const bankUpdateData: Record<string, unknown> = {};
    if (nextBoletoNumber !== bank.billingNextBoletoNumber) {
      bankUpdateData.billingNextBoletoNumber = nextBoletoNumber;
    }

    if (!bank.billingContractNumber && discoveredContractNumber) {
      bankUpdateData.billingContractNumber = discoveredContractNumber;
    }

    if (Object.keys(bankUpdateData).length) {
      bankUpdateData.updatedBy = payload.requestedBy || null;
      await this.prisma.bankAccount.update({
        where: { id: bank.id },
        data: bankUpdateData,
      });
    }

    return {
      batchId: batch.id,
      bankAccountId: bank.id,
      bankAccountLabel,
      issuedCount: issuedItems.length,
      errorCount: failedItems.length,
      nextBoletoNumber,
      issuedItems,
      failedItems,
      message:
        failedItems.length > 0
          ? issuedItems.length > 0
            ? `${issuedItems.length} boleto(s) emitido(s) e ${failedItems.length} falha(s) encontrada(s).`
            : "Nenhum boleto foi emitido."
          : issuedItems.length === 1
            ? "1 boleto emitido com sucesso."
            : `${issuedItems.length} boletos emitidos com sucesso.`,
    };
  }

  async listBankReturnImports(query: ListBankReturnImportsDto) {
    const normalizedSourceSystem = normalizeText(query.sourceSystem);
    const normalizedSourceTenantId = normalizeText(query.sourceTenantId);
    const normalizedBankAccountId = String(query.bankAccountId || "").trim();

    const imports = await this.prisma.bankReturnImport.findMany({
      where: {
        canceledAt: null,
        ...(normalizedBankAccountId ? { bankAccountId: normalizedBankAccountId } : {}),
        ...(normalizedSourceSystem || normalizedSourceTenantId
          ? {
              company: {
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
        company: {
          select: {
            name: true,
          },
        },
        bankAccount: {
          select: {
            bankName: true,
            branchNumber: true,
            branchDigit: true,
            accountNumber: true,
            accountDigit: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    return imports.map((item: any) => this.mapBankReturnImport(item));
  }

  async importBankReturns(payload: ImportBankReturnDto) {
    const normalizedSourceSystem = normalizeText(payload.sourceSystem);
    const normalizedSourceTenantId = normalizeText(payload.sourceTenantId);
    const normalizedBankAccountId = String(payload.bankAccountId || "").trim();

    if (!normalizedSourceSystem || !normalizedSourceTenantId) {
      throw new BadRequestException(
        "Informe o sistema e o tenant de origem para importar o retorno bancario.",
      );
    }

    if (!normalizedBankAccountId) {
      throw new BadRequestException(
        "Selecione o banco para importar o retorno bancario.",
      );
    }

    const { parsedStart, parsedEnd, rangeInDays } = this.parseBankReturnPeriod(
      payload.periodStart,
      payload.periodEnd,
    );

    const company = await this.resolveCompany({
      sourceSystem: normalizedSourceSystem,
      sourceTenantId: normalizedSourceTenantId,
      requestedBy: payload.requestedBy,
    });

    const bank = await this.prisma.bankAccount.findFirst({
      where: {
        id: normalizedBankAccountId,
        companyId: company.id,
        status: "ACTIVE",
        canceledAt: null,
      },
      select: {
        id: true,
        bankCode: true,
        bankName: true,
        branchNumber: true,
        branchDigit: true,
        accountNumber: true,
        accountDigit: true,
        billingProvider: true,
        billingApiClientId: true,
        billingCertificateBase64: true,
        billingCertificatePassword: true,
        billingBeneficiaryCode: true,
      },
    });

    if (!bank) {
      throw new NotFoundException("BANCO NAO ENCONTRADO.");
    }

    if (normalizeText(bank.billingProvider) !== "SICOOB") {
      throw new BadRequestException(
        "A importacao automatica de retorno disponivel no momento atende apenas bancos configurados como SICOOB.",
      );
    }

    if (!bank.billingApiClientId) {
      throw new BadRequestException(
        "Client ID nao configurado no cadastro do banco.",
      );
    }

    if (!bank.billingCertificateBase64 || !bank.billingCertificatePassword) {
      throw new BadRequestException(
        "Certificado digital nao configurado no cadastro do banco.",
      );
    }

    if (!bank.billingBeneficiaryCode) {
      throw new BadRequestException(
        "Codigo do beneficiario nao configurado no cadastro do banco.",
      );
    }

    const installments = await this.prisma.receivableInstallment.findMany({
      where: {
        companyId: company.id,
        bankAccountId: bank.id,
        canceledAt: null,
        OR: [
          { bankSlipOurNumber: { not: null } },
          { bankSlipBarcode: { not: null } },
        ],
      },
      select: {
        id: true,
        sourceInstallmentKey: true,
        status: true,
        openAmount: true,
        paidAmount: true,
        settledAt: true,
        bankSlipOurNumber: true,
        bankSlipBarcode: true,
      },
    });

    const installmentMaps = this.buildBankReturnInstallmentMaps(installments);
    const requestSnapshot: Array<Record<string, unknown>> = [];
    const importedItems: Array<Record<string, unknown>> = [];
    const rangeDates = this.buildDateRangeArray(parsedStart, parsedEnd);
    const movementTypes = [
      SICOOB_MOVEMENT_TYPE_CODES.LIQUIDATION,
      SICOOB_MOVEMENT_TYPE_CODES.WRITE_OFF,
    ];

    for (const currentDate of rangeDates) {
      const currentDateOnly = dateToDateOnly(currentDate);

      for (const movementType of movementTypes) {
        const downloadResult = await this.sicoobBillingService.downloadMovements(
          {
            clientId: bank.billingApiClientId,
            certificateBase64: bank.billingCertificateBase64,
            certificatePassword: bank.billingCertificatePassword,
          },
          {
            numeroCliente: Number(normalizeDigits(bank.billingBeneficiaryCode)),
            tipoMovimento: movementType,
            dataInicial: currentDateOnly || "",
            dataFinal: currentDateOnly || "",
            maxAttempts: 12,
            sleepMilliseconds: 700,
          },
        );

        requestSnapshot.push({
          date: currentDateOnly,
          movementType,
          codigoSolicitacao: downloadResult.codigoSolicitacao,
          totalRegistros: downloadResult.totalRegistros,
          idArquivos: downloadResult.idArquivos,
        });

        for (const record of downloadResult.records) {
          const movementPayload = record as Record<string, unknown>;
          const movementStatus = resolveBankReturnMovementStatus(
            String(movementPayload.siglaMovimento || ""),
          );
          const importedBase = buildImportedBankReturnItem({
            payload: movementPayload,
            movementStatus: movementStatus.code,
            requestCode: downloadResult.codigoSolicitacao,
            fileId: downloadResult.idArquivos[0],
          });

          const matchedInstallment =
            (importedBase.ourNumber
              ? installmentMaps.byOurNumber.get(importedBase.ourNumber)
              : null) ||
            (importedBase.barcode
              ? installmentMaps.byBarcode.get(importedBase.barcode)
              : null) ||
            null;

          importedItems.push({
            ...importedBase,
            matchedInstallmentId: matchedInstallment?.id || null,
            matchedInstallment: matchedInstallment
              ? {
                  id: matchedInstallment.id,
                  sourceInstallmentKey: matchedInstallment.sourceInstallmentKey,
                  status: matchedInstallment.status,
                  openAmount: matchedInstallment.openAmount,
                  paidAmount: matchedInstallment.paidAmount,
                  settledAt: matchedInstallment.settledAt || null,
                }
              : null,
          });
        }
      }
    }

    const summary = this.summarizeBankReturnImportItems(
      importedItems.map((item) => ({
        movementStatus: String(item.movementStatus || ""),
        matchedInstallment: (item.matchedInstallment as any) || null,
      })),
    );

    const createdImport = await this.prisma.$transaction(async (tx: any) => {
      const importSession = await tx.bankReturnImport.create({
        data: {
          companyId: company.id,
          bankAccountId: bank.id,
          provider: "SICOOB",
          periodStart: parsedStart,
          periodEnd: parsedEnd,
          importedItemCount: summary.importedItemCount,
          matchedItemCount: summary.matchedItemCount,
          liquidatedItemCount: summary.liquidatedItemCount,
          bankClosedItemCount: summary.bankClosedItemCount,
          readyToApplyCount: summary.readyToApplyCount,
          appliedItemCount: summary.appliedItemCount,
          unmatchedItemCount: summary.unmatchedItemCount,
          status: summary.status,
          requestSnapshotJson: serializeJson(requestSnapshot),
          summaryJson: serializeJson({
            rangeInDays,
            requestedDates: rangeDates
              .map((item) => dateToDateOnly(item))
              .filter((item): item is string => Boolean(item)),
          }),
          createdBy: payload.requestedBy || null,
          updatedBy: payload.requestedBy || null,
        },
      });

      if (importedItems.length) {
        await tx.bankReturnImportItem.createMany({
          data: importedItems.map((item) => ({
            importId: importSession.id,
            companyId: company.id,
            bankAccountId: bank.id,
            matchedInstallmentId: item.matchedInstallmentId,
            movementTypeCode: item.movementTypeCode,
            movementStatus: item.movementStatus,
            externalRequestCode: item.externalRequestCode,
            externalFileId: item.externalFileId,
            dueDate: item.dueDate,
            movementDate: item.movementDate,
            paymentDate: item.paymentDate,
            expectedCreditDate: item.expectedCreditDate,
            ourNumber: item.ourNumber,
            yourNumber: item.yourNumber,
            barcode: item.barcode,
            contractNumber: item.contractNumber,
            amount: item.amount,
            settledAmount: item.settledAmount,
            discountAmount: item.discountAmount,
            interestAmount: item.interestAmount,
            feeAmount: item.feeAmount,
            rawPayloadJson: item.rawPayloadJson,
            createdBy: payload.requestedBy || null,
            updatedBy: payload.requestedBy || null,
          })),
        });
      }

      return tx.bankReturnImport.findUnique({
        where: { id: importSession.id },
        include: {
          company: {
            select: {
              name: true,
            },
          },
          bankAccount: {
            select: {
              bankName: true,
              branchNumber: true,
              branchDigit: true,
              accountNumber: true,
              accountDigit: true,
            },
          },
        },
      });
    });

    return {
      ...this.mapBankReturnImport(createdImport),
      message:
        summary.importedItemCount > 0
          ? summary.importedItemCount === 1
            ? "1 retorno bancario importado para conferencia."
            : `${summary.importedItemCount} retornos bancarios importados para conferencia.`
          : "Nenhum retorno bancario foi encontrado no periodo informado.",
    };
  }

  async getBankReturnImport(importId: string, query: GetBankReturnImportDto) {
    const normalizedImportId = String(importId || "").trim();
    const normalizedSourceSystem = normalizeText(query.sourceSystem);
    const normalizedSourceTenantId = normalizeText(query.sourceTenantId);

    if (!normalizedImportId) {
      throw new BadRequestException("Importacao de retorno bancario invalida.");
    }

    if (!normalizedSourceSystem || !normalizedSourceTenantId) {
      throw new BadRequestException(
        "Informe o sistema e o tenant de origem para localizar a importacao do retorno bancario.",
      );
    }

    const importSession = await this.prisma.bankReturnImport.findFirst({
      where: {
        id: normalizedImportId,
        canceledAt: null,
        company: {
          sourceSystem: normalizedSourceSystem,
          sourceTenantId: normalizedSourceTenantId,
        },
      },
      include: {
        company: {
          select: {
            name: true,
          },
        },
        bankAccount: {
          select: {
            bankName: true,
            branchNumber: true,
            branchDigit: true,
            accountNumber: true,
            accountDigit: true,
          },
        },
        items: {
          where: {
            canceledAt: null,
          },
          include: {
            matchedInstallment: {
              select: {
                id: true,
                sourceInstallmentKey: true,
                status: true,
                openAmount: true,
                paidAmount: true,
                settledAt: true,
              },
            },
          },
          orderBy: [{ paymentDate: "desc" }, { movementDate: "desc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!importSession) {
      throw new NotFoundException("IMPORTACAO DE RETORNO BANCARIO NAO ENCONTRADA.");
    }

    const summary = this.summarizeBankReturnImportItems(
      importSession.items.map((item: any) => ({
        movementStatus: item.movementStatus,
        appliedStatus: item.appliedStatus,
        matchedInstallment: item.matchedInstallment || null,
      })),
    );

    return {
      ...this.mapBankReturnImport({
        ...importSession,
        ...summary,
        importedItemCount: summary.importedItemCount,
        matchedItemCount: summary.matchedItemCount,
        liquidatedItemCount: summary.liquidatedItemCount,
        bankClosedItemCount: summary.bankClosedItemCount,
        readyToApplyCount: summary.readyToApplyCount,
        appliedItemCount: summary.appliedItemCount,
        unmatchedItemCount: summary.unmatchedItemCount,
        status: summary.status,
      }),
      items: importSession.items.map((item: any) => this.mapBankReturnImportItem(item)),
    };
  }

  async applyBankReturnLiquidations(
    importId: string,
    payload: ApplyBankReturnLiquidationsDto,
  ) {
    const normalizedImportId = String(importId || "").trim();
    const normalizedSourceSystem = normalizeText(payload.sourceSystem);
    const normalizedSourceTenantId = normalizeText(payload.sourceTenantId);

    if (!normalizedImportId) {
      throw new BadRequestException("Importacao de retorno bancario invalida.");
    }

    if (!normalizedSourceSystem || !normalizedSourceTenantId) {
      throw new BadRequestException(
        "Informe o sistema e o tenant de origem para aplicar o retorno bancario.",
      );
    }

    const importSession = await this.prisma.bankReturnImport.findFirst({
      where: {
        id: normalizedImportId,
        canceledAt: null,
        company: {
          sourceSystem: normalizedSourceSystem,
          sourceTenantId: normalizedSourceTenantId,
        },
      },
      include: {
        company: {
          select: {
            id: true,
            sourceSystem: true,
            sourceTenantId: true,
          },
        },
        items: {
          where: {
            canceledAt: null,
          },
          include: {
            matchedInstallment: {
              select: {
                id: true,
                sourceInstallmentKey: true,
                status: true,
                openAmount: true,
                paidAmount: true,
                settledAt: true,
              },
            },
          },
          orderBy: [{ createdAt: "asc" }],
        },
      },
    });

    if (!importSession) {
      throw new NotFoundException("IMPORTACAO DE RETORNO BANCARIO NAO ENCONTRADA.");
    }

    const itemsToApply = importSession.items.filter((item: any) =>
      this.evaluateBankReturnImportItem({
        movementStatus: item.movementStatus,
        appliedStatus: item.appliedStatus,
        matchedInstallment: item.matchedInstallment || null,
      }).canApply,
    );

    if (!itemsToApply.length) {
      return {
        importId: importSession.id,
        appliedCount: 0,
        skippedCount: 0,
        message: "Nenhum retorno liquidado esta pronto para baixa no sistema.",
      };
    }

    const settlementPreview = itemsToApply.map((item: any) => {
      const discountAmount = roundMoney(Number(item.discountAmount || 0));
      const interestAmount = roundMoney(Number(item.interestAmount || 0));
      const penaltyAmount = 0;
      const receivedAmount = roundMoney(
        Number(item.matchedInstallment?.openAmount || 0) -
          discountAmount +
          interestAmount +
          penaltyAmount,
      );

      return {
        item,
        discountAmount,
        interestAmount,
        penaltyAmount,
        receivedAmount,
        settledAt:
          item.paymentDate || item.movementDate || item.createdAt || new Date(),
      };
    });

    const totalReceivedAmount = settlementPreview.reduce(
      (accumulator, current) => accumulator + current.receivedAmount,
      0,
    );

    const applicationResult = await this.prisma.$transaction(async (tx: any) => {
      const bankReturnCashSession = await tx.cashSession.create({
        data: {
          companyId: importSession.company.id,
          sourceSystem: importSession.company.sourceSystem,
          sourceTenantId: importSession.company.sourceTenantId,
          cashierUserId: "RETORNO_BANCARIO",
          cashierDisplayName: "RETORNO BANCARIO",
          status: "CLOSED",
          openingAmount: 0,
          totalReceivedAmount,
          expectedClosingAmount: totalReceivedAmount,
          openedAt: new Date(),
          closedAt: new Date(),
          notes: "BAIXA AUTOMATICA POR RETORNO BANCARIO",
          createdBy: payload.requestedBy || null,
          updatedBy: payload.requestedBy || null,
        },
      });

      const appliedItems: Array<Record<string, unknown>> = [];

      for (const preview of settlementPreview) {
        const item = preview.item;
        const currentInstallment = await tx.receivableInstallment.findFirst({
          where: {
            id: item.matchedInstallmentId,
            companyId: importSession.company.id,
            canceledAt: null,
          },
          select: {
            id: true,
            sourceInstallmentKey: true,
            status: true,
            openAmount: true,
            paidAmount: true,
          },
        });

        if (!currentInstallment) {
          await tx.bankReturnImportItem.update({
            where: { id: item.id },
            data: {
              appliedStatus: "SKIPPED_NO_MATCH",
              updatedBy: payload.requestedBy || null,
            },
          });
          continue;
        }

        if (
          normalizeText(currentInstallment.status) === "PAID" ||
          Number(currentInstallment.openAmount || 0) <= 0
        ) {
          await tx.bankReturnImportItem.update({
            where: { id: item.id },
            data: {
              appliedStatus: "SKIPPED_ALREADY_SETTLED",
              updatedBy: payload.requestedBy || null,
            },
          });
          continue;
        }

        const settlement = await tx.installmentSettlement.create({
          data: {
            companyId: importSession.company.id,
            installmentId: currentInstallment.id,
            cashSessionId: bankReturnCashSession.id,
            receivedAmount: preview.receivedAmount,
            discountAmount: preview.discountAmount,
            interestAmount: preview.interestAmount,
            penaltyAmount: preview.penaltyAmount,
            paymentMethod: "BANK_SLIP",
            settledAt: new Date(preview.settledAt),
            requestedBy: payload.requestedBy || "RETORNO_BANCARIO",
            notes: normalizeText(
              `RETORNO BANCARIO SICOOB NOSSO NUMERO ${item.ourNumber || "SEM"} TARIFA ${Number(item.feeAmount || 0).toFixed(2)}`,
            ),
            createdBy: payload.requestedBy || null,
            updatedBy: payload.requestedBy || null,
          },
        });

        await tx.receivableInstallment.update({
          where: { id: currentInstallment.id },
          data: {
            openAmount: 0,
            paidAmount: roundMoney(
              Number(currentInstallment.paidAmount || 0) + preview.receivedAmount,
            ),
            status: "PAID",
            settlementMethod: "BANK_RETURN",
            settledAt: new Date(preview.settledAt),
            updatedBy: payload.requestedBy || null,
          },
        });

        await tx.cashMovement.create({
          data: {
            companyId: importSession.company.id,
            cashSessionId: bankReturnCashSession.id,
            movementType: "SETTLEMENT",
            direction: "IN",
            paymentMethod: "BANK_SLIP",
            amount: preview.receivedAmount,
            description: "BAIXA POR RETORNO BANCARIO",
            occurredAt: new Date(preview.settledAt),
            referenceType: "INSTALLMENT",
            referenceId: currentInstallment.id,
            createdBy: payload.requestedBy || null,
            updatedBy: payload.requestedBy || null,
          },
        });

        await tx.bankReturnImportItem.update({
          where: { id: item.id },
          data: {
            appliedAt: new Date(),
            appliedBy: payload.requestedBy || null,
            appliedSettlementId: settlement.id,
            appliedStatus: "APPLIED",
            updatedBy: payload.requestedBy || null,
          },
        });

        appliedItems.push({
          itemId: item.id,
          installmentId: currentInstallment.id,
          sourceInstallmentKey: currentInstallment.sourceInstallmentKey,
          settlementId: settlement.id,
          receivedAmount: preview.receivedAmount,
          ourNumber: item.ourNumber || null,
        });
      }

      return {
        cashSessionId: bankReturnCashSession.id,
        appliedItems,
      };
    });

    const refreshedImport = await this.prisma.bankReturnImport.findUnique({
      where: { id: importSession.id },
      include: {
        items: {
          where: {
            canceledAt: null,
          },
          include: {
            matchedInstallment: {
              select: {
                id: true,
                sourceInstallmentKey: true,
                status: true,
                openAmount: true,
                paidAmount: true,
                settledAt: true,
              },
            },
          },
        },
      },
    });

    const refreshedSummary = this.summarizeBankReturnImportItems(
      (refreshedImport?.items || []).map((item: any) => ({
        movementStatus: item.movementStatus,
        appliedStatus: item.appliedStatus,
        matchedInstallment: item.matchedInstallment || null,
      })),
    );

    await this.prisma.bankReturnImport.update({
      where: { id: importSession.id },
      data: {
        importedItemCount: refreshedSummary.importedItemCount,
        matchedItemCount: refreshedSummary.matchedItemCount,
        liquidatedItemCount: refreshedSummary.liquidatedItemCount,
        bankClosedItemCount: refreshedSummary.bankClosedItemCount,
        readyToApplyCount: refreshedSummary.readyToApplyCount,
        appliedItemCount: refreshedSummary.appliedItemCount,
        unmatchedItemCount: refreshedSummary.unmatchedItemCount,
        status: refreshedSummary.status,
        updatedBy: payload.requestedBy || null,
      },
    });

    return {
      importId: importSession.id,
      cashSessionId: applicationResult.cashSessionId,
      appliedCount: applicationResult.appliedItems.length,
      skippedCount: itemsToApply.length - applicationResult.appliedItems.length,
      appliedItems: applicationResult.appliedItems,
      message:
        applicationResult.appliedItems.length === 1
          ? "1 parcela liquidada foi baixada com sucesso."
          : applicationResult.appliedItems.length > 1
            ? `${applicationResult.appliedItems.length} parcelas liquidadas foram baixadas com sucesso.`
            : "Nenhuma parcela foi baixada na aplicacao do retorno bancario.",
    };
  }

  async getInstallmentBankSlipPdf(
    installmentId: string,
    query: {
      sourceSystem?: string | null;
      sourceTenantId?: string | null;
    },
  ) {
    const normalizedInstallmentId = String(installmentId || "").trim();
    const normalizedSourceSystem = normalizeText(query.sourceSystem);
    const normalizedSourceTenantId = normalizeText(query.sourceTenantId);

    if (!normalizedInstallmentId) {
      throw new BadRequestException("Parcela inválida.");
    }

    if (!normalizedSourceSystem || !normalizedSourceTenantId) {
      throw new BadRequestException(
        "Informe o sistema e o tenant de origem para localizar a parcela.",
      );
    }

    const installment = await this.prisma.receivableInstallment.findFirst({
      where: {
        id: normalizedInstallmentId,
        canceledAt: null,
        batch: {
          sourceSystem: normalizedSourceSystem,
          sourceTenantId: normalizedSourceTenantId,
        },
      },
      select: {
        id: true,
        installmentNumber: true,
        dueDate: true,
        sourceInstallmentKey: true,
        bankSlipPdfBase64: true,
        bankSlipOurNumber: true,
      },
    });

    if (!installment) {
      throw new NotFoundException("PARCELA NÃO ENCONTRADA.");
    }

    if (!installment.bankSlipPdfBase64) {
      throw new NotFoundException("PDF DO BOLETO NÃO ENCONTRADO.");
    }

    return {
      installmentId: installment.id,
      contentType: "application/pdf",
      fileName: `boleto-${installment.bankSlipOurNumber || installment.installmentNumber}-${dateToDateOnly(installment.dueDate) || "sem-data"}.pdf`,
      base64: installment.bankSlipPdfBase64,
    };
  }
}
