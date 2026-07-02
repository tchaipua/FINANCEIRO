import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  normalizeDigits,
  normalizeEmail,
  normalizePhone,
  normalizeText,
  parseIsoDate,
  roundMoney,
  serializeJson,
} from "../../../common/finance-core.utils";
import {
  DEFAULT_BRANCH_CODE,
  normalizeBranchCode,
} from "../../../common/branch.constants";
import { getFinanceContext } from "../../../common/finance-context";
import {
  CancelSaleDto,
  CreateSaleReturnDto,
  CreateSaleDto,
  GetSaleDto,
  ListSalesDto,
  SalePaymentDto,
} from "./dto/sales.dto";

type BranchStockParameterMode = "NO" | "YES" | "BY_PRODUCT";

type BranchStockConfig = {
  branchCode: number;
  stockControlMode: BranchStockParameterMode;
  stockIntegerQuantityMode: BranchStockParameterMode;
  stockLotControlMode: BranchStockParameterMode;
  stockExpirationControlMode: BranchStockParameterMode;
  stockGridControlMode: BranchStockParameterMode;
  stockNegativeControlMode: BranchStockParameterMode;
  allowSaleUnitPriceEdit: boolean;
  allowSaleItemDiscount: boolean;
};

type ResolvedStockOptions = {
  tracksInventory: boolean;
  allowFraction: boolean;
  usesColorSize: boolean;
  usesLotControl: boolean;
  usesExpirationControl: boolean;
  allowsNegativeStock: boolean;
};

const IMMEDIATE_PAYMENT_METHODS = ["CASH", "PIX", "DEBIT_CARD", "CREDIT_CARD"];
const DEFERRED_PAYMENT_METHODS = ["BOLETO", "TERM", "INSTALLMENT"];
const GENERIC_PRODUCT_INTERNAL_CODE = "1";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "DINHEIRO",
  PIX: "PIX",
  DEBIT_CARD: "CARTÃO DE DÉBITO",
  CREDIT_CARD: "CARTÃO DE CRÉDITO",
  BOLETO: "BOLETO",
  TERM: "PRAZO",
  INSTALLMENT: "PRAZO PARCELADO",
};

function addMonths(date: Date, months: number) {
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + months);
  return nextDate;
}

function parseDateOnlyAsLocalDate(value: string | undefined, label: string, endOfDay = false) {
  const normalized = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);

  if (!match) {
    return parseIsoDate(value, label);
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(
    year,
    month,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Informe ${label} válida.`);
  }

  return parsed;
}

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  private currentBranchCode(sourceBranchCode?: number | null) {
    const requestedBranchCode = normalizeBranchCode(
      sourceBranchCode ?? getFinanceContext()?.branchCode,
      DEFAULT_BRANCH_CODE,
    );

    return requestedBranchCode > 0 ? requestedBranchCode : DEFAULT_BRANCH_CODE;
  }

  private normalizeBranchStockParameterMode(
    value?: string | null,
    fallback: BranchStockParameterMode = "BY_PRODUCT",
  ): BranchStockParameterMode {
    const normalized = normalizeText(value);
    return normalized === "NO" ||
      normalized === "YES" ||
      normalized === "BY_PRODUCT"
      ? normalized
      : fallback;
  }

  private getLegacyIntegerMode(quantityPrecision?: string | null): BranchStockParameterMode {
    const normalized = normalizeText(quantityPrecision);
    if (normalized === "DECIMAL_ALLOWED") return "NO";
    if (normalized === "PRODUCT_DEFINED") return "BY_PRODUCT";
    return "YES";
  }

  private getLegacyLotMode(inventoryControlType?: string | null): BranchStockParameterMode {
    return normalizeText(inventoryControlType) === "LOT" ? "BY_PRODUCT" : "NO";
  }

  private getLegacyGridMode(inventoryControlType?: string | null): BranchStockParameterMode {
    return normalizeText(inventoryControlType) === "COLOR_SIZE" ? "BY_PRODUCT" : "NO";
  }

  private resolveBooleanByBranchMode(
    mode: BranchStockParameterMode,
    productValue: boolean | undefined,
    defaultValue: boolean,
    forcedYesValue = true,
    forcedNoValue = false,
  ) {
    if (mode === "YES") return forcedYesValue;
    if (mode === "NO") return forcedNoValue;
    return typeof productValue === "boolean" ? productValue : defaultValue;
  }

  private async loadBranchStockConfig(companyId: string, branchCode: number): Promise<BranchStockConfig> {
    const branch = await this.prisma.companyBranch.findFirst({
      where: {
        companyId,
        branchCode,
        canceledAt: null,
      },
    });

    return {
      branchCode,
      stockControlMode: this.normalizeBranchStockParameterMode(
        branch?.stockControlMode,
        "BY_PRODUCT",
      ),
      stockIntegerQuantityMode: this.normalizeBranchStockParameterMode(
        branch?.stockIntegerQuantityMode,
        this.getLegacyIntegerMode(branch?.quantityPrecision),
      ),
      stockLotControlMode: this.normalizeBranchStockParameterMode(
        branch?.stockLotControlMode,
        this.getLegacyLotMode(branch?.inventoryControlType),
      ),
      stockExpirationControlMode: this.normalizeBranchStockParameterMode(
        branch?.stockExpirationControlMode,
        "NO",
      ),
      stockGridControlMode: this.normalizeBranchStockParameterMode(
        branch?.stockGridControlMode,
        this.getLegacyGridMode(branch?.inventoryControlType),
      ),
      stockNegativeControlMode: this.normalizeBranchStockParameterMode(
        branch?.stockNegativeControlMode,
        "BY_PRODUCT",
      ),
      allowSaleUnitPriceEdit: branch?.allowSaleUnitPriceEdit !== false,
      allowSaleItemDiscount: branch?.allowSaleItemDiscount !== false,
    };
  }

  private resolveStockOptions(product: any, branchConfig: BranchStockConfig): ResolvedStockOptions {
    const tracksInventory = this.resolveBooleanByBranchMode(
      branchConfig.stockControlMode,
      Boolean(product.tracksInventory),
      true,
    );

    if (!tracksInventory) {
      return {
        tracksInventory: false,
        allowFraction: false,
        usesColorSize: false,
        usesLotControl: false,
        usesExpirationControl: false,
        allowsNegativeStock: false,
      };
    }

    return {
      tracksInventory,
      allowFraction: this.resolveBooleanByBranchMode(
        branchConfig.stockIntegerQuantityMode,
        Boolean(product.allowFraction),
        false,
        false,
        true,
      ),
      usesLotControl: this.resolveBooleanByBranchMode(
        branchConfig.stockLotControlMode,
        Boolean(product.usesLotControl),
        false,
      ),
      usesExpirationControl: this.resolveBooleanByBranchMode(
        branchConfig.stockExpirationControlMode,
        Boolean(product.usesExpirationControl),
        false,
      ),
      usesColorSize: this.resolveBooleanByBranchMode(
        branchConfig.stockGridControlMode,
        Boolean(product.usesColorSize),
        false,
      ),
      allowsNegativeStock: this.resolveBooleanByBranchMode(
        branchConfig.stockNegativeControlMode,
        Boolean(product.allowsNegativeStock),
        false,
      ),
    };
  }

  private normalizePaymentMethod(value?: string | null) {
    const normalized = normalizeText(value);
    if (!normalized) {
      throw new BadRequestException("Informe a forma de pagamento.");
    }

    if (![...IMMEDIATE_PAYMENT_METHODS, ...DEFERRED_PAYMENT_METHODS].includes(normalized)) {
      throw new BadRequestException(`Forma de pagamento não suportada: ${normalized}.`);
    }

    return normalized;
  }

  private isImmediatePayment(method: string) {
    return IMMEDIATE_PAYMENT_METHODS.includes(method);
  }

  private affectsCashDrawer(method?: string | null) {
    return normalizeText(method) === "CASH";
  }

  private isDeferredPayment(method: string) {
    return DEFERRED_PAYMENT_METHODS.includes(method);
  }

  private isGenericProduct(product: { internalCode?: string | null }) {
    return String(product.internalCode || "").trim() === GENERIC_PRODUCT_INTERNAL_CODE;
  }

  private normalizeRequiredDate(value: string | undefined, label: string) {
    try {
      return parseIsoDate(value, label);
    } catch {
      throw new BadRequestException(`Informe ${label} válida.`);
    }
  }

  private buildVariantKey(input: {
    options: ResolvedStockOptions;
    colorCode?: string | null;
    colorName?: string | null;
    sizeCode?: string | null;
    lotNumber?: string | null;
  }) {
    const colorPart = input.options.usesColorSize
      ? `COR:${normalizeText(input.colorCode) || normalizeText(input.colorName) || "SEM_COR"}`
      : "COR:GERAL";
    const sizePart = input.options.usesColorSize
      ? `NUM:${normalizeText(input.sizeCode) || "SEM_NUMERO"}`
      : "NUM:GERAL";
    const lotPart = input.options.usesLotControl
      ? `LOTE:${normalizeText(input.lotNumber) || "SEM_LOTE"}`
      : "LOTE:GERAL";

    return `${colorPart}|${sizePart}|${lotPart}`;
  }

  private buildSaleNumber(branchCode: number) {
    const stamp = new Date()
      .toISOString()
      .replace(/\D/g, "")
      .slice(0, 14);
    return `VENDA-${branchCode}-${stamp}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private buildReturnNumber(branchCode: number) {
    const stamp = new Date()
      .toISOString()
      .replace(/\D/g, "")
      .slice(0, 14);
    return `DEV-${branchCode}-${stamp}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private async loadReturnedQuantityBySaleItem(
    companyId: string,
    saleId: string,
    client: any = this.prisma,
  ) {
    const returnItems = await client.saleReturnItem.findMany({
      where: {
        companyId,
        saleId,
        canceledAt: null,
        saleReturn: {
          status: "CONFIRMED",
          canceledAt: null,
        },
      },
      select: {
        saleItemId: true,
        quantity: true,
      },
    });

    return returnItems.reduce((summary: Map<string, number>, item: any) => {
      summary.set(
        item.saleItemId,
        roundMoney((summary.get(item.saleItemId) || 0) + Number(item.quantity || 0)),
      );
      return summary;
    }, new Map<string, number>());
  }

  private mapSaleReturnContext(sale: any, returnedQuantities: Map<string, number>) {
    const mappedSale = this.mapSale(sale);

    return {
      ...mappedSale,
      items: mappedSale.items.map((item: any) => {
        const returnedQuantity = roundMoney(returnedQuantities.get(item.id) || 0);
        return {
          ...item,
          returnedQuantity,
          availableReturnQuantity: Math.max(
            0,
            roundMoney(Number(item.quantity || 0) - returnedQuantity),
          ),
        };
      }),
    };
  }

  private buildPaymentSummary(payments: Array<{ paymentMethod: string; amount: number }>) {
    return payments
      .map((payment) => `${PAYMENT_METHOD_LABELS[payment.paymentMethod] || payment.paymentMethod}: ${roundMoney(payment.amount).toFixed(2)}`)
      .join(" | ");
  }

  private async resolveCompany(payload: {
    sourceSystem?: string | null;
    sourceTenantId?: string | null;
    companyName?: string | null;
    companyDocument?: string | null;
    requestedBy?: string | null;
  }) {
    const normalizedSourceSystem = normalizeText(payload.sourceSystem);
    const normalizedSourceTenantId = normalizeText(payload.sourceTenantId);

    if (!normalizedSourceSystem || !normalizedSourceTenantId) {
      throw new BadRequestException(
        "Informe o sistema de origem e o tenant para operar vendas.",
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

    const normalizedCompanyName = normalizeText(payload.companyName);
    const normalizedCompanyDocument = normalizeDigits(payload.companyDocument);

    if (existing) {
      return this.prisma.company.update({
        where: { id: existing.id },
        data: {
          ...(normalizedCompanyName ? { name: normalizedCompanyName } : {}),
          ...(normalizedCompanyDocument ? { document: normalizedCompanyDocument } : {}),
          updatedBy: payload.requestedBy || null,
        },
      });
    }

    return this.prisma.company.create({
      data: {
        sourceSystem: normalizedSourceSystem,
        sourceTenantId: normalizedSourceTenantId,
        name: normalizedCompanyName || normalizedSourceTenantId,
        document: normalizedCompanyDocument,
        createdBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
    });
  }

  private async ensureCustomerParty(tx: any, companyId: string, branchCode: number, payload: CreateSaleDto) {
    const customer = payload.customer;
    const normalizedName =
      normalizeText(customer?.name) || normalizeText(payload.sourceEntityName);

    if (!normalizedName) {
      return null;
    }

    const document = normalizeDigits(customer?.document);
    const externalEntityType =
      normalizeText(customer?.externalEntityType) ||
      normalizeText(payload.sourceEntityType) ||
      "CUSTOMER";
    const externalEntityId =
      normalizeText(customer?.externalEntityId) ||
      document ||
      normalizeText(payload.sourceEntityId) ||
      `CUSTOMER-${randomUUID().toUpperCase()}`;

    return tx.party.upsert({
      where: {
        companyId_branchCode_externalEntityType_externalEntityId: {
          companyId,
          branchCode,
          externalEntityType,
          externalEntityId,
        },
      },
      create: {
        companyId,
        branchCode,
        externalEntityType,
        externalEntityId,
        name: normalizedName,
        document,
        email: normalizeEmail(customer?.email),
        phone: normalizePhone(customer?.phone),
        createdBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
      update: {
        name: normalizedName,
        document,
        email: normalizeEmail(customer?.email),
        phone: normalizePhone(customer?.phone),
        updatedBy: payload.requestedBy || null,
      },
    });
  }

  private async loadOpenCashSession(companyId: string, cashierUserId?: string | null) {
    const normalizedCashierUserId = normalizeText(cashierUserId);
    if (!normalizedCashierUserId) {
      throw new BadRequestException("Informe o operador do caixa para pagamentos à vista.");
    }

    return this.prisma.cashSession.findFirst({
      where: {
        companyId,
        cashierUserId: normalizedCashierUserId,
        status: "OPEN",
        canceledAt: null,
      },
    });
  }

  private expandDeferredPayments(payments: Array<SalePaymentDto & { paymentMethod: string }>) {
    const expanded: Array<{
      paymentMethod: string;
      amount: number;
      dueDate: Date;
      installmentNumber: number;
      installmentCount: number;
      sourceIndex: number;
      notes?: string | null;
    }> = [];

    payments.forEach((payment, paymentIndex) => {
      if (!this.isDeferredPayment(payment.paymentMethod)) return;

      const installmentCount = Math.max(1, Number(payment.installmentCount || 1));
      const firstDueDate = this.normalizeRequiredDate(
        payment.dueDate,
        payment.paymentMethod === "BOLETO"
          ? "o vencimento do boleto"
          : "o primeiro vencimento do prazo",
      );
      const totalAmount = roundMoney(Number(payment.amount || 0));
      const baseAmount = roundMoney(totalAmount / installmentCount);
      let distributedAmount = 0;

      for (let index = 0; index < installmentCount; index += 1) {
        const isLast = index === installmentCount - 1;
        const amount = isLast
          ? roundMoney(totalAmount - distributedAmount)
          : baseAmount;
        distributedAmount = roundMoney(distributedAmount + amount);

        expanded.push({
          paymentMethod: payment.paymentMethod,
          amount,
          dueDate: addMonths(firstDueDate, index),
          installmentNumber: expanded.length + 1,
          installmentCount: 0,
          sourceIndex: paymentIndex,
          notes: normalizeText(payment.notes),
        });
      }
    });

    return expanded.map((installment) => ({
      ...installment,
      installmentCount: expanded.length,
    }));
  }

  private mapSale(sale: any) {
    const items = Array.isArray(sale.items) ? sale.items : [];
    const payments = Array.isArray(sale.payments) ? sale.payments : [];

    return {
      id: sale.id,
      companyId: sale.companyId,
      companyName: sale.company?.name || null,
      branchCode: sale.branchCode,
      sourceSystem: sale.sourceSystem,
      sourceTenantId: sale.sourceTenantId,
      saleNumber: sale.saleNumber,
      saleChannel: sale.saleChannel,
      status: sale.status,
      customerPartyId: sale.customerPartyId || null,
      customerName: sale.customerNameSnapshot,
      customerDocument: sale.customerDocumentSnapshot || null,
      sourceEntityType: sale.sourceEntityType || null,
      sourceEntityId: sale.sourceEntityId || null,
      sourceEntityName: sale.sourceEntityName || null,
      subtotalAmount: roundMoney(sale.subtotalAmount || 0),
      discountAmount: roundMoney(sale.discountAmount || 0),
      totalAmount: roundMoney(sale.totalAmount || 0),
      paidAmount: roundMoney(sale.paidAmount || 0),
      receivableAmount: roundMoney(sale.receivableAmount || 0),
      paymentSummary: sale.paymentSummary || null,
      receivableBatchId: sale.receivableBatchId || null,
      receivableTitleId: sale.receivableTitleId || null,
      notes: sale.notes || null,
      confirmedAt: sale.confirmedAt?.toISOString?.() || null,
      createdAt: sale.createdAt?.toISOString?.() || null,
      updatedAt: sale.updatedAt?.toISOString?.() || null,
      items: items.map((item: any) => ({
        id: item.id,
        productId: item.productId,
        lineNumber: item.lineNumber,
        productName: item.productNameSnapshot,
        productCode: item.productCodeSnapshot || null,
        unitCode: item.unitCodeSnapshot,
        quantity: roundMoney(item.quantity || 0),
        unitCost:
          item.unitCost === null || item.unitCost === undefined
            ? null
            : roundMoney(item.unitCost),
        unitPrice: roundMoney(item.unitPrice || 0),
        discountAmount: roundMoney(item.discountAmount || 0),
        totalAmount: roundMoney(item.totalAmount || 0),
        tracksInventory: Boolean(item.tracksInventory),
        allowFraction: Boolean(item.allowFraction),
        variantKey: item.variantKey || "GERAL",
        colorCode: item.colorCode || null,
        colorName: item.colorName || null,
        sizeCode: item.sizeCode || null,
        lotNumber: item.lotNumber || null,
        lotExpirationDate: item.lotExpirationDate?.toISOString?.() || null,
        previousStock:
          item.previousStock === null || item.previousStock === undefined
            ? null
            : roundMoney(item.previousStock),
        resultingStock:
          item.resultingStock === null || item.resultingStock === undefined
            ? null
            : roundMoney(item.resultingStock),
      })),
      payments: payments.map((payment: any) => ({
        id: payment.id,
        paymentMethod: payment.paymentMethod,
        paymentMethodLabel:
          PAYMENT_METHOD_LABELS[payment.paymentMethod] || payment.paymentMethod,
        amount: roundMoney(payment.amount || 0),
        dueDate: payment.dueDate?.toISOString?.() || null,
        installmentCount: payment.installmentCount || null,
        cardInstallmentCount: payment.cardInstallmentCount || null,
        cashSessionId: payment.cashSessionId || null,
        receivableInstallmentId: payment.receivableInstallmentId || null,
        status: payment.status,
        movementDate:
          payment.status === "PAID"
            ? sale.confirmedAt?.toISOString?.() || null
            : null,
        notes: payment.notes || null,
      })),
    };
  }

  async list(query: ListSalesDto) {
    const company = await this.resolveCompany({
      sourceSystem: query.sourceSystem,
      sourceTenantId: query.sourceTenantId,
    });
    const normalizedSearch = normalizeText(query.search);
    const normalizedStatus = normalizeText(query.status);
    const normalizedSaleChannel = normalizeText(query.saleChannel);
    const dateFrom = query.dateFrom
      ? parseDateOnlyAsLocalDate(query.dateFrom, "data inicial")
      : null;
    const dateTo = query.dateTo
      ? parseDateOnlyAsLocalDate(query.dateTo, "data final", true)
      : null;

    const sales = await this.prisma.sale.findMany({
      where: {
        companyId: company.id,
        canceledAt: null,
        ...(dateFrom || dateTo
          ? {
              confirmedAt: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
        ...(normalizedStatus && normalizedStatus !== "ALL"
          ? { status: normalizedStatus }
          : {}),
        ...(normalizedSaleChannel && normalizedSaleChannel !== "ALL"
          ? { saleChannel: normalizedSaleChannel }
          : {}),
        ...(normalizedSearch
          ? {
              OR: [
                { saleNumber: { contains: normalizedSearch } },
                { customerNameSnapshot: { contains: normalizedSearch } },
                { customerDocumentSnapshot: { contains: normalizeDigits(query.search) || normalizedSearch } },
                { sourceEntityName: { contains: normalizedSearch } },
              ],
            }
          : {}),
      },
      include: {
        company: { select: { name: true } },
        items: { where: { canceledAt: null }, orderBy: { lineNumber: "asc" } },
        payments: { where: { canceledAt: null }, orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ confirmedAt: "desc" }],
      take: 100,
    });

    return sales.map((sale: any) => this.mapSale(sale));
  }

  async get(saleId: string, query: GetSaleDto) {
    const company = await this.resolveCompany({
      sourceSystem: query.sourceSystem,
      sourceTenantId: query.sourceTenantId,
    });
    const normalizedSaleId = String(saleId || "").trim();

    const sale = await this.prisma.sale.findFirst({
      where: {
        id: normalizedSaleId,
        companyId: company.id,
        canceledAt: null,
      },
      include: {
        company: { select: { name: true } },
        items: { where: { canceledAt: null }, orderBy: { lineNumber: "asc" } },
        payments: { where: { canceledAt: null }, orderBy: { createdAt: "asc" } },
      },
    });

    if (!sale) {
      throw new NotFoundException("VENDA NÃO ENCONTRADA.");
    }

    return this.mapSale(sale);
  }

  async getReturnContext(saleId: string, query: GetSaleDto) {
    const company = await this.resolveCompany({
      sourceSystem: query.sourceSystem,
      sourceTenantId: query.sourceTenantId,
    });
    const normalizedSaleId = String(saleId || "").trim();

    const sale = await this.prisma.sale.findFirst({
      where: {
        id: normalizedSaleId,
        companyId: company.id,
        sourceSystem: normalizeText(query.sourceSystem)!,
        sourceTenantId: normalizeText(query.sourceTenantId)!,
        canceledAt: null,
      },
      include: {
        company: { select: { name: true } },
        items: { where: { canceledAt: null }, orderBy: { lineNumber: "asc" } },
        payments: { where: { canceledAt: null }, orderBy: { createdAt: "asc" } },
      },
    });

    if (!sale) {
      throw new NotFoundException("VENDA NÃO ENCONTRADA.");
    }

    const returnedQuantities = await this.loadReturnedQuantityBySaleItem(
      company.id,
      sale.id,
    );

    return this.mapSaleReturnContext(sale, returnedQuantities);
  }

  async create(payload: CreateSaleDto) {
    const company = await this.resolveCompany(payload);
    const branchCode = this.currentBranchCode(payload.sourceBranchCode);
    const branchConfig = await this.loadBranchStockConfig(company.id, branchCode);
    const saleChannel = normalizeText(payload.saleChannel) || "GENERAL";
    const normalizedRequestedBy = payload.requestedBy || payload.cashierUserId || null;

    if (!payload.items?.length) {
      throw new BadRequestException("Informe ao menos um item na venda.");
    }

    if (!payload.payments?.length) {
      throw new BadRequestException("Informe ao menos uma forma de pagamento.");
    }

    const normalizedPayments = payload.payments.map((payment) => ({
      ...payment,
      paymentMethod: this.normalizePaymentMethod(payment.paymentMethod),
      amount: roundMoney(Number(payment.amount || 0)),
    }));

    const hasImmediatePayment = normalizedPayments.some((payment) =>
      this.isImmediatePayment(payment.paymentMethod),
    );
    const hasDeferredPayment = normalizedPayments.some((payment) =>
      this.isDeferredPayment(payment.paymentMethod),
    );
    const openCashSession = hasImmediatePayment
      ? await this.loadOpenCashSession(company.id, payload.cashierUserId)
      : null;

    if (hasImmediatePayment && !openCashSession) {
      throw new BadRequestException(
        "O operador precisa ter um caixa aberto para pagamentos à vista, PIX ou cartão.",
      );
    }

    const normalizedItems = await Promise.all(
      payload.items.map(async (item, index) => {
        const product = await this.prisma.product.findFirst({
          where: {
            id: String(item.productId || "").trim(),
            companyId: company.id,
            status: "ACTIVE",
            canceledAt: null,
          },
        });

        if (!product) {
          throw new NotFoundException(`PRODUTO ${index + 1} NÃO ENCONTRADO OU INATIVO.`);
        }

        if (![0, branchCode].includes(Number(product.branchCode || DEFAULT_BRANCH_CODE))) {
          throw new BadRequestException(
            `O produto ${product.name} pertence a outra filial.`,
          );
        }

        const stockOptions = this.resolveStockOptions(product, branchConfig);
        const isGenericProduct = this.isGenericProduct(product);
        const quantity = roundMoney(Number(item.quantity || 0));

        if (quantity <= 0) {
          throw new BadRequestException(`Informe quantidade válida para ${product.name}.`);
        }

        if (!stockOptions.allowFraction && !Number.isInteger(quantity)) {
          throw new BadRequestException(
            `O produto ${product.name} deve ser vendido em quantidade inteira nesta filial.`,
          );
        }

        const colorCode = normalizeText(item.colorCode);
        const colorName = normalizeText(item.colorName);
        const sizeCode = normalizeText(item.sizeCode);
        const lotNumber = normalizeText(item.lotNumber);
        const lotExpirationDate = item.lotExpirationDate
          ? this.normalizeRequiredDate(item.lotExpirationDate, "a validade do lote")
          : null;

        if (stockOptions.usesColorSize && ((!colorCode && !colorName) || !sizeCode)) {
          throw new BadRequestException(
            `Informe cor e número para vender ${product.name}.`,
          );
        }

        if (stockOptions.usesLotControl && !lotNumber) {
          throw new BadRequestException(
            `Informe o lote para vender ${product.name}.`,
          );
        }

        if (stockOptions.usesExpirationControl && !lotExpirationDate) {
          throw new BadRequestException(
            `Informe a validade do lote para vender ${product.name}.`,
          );
        }

        const unitPrice = roundMoney(
          item.unitPrice === undefined || item.unitPrice === null
            ? Number(product.salePrice || 0)
            : Number(item.unitPrice || 0),
        );
        const productSalePrice =
          product.salePrice === null || product.salePrice === undefined
            ? 0
            : roundMoney(Number(product.salePrice || 0));
        const unitCost =
          item.unitCost === undefined || item.unitCost === null
            ? product.purchasePrice === null || product.purchasePrice === undefined
              ? null
              : roundMoney(Number(product.purchasePrice || 0))
            : roundMoney(Number(item.unitCost || 0));
        const productNameSnapshot = isGenericProduct
          ? normalizeText(item.description)
          : product.name;

        if (isGenericProduct && !productNameSnapshot) {
          throw new BadRequestException(
            "Informe a descrição do produto genérico.",
          );
        }

        if (isGenericProduct && (item.unitCost === undefined || item.unitCost === null)) {
          throw new BadRequestException(
            "Informe o custo do produto genérico.",
          );
        }

        if (unitCost !== null && unitCost < 0) {
          throw new BadRequestException(
            `Informe custo válido para ${product.name}.`,
          );
        }

        if (
          !branchConfig.allowSaleUnitPriceEdit &&
          !isGenericProduct &&
          Math.abs(unitPrice - productSalePrice) > 0.009
        ) {
          throw new BadRequestException(
            `Esta filial não permite alterar o preço de venda do produto ${product.name}.`,
          );
        }

        if (unitPrice <= 0) {
          throw new BadRequestException(
            `Informe preço de venda válido para ${product.name}.`,
          );
        }

        const grossAmount = roundMoney(quantity * unitPrice);
        const itemDiscountAmount = roundMoney(Number(item.discountAmount || 0));

        if (!branchConfig.allowSaleItemDiscount && itemDiscountAmount > 0) {
          throw new BadRequestException(
            "Esta filial não permite desconto por produto na venda.",
          );
        }

        if (itemDiscountAmount > grossAmount) {
          throw new BadRequestException(
            `O desconto do item ${product.name} não pode superar o total do item.`,
          );
        }

        return {
          lineNumber: index + 1,
          product,
          quantity,
          unitPrice,
          unitCost,
          productNameSnapshot: productNameSnapshot || product.name,
          grossAmount,
          discountAmount: itemDiscountAmount,
          totalAmount: roundMoney(grossAmount - itemDiscountAmount),
          stockOptions,
          colorCode,
          colorName,
          sizeCode,
          lotNumber,
          lotExpirationDate,
          variantKey: this.buildVariantKey({
            options: stockOptions,
            colorCode,
            colorName,
            sizeCode,
            lotNumber,
          }),
        };
      }),
    );

    const subtotalAmount = roundMoney(
      normalizedItems.reduce((total, item) => total + item.grossAmount, 0),
    );
    const itemDiscountAmount = roundMoney(
      normalizedItems.reduce((total, item) => total + item.discountAmount, 0),
    );
    const saleDiscountAmount = roundMoney(Number(payload.discountAmount || 0));
    const totalDiscountAmount = roundMoney(itemDiscountAmount + saleDiscountAmount);
    const totalBeforeSaleDiscount = roundMoney(
      normalizedItems.reduce((total, item) => total + item.totalAmount, 0),
    );
    const totalAmount = roundMoney(totalBeforeSaleDiscount - saleDiscountAmount);

    if (totalAmount <= 0) {
      throw new BadRequestException("O total da venda precisa ser maior que zero.");
    }

    const paymentTotal = roundMoney(
      normalizedPayments.reduce((total, payment) => total + payment.amount, 0),
    );

    if (Math.abs(paymentTotal - totalAmount) > 0.01) {
      throw new BadRequestException(
        "A soma das formas de pagamento deve ser igual ao total da venda.",
      );
    }

    const paidAmount = roundMoney(
      normalizedPayments
        .filter((payment) => this.isImmediatePayment(payment.paymentMethod))
        .reduce((total, payment) => total + payment.amount, 0),
    );
    const receivableAmount = roundMoney(totalAmount - paidAmount);

    if (hasDeferredPayment && receivableAmount <= 0) {
      throw new BadRequestException(
        "Pagamentos a prazo precisam possuir valor em aberto.",
      );
    }

    if (hasDeferredPayment) {
      const payerName =
        normalizeText(payload.customer?.name) || normalizeText(payload.sourceEntityName);
      if (!payerName) {
        throw new BadRequestException(
          "Informe o cliente/pagador para vendas a prazo, boleto ou parceladas.",
        );
      }
    }

    const deferredInstallments = this.expandDeferredPayments(normalizedPayments);
    const deferredTotal = roundMoney(
      deferredInstallments.reduce((total, installment) => total + installment.amount, 0),
    );

    if (Math.abs(deferredTotal - receivableAmount) > 0.01) {
      throw new BadRequestException(
        "A soma dos vencimentos a prazo deve ser igual ao valor em aberto.",
      );
    }

    const saleNumber = this.buildSaleNumber(branchCode);
    const paymentSummary = this.buildPaymentSummary(normalizedPayments);

    const createdSale = await this.prisma.$transaction(async (tx: any) => {
      const customerParty = await this.ensureCustomerParty(
        tx,
        company.id,
        branchCode,
        payload,
      );

      const sale = await tx.sale.create({
        data: {
          companyId: company.id,
          branchCode,
          sourceSystem: normalizeText(payload.sourceSystem)!,
          sourceTenantId: normalizeText(payload.sourceTenantId)!,
          saleNumber,
          saleChannel,
          status: "CONFIRMED",
          customerPartyId: customerParty?.id || null,
          customerNameSnapshot:
            customerParty?.name ||
            normalizeText(payload.sourceEntityName) ||
            "CONSUMIDOR FINAL",
          customerDocumentSnapshot:
            customerParty?.document || normalizeDigits(payload.customer?.document),
          sourceEntityType: normalizeText(payload.sourceEntityType),
          sourceEntityId: normalizeText(payload.sourceEntityId),
          sourceEntityName: normalizeText(payload.sourceEntityName),
          subtotalAmount,
          discountAmount: totalDiscountAmount,
          totalAmount,
          paidAmount,
          receivableAmount,
          paymentSummary,
          notes: normalizeText(payload.notes),
          confirmedAt: new Date(),
          createdBy: normalizedRequestedBy,
          updatedBy: normalizedRequestedBy,
        },
      });

      for (const item of normalizedItems) {
        const currentProduct = await tx.product.findFirst({
          where: {
            id: item.product.id,
            companyId: company.id,
            status: "ACTIVE",
            canceledAt: null,
          },
        });

        if (!currentProduct) {
          throw new NotFoundException(`PRODUTO ${item.product.name} NÃO ENCONTRADO.`);
        }

        let previousStock: number | null = null;
        let resultingStock: number | null = null;

        if (item.stockOptions.tracksInventory) {
          previousStock = roundMoney(Number(currentProduct.currentStock || 0));
          resultingStock = roundMoney(previousStock - item.quantity);
          const usesDetailedStock =
            item.stockOptions.usesColorSize || item.stockOptions.usesLotControl;
          const existingBalance = await tx.productStockBalance.findFirst({
            where: {
              companyId: company.id,
              branchCode,
              productId: currentProduct.id,
              variantKey: item.variantKey,
              canceledAt: null,
            },
          });
          const previousBalance = roundMoney(
            Number(existingBalance?.quantity ?? (usesDetailedStock ? 0 : previousStock)),
          );
          const resultingBalance = roundMoney(previousBalance - item.quantity);
          const insufficientStock = usesDetailedStock
            ? resultingBalance < 0
            : resultingStock < 0;

          if (!item.stockOptions.allowsNegativeStock && insufficientStock) {
            const currentBalanceLabel = usesDetailedStock
              ? `Saldo atual desta variação/lote: ${previousBalance}.`
              : `Saldo atual: ${previousStock}.`;
            throw new BadRequestException(
              `Estoque insuficiente para ${currentProduct.name}. ${currentBalanceLabel}`,
            );
          }

          await tx.product.update({
            where: { id: currentProduct.id },
            data: {
              currentStock: resultingStock,
              updatedBy: normalizedRequestedBy,
            },
          });

          await tx.productStockBalance.upsert({
            where: {
              companyId_productId_branchCode_variantKey: {
                companyId: company.id,
                productId: currentProduct.id,
                branchCode,
                variantKey: item.variantKey,
              },
            },
            create: {
              companyId: company.id,
              branchCode,
              productId: currentProduct.id,
              variantKey: item.variantKey,
              colorCode: item.colorCode,
              colorName: item.colorName,
              sizeCode: item.sizeCode,
              lotNumber: item.lotNumber,
              lotExpirationDate: item.lotExpirationDate,
              quantity: resultingBalance,
              reservedQuantity: 0,
              createdBy: normalizedRequestedBy,
              updatedBy: normalizedRequestedBy,
            },
            update: {
              quantity: resultingBalance,
              colorCode: item.colorCode,
              colorName: item.colorName,
              sizeCode: item.sizeCode,
              lotNumber: item.lotNumber,
              lotExpirationDate: item.lotExpirationDate,
              updatedBy: normalizedRequestedBy,
            },
          });
        }

        const saleItem = await tx.saleItem.create({
          data: {
            companyId: company.id,
            branchCode,
            saleId: sale.id,
            productId: currentProduct.id,
            lineNumber: item.lineNumber,
            productNameSnapshot: item.productNameSnapshot,
            productCodeSnapshot:
              currentProduct.internalCode || currentProduct.sku || currentProduct.barcode,
            unitCodeSnapshot: currentProduct.unitCode || "UN",
            quantity: item.quantity,
            unitCost: item.unitCost,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
            totalAmount: item.totalAmount,
            tracksInventory: item.stockOptions.tracksInventory,
            allowFraction: item.stockOptions.allowFraction,
            usesColorSize: item.stockOptions.usesColorSize,
            usesLotControl: item.stockOptions.usesLotControl,
            usesExpirationControl: item.stockOptions.usesExpirationControl,
            allowsNegativeStock: item.stockOptions.allowsNegativeStock,
            variantKey: item.variantKey,
            colorCode: item.colorCode,
            colorName: item.colorName,
            sizeCode: item.sizeCode,
            lotNumber: item.lotNumber,
            lotExpirationDate: item.lotExpirationDate,
            previousStock,
            resultingStock,
            createdBy: normalizedRequestedBy,
            updatedBy: normalizedRequestedBy,
          },
        });

        if (item.stockOptions.tracksInventory) {
          await tx.stockMovement.create({
            data: {
              companyId: company.id,
              branchCode,
              productId: currentProduct.id,
              sourceType: "SALE",
              sourceId: sale.id,
              sourceItemId: saleItem.id,
              movementType: "EXIT",
              quantity: item.quantity,
              previousStock: previousStock || 0,
              resultingStock: resultingStock || 0,
              unitCost: item.unitCost,
              notes: normalizeText(`SAÍDA POR VENDA ${sale.saleNumber}`),
              occurredAt: sale.confirmedAt,
              createdBy: normalizedRequestedBy,
              updatedBy: normalizedRequestedBy,
            },
          });
        }
      }

      if (openCashSession && paidAmount > 0) {
        const cashAmount = roundMoney(
          normalizedPayments
            .filter((payment) => payment.paymentMethod === "CASH")
            .reduce((total, payment) => total + payment.amount, 0),
        );

        await tx.cashSession.update({
          where: { id: openCashSession.id },
          data: {
            totalReceivedAmount: {
              increment: paidAmount,
            },
            expectedClosingAmount:
              cashAmount > 0
                ? {
                    increment: cashAmount,
                  }
                : undefined,
            updatedBy: normalizedRequestedBy,
          },
        });

        for (const payment of normalizedPayments.filter((item) =>
          this.isImmediatePayment(item.paymentMethod),
        )) {
          await tx.cashMovement.create({
            data: {
              companyId: company.id,
              branchCode,
              cashSessionId: openCashSession.id,
              movementType: "SALE_RECEIPT",
              direction: "IN",
              paymentMethod: payment.paymentMethod,
              amount: payment.amount,
              description: normalizeText(
                `RECEBIMENTO DE VENDA - ${PAYMENT_METHOD_LABELS[payment.paymentMethod]}`,
              ),
              occurredAt: sale.confirmedAt,
              referenceType: "SALE",
              referenceId: sale.id,
              createdBy: normalizedRequestedBy,
              updatedBy: normalizedRequestedBy,
            },
          });
        }
      }

      let receivableTitleId: string | null = null;
      let receivableBatchId: string | null = null;
      const createdInstallments: Array<{
        id: string;
        sourceIndex: number;
        installmentNumber: number;
      }> = [];

      if (deferredInstallments.length) {
        const batch = await tx.receivableBatch.create({
          data: {
            companyId: company.id,
            branchCode,
            sourceSystem: normalizeText(payload.sourceSystem)!,
            sourceTenantId: normalizeText(payload.sourceTenantId)!,
            sourceBatchType: "SALE",
            sourceBatchId: sale.saleNumber,
            referenceDate: sale.confirmedAt,
            status: "PROCESSED",
            itemCount: 1,
            processedCount: 1,
            duplicateCount: 0,
            errorCount: 0,
            payloadSnapshot: serializeJson(payload),
            metadataJson: serializeJson({
              saleId: sale.id,
              saleNumber: sale.saleNumber,
              saleChannel,
            }),
            createdBy: normalizedRequestedBy,
            updatedBy: normalizedRequestedBy,
          },
        });
        receivableBatchId = batch.id;

        const title = await tx.receivableTitle.create({
          data: {
            companyId: company.id,
            branchCode,
            batchId: batch.id,
            payerPartyId: customerParty?.id || null,
            sourceEntityType: "SALE",
            sourceEntityId: sale.id,
            sourceEntityName: sale.saleNumber,
            classLabel: saleChannel,
            businessKey: `SALE:${sale.saleNumber}`,
            description: normalizeText(`VENDA ${sale.saleNumber}`)!,
            categoryCode: saleChannel,
            totalAmount: receivableAmount,
            payerNameSnapshot: sale.customerNameSnapshot,
            payerDocumentSnapshot: sale.customerDocumentSnapshot,
            payerEmailSnapshot: normalizeEmail(payload.customer?.email),
            payerPhoneSnapshot: normalizePhone(payload.customer?.phone),
            createdBy: normalizedRequestedBy,
            updatedBy: normalizedRequestedBy,
          },
        });
        receivableTitleId = title.id;

        for (const installment of deferredInstallments) {
          const createdInstallment = await tx.receivableInstallment.create({
            data: {
              companyId: company.id,
              branchCode,
              batchId: batch.id,
              titleId: title.id,
              sourceInstallmentKey: `SALE:${sale.saleNumber}:${installment.installmentNumber}`,
              installmentNumber: installment.installmentNumber,
              installmentCount: installment.installmentCount,
              dueDate: installment.dueDate,
              amount: installment.amount,
              openAmount: installment.amount,
              paidAmount: 0,
              status: "OPEN",
              descriptionSnapshot: normalizeText(
                `${PAYMENT_METHOD_LABELS[installment.paymentMethod]} - VENDA ${sale.saleNumber}`,
              )!,
              payerNameSnapshot: sale.customerNameSnapshot,
              payerDocumentSnapshot: sale.customerDocumentSnapshot,
              createdBy: normalizedRequestedBy,
              updatedBy: normalizedRequestedBy,
            },
          });

          createdInstallments.push({
            id: createdInstallment.id,
            sourceIndex: installment.sourceIndex,
            installmentNumber: installment.installmentNumber,
          });
        }

        await tx.sale.update({
          where: { id: sale.id },
          data: {
            receivableBatchId,
            receivableTitleId,
            updatedBy: normalizedRequestedBy,
          },
        });
      }

      for (const payment of normalizedPayments.filter((item) =>
        this.isImmediatePayment(item.paymentMethod),
      )) {
        await tx.salePayment.create({
          data: {
            companyId: company.id,
            branchCode,
            saleId: sale.id,
            paymentMethod: payment.paymentMethod,
            amount: payment.amount,
            cardInstallmentCount: payment.cardInstallmentCount || null,
            cashSessionId: openCashSession?.id || null,
            status: "PAID",
            notes: normalizeText(payment.notes),
            createdBy: normalizedRequestedBy,
            updatedBy: normalizedRequestedBy,
          },
        });
      }

      for (const installment of deferredInstallments) {
        const linkedInstallment = createdInstallments.find(
          (item) =>
            item.sourceIndex === installment.sourceIndex &&
            item.installmentNumber === installment.installmentNumber,
        );

        await tx.salePayment.create({
          data: {
            companyId: company.id,
            branchCode,
            saleId: sale.id,
            paymentMethod: installment.paymentMethod,
            amount: installment.amount,
            dueDate: installment.dueDate,
            installmentCount: installment.installmentCount,
            receivableInstallmentId: linkedInstallment?.id || null,
            status: "OPEN",
            notes: installment.notes,
            createdBy: normalizedRequestedBy,
            updatedBy: normalizedRequestedBy,
          },
        });
      }

      return tx.sale.findFirst({
        where: { id: sale.id },
        include: {
          company: { select: { name: true } },
          items: { where: { canceledAt: null }, orderBy: { lineNumber: "asc" } },
          payments: { where: { canceledAt: null }, orderBy: { createdAt: "asc" } },
        },
      });
    });

    return {
      ...this.mapSale(createdSale),
      message: "Venda confirmada com sucesso.",
    };
  }

  private mapSaleReturn(returnRecord: any) {
    const items = Array.isArray(returnRecord?.items) ? returnRecord.items : [];
    const credit = returnRecord?.credit || null;

    return {
      id: returnRecord.id,
      companyId: returnRecord.companyId,
      branchCode: returnRecord.branchCode,
      saleId: returnRecord.saleId,
      returnNumber: returnRecord.returnNumber,
      status: returnRecord.status,
      customerPartyId: returnRecord.customerPartyId || null,
      customerName: returnRecord.customerNameSnapshot,
      customerDocument: returnRecord.customerDocumentSnapshot || null,
      totalAmount: roundMoney(returnRecord.totalAmount || 0),
      creditId: returnRecord.creditId || null,
      reason: returnRecord.reason,
      confirmedAt: returnRecord.confirmedAt?.toISOString?.() || null,
      createdAt: returnRecord.createdAt?.toISOString?.() || null,
      credit: credit
        ? {
            id: credit.id,
            status: credit.status,
            originalAmount: roundMoney(credit.originalAmount || 0),
            availableAmount: roundMoney(credit.availableAmount || 0),
          }
        : null,
      items: items.map((item: any) => ({
        id: item.id,
        saleItemId: item.saleItemId,
        productId: item.productId,
        productName: item.productNameSnapshot,
        productCode: item.productCodeSnapshot || null,
        unitCode: item.unitCodeSnapshot,
        quantity: roundMoney(item.quantity || 0),
        unitPrice: roundMoney(item.unitPrice || 0),
        totalAmount: roundMoney(item.totalAmount || 0),
        tracksInventory: Boolean(item.tracksInventory),
      })),
    };
  }

  async createReturn(saleId: string, payload: CreateSaleReturnDto) {
    const normalizedSaleId = String(saleId || "").trim();
    if (!normalizedSaleId) {
      throw new BadRequestException("Venda inválida para devolução.");
    }

    const company = await this.resolveCompany({
      sourceSystem: payload.sourceSystem,
      sourceTenantId: payload.sourceTenantId,
    });
    const normalizedSourceSystem = normalizeText(payload.sourceSystem)!;
    const normalizedSourceTenantId = normalizeText(payload.sourceTenantId)!;
    const reason = normalizeText(payload.reason);
    const requestedBy = normalizeText(payload.requestedBy) || "OPERADOR";
    const confirmedAt = new Date();

    if (!reason) {
      throw new BadRequestException("Informe o motivo da devolução.");
    }

    const requestedQuantities = new Map<string, number>();
    for (const item of payload.items || []) {
      const saleItemId = String(item.saleItemId || "").trim();
      const quantity = roundMoney(Number(item.quantity || 0));
      if (!saleItemId || quantity <= 0) {
        continue;
      }
      requestedQuantities.set(
        saleItemId,
        roundMoney((requestedQuantities.get(saleItemId) || 0) + quantity),
      );
    }

    if (!requestedQuantities.size) {
      throw new BadRequestException("Informe ao menos um produto para devolução.");
    }

    const sale = await this.prisma.sale.findFirst({
      where: {
        id: normalizedSaleId,
        companyId: company.id,
        sourceSystem: normalizedSourceSystem,
        sourceTenantId: normalizedSourceTenantId,
        canceledAt: null,
      },
      include: {
        items: { where: { canceledAt: null }, orderBy: { lineNumber: "asc" } },
      },
    });

    if (!sale) {
      throw new NotFoundException("VENDA NÃO ENCONTRADA.");
    }

    if (normalizeText(sale.status) === "CANCELED") {
      throw new BadRequestException("Venda cancelada não pode receber devolução.");
    }

    const returnedQuantities = await this.loadReturnedQuantityBySaleItem(
      company.id,
      sale.id,
    );
    const saleItemsById = new Map((sale.items || []).map((item: any) => [item.id, item]));
    const returnLines: Array<{
      saleItem: any;
      quantity: number;
      unitReturnPrice: number;
      totalAmount: number;
    }> = [];

    for (const [saleItemId, quantity] of requestedQuantities) {
      const saleItem = saleItemsById.get(saleItemId);
      if (!saleItem) {
        throw new BadRequestException("Produto selecionado não pertence à venda.");
      }

      if (!saleItem.allowFraction && !Number.isInteger(quantity)) {
        throw new BadRequestException(
          `Produto ${saleItem.productNameSnapshot} não permite devolução fracionada.`,
        );
      }

      const alreadyReturned = roundMoney(returnedQuantities.get(saleItemId) || 0);
      const availableQuantity = roundMoney(Number(saleItem.quantity || 0) - alreadyReturned);
      if (quantity > availableQuantity) {
        throw new BadRequestException(
          `Quantidade de devolução maior que a disponível para ${saleItem.productNameSnapshot}.`,
        );
      }

      const unitReturnPrice = roundMoney(
        Number(saleItem.totalAmount || 0) / Number(saleItem.quantity || 1),
      );
      returnLines.push({
        saleItem,
        quantity,
        unitReturnPrice,
        totalAmount: roundMoney(unitReturnPrice * quantity),
      });
    }

    const totalAmount = roundMoney(
      returnLines.reduce((total, line) => total + line.totalAmount, 0),
    );
    if (totalAmount <= 0) {
      throw new BadRequestException("A devolução precisa gerar valor maior que zero.");
    }

    const returnNumber = this.buildReturnNumber(sale.branchCode);

    const result = await this.prisma.$transaction(async (tx: any) => {
      const transactionReturnedQuantities = await this.loadReturnedQuantityBySaleItem(
        company.id,
        sale.id,
        tx,
      );

      for (const line of returnLines) {
        const alreadyReturned = roundMoney(
          transactionReturnedQuantities.get(line.saleItem.id) || 0,
        );
        const availableQuantity = roundMoney(
          Number(line.saleItem.quantity || 0) - alreadyReturned,
        );
        if (line.quantity > availableQuantity) {
          throw new BadRequestException(
            `Quantidade de devolução maior que a disponível para ${line.saleItem.productNameSnapshot}.`,
          );
        }
      }

      const createdReturn = await tx.saleReturn.create({
        data: {
          companyId: company.id,
          branchCode: sale.branchCode,
          saleId: sale.id,
          returnNumber,
          customerPartyId: sale.customerPartyId || null,
          customerNameSnapshot: sale.customerNameSnapshot,
          customerDocumentSnapshot: sale.customerDocumentSnapshot,
          totalAmount,
          reason,
          confirmedAt,
          createdBy: requestedBy,
          updatedBy: requestedBy,
        },
      });

      const credit = await tx.customerCredit.create({
        data: {
          companyId: company.id,
          branchCode: sale.branchCode,
          partyId: sale.customerPartyId || null,
          customerName: sale.customerNameSnapshot,
          customerDocument: sale.customerDocumentSnapshot,
          originalAmount: totalAmount,
          availableAmount: totalAmount,
          sourceType: "SALE_RETURN",
          sourceReference: returnNumber,
          notes: normalizeText(`DEVOLUÇÃO DA VENDA ${sale.saleNumber} - ${reason}`),
          createdBy: requestedBy,
          updatedBy: requestedBy,
        },
      });

      await tx.customerCreditMovement.create({
        data: {
          companyId: company.id,
          branchCode: sale.branchCode,
          creditId: credit.id,
          movementType: "GENERATED",
          direction: "IN",
          amount: totalAmount,
          referenceType: "SALE_RETURN",
          referenceId: createdReturn.id,
          notes: normalizeText(`CRÉDITO GERADO PELA DEVOLUÇÃO ${returnNumber}`),
          occurredAt: confirmedAt,
          createdBy: requestedBy,
          updatedBy: requestedBy,
        },
      });

      await tx.saleReturn.update({
        where: { id: createdReturn.id },
        data: {
          creditId: credit.id,
          updatedBy: requestedBy,
        },
      });

      let lineNumber = 1;
      for (const line of returnLines) {
        let previousStock: number | null = null;
        let resultingStock: number | null = null;

        if (line.saleItem.tracksInventory) {
          const product = await tx.product.findFirst({
            where: {
              id: line.saleItem.productId,
              companyId: company.id,
            },
          });

          if (product) {
            previousStock = roundMoney(Number(product.currentStock || 0));
            resultingStock = roundMoney(previousStock + line.quantity);

            const balance = await tx.productStockBalance.findFirst({
              where: {
                companyId: company.id,
                branchCode: line.saleItem.branchCode,
                productId: line.saleItem.productId,
                variantKey: line.saleItem.variantKey || "GERAL",
                canceledAt: null,
              },
            });
            const previousBalance = roundMoney(
              Number(balance?.quantity ?? previousStock),
            );
            const resultingBalance = roundMoney(previousBalance + line.quantity);

            await tx.product.update({
              where: { id: product.id },
              data: {
                currentStock: resultingStock,
                updatedBy: requestedBy,
              },
            });

            await tx.productStockBalance.upsert({
              where: {
                companyId_productId_branchCode_variantKey: {
                  companyId: company.id,
                  productId: line.saleItem.productId,
                  branchCode: line.saleItem.branchCode,
                  variantKey: line.saleItem.variantKey || "GERAL",
                },
              },
              create: {
                companyId: company.id,
                branchCode: line.saleItem.branchCode,
                productId: line.saleItem.productId,
                variantKey: line.saleItem.variantKey || "GERAL",
                colorCode: line.saleItem.colorCode,
                colorName: line.saleItem.colorName,
                sizeCode: line.saleItem.sizeCode,
                lotNumber: line.saleItem.lotNumber,
                lotExpirationDate: line.saleItem.lotExpirationDate,
                quantity: resultingBalance,
                reservedQuantity: 0,
                createdBy: requestedBy,
                updatedBy: requestedBy,
              },
              update: {
                quantity: resultingBalance,
                updatedBy: requestedBy,
              },
            });
          }
        }

        const createdItem = await tx.saleReturnItem.create({
          data: {
            companyId: company.id,
            branchCode: line.saleItem.branchCode,
            returnId: createdReturn.id,
            saleId: sale.id,
            saleItemId: line.saleItem.id,
            productId: line.saleItem.productId,
            lineNumber,
            productNameSnapshot: line.saleItem.productNameSnapshot,
            productCodeSnapshot: line.saleItem.productCodeSnapshot,
            unitCodeSnapshot: line.saleItem.unitCodeSnapshot,
            quantity: line.quantity,
            unitPrice: line.unitReturnPrice,
            totalAmount: line.totalAmount,
            tracksInventory: Boolean(line.saleItem.tracksInventory),
            variantKey: line.saleItem.variantKey || "GERAL",
            colorCode: line.saleItem.colorCode,
            colorName: line.saleItem.colorName,
            sizeCode: line.saleItem.sizeCode,
            lotNumber: line.saleItem.lotNumber,
            lotExpirationDate: line.saleItem.lotExpirationDate,
            previousStock,
            resultingStock,
            createdBy: requestedBy,
            updatedBy: requestedBy,
          },
        });

        if (line.saleItem.tracksInventory && previousStock !== null && resultingStock !== null) {
          await tx.stockMovement.create({
            data: {
              companyId: company.id,
              branchCode: line.saleItem.branchCode,
              productId: line.saleItem.productId,
              sourceType: "SALE_RETURN",
              sourceId: createdReturn.id,
              sourceItemId: createdItem.id,
              movementType: "ENTRY",
              quantity: line.quantity,
              previousStock,
              resultingStock,
              unitCost: line.saleItem.unitCost,
              notes: normalizeText(
                `DEVOLUÇÃO DA VENDA ${sale.saleNumber} - ${reason}`,
              ),
              occurredAt: confirmedAt,
              createdBy: requestedBy,
              updatedBy: requestedBy,
            },
          });
        }

        lineNumber += 1;
      }

      return tx.saleReturn.findUnique({
        where: { id: createdReturn.id },
        include: {
          credit: true,
          items: { where: { canceledAt: null }, orderBy: { lineNumber: "asc" } },
        },
      });
    });

    return {
      ...this.mapSaleReturn(result),
      message: "Devolução registrada e crédito gerado para o cliente.",
    };
  }

  async cancel(saleId: string, payload: CancelSaleDto) {
    const normalizedSaleId = String(saleId || "").trim();
    if (!normalizedSaleId) {
      throw new BadRequestException("Venda inválida para cancelamento.");
    }

    const company = await this.resolveCompany({
      sourceSystem: payload.sourceSystem,
      sourceTenantId: payload.sourceTenantId,
    });
    const canceledAt = new Date();
    const canceledBy =
      normalizeText(payload.requestedBy) ||
      normalizeText(payload.cashierUserId) ||
      "OPERADOR";
    const cancellationNote =
      normalizeText(payload.reason || payload.notes) || "CANCELAMENTO DA VENDA";

    const sale = await this.prisma.sale.findFirst({
      where: {
        id: normalizedSaleId,
        companyId: company.id,
        sourceSystem: normalizeText(payload.sourceSystem)!,
        sourceTenantId: normalizeText(payload.sourceTenantId)!,
        canceledAt: null,
      },
      include: {
        items: { where: { canceledAt: null }, orderBy: { lineNumber: "asc" } },
        payments: { where: { canceledAt: null } },
      },
    });

    if (!sale) {
      throw new NotFoundException("VENDA NÃO ENCONTRADA OU JÁ CANCELADA.");
    }

    const cancelerCashSession =
      Number(sale.paidAmount || 0) > 0
        ? await this.loadOpenCashSession(company.id, payload.cashierUserId)
        : null;

    if (Number(sale.paidAmount || 0) > 0 && !cancelerCashSession) {
      throw new BadRequestException(
        "Abra o caixa do operador que está cancelando a venda antes de cancelar valores recebidos.",
      );
    }

    const result = await this.prisma.$transaction(async (tx: any) => {
      const cashSessionAdjustments = new Map<
        string,
        { receivedAmount: number; drawerAmount: number }
      >();
      let cancelerDrawerOutAmount = 0;
      const addCashSessionAdjustment = (
        cashSessionId: string | null | undefined,
        receivedAmount: number,
        drawerAmount: number,
      ) => {
        if (!cashSessionId) return;
        const current =
          cashSessionAdjustments.get(cashSessionId) || {
            receivedAmount: 0,
            drawerAmount: 0,
          };
        current.receivedAmount = roundMoney(
          current.receivedAmount + receivedAmount,
        );
        current.drawerAmount = roundMoney(current.drawerAmount + drawerAmount);
        cashSessionAdjustments.set(cashSessionId, current);
      };

      for (const item of sale.items || []) {
        if (!item.tracksInventory) {
          continue;
        }

        const product = await tx.product.findFirst({
          where: {
            id: item.productId,
            companyId: company.id,
          },
        });

        if (!product) {
          continue;
        }

        const previousStock = roundMoney(Number(product.currentStock || 0));
        const resultingStock = roundMoney(
          previousStock + Number(item.quantity || 0),
        );
        const balance = await tx.productStockBalance.findFirst({
          where: {
            companyId: company.id,
            branchCode: item.branchCode,
            productId: item.productId,
            variantKey: item.variantKey || "GERAL",
            canceledAt: null,
          },
        });
        const previousBalance = roundMoney(
          Number(balance?.quantity ?? previousStock),
        );
        const resultingBalance = roundMoney(
          previousBalance + Number(item.quantity || 0),
        );

        await tx.product.update({
          where: { id: product.id },
          data: {
            currentStock: resultingStock,
            updatedBy: canceledBy,
          },
        });

        await tx.productStockBalance.upsert({
          where: {
            companyId_productId_branchCode_variantKey: {
              companyId: company.id,
              productId: item.productId,
              branchCode: item.branchCode,
              variantKey: item.variantKey || "GERAL",
            },
          },
          create: {
            companyId: company.id,
            branchCode: item.branchCode,
            productId: item.productId,
            variantKey: item.variantKey || "GERAL",
            colorCode: item.colorCode,
            colorName: item.colorName,
            sizeCode: item.sizeCode,
            lotNumber: item.lotNumber,
            lotExpirationDate: item.lotExpirationDate,
            quantity: resultingBalance,
            reservedQuantity: 0,
            createdBy: canceledBy,
            updatedBy: canceledBy,
          },
          update: {
            quantity: resultingBalance,
            updatedBy: canceledBy,
          },
        });

        await tx.stockMovement.create({
          data: {
            companyId: company.id,
            branchCode: item.branchCode,
            productId: item.productId,
            sourceType: "SALE_CANCEL",
            sourceId: sale.id,
            sourceItemId: item.id,
            movementType: "ENTRY",
            quantity: item.quantity,
            previousStock,
            resultingStock,
            unitCost: item.unitCost,
            notes: normalizeText(
              `CANCELAMENTO DA VENDA ${sale.saleNumber} - ${cancellationNote}`,
            ),
            occurredAt: canceledAt,
            createdBy: canceledBy,
            updatedBy: canceledBy,
          },
        });
      }

      const saleCashMovements = await tx.cashMovement.findMany({
        where: {
          companyId: company.id,
          referenceType: "SALE",
          referenceId: sale.id,
          canceledAt: null,
        },
      });

      for (const movement of saleCashMovements) {
        await tx.cashMovement.update({
          where: { id: movement.id },
          data: {
            canceledAt,
            canceledBy,
            updatedBy: canceledBy,
          },
        });
        addCashSessionAdjustment(
          movement.cashSessionId,
          Number(movement.amount || 0),
          this.affectsCashDrawer(movement.paymentMethod)
            ? Number(movement.amount || 0)
            : 0,
        );
        if (this.affectsCashDrawer(movement.paymentMethod)) {
          cancelerDrawerOutAmount = roundMoney(
            cancelerDrawerOutAmount + Number(movement.amount || 0),
          );
        }
      }

      if (sale.receivableTitleId) {
        const installments = await tx.receivableInstallment.findMany({
          where: {
            companyId: company.id,
            titleId: sale.receivableTitleId,
            canceledAt: null,
          },
          include: {
            settlements: {
              where: { canceledAt: null },
              orderBy: [{ settledAt: "asc" }, { createdAt: "asc" }],
            },
          },
        });

        for (const installment of installments) {
          for (const settlement of installment.settlements || []) {
            await tx.installmentSettlement.update({
              where: { id: settlement.id },
              data: {
                canceledAt,
                canceledBy,
                notes: normalizeText(
                  [settlement.notes, cancellationNote]
                    .filter(Boolean)
                    .join(" | ESTORNO: "),
                ),
                updatedBy: canceledBy,
              },
            });

            const settlementMovements = await tx.cashMovement.findMany({
              where: {
                companyId: company.id,
                cashSessionId: settlement.cashSessionId,
                movementType: "SETTLEMENT",
                direction: "IN",
                referenceType: "INSTALLMENT",
                referenceId: installment.id,
                paymentMethod: settlement.paymentMethod,
                amount: settlement.receivedAmount,
                canceledAt: null,
              },
            });

            for (const movement of settlementMovements) {
              await tx.cashMovement.update({
                where: { id: movement.id },
                data: {
                  canceledAt,
                  canceledBy,
                  updatedBy: canceledBy,
                },
              });
            }

            addCashSessionAdjustment(
              settlement.cashSessionId,
              Number(settlement.receivedAmount || 0),
              this.affectsCashDrawer(settlement.paymentMethod)
                ? Number(settlement.receivedAmount || 0)
                : 0,
            );
            if (this.affectsCashDrawer(settlement.paymentMethod)) {
              cancelerDrawerOutAmount = roundMoney(
                cancelerDrawerOutAmount + Number(settlement.receivedAmount || 0),
              );
            }
          }

          await tx.receivableInstallment.update({
            where: { id: installment.id },
            data: {
              openAmount: 0,
              paidAmount: 0,
              status: "CANCELED",
              settlementMethod: null,
              settledAt: null,
              bankAccountId: null,
              bankAccountLabel: null,
              bankAssignedAt: null,
              bankAssignedBy: null,
              bankMovementGroupId: null,
              bankMovementStatus: null,
              bankMovementCreatedAt: null,
              bankMovementConvertedAt: null,
              bankMovementConvertedBy: null,
              canceledAt,
              canceledBy,
              updatedBy: canceledBy,
            },
          });
        }

        await tx.receivableTitle.update({
          where: { id: sale.receivableTitleId },
          data: {
            canceledAt,
            canceledBy,
            updatedBy: canceledBy,
          },
        });
      }

      if (sale.receivableBatchId) {
        await tx.receivableBatch.update({
          where: { id: sale.receivableBatchId },
          data: {
            status: "CANCELED",
            canceledAt,
            canceledBy,
            updatedBy: canceledBy,
          },
        });
      }

      for (const [cashSessionId, adjustment] of cashSessionAdjustments) {
        await tx.cashSession.update({
          where: { id: cashSessionId },
          data: {
            totalReceivedAmount:
              adjustment.receivedAmount > 0
                ? { decrement: adjustment.receivedAmount }
                : undefined,
            expectedClosingAmount:
              adjustment.drawerAmount > 0
                ? { decrement: adjustment.drawerAmount }
                : undefined,
            updatedBy: canceledBy,
          },
        });
      }

      if (cancelerCashSession && cancelerDrawerOutAmount > 0) {
        await tx.cashMovement.create({
          data: {
            companyId: company.id,
            branchCode: sale.branchCode,
            cashSessionId: cancelerCashSession.id,
            movementType: "SALE_CANCEL",
            direction: "OUT",
            paymentMethod: "CASH",
            amount: cancelerDrawerOutAmount,
            description: normalizeText(
              `CANCELAMENTO DA VENDA ${sale.saleNumber}`,
            )!,
            occurredAt: canceledAt,
            referenceType: "SALE",
            referenceId: sale.id,
            createdBy: canceledBy,
            updatedBy: canceledBy,
          },
        });

        await tx.cashSession.update({
          where: { id: cancelerCashSession.id },
          data: {
            expectedClosingAmount: { decrement: cancelerDrawerOutAmount },
            updatedBy: canceledBy,
          },
        });
      }

      await tx.salePayment.updateMany({
        where: {
          companyId: company.id,
          saleId: sale.id,
          canceledAt: null,
        },
        data: {
          status: "CANCELED",
          canceledAt,
          canceledBy,
          updatedBy: canceledBy,
        },
      });

      await tx.saleItem.updateMany({
        where: {
          companyId: company.id,
          saleId: sale.id,
          canceledAt: null,
        },
        data: {
          canceledAt,
          canceledBy,
          updatedBy: canceledBy,
        },
      });

      const canceledSale = await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: "CANCELED",
          notes: normalizeText(
            [sale.notes, cancellationNote]
              .filter(Boolean)
              .join(" | CANCELAMENTO: "),
          ),
          canceledAt,
          canceledBy,
          updatedBy: canceledBy,
        },
      });

      return {
        saleId: canceledSale.id,
        stockMovementCount: (sale.items || []).filter(
          (item: any) => item.tracksInventory,
        ).length,
        canceledCashMovementCount: saleCashMovements.length,
        adjustedCashSessionCount: cashSessionAdjustments.size,
        cancelerCashOutAmount: cancelerDrawerOutAmount,
      };
    });

    return {
      ...result,
      message: "Venda cancelada com sucesso.",
    };
  }
}
