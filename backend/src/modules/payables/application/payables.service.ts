import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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
  ApprovePayableInvoiceImportDto,
  ApprovePayableInvoiceImportItemDto,
  CancelPayableInvoiceImportDto,
  GetPayableInvoiceImportDto,
  ImportInvoiceXmlDto,
  ListPayableInvoiceImportsDto,
  PAYABLE_INSTALLMENT_PAYMENT_METHODS,
  UpdatePayableInvoiceImportItemApprovalDraftDto,
  UpdatePayableInvoiceImportInstallmentDto,
  UpdatePayableInvoiceImportInstallmentsDto,
} from "./dto/payables.dto";
import {
  ParsedPayableInvoiceItem,
  parsePayableInvoiceXml,
} from "./payables-xml-parser";
import {
  DEFAULT_BRANCH_CODE,
  normalizeBranchCode,
} from "../../../common/branch.constants";
import { ensureDefaultCompanyBranch } from "../../../common/company-branches";
import { getFinanceContext } from "../../../common/finance-context";

type ResolvedCompany = {
  id: string;
  sourceSystem: string;
  sourceTenantId: string;
  name: string;
  document: string | null;
};

type ImportXmlForCompanyOptions = {
  requestedBy?: string | null;
  importType?: string | null;
  fiscalCertificateId?: string | null;
  distributionNsu?: string | null;
};

type BranchStockParameterMode = "NO" | "YES" | "BY_PRODUCT";

type BranchStockParameterConfig = {
  branchCode: number;
  stockControlMode: BranchStockParameterMode;
  stockIntegerQuantityMode: BranchStockParameterMode;
  stockLotControlMode: BranchStockParameterMode;
  stockExpirationControlMode: BranchStockParameterMode;
  stockGridControlMode: BranchStockParameterMode;
  stockNegativeControlMode: BranchStockParameterMode;
};

type ResolvedProductStockOptions = {
  tracksInventory: boolean;
  allowFraction: boolean;
  usesLotControl: boolean;
  usesExpirationControl: boolean;
  usesColorSize: boolean;
  allowsNegativeStock: boolean;
};

@Injectable()
export class PayablesService {
  constructor(private readonly prisma: PrismaService) {}

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

  private getLegacyIntegerMode(
    quantityPrecision?: string | null,
  ): BranchStockParameterMode {
    const normalized = normalizeText(quantityPrecision);
    if (normalized === "DECIMAL_ALLOWED") return "NO";
    if (normalized === "PRODUCT_DEFINED") return "BY_PRODUCT";
    return "YES";
  }

  private getLegacyLotMode(
    inventoryControlType?: string | null,
  ): BranchStockParameterMode {
    return normalizeText(inventoryControlType) === "LOT" ? "BY_PRODUCT" : "NO";
  }

  private getLegacyGridMode(
    inventoryControlType?: string | null,
  ): BranchStockParameterMode {
    return normalizeText(inventoryControlType) === "COLOR_SIZE"
      ? "BY_PRODUCT"
      : "NO";
  }

  private getInventoryControlTypeFromStockModes(
    stockLotControlMode: BranchStockParameterMode,
    stockGridControlMode: BranchStockParameterMode,
  ) {
    if (stockGridControlMode !== "NO") return "COLOR_SIZE";
    if (stockLotControlMode !== "NO") return "LOT";
    return "TRADITIONAL";
  }

  private getQuantityPrecisionFromStockMode(
    stockIntegerQuantityMode: BranchStockParameterMode,
  ) {
    if (stockIntegerQuantityMode === "NO") return "DECIMAL_ALLOWED";
    if (stockIntegerQuantityMode === "BY_PRODUCT") return "PRODUCT_DEFINED";
    return "INTEGER_ONLY";
  }

  private normalizePayableInstallmentStatus(value?: string | null) {
    return normalizeText(value) === "PAID" ? "PAID" : "OPEN";
  }

  private normalizePayableInstallmentPaymentMethod(value?: string | null) {
    const normalized = normalizeText(value);
    if (
      normalized &&
      PAYABLE_INSTALLMENT_PAYMENT_METHODS.includes(
        normalized as (typeof PAYABLE_INSTALLMENT_PAYMENT_METHODS)[number],
      )
    ) {
      return normalized;
    }

    return null;
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

  private async resolveBranchStockParameterConfig(
    tx: any,
    companyId: string,
    payload: ApprovePayableInvoiceImportDto,
  ): Promise<BranchStockParameterConfig> {
    const branchCode = this.currentBranchCode(payload.sourceBranchCode);

    await ensureDefaultCompanyBranch(tx, companyId, payload.requestedBy);

    const existingBranch = await tx.companyBranch.findFirst({
      where: {
        companyId,
        branchCode,
        canceledAt: null,
      },
    });

    const config: BranchStockParameterConfig = {
      branchCode,
      stockControlMode: this.normalizeBranchStockParameterMode(
        payload.stockControlMode || existingBranch?.stockControlMode,
        "BY_PRODUCT",
      ),
      stockIntegerQuantityMode: this.normalizeBranchStockParameterMode(
        payload.stockIntegerQuantityMode ||
          existingBranch?.stockIntegerQuantityMode,
        this.getLegacyIntegerMode(existingBranch?.quantityPrecision),
      ),
      stockLotControlMode: this.normalizeBranchStockParameterMode(
        payload.stockLotControlMode || existingBranch?.stockLotControlMode,
        this.getLegacyLotMode(existingBranch?.inventoryControlType),
      ),
      stockExpirationControlMode: this.normalizeBranchStockParameterMode(
        payload.stockExpirationControlMode ||
          existingBranch?.stockExpirationControlMode,
        this.getLegacyLotMode(existingBranch?.inventoryControlType),
      ),
      stockGridControlMode: this.normalizeBranchStockParameterMode(
        payload.stockGridControlMode || existingBranch?.stockGridControlMode,
        this.getLegacyGridMode(existingBranch?.inventoryControlType),
      ),
      stockNegativeControlMode: this.normalizeBranchStockParameterMode(
        payload.stockNegativeControlMode ||
          existingBranch?.stockNegativeControlMode,
        "NO",
      ),
    };
    const stockConfigFields = {
      stockControlMode: config.stockControlMode,
      stockIntegerQuantityMode: config.stockIntegerQuantityMode,
      stockLotControlMode: config.stockLotControlMode,
      stockExpirationControlMode: config.stockExpirationControlMode,
      stockGridControlMode: config.stockGridControlMode,
      stockNegativeControlMode: config.stockNegativeControlMode,
    };

    await tx.companyBranch.upsert({
      where: {
        companyId_branchCode: {
          companyId,
          branchCode,
        },
      },
      create: {
        companyId,
        branchCode,
        name:
          branchCode === DEFAULT_BRANCH_CODE
            ? "FILIAL 1"
            : `FILIAL ${branchCode}`,
        isActive: true,
        isDefault: branchCode === DEFAULT_BRANCH_CODE,
        inventoryControlType: this.getInventoryControlTypeFromStockModes(
          config.stockLotControlMode,
          config.stockGridControlMode,
        ),
        quantityPrecision: this.getQuantityPrecisionFromStockMode(
          config.stockIntegerQuantityMode,
        ),
        ...stockConfigFields,
        createdBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
      update: {
        isActive: true,
        canceledAt: null,
        canceledBy: null,
        inventoryControlType: this.getInventoryControlTypeFromStockModes(
          config.stockLotControlMode,
          config.stockGridControlMode,
        ),
        quantityPrecision: this.getQuantityPrecisionFromStockMode(
          config.stockIntegerQuantityMode,
        ),
        ...stockConfigFields,
        updatedBy: payload.requestedBy || null,
      },
    });

    return config;
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

  private getDraftBoolean(
    value: boolean | undefined,
    draftValue: boolean | null | undefined,
  ) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof draftValue === "boolean") {
      return draftValue;
    }

    return undefined;
  }

  private resolveProductStockOptions(
    item: any,
    approvalItem: ApprovePayableInvoiceImportItemDto | undefined,
    branchConfig: BranchStockParameterConfig,
  ): ResolvedProductStockOptions {
    const tracksInventory = this.resolveBooleanByBranchMode(
      branchConfig.stockControlMode,
      this.getDraftBoolean(
        approvalItem?.tracksInventory,
        item.draftTracksInventory,
      ),
      Boolean(item.tracksInventory),
    );

    const allowFraction = this.resolveBooleanByBranchMode(
      branchConfig.stockIntegerQuantityMode,
      this.getDraftBoolean(approvalItem?.allowFraction, item.draftAllowFraction),
      !Number.isInteger(roundMoney(item.quantity || 0)),
      false,
      true,
    );

    const stockOptions: ResolvedProductStockOptions = {
      tracksInventory,
      allowFraction,
      usesLotControl: this.resolveBooleanByBranchMode(
        branchConfig.stockLotControlMode,
        this.getDraftBoolean(
          approvalItem?.usesLotControl,
          item.draftUsesLotControl,
        ),
        false,
      ),
      usesExpirationControl: this.resolveBooleanByBranchMode(
        branchConfig.stockExpirationControlMode,
        this.getDraftBoolean(
          approvalItem?.usesExpirationControl,
          item.draftUsesExpirationControl,
        ),
        false,
      ),
      usesColorSize: this.resolveBooleanByBranchMode(
        branchConfig.stockGridControlMode,
        this.getDraftBoolean(
          approvalItem?.usesColorSize,
          item.draftUsesColorSize,
        ),
        false,
      ),
      allowsNegativeStock: this.resolveBooleanByBranchMode(
        branchConfig.stockNegativeControlMode,
        this.getDraftBoolean(
          approvalItem?.allowsNegativeStock,
          item.draftAllowsNegativeStock,
        ),
        false,
      ),
    };

    if (!stockOptions.tracksInventory) {
      return {
        ...stockOptions,
        allowFraction: false,
        usesLotControl: false,
        usesExpirationControl: false,
        usesColorSize: false,
        allowsNegativeStock: false,
      };
    }

    if (
      !stockOptions.allowFraction &&
      !Number.isInteger(roundMoney(item.quantity || 0))
    ) {
      throw new BadRequestException(
        `O item ${item.lineNumber} possui quantidade fracionada. Marque que o produto aceita fracionar ou ajuste o parâmetro da filial.`,
      );
    }

    return stockOptions;
  }

  private async ensureSupplier(
    companyId: string,
    payload: {
      legalName: string;
      tradeName?: string | null;
      document?: string | null;
      stateRegistration?: string | null;
      email?: string | null;
      phone?: string | null;
    },
    requestedBy?: string | null,
  ) {
    const normalizedDocument = normalizeDigits(payload.document);
    const normalizedLegalName =
      normalizeText(payload.legalName) || "FORNECEDOR NÃO IDENTIFICADO";

    const existing =
      (normalizedDocument
        ? await this.prisma.supplier.findFirst({
            where: {
              companyId,
              document: normalizedDocument,
              canceledAt: null,
            },
          })
        : null) ||
      (await this.prisma.supplier.findFirst({
        where: {
          companyId,
          legalName: normalizedLegalName,
          canceledAt: null,
        },
      }));

    const data = {
      status: "ACTIVE",
      legalName: normalizedLegalName,
      tradeName: normalizeText(payload.tradeName),
      document: normalizedDocument,
      stateRegistration: normalizeText(payload.stateRegistration),
      email: normalizeEmail(payload.email),
      phone: normalizePhone(payload.phone),
      updatedBy: requestedBy || null,
    };

    if (existing) {
      return this.prisma.supplier.update({
        where: { id: existing.id },
        data,
      });
    }

    return this.prisma.supplier.create({
      data: {
        companyId,
        ...data,
        createdBy: requestedBy || null,
      },
    });
  }

  private async findSuggestedProduct(
    companyId: string,
    item: ParsedPayableInvoiceItem,
  ) {
    if (item.barcode) {
      const productByBarcode = await this.prisma.product.findFirst({
        where: {
          companyId,
          barcode: item.barcode,
          canceledAt: null,
        },
      });

      if (productByBarcode) {
        return productByBarcode;
      }
    }

    if (item.supplierItemCode) {
      const productByCode = await this.prisma.product.findFirst({
        where: {
          companyId,
          internalCode: item.supplierItemCode,
          canceledAt: null,
        },
      });

      if (productByCode) {
        return productByCode;
      }
    }

    return null;
  }

  private getInvoiceStatusMeta(status?: string | null) {
    const normalizedStatus = normalizeText(status) || "PENDING_APPROVAL";

    if (normalizedStatus === "APPROVED") {
      return {
        status: "APPROVED",
        statusLabel: "APROVADA",
        semaphore: "GREEN",
      };
    }

    if (normalizedStatus === "CANCELED") {
      return {
        status: "CANCELED",
        statusLabel: "CANCELADA",
        semaphore: "YELLOW",
      };
    }

    return {
      status: "PENDING_APPROVAL",
      statusLabel: "AGUARDANDO APROVAÇÃO",
      semaphore: "YELLOW",
    };
  }

  private mapImportSummary(invoiceImport: any) {
    const statusMeta = this.getInvoiceStatusMeta(invoiceImport.status);

    return {
      id: invoiceImport.id,
      companyId: invoiceImport.companyId,
      companyName: invoiceImport.company?.name || null,
      sourceSystem: invoiceImport.company?.sourceSystem || null,
      sourceTenantId: invoiceImport.company?.sourceTenantId || null,
      status: statusMeta.status,
      statusLabel: statusMeta.statusLabel,
      semaphore: statusMeta.semaphore,
      importType: invoiceImport.importType,
      documentModel: invoiceImport.documentModel,
      accessKey: invoiceImport.accessKey,
      fiscalCertificateId: invoiceImport.fiscalCertificateId || null,
      distributionNsu: invoiceImport.distributionNsu || null,
      invoiceNumber: invoiceImport.invoiceNumber,
      series: invoiceImport.series || null,
      operationNature: invoiceImport.operationNature || null,
      issueDate: invoiceImport.issueDate.toISOString(),
      entryDate: invoiceImport.entryDate ? invoiceImport.entryDate.toISOString() : null,
      totalProductsAmount: roundMoney(invoiceImport.totalProductsAmount || 0),
      totalInvoiceAmount: roundMoney(invoiceImport.totalInvoiceAmount || 0),
      supplierId: invoiceImport.supplierId || null,
      supplierName: invoiceImport.supplier?.legalName || null,
      supplierDocument: invoiceImport.supplier?.document || null,
      itemsCount: invoiceImport.items?.length || 0,
      installmentsCount: invoiceImport.installments?.length || 0,
      payableInstallmentsCount:
        invoiceImport.payableTitle?.installments?.length || 0,
      stockMovementCount: invoiceImport.stockMovements?.length || 0,
      approvedAt: invoiceImport.approvedAt
        ? invoiceImport.approvedAt.toISOString()
        : null,
      approvedBy: invoiceImport.approvedBy || null,
      createdAt: invoiceImport.createdAt.toISOString(),
      createdBy: invoiceImport.createdBy || null,
      updatedAt: invoiceImport.updatedAt.toISOString(),
      updatedBy: invoiceImport.updatedBy || null,
      cancellationReason: invoiceImport.cancellationReason || null,
    };
  }

  private mapImportDetail(invoiceImport: any) {
    const summary = this.mapImportSummary(invoiceImport);

    return {
      ...summary,
      approvalNotes: invoiceImport.approvalNotes || null,
      cancellationReason: invoiceImport.cancellationReason || null,
      items: (invoiceImport.items || []).map((item: any) => ({
        id: item.id,
        lineNumber: item.lineNumber,
        approvalAction: item.approvalAction || null,
        productId: item.productId || null,
        productName: item.product?.name || item.draftProductName || null,
        productTracksInventory: item.product
          ? Boolean(item.product.tracksInventory)
          : typeof item.draftTracksInventory === "boolean"
            ? item.draftTracksInventory
            : null,
        draftInternalCode: item.draftInternalCode || null,
        draftSku: item.draftSku || null,
        draftBarcode: item.draftBarcode || null,
        draftUnitCode: item.draftUnitCode || null,
        draftProductType: item.draftProductType || null,
        draftTracksInventory:
          typeof item.draftTracksInventory === "boolean"
            ? item.draftTracksInventory
            : null,
        draftAllowFraction:
          typeof item.draftAllowFraction === "boolean"
            ? item.draftAllowFraction
            : null,
        draftUsesLotControl:
          typeof item.draftUsesLotControl === "boolean"
            ? item.draftUsesLotControl
            : null,
        draftUsesExpirationControl:
          typeof item.draftUsesExpirationControl === "boolean"
            ? item.draftUsesExpirationControl
            : null,
        draftUsesColorSize:
          typeof item.draftUsesColorSize === "boolean"
            ? item.draftUsesColorSize
            : null,
        draftAllowsNegativeStock:
          typeof item.draftAllowsNegativeStock === "boolean"
            ? item.draftAllowsNegativeStock
            : null,
        draftMinimumStock:
          typeof item.draftMinimumStock === "number"
            ? roundMoney(item.draftMinimumStock)
            : null,
        draftNotes: item.draftNotes || null,
        productCheckedAt: item.productCheckedAt
          ? item.productCheckedAt.toISOString()
          : null,
        productCheckedBy: item.productCheckedBy || null,
        recommendedAction: item.productId ? "LINK_EXISTING" : "CREATE_PRODUCT",
        supplierItemCode: item.supplierItemCode || null,
        barcode: item.barcode || null,
        description: item.description,
        ncmCode: item.ncmCode || null,
        cfopCode: item.cfopCode || null,
        unitCode: item.unitCode || null,
        quantity: roundMoney(item.quantity || 0),
        unitPrice: roundMoney(item.unitPrice || 0),
        totalPrice: roundMoney(item.totalPrice || 0),
        tracksInventory: Boolean(item.tracksInventory),
      })),
      installments: (invoiceImport.installments || []).map(
        (installment: any) => {
          const originalAmount = roundMoney(
            installment.originalAmount ?? installment.amount ?? 0,
          );
          const additionAmount = roundMoney(installment.additionAmount || 0);
          const discountAmount = roundMoney(installment.discountAmount || 0);
          const finalAmount = roundMoney(
            installment.finalAmount ??
              installment.amount ??
              originalAmount + additionAmount - discountAmount,
          );

          return {
            id: installment.id,
            installmentLabel: installment.installmentLabel || null,
            installmentNumber: installment.installmentNumber,
            dueDate: installment.dueDate.toISOString(),
            originalAmount,
            additionAmount,
            discountAmount,
            finalAmount,
            amount: finalAmount,
            status: installment.status || "OPEN",
            paymentMethod: installment.paymentMethod || null,
            settledAt: installment.settledAt
              ? installment.settledAt.toISOString()
              : null,
            notes: installment.notes || null,
          };
        },
      ),
      payableTitle: invoiceImport.payableTitle
        ? {
            id: invoiceImport.payableTitle.id,
            status: invoiceImport.payableTitle.status,
            documentNumber: invoiceImport.payableTitle.documentNumber,
            description: invoiceImport.payableTitle.description,
            installments: (
              invoiceImport.payableTitle.installments || []
            ).map((installment: any) => ({
              id: installment.id,
              installmentNumber: installment.installmentNumber,
              installmentCount: installment.installmentCount,
              dueDate: installment.dueDate.toISOString(),
              originalAmount: roundMoney(
                installment.originalAmount ?? installment.amount ?? 0,
              ),
              additionAmount: roundMoney(installment.additionAmount || 0),
              discountAmount: roundMoney(installment.discountAmount || 0),
              finalAmount: roundMoney(
                installment.finalAmount ?? installment.amount ?? 0,
              ),
              amount: roundMoney(
                installment.finalAmount ?? installment.amount ?? 0,
              ),
              openAmount: roundMoney(installment.openAmount || 0),
              paidAmount: roundMoney(installment.paidAmount || 0),
              status: installment.status,
              paymentMethod: installment.paymentMethod || null,
              settledAt: installment.settledAt
                ? installment.settledAt.toISOString()
                : null,
              notes: installment.notes || null,
            })),
          }
        : null,
      stockMovements: (invoiceImport.stockMovements || []).map((movement: any) => ({
        id: movement.id,
        productId: movement.productId,
        productName: movement.product?.name || null,
        quantity: roundMoney(movement.quantity || 0),
        previousStock: roundMoney(movement.previousStock || 0),
        resultingStock: roundMoney(movement.resultingStock || 0),
        occurredAt: movement.occurredAt.toISOString(),
      })),
    };
  }

  private async loadScopedImport(
    importId: string,
    sourceSystem?: string | null,
    sourceTenantId?: string | null,
  ) {
    const normalizedImportId = String(importId || "").trim();
    if (!normalizedImportId) {
      throw new BadRequestException("Importação de nota inválida.");
    }

    const normalizedSourceSystem = normalizeText(sourceSystem);
    const normalizedSourceTenantId = normalizeText(sourceTenantId);

    if (!normalizedSourceSystem || !normalizedSourceTenantId) {
      throw new BadRequestException(
        "Informe o sistema e o tenant de origem para localizar a nota importada.",
      );
    }

    const invoiceImport = await this.prisma.payableInvoiceImport.findFirst({
      where: {
        id: normalizedImportId,
        canceledAt: null,
        company: {
          sourceSystem: normalizedSourceSystem,
          sourceTenantId: normalizedSourceTenantId,
        },
      },
      include: {
        company: true,
        supplier: true,
        fiscalCertificate: true,
        items: {
          where: {
            canceledAt: null,
          },
          include: {
            product: true,
          },
          orderBy: [{ lineNumber: "asc" }],
        },
        installments: {
          where: {
            canceledAt: null,
          },
          orderBy: [{ installmentNumber: "asc" }],
        },
        payableTitle: {
          include: {
            installments: {
              where: {
                canceledAt: null,
              },
              orderBy: [{ installmentNumber: "asc" }],
            },
          },
        },
        stockMovements: {
          where: {
            canceledAt: null,
          },
          include: {
            product: true,
          },
          orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!invoiceImport) {
      throw new NotFoundException("NOTA IMPORTADA NÃO ENCONTRADA.");
    }

    return invoiceImport;
  }

  async importXmlDocumentForCompany(
    company: ResolvedCompany,
    xmlContent: string,
    options?: ImportXmlForCompanyOptions,
  ) {
    const parsedXml = parsePayableInvoiceXml(xmlContent);

    const existingImport = await this.prisma.payableInvoiceImport.findFirst({
      where: {
        companyId: company.id,
        canceledAt: null,
        OR: [
          { accessKey: parsedXml.accessKey },
          { xmlHash: parsedXml.xmlHash },
        ],
      },
      include: {
        company: true,
        supplier: true,
        fiscalCertificate: true,
        items: {
          where: { canceledAt: null },
          include: { product: true },
          orderBy: [{ lineNumber: "asc" }],
        },
        installments: {
          where: { canceledAt: null },
          orderBy: [{ installmentNumber: "asc" }],
        },
        payableTitle: {
          include: {
            installments: {
              where: { canceledAt: null },
              orderBy: [{ installmentNumber: "asc" }],
            },
          },
        },
        stockMovements: {
          where: { canceledAt: null },
          include: { product: true },
          orderBy: [{ occurredAt: "asc" }],
        },
      },
    });

    if (existingImport) {
      return {
        ...this.mapImportDetail(existingImport),
        alreadyImported: true,
        message: "Esta nota já havia sido importada anteriormente.",
      };
    }

    const supplier = await this.ensureSupplier(
      company.id,
      parsedXml.supplier,
      options?.requestedBy,
    );

    const createdImport = await this.prisma.$transaction(async (tx: any) => {
      const invoiceImport = await tx.payableInvoiceImport.create({
        data: {
          companyId: company.id,
          supplierId: supplier.id,
          fiscalCertificateId: options?.fiscalCertificateId || null,
          status: "PENDING_APPROVAL",
          importType: normalizeText(options?.importType) || "XML_UPLOAD",
          documentModel: parsedXml.documentModel,
          accessKey: parsedXml.accessKey,
          invoiceNumber: parsedXml.invoiceNumber,
          series: parsedXml.series,
          operationNature: parsedXml.operationNature,
          issueDate: parsedXml.issueDate,
          entryDate: parsedXml.entryDate,
          totalProductsAmount: parsedXml.totalProductsAmount,
          totalInvoiceAmount: parsedXml.totalInvoiceAmount,
          xmlHash: parsedXml.xmlHash,
          xmlContentBlob: Buffer.from(String(xmlContent || "").trim(), "utf8"),
          distributionNsu: normalizeDigits(options?.distributionNsu),
          parsedSnapshotJson: serializeJson(parsedXml.parsedSnapshot),
          createdBy: options?.requestedBy || null,
          updatedBy: options?.requestedBy || null,
        },
      });

      for (const item of parsedXml.items) {
        const suggestedProduct = await this.findSuggestedProduct(company.id, item);

        await tx.payableInvoiceImportItem.create({
          data: {
            invoiceImportId: invoiceImport.id,
            productId: suggestedProduct?.id || null,
            lineNumber: item.lineNumber,
            supplierItemCode: item.supplierItemCode,
            barcode: item.barcode,
            description: item.description,
            ncmCode: item.ncmCode,
            cfopCode: item.cfopCode,
            unitCode: item.unitCode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            tracksInventory: item.tracksInventory,
            createdBy: options?.requestedBy || null,
            updatedBy: options?.requestedBy || null,
          },
        });
      }

      for (const installment of parsedXml.installments) {
        await tx.payableInvoiceImportInstallment.create({
          data: {
            invoiceImportId: invoiceImport.id,
            installmentLabel: installment.installmentLabel,
            installmentNumber: installment.installmentNumber,
            dueDate: installment.dueDate,
            originalAmount: installment.amount,
            additionAmount: 0,
            discountAmount: 0,
            finalAmount: installment.amount,
            amount: installment.amount,
            status: "OPEN",
            paymentMethod: null,
            settledAt: null,
            notes: null,
            createdBy: options?.requestedBy || null,
            updatedBy: options?.requestedBy || null,
          },
        });
      }

      return tx.payableInvoiceImport.findUnique({
        where: { id: invoiceImport.id },
        include: {
          company: true,
          supplier: true,
          fiscalCertificate: true,
          items: {
            where: { canceledAt: null },
            include: { product: true },
            orderBy: [{ lineNumber: "asc" }],
          },
          installments: {
            where: { canceledAt: null },
            orderBy: [{ installmentNumber: "asc" }],
          },
          payableTitle: {
            include: {
              installments: {
                where: { canceledAt: null },
                orderBy: [{ installmentNumber: "asc" }],
              },
            },
          },
          stockMovements: {
            where: { canceledAt: null },
            include: { product: true },
            orderBy: [{ occurredAt: "asc" }],
          },
        },
      });
    });

    return {
      ...this.mapImportDetail(createdImport),
      alreadyImported: false,
      message: "Nota importada com sucesso e aguardando aprovação.",
    };
  }

  private normalizeApprovalAction(action?: string | null) {
    const normalized = normalizeText(action);
    if (
      normalized === "LINK_EXISTING" ||
      normalized === "CREATE_PRODUCT" ||
      normalized === "IGNORE_STOCK"
    ) {
      return normalized;
    }

    return null;
  }

  private getClearedProductDraftData() {
    return {
      draftProductName: null,
      draftInternalCode: null,
      draftSku: null,
      draftBarcode: null,
      draftUnitCode: null,
      draftProductType: null,
      draftTracksInventory: null,
      draftAllowFraction: null,
      draftUsesLotControl: null,
      draftUsesExpirationControl: null,
      draftUsesColorSize: null,
      draftAllowsNegativeStock: null,
      draftMinimumStock: null,
      draftNotes: null,
      productCheckedAt: null,
      productCheckedBy: null,
    };
  }

  private async resolveApprovalProduct(
    tx: any,
    companyId: string,
    invoiceImport: any,
    item: any,
    approvalItem: ApprovePayableInvoiceImportItemDto | undefined,
    branchConfig: BranchStockParameterConfig,
    requestedBy?: string | null,
    createdProductsCache?: Map<string, any>,
  ) {
    const action =
      this.normalizeApprovalAction(approvalItem?.action) ||
      this.normalizeApprovalAction(item.approvalAction) ||
      (item.productId ? "LINK_EXISTING" : "CREATE_PRODUCT");

    if (action === "IGNORE_STOCK") {
      return {
        action,
        product: null,
      };
    }

    if (action === "LINK_EXISTING") {
      const targetProductId = String(
        approvalItem?.productId || item.productId || "",
      ).trim();

      if (!targetProductId) {
        throw new BadRequestException(
          `Selecione um produto existente para o item ${item.lineNumber}.`,
        );
      }

      const product = await tx.product.findFirst({
        where: {
          id: targetProductId,
          companyId,
          canceledAt: null,
        },
      });

      if (!product) {
        throw new BadRequestException(
          `O produto informado para o item ${item.lineNumber} não pertence a este tenant.`,
        );
      }

      return {
        action,
        product,
      };
    }

    const productName =
      normalizeText(approvalItem?.productName) ||
      normalizeText(item.draftProductName) ||
      item.description;
    const internalCode =
      normalizeText(approvalItem?.internalCode) ||
      normalizeText(item.draftInternalCode) ||
      item.supplierItemCode ||
      null;
    const barcode =
      normalizeDigits(approvalItem?.barcode) ||
      normalizeDigits(item.draftBarcode) ||
      item.barcode ||
      null;
    const sku =
      normalizeText(approvalItem?.sku) || normalizeText(item.draftSku) || null;
    const unitCode =
      normalizeText(approvalItem?.unitCode) ||
      normalizeText(item.draftUnitCode) ||
      item.unitCode ||
      "UN";
    const productType =
      normalizeText(approvalItem?.productType) ||
      normalizeText(item.draftProductType) ||
      "GOODS";
    const stockOptions = this.resolveProductStockOptions(
      item,
      approvalItem,
      branchConfig,
    );
    const minimumStock =
      this.normalizeOptionalMoney(
        approvalItem?.minimumStock ?? item.draftMinimumStock,
      ) ?? 0;
    const cacheKey = [
      branchConfig.branchCode,
      barcode || "",
      internalCode || "",
      sku || "",
      productName,
      unitCode,
    ].join("|");

    if (createdProductsCache?.has(cacheKey)) {
      return {
        action,
        product: createdProductsCache.get(cacheKey),
      };
    }

    const existingProduct =
      (barcode
        ? await tx.product.findFirst({
            where: {
              companyId,
              branchCode: branchConfig.branchCode,
              barcode,
              canceledAt: null,
            },
          })
        : null) ||
      (internalCode
        ? await tx.product.findFirst({
            where: {
              companyId,
              branchCode: branchConfig.branchCode,
              internalCode,
              canceledAt: null,
            },
          })
        : null);

    if (existingProduct) {
      if (createdProductsCache) {
        createdProductsCache.set(cacheKey, existingProduct);
      }

      return {
        action: "LINK_EXISTING",
        product: existingProduct,
      };
    }

    const createdProduct = await tx.product.create({
      data: {
        companyId,
        branchCode: branchConfig.branchCode,
        status: "ACTIVE",
        name: productName,
        internalCode,
        sku,
        barcode,
        unitCode,
        productType,
        ...stockOptions,
        currentStock: 0,
        minimumStock,
        purchasePrice:
          Number(item.unitPrice || 0) > 0 ? roundMoney(item.unitPrice) : null,
        ncmCode: item.ncmCode || null,
        notes:
          normalizeText(approvalItem?.notes) ||
          normalizeText(item.draftNotes) ||
          normalizeText(
            `CRIADO NA APROVAÇÃO DA NF-E ${invoiceImport.invoiceNumber}${invoiceImport.series ? ` SÉRIE ${invoiceImport.series}` : ""}`,
          ),
        createdBy: requestedBy || null,
        updatedBy: requestedBy || null,
      },
    });

    if (createdProductsCache) {
      createdProductsCache.set(cacheKey, createdProduct);
    }

    return {
      action,
      product: createdProduct,
    };
  }

  async importFromXml(payload: ImportInvoiceXmlDto) {
    const company = await this.resolveCompany({
      sourceSystem: payload.sourceSystem,
      sourceTenantId: payload.sourceTenantId,
      companyName: payload.companyName,
      companyDocument: payload.companyDocument,
      requestedBy: payload.requestedBy,
    });
    return this.importXmlDocumentForCompany(company, payload.xmlContent, {
      requestedBy: payload.requestedBy,
      importType: "XML_UPLOAD",
    });
  }

  async listInvoiceImports(query: ListPayableInvoiceImportsDto) {
    const company = await this.findCompany(
      query.sourceSystem,
      query.sourceTenantId,
    );

    if (!company) {
      return [];
    }

    const normalizedStatus = normalizeText(query.status);
    const normalizedSearch = normalizeText(query.search);
    const searchDigits = normalizeDigits(query.search);

    const invoiceImports = await this.prisma.payableInvoiceImport.findMany({
      where: {
        companyId: company.id,
        canceledAt: null,
        ...(normalizedStatus && normalizedStatus !== "ALL"
          ? { status: normalizedStatus }
          : {}),
        ...(normalizedSearch
          ? {
              OR: [
                { accessKey: { contains: searchDigits || normalizedSearch } },
                { invoiceNumber: { contains: searchDigits || normalizedSearch } },
                { series: { contains: normalizedSearch } },
                {
                  supplier: {
                    legalName: {
                      contains: normalizedSearch,
                    },
                  },
                },
                {
                  supplier: {
                    document: {
                      contains: searchDigits || normalizedSearch,
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        company: true,
        supplier: true,
        items: {
          where: { canceledAt: null },
          select: { id: true },
        },
        installments: {
          where: { canceledAt: null },
          select: { id: true },
        },
        payableTitle: {
          include: {
            installments: {
              where: { canceledAt: null },
              select: { id: true },
            },
          },
        },
        stockMovements: {
          where: { canceledAt: null },
          select: { id: true },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    return invoiceImports.map((invoiceImport) =>
      this.mapImportSummary(invoiceImport),
    );
  }

  async getInvoiceImport(
    importId: string,
    query: GetPayableInvoiceImportDto,
  ) {
    const invoiceImport = await this.loadScopedImport(
      importId,
      query.sourceSystem,
      query.sourceTenantId,
    );

    return this.mapImportDetail(invoiceImport);
  }

  async updateInvoiceImportItemApprovalDraft(
    importId: string,
    itemId: string,
    payload: UpdatePayableInvoiceImportItemApprovalDraftDto,
  ) {
    const invoiceImport = await this.loadScopedImport(
      importId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    if (normalizeText(invoiceImport.status) === "APPROVED") {
      throw new BadRequestException(
        "Não é possível alterar produtos de uma nota já aprovada.",
      );
    }

    const item = invoiceImport.items.find(
      (currentItem: any) => currentItem.id === String(itemId || "").trim(),
    );

    if (!item) {
      throw new NotFoundException("ITEM DA NOTA IMPORTADA NÃO ENCONTRADO.");
    }

    const rawAction = String(payload.action ?? "").trim();
    const action = this.normalizeApprovalAction(rawAction);
    const clearProductDraftData = this.getClearedProductDraftData();
    let data: Record<string, any> = {
      updatedBy: payload.requestedBy || null,
    };
    let message = "Conferência do item atualizada.";

    if (!rawAction) {
      data = {
        ...data,
        approvalAction: null,
        productId: null,
        ...clearProductDraftData,
      };
    } else if (action === "IGNORE_STOCK") {
      data = {
        ...data,
        approvalAction: "IGNORE_STOCK",
        productId: null,
        ...clearProductDraftData,
      };
      message = "Item marcado como sem estoque.";
    } else if (action === "LINK_EXISTING") {
      const targetProductId = String(payload.productId || item.productId || "").trim();

      if (!targetProductId) {
        throw new BadRequestException(
          `Selecione um produto existente para o item ${item.lineNumber}.`,
        );
      }

      const product = await this.prisma.product.findFirst({
        where: {
          id: targetProductId,
          companyId: invoiceImport.companyId,
          canceledAt: null,
        },
      });

      if (!product) {
        throw new BadRequestException(
          `O produto informado para o item ${item.lineNumber} não pertence a este tenant.`,
        );
      }

      data = {
        ...data,
        approvalAction: "LINK_EXISTING",
        productId: product.id,
        ...clearProductDraftData,
      };
      message = "Vínculo do produto conferido.";
    } else if (action === "CREATE_PRODUCT") {
      const productName =
        normalizeText(payload.productName) ||
        normalizeText(item.draftProductName) ||
        item.description;

      if (!productName) {
        throw new BadRequestException(
          `Informe o nome do produto para o item ${item.lineNumber}.`,
        );
      }

      data = {
        ...data,
        approvalAction: "CREATE_PRODUCT",
        productId: null,
        draftProductName: productName,
        draftInternalCode:
          normalizeText(payload.internalCode) ||
          normalizeText(item.supplierItemCode),
        draftSku: normalizeText(payload.sku),
        draftBarcode:
          normalizeDigits(payload.barcode) || normalizeDigits(item.barcode),
        draftUnitCode:
          normalizeText(payload.unitCode) || normalizeText(item.unitCode) || "UN",
        draftProductType: normalizeText(payload.productType) || "GOODS",
        draftTracksInventory:
          typeof payload.tracksInventory === "boolean"
            ? payload.tracksInventory
            : Boolean(item.tracksInventory),
        draftAllowFraction:
          typeof payload.allowFraction === "boolean"
            ? payload.allowFraction
            : !Number.isInteger(roundMoney(item.quantity || 0)),
        draftUsesLotControl:
          typeof payload.usesLotControl === "boolean"
            ? payload.usesLotControl
            : false,
        draftUsesExpirationControl:
          typeof payload.usesExpirationControl === "boolean"
            ? payload.usesExpirationControl
            : false,
        draftUsesColorSize:
          typeof payload.usesColorSize === "boolean"
            ? payload.usesColorSize
            : false,
        draftAllowsNegativeStock:
          typeof payload.allowsNegativeStock === "boolean"
            ? payload.allowsNegativeStock
            : false,
        draftMinimumStock:
          this.normalizeOptionalMoney(payload.minimumStock) ?? 0,
        draftNotes: normalizeText(payload.notes),
        productCheckedAt: new Date(),
        productCheckedBy: payload.requestedBy || null,
      };
      message = "Produto conferido e reservado para criação na aprovação da nota.";
    } else {
      throw new BadRequestException(
        `Ação inválida para o item ${item.lineNumber}.`,
      );
    }

    await this.prisma.payableInvoiceImportItem.update({
      where: { id: item.id },
      data,
    });

    const updatedImport = await this.loadScopedImport(
      importId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    return {
      ...this.mapImportDetail(updatedImport),
      message,
    };
  }

  async updateInvoiceImportInstallments(
    importId: string,
    payload: UpdatePayableInvoiceImportInstallmentsDto,
  ) {
    const invoiceImport = await this.loadScopedImport(
      importId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    if (normalizeText(invoiceImport.status) === "APPROVED") {
      throw new BadRequestException(
        "Não é possível alterar parcelas de uma nota já aprovada.",
      );
    }

    if (!Array.isArray(payload.installments) || !payload.installments.length) {
      throw new BadRequestException(
        "A nota precisa manter pelo menos uma parcela.",
      );
    }

    const normalizedInstallments = payload.installments.map(
      (installment: UpdatePayableInvoiceImportInstallmentDto, index: number) => {
        const dueDate = parseIsoDate(
          installment.dueDate,
          `a data da parcela ${index + 1}`,
        );
        const originalAmount = this.normalizeOptionalMoney(installment.amount);
        const additionAmount =
          this.normalizeOptionalMoney(installment.additionAmount) || 0;
        const discountAmount =
          this.normalizeOptionalMoney(installment.discountAmount) || 0;

        if (!originalAmount || originalAmount <= 0) {
          throw new BadRequestException(
            `Informe um valor válido para a parcela ${index + 1}.`,
          );
        }

        if (discountAmount > roundMoney(originalAmount + additionAmount)) {
          throw new BadRequestException(
            `O desconto da parcela ${index + 1} não pode ser maior que o valor ajustado da duplicata.`,
          );
        }

        const finalAmount = roundMoney(
          originalAmount + additionAmount - discountAmount,
        );

        if (finalAmount <= 0) {
          throw new BadRequestException(
            `O valor final da parcela ${index + 1} precisa ser maior que zero.`,
          );
        }

        const status = this.normalizePayableInstallmentStatus(
          installment.status,
        );
        const paymentMethod =
          status === "PAID"
            ? this.normalizePayableInstallmentPaymentMethod(
                installment.paymentMethod,
              )
            : null;

        if (status === "PAID" && !paymentMethod) {
          throw new BadRequestException(
            `Informe o meio de pagamento da parcela ${index + 1}.`,
          );
        }

        const settledAt =
          status === "PAID"
            ? installment.settledAt
              ? parseIsoDate(
                  installment.settledAt,
                  `a data de baixa da parcela ${index + 1}`,
                )
              : new Date()
            : null;

        return {
          id: String(installment.id || "").trim() || null,
          installmentLabel:
            normalizeText(installment.installmentLabel) ||
            `PARCELA ${index + 1}`,
          installmentNumber: index + 1,
          dueDate,
          originalAmount,
          additionAmount,
          discountAmount,
          finalAmount,
          amount: finalAmount,
          status,
          paymentMethod,
          settledAt,
          notes: normalizeText(installment.notes) || null,
        };
      },
    );

    const totalInstallmentsAmount = roundMoney(
      normalizedInstallments.reduce(
        (accumulator, installment) => accumulator + installment.originalAmount,
        0,
      ),
    );
    const totalInvoiceAmount = roundMoney(invoiceImport.totalInvoiceAmount || 0);

    if (Math.abs(totalInstallmentsAmount - totalInvoiceAmount) > 0.01) {
      throw new BadRequestException(
        "A soma das parcelas deve ser igual ao valor total da nota.",
      );
    }

    const existingInstallments = [...invoiceImport.installments].sort(
      (left, right) => left.installmentNumber - right.installmentNumber,
    );
    const existingById = new Map(
      existingInstallments.map((installment) => [installment.id, installment]),
    );

    for (const installment of normalizedInstallments) {
      if (installment.id && !existingById.has(installment.id)) {
        throw new BadRequestException(
          "Uma ou mais parcelas informadas não pertencem a esta nota.",
        );
      }
    }

    const updateResult = await this.prisma.$transaction(async (tx: any) => {
      const usedIds = new Set<string>();

      for (const installment of normalizedInstallments) {
        if (installment.id) {
          usedIds.add(installment.id);
          await tx.payableInvoiceImportInstallment.update({
            where: { id: installment.id },
            data: {
              installmentLabel: installment.installmentLabel,
              installmentNumber: installment.installmentNumber,
              dueDate: installment.dueDate,
              originalAmount: installment.originalAmount,
              additionAmount: installment.additionAmount,
              discountAmount: installment.discountAmount,
              finalAmount: installment.finalAmount,
              amount: installment.amount,
              status: installment.status,
              paymentMethod: installment.paymentMethod,
              settledAt: installment.settledAt,
              notes: installment.notes,
              canceledAt: null,
              canceledBy: null,
              updatedBy: payload.requestedBy || null,
            },
          });
          continue;
        }

        await tx.payableInvoiceImportInstallment.create({
          data: {
            invoiceImportId: invoiceImport.id,
            installmentLabel: installment.installmentLabel,
            installmentNumber: installment.installmentNumber,
            dueDate: installment.dueDate,
            originalAmount: installment.originalAmount,
            additionAmount: installment.additionAmount,
            discountAmount: installment.discountAmount,
            finalAmount: installment.finalAmount,
            amount: installment.amount,
            status: installment.status,
            paymentMethod: installment.paymentMethod,
            settledAt: installment.settledAt,
            notes: installment.notes,
            createdBy: payload.requestedBy || null,
            updatedBy: payload.requestedBy || null,
          },
        });
      }

      const archivedInstallmentBase = Date.now() % 100000000;
      const removedInstallments = existingInstallments.filter(
        (installment) => !usedIds.has(installment.id),
      );

      for (const [index, installment] of removedInstallments.entries()) {
        await tx.payableInvoiceImportInstallment.update({
          where: { id: installment.id },
          data: {
            installmentNumber: archivedInstallmentBase + index + 1,
            canceledAt: new Date(),
            canceledBy: payload.requestedBy || null,
            updatedBy: payload.requestedBy || null,
          },
        });
      }

      return tx.payableInvoiceImport.findUnique({
        where: { id: invoiceImport.id },
        include: {
          company: true,
          supplier: true,
          items: {
            where: { canceledAt: null },
            include: { product: true },
            orderBy: [{ lineNumber: "asc" }],
          },
          installments: {
            where: { canceledAt: null },
            orderBy: [{ installmentNumber: "asc" }],
          },
          payableTitle: {
            include: {
              installments: {
                where: { canceledAt: null },
                orderBy: [{ installmentNumber: "asc" }],
              },
            },
          },
          stockMovements: {
            where: { canceledAt: null },
            include: { product: true },
            orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
          },
        },
      });
    });

    return {
      ...this.mapImportDetail(updateResult),
      message: "Parcelas da nota atualizadas com sucesso.",
    };
  }

  async cancelInvoiceImport(
    importId: string,
    payload: CancelPayableInvoiceImportDto,
  ) {
    const invoiceImport = await this.loadScopedImport(
      importId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const cancellationReason = normalizeText(payload.cancellationReason);

    if (!cancellationReason) {
      throw new BadRequestException(
        "Informe o motivo do cancelamento da nota.",
      );
    }

    if (normalizeText(invoiceImport.status) === "APPROVED") {
      throw new BadRequestException(
        "Não é possível cancelar uma nota já aprovada.",
      );
    }

    await this.prisma.payableInvoiceImport.update({
      where: { id: invoiceImport.id },
      data: {
        status: "CANCELED",
        cancellationReason,
        canceledAt: new Date(),
        canceledBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
    });

    return {
      id: invoiceImport.id,
      status: "CANCELED",
      statusLabel: "CANCELADA",
      cancellationReason,
      message: "Nota cancelada com sucesso.",
    };
  }

  async approveInvoiceImport(
    importId: string,
    payload: ApprovePayableInvoiceImportDto,
  ) {
    const invoiceImport = await this.loadScopedImport(
      importId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    if (normalizeText(invoiceImport.status) === "APPROVED") {
      return {
        ...this.mapImportDetail(invoiceImport),
        message: "Esta nota já estava aprovada.",
      };
    }

    const approvalMap = new Map<string, ApprovePayableInvoiceImportItemDto>(
      (payload.items || []).map((item) => [item.itemId, item]),
    );
    const createdProductsCache = new Map<string, any>();
    const normalizedInstallments = invoiceImport.installments.map(
      (installment: any) => {
        const originalAmount = roundMoney(
          installment.originalAmount ?? installment.amount ?? 0,
        );
        const additionAmount = roundMoney(installment.additionAmount || 0);
        const discountAmount = roundMoney(installment.discountAmount || 0);
        const finalAmount = roundMoney(
          installment.finalAmount ??
            installment.amount ??
            originalAmount + additionAmount - discountAmount,
        );
        const status = this.normalizePayableInstallmentStatus(
          installment.status,
        );
        const paymentMethod =
          status === "PAID"
            ? this.normalizePayableInstallmentPaymentMethod(
                installment.paymentMethod,
              )
            : null;
        const settledAt =
          status === "PAID"
            ? installment.settledAt || new Date()
            : null;

        return {
          ...installment,
          originalAmount,
          additionAmount,
          discountAmount,
          finalAmount,
          status,
          paymentMethod,
          settledAt,
          notes: installment.notes || null,
        };
      },
    );

    const approvalResult = await this.prisma.$transaction(async (tx: any) => {
      const branchStockConfig = await this.resolveBranchStockParameterConfig(
        tx,
        invoiceImport.companyId,
        payload,
      );

      const titleTotalAmount = roundMoney(
        normalizedInstallments.reduce(
          (accumulator, installment) => accumulator + installment.finalAmount,
          0,
        ),
      );
      const titleStatus =
        normalizedInstallments.length > 0 &&
        normalizedInstallments.every(
          (installment) => installment.status === "PAID",
        )
          ? "PAID"
          : "OPEN";
      const payableTitle = await tx.payableTitle.create({
        data: {
          companyId: invoiceImport.companyId,
          branchCode: branchStockConfig.branchCode,
          supplierId: invoiceImport.supplierId,
          sourceDocumentType: "PAYABLE_INVOICE_IMPORT",
          sourceDocumentId: invoiceImport.id,
          status: titleStatus,
          documentNumber: `${invoiceImport.invoiceNumber}${invoiceImport.series ? `/${invoiceImport.series}` : ""}`,
          description: normalizeText(
            `NF-E ${invoiceImport.invoiceNumber}${invoiceImport.series ? ` SÉRIE ${invoiceImport.series}` : ""} - ${invoiceImport.supplier?.legalName || "FORNECEDOR"}`,
          )!,
          issueDate: invoiceImport.issueDate,
          totalAmount: titleTotalAmount,
          supplierNameSnapshot:
            invoiceImport.supplier?.legalName || "FORNECEDOR NÃO IDENTIFICADO",
          supplierDocumentSnapshot: invoiceImport.supplier?.document || null,
          createdBy: payload.requestedBy || null,
          updatedBy: payload.requestedBy || null,
        },
      });

      const installmentsCount = normalizedInstallments.length || 1;

      for (const installment of normalizedInstallments) {
        await tx.payableInstallment.create({
          data: {
            companyId: invoiceImport.companyId,
            branchCode: branchStockConfig.branchCode,
            titleId: payableTitle.id,
            installmentNumber: installment.installmentNumber,
            installmentCount: installmentsCount,
            dueDate: installment.dueDate,
            originalAmount: installment.originalAmount,
            additionAmount: installment.additionAmount,
            discountAmount: installment.discountAmount,
            finalAmount: installment.finalAmount,
            amount: installment.finalAmount,
            openAmount: installment.status === "PAID" ? 0 : installment.finalAmount,
            paidAmount: installment.status === "PAID" ? installment.finalAmount : 0,
            status: installment.status,
            paymentMethod: installment.paymentMethod,
            settledAt: installment.settledAt,
            notes: installment.notes,
            descriptionSnapshot: normalizeText(
              `NF-E ${invoiceImport.invoiceNumber}${invoiceImport.series ? `/${invoiceImport.series}` : ""} - ${invoiceImport.supplier?.legalName || "FORNECEDOR"}`,
            )!,
            supplierNameSnapshot:
              invoiceImport.supplier?.legalName || "FORNECEDOR NÃO IDENTIFICADO",
            supplierDocumentSnapshot: invoiceImport.supplier?.document || null,
            createdBy: payload.requestedBy || null,
            updatedBy: payload.requestedBy || null,
          },
        });
      }

      for (const item of invoiceImport.items) {
        const approvalItem = approvalMap.get(item.id);
        const resolution = await this.resolveApprovalProduct(
          tx,
          invoiceImport.companyId,
          invoiceImport,
          item,
          approvalItem,
          branchStockConfig,
          payload.requestedBy,
          createdProductsCache,
        );

        await tx.payableInvoiceImportItem.update({
          where: { id: item.id },
          data: {
            productId: resolution.product?.id || null,
            approvalAction: resolution.action,
            ...this.getClearedProductDraftData(),
            updatedBy: payload.requestedBy || null,
          },
        });

        if (!resolution.product || !resolution.product.tracksInventory) {
          continue;
        }

        const previousStock = roundMoney(resolution.product.currentStock || 0);
        const entryQuantity = roundMoney(item.quantity || 0);
        const resultingStock = roundMoney(previousStock + entryQuantity);

        await tx.product.update({
          where: { id: resolution.product.id },
          data: {
            currentStock: resultingStock,
            ...(Number(item.unitPrice || 0) > 0
              ? { purchasePrice: roundMoney(item.unitPrice) }
              : {}),
            updatedBy: payload.requestedBy || null,
          },
        });

        await tx.stockMovement.create({
          data: {
            companyId: invoiceImport.companyId,
            branchCode: branchStockConfig.branchCode,
            productId: resolution.product.id,
            sourceImportId: invoiceImport.id,
            sourceImportItemId: item.id,
            movementType: "ENTRY",
            quantity: entryQuantity,
            previousStock,
            resultingStock,
            unitCost:
              Number(item.unitPrice || 0) > 0
                ? roundMoney(item.unitPrice)
                : null,
            notes: normalizeText(
              `ENTRADA POR APROVAÇÃO DA NF-E ${invoiceImport.invoiceNumber}${invoiceImport.series ? `/${invoiceImport.series}` : ""}`,
            ),
            occurredAt: new Date(),
            createdBy: payload.requestedBy || null,
            updatedBy: payload.requestedBy || null,
          },
        });
      }

      await tx.payableInvoiceImport.update({
        where: { id: invoiceImport.id },
        data: {
          status: "APPROVED",
          approvalNotes: normalizeText(payload.approvalNotes),
          approvedAt: new Date(),
          approvedBy: payload.requestedBy || null,
          updatedBy: payload.requestedBy || null,
        },
      });

      return tx.payableInvoiceImport.findUnique({
        where: { id: invoiceImport.id },
        include: {
          company: true,
          supplier: true,
          items: {
            where: { canceledAt: null },
            include: { product: true },
            orderBy: [{ lineNumber: "asc" }],
          },
          installments: {
            where: { canceledAt: null },
            orderBy: [{ installmentNumber: "asc" }],
          },
          payableTitle: {
            include: {
              installments: {
                where: { canceledAt: null },
                orderBy: [{ installmentNumber: "asc" }],
              },
            },
          },
          stockMovements: {
            where: { canceledAt: null },
            include: { product: true },
            orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
          },
        },
      });
    });

    return {
      ...this.mapImportDetail(approvalResult),
      message:
        "Nota aprovada com sucesso. Estoque e duplicatas do contas a pagar foram gerados.",
    };
  }
}
