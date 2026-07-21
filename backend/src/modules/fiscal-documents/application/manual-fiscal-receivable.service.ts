import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  normalizeText,
  roundMoney,
  serializeJson,
} from "../../../common/finance-core.utils";
import { ManualFiscalInstallmentDto } from "./dto/manual-fiscal-receivable.dto";
import {
  activePartyRoleWhere,
  PARTY_ROLE,
} from "../../../common/party-registry";

export type ManualFiscalReceivablePlan = {
  createReceivable: true;
  totalAmount: number;
  installments: Array<{
    installmentNumber: number;
    installmentCount: number;
    dueDate: Date;
    dueDateText: string;
    amount: number;
  }>;
};

type EnsureManualFiscalReceivableParams = {
  documentKind: "NFE" | "NFSE";
  documentId: string;
  companyId: string;
  branchCode: number;
  sourceSystem: string;
  sourceTenantId: string;
  payerPartyId: string;
  documentReference: string;
  plan: ManualFiscalReceivablePlan;
  requestedBy?: string | null;
};

function parseDateOnly(value: string, label: string) {
  const normalized = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new BadRequestException(`INFORME ${label} NO FORMATO AAAA-MM-DD.`);
  }
  const parsed = new Date(`${normalized}T12:00:00-03:00`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== Number(normalized.slice(0, 4)) ||
    parsed.getMonth() + 1 !== Number(normalized.slice(5, 7)) ||
    parsed.getDate() !== Number(normalized.slice(8, 10))
  ) {
    throw new BadRequestException(`INFORME ${label} VÁLIDA.`);
  }
  return { parsed, normalized };
}

export function normalizeManualFiscalReceivablePlan(
  createReceivable: boolean | null | undefined,
  totalAmountInput: number,
  installmentsInput?: ManualFiscalInstallmentDto[] | null,
): ManualFiscalReceivablePlan | null {
  if (!createReceivable) return null;

  const totalAmount = roundMoney(totalAmountInput);
  if (totalAmount <= 0) {
    throw new BadRequestException(
      "O VALOR DO TÍTULO A RECEBER DEVE SER POSITIVO.",
    );
  }
  const installments = Array.isArray(installmentsInput)
    ? installmentsInput
    : [];
  if (!installments.length) {
    throw new BadRequestException(
      "INFORME AO MENOS UMA PARCELA PARA O CONTAS A RECEBER.",
    );
  }
  if (installments.length > 60) {
    throw new BadRequestException(
      "O CONTAS A RECEBER ACEITA NO MÁXIMO 60 PARCELAS POR NOTA.",
    );
  }

  const normalizedInstallments = installments.map((installment, index) => {
    const { parsed, normalized } = parseDateOnly(
      installment.dueDate,
      `A DATA DE VENCIMENTO DA PARCELA ${index + 1}`,
    );
    const amount = roundMoney(installment.amount);
    if (amount <= 0) {
      throw new BadRequestException(
        `O VALOR DA PARCELA ${index + 1} DEVE SER POSITIVO.`,
      );
    }
    return {
      installmentNumber: index + 1,
      installmentCount: installments.length,
      dueDate: parsed,
      dueDateText: normalized,
      amount,
    };
  });
  const installmentTotal = roundMoney(
    normalizedInstallments.reduce(
      (sum, installment) => sum + installment.amount,
      0,
    ),
  );
  if (Math.abs(installmentTotal - totalAmount) > 0.009) {
    throw new BadRequestException(
      `A SOMA DAS PARCELAS (${installmentTotal.toFixed(2)}) DEVE SER IGUAL AO VALOR DA NOTA (${totalAmount.toFixed(2)}).`,
    );
  }

  return {
    createReceivable: true,
    totalAmount,
    installments: normalizedInstallments,
  };
}

export function serializeManualFiscalReceivablePlan(
  plan: ManualFiscalReceivablePlan | null,
) {
  if (!plan) return null;
  return serializeJson({
    createReceivable: true,
    totalAmount: plan.totalAmount,
    installments: plan.installments.map((installment) => ({
      installmentNumber: installment.installmentNumber,
      installmentCount: installment.installmentCount,
      dueDate: installment.dueDateText,
      amount: installment.amount,
    })),
  });
}

@Injectable()
export class ManualFiscalReceivableService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureForAuthorizedDocument(
    params: EnsureManualFiscalReceivableParams,
  ) {
    const party = await this.prisma.party.findFirst({
      where: {
        id: params.payerPartyId,
        companyId: params.companyId,
        canceledAt: null,
        ...activePartyRoleWhere(params.branchCode, [
          PARTY_ROLE.CUSTOMER,
          PARTY_ROLE.PAYER,
          PARTY_ROLE.TAKER,
          PARTY_ROLE.RECIPIENT,
        ]),
      },
    });
    if (!party) {
      throw new NotFoundException(
        "O PAGADOR DA NOTA NÃO FOI ENCONTRADO NESTA FILIAL.",
      );
    }

    const businessKey = `FISCAL:${params.documentKind}:${params.documentId}`;
    const sourceBatchId = businessKey;
    const existing = await this.prisma.receivableTitle.findUnique({
      where: {
        companyId_branchCode_businessKey: {
          companyId: params.companyId,
          branchCode: params.branchCode,
          businessKey,
        },
      },
      include: {
        installments: {
          where: { canceledAt: null },
          orderBy: { installmentNumber: "asc" },
        },
      },
    });

    if (existing) {
      if (
        existing.payerPartyId !== party.id ||
        Math.abs(roundMoney(existing.totalAmount) - params.plan.totalAmount) >
          0.009 ||
        existing.installments.length !== params.plan.installments.length
      ) {
        throw new BadRequestException(
          "O LANÇAMENTO DE CONTAS A RECEBER JÁ EXISTE COM DADOS DIFERENTES.",
        );
      }
      await this.linkDocument(
        params.documentKind,
        params.documentId,
        existing.id,
        params.requestedBy,
      );
      return this.mapTitle(existing);
    }

    const requestedBy = normalizeText(params.requestedBy);
    const description = normalizeText(
      `${params.documentKind === "NFE" ? "NF-E" : "NFS-E"} MANUAL ${params.documentReference}`,
    )!;

    return this.prisma.$transaction(async (tx: any) => {
      const concurrent = await tx.receivableTitle.findUnique({
        where: {
          companyId_branchCode_businessKey: {
            companyId: params.companyId,
            branchCode: params.branchCode,
            businessKey,
          },
        },
        include: {
          installments: {
            where: { canceledAt: null },
            orderBy: { installmentNumber: "asc" },
          },
        },
      });
      if (concurrent) {
        await this.linkDocumentWithTransaction(
          tx,
          params.documentKind,
          params.documentId,
          concurrent.id,
          requestedBy,
        );
        return this.mapTitle(concurrent);
      }

      const batch = await tx.receivableBatch.upsert({
        where: {
          companyId_branchCode_sourceBatchId: {
            companyId: params.companyId,
            branchCode: params.branchCode,
            sourceBatchId,
          },
        },
        create: {
          companyId: params.companyId,
          branchCode: params.branchCode,
          sourceSystem: normalizeText(params.sourceSystem)!,
          sourceTenantId: normalizeText(params.sourceTenantId)!,
          sourceBatchType: `MANUAL_${params.documentKind}`,
          sourceBatchId,
          referenceDate: new Date(),
          status: "PROCESSED",
          itemCount: 1,
          processedCount: 1,
          duplicateCount: 0,
          errorCount: 0,
          payloadSnapshot: serializeManualFiscalReceivablePlan(params.plan),
          metadataJson: serializeJson({
            documentKind: params.documentKind,
            documentId: params.documentId,
            documentReference: params.documentReference,
          }),
          createdBy: requestedBy,
          updatedBy: requestedBy,
        },
        update: {
          status: "PROCESSED",
          updatedBy: requestedBy,
        },
      });

      const title = await tx.receivableTitle.create({
        data: {
          companyId: params.companyId,
          branchCode: params.branchCode,
          batchId: batch.id,
          payerPartyId: party.id,
          sourceEntityType: `${params.documentKind}_DOCUMENT`,
          sourceEntityId: params.documentId,
          sourceEntityName: params.documentReference,
          classLabel: params.documentKind,
          businessKey,
          description,
          categoryCode: "FISCAL",
          totalAmount: params.plan.totalAmount,
          payerNameSnapshot: party.name,
          payerDocumentSnapshot: party.document,
          payerEmailSnapshot: party.email,
          payerPhoneSnapshot: party.phone,
          createdBy: requestedBy,
          updatedBy: requestedBy,
        },
      });

      for (const installment of params.plan.installments) {
        await tx.receivableInstallment.create({
          data: {
            companyId: params.companyId,
            branchCode: params.branchCode,
            batchId: batch.id,
            titleId: title.id,
            sourceInstallmentKey: `${businessKey}:${installment.installmentNumber}`,
            installmentNumber: installment.installmentNumber,
            installmentCount: installment.installmentCount,
            dueDate: installment.dueDate,
            amount: installment.amount,
            openAmount: installment.amount,
            paidAmount: 0,
            status: "OPEN",
            descriptionSnapshot: description,
            payerNameSnapshot: party.name,
            payerDocumentSnapshot: party.document,
            createdBy: requestedBy,
            updatedBy: requestedBy,
          },
        });
      }

      await this.linkDocumentWithTransaction(
        tx,
        params.documentKind,
        params.documentId,
        title.id,
        requestedBy,
      );
      await tx.fiscalAuditEvent.create({
        data: {
          companyId: params.companyId,
          branchCode: params.branchCode,
          entityType: "RECEIVABLE_TITLE",
          entityId: title.id,
          action: "CREATE_FROM_AUTHORIZED_FISCAL_DOCUMENT",
          summary: normalizeText(
            `CONTAS A RECEBER CRIADO A PARTIR DA ${description}`,
          )!,
          afterJson: serializeJson({
            documentKind: params.documentKind,
            documentId: params.documentId,
            payerPartyId: party.id,
            totalAmount: params.plan.totalAmount,
            installmentCount: params.plan.installments.length,
          }),
          occurredAt: new Date(),
          performedBy: requestedBy,
          createdBy: requestedBy,
        },
      });

      return {
        id: title.id,
        businessKey,
        totalAmount: params.plan.totalAmount,
        installmentCount: params.plan.installments.length,
        status: "OPEN",
      };
    });
  }

  private async linkDocument(
    kind: "NFE" | "NFSE",
    documentId: string,
    titleId: string,
    requestedBy?: string | null,
  ) {
    if (kind === "NFE") {
      await this.prisma.fiscalDocument.update({
        where: { id: documentId },
        data: { receivableTitleId: titleId, updatedBy: requestedBy || null },
      });
      return;
    }
    await this.prisma.nfseDocument.update({
      where: { id: documentId },
      data: { receivableTitleId: titleId, updatedBy: requestedBy || null },
    });
  }

  private async linkDocumentWithTransaction(
    tx: any,
    kind: "NFE" | "NFSE",
    documentId: string,
    titleId: string,
    requestedBy?: string | null,
  ) {
    if (kind === "NFE") {
      await tx.fiscalDocument.update({
        where: { id: documentId },
        data: { receivableTitleId: titleId, updatedBy: requestedBy || null },
      });
      return;
    }
    await tx.nfseDocument.update({
      where: { id: documentId },
      data: { receivableTitleId: titleId, updatedBy: requestedBy || null },
    });
  }

  private mapTitle(title: any) {
    return {
      id: title.id,
      businessKey: title.businessKey,
      totalAmount: roundMoney(title.totalAmount),
      installmentCount: Array.isArray(title.installments)
        ? title.installments.length
        : 0,
      status: "OPEN",
    };
  }
}
