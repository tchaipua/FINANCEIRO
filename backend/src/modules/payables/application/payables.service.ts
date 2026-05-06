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
  roundMoney,
  serializeJson,
} from "../../../common/finance-core.utils";
import {
  ApprovePayableInvoiceImportDto,
  ApprovePayableInvoiceImportItemDto,
  GetPayableInvoiceImportDto,
  ImportInvoiceXmlDto,
  ListPayableInvoiceImportsDto,
} from "./dto/payables.dto";
import {
  ParsedPayableInvoiceItem,
  parsePayableInvoiceXml,
} from "./payables-xml-parser";

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
    };
  }

  private mapImportDetail(invoiceImport: any) {
    const summary = this.mapImportSummary(invoiceImport);

    return {
      ...summary,
      approvalNotes: invoiceImport.approvalNotes || null,
      items: (invoiceImport.items || []).map((item: any) => ({
        id: item.id,
        lineNumber: item.lineNumber,
        approvalAction: item.approvalAction || null,
        productId: item.productId || null,
        productName: item.product?.name || null,
        productTracksInventory: item.product
          ? Boolean(item.product.tracksInventory)
          : null,
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
        (installment: any) => ({
          id: installment.id,
          installmentLabel: installment.installmentLabel || null,
          installmentNumber: installment.installmentNumber,
          dueDate: installment.dueDate.toISOString(),
          amount: roundMoney(installment.amount || 0),
        }),
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
              amount: roundMoney(installment.amount || 0),
              openAmount: roundMoney(installment.openAmount || 0),
              status: installment.status,
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
            amount: installment.amount,
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

  private async resolveApprovalProduct(
    tx: any,
    companyId: string,
    invoiceImport: any,
    item: any,
    approvalItem: ApprovePayableInvoiceImportItemDto | undefined,
    requestedBy?: string | null,
    createdProductsCache?: Map<string, any>,
  ) {
    const action =
      this.normalizeApprovalAction(approvalItem?.action) ||
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
      normalizeText(approvalItem?.productName) || item.description;
    const internalCode =
      normalizeText(approvalItem?.internalCode) || item.supplierItemCode || null;
    const barcode = normalizeDigits(approvalItem?.barcode) || item.barcode || null;
    const sku = normalizeText(approvalItem?.sku) || null;
    const unitCode = normalizeText(approvalItem?.unitCode) || item.unitCode || "UN";
    const productType =
      normalizeText(approvalItem?.productType) || "GOODS";
    const tracksInventory =
      typeof approvalItem?.tracksInventory === "boolean"
        ? approvalItem.tracksInventory
        : Boolean(item.tracksInventory);
    const allowFraction = Boolean(approvalItem?.allowFraction);
    const minimumStock = this.normalizeOptionalMoney(approvalItem?.minimumStock) || 0;
    const cacheKey = [
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
              barcode,
              canceledAt: null,
            },
          })
        : null) ||
      (internalCode
        ? await tx.product.findFirst({
            where: {
              companyId,
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
        status: "ACTIVE",
        name: productName,
        internalCode,
        sku,
        barcode,
        unitCode,
        productType,
        tracksInventory,
        allowFraction,
        currentStock: 0,
        minimumStock,
        purchasePrice:
          Number(item.unitPrice || 0) > 0 ? roundMoney(item.unitPrice) : null,
        ncmCode: item.ncmCode || null,
        notes:
          normalizeText(approvalItem?.notes) ||
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

    const approvalResult = await this.prisma.$transaction(async (tx: any) => {
      const payableTitle = await tx.payableTitle.create({
        data: {
          companyId: invoiceImport.companyId,
          supplierId: invoiceImport.supplierId,
          sourceDocumentType: "PAYABLE_INVOICE_IMPORT",
          sourceDocumentId: invoiceImport.id,
          status: "OPEN",
          documentNumber: `${invoiceImport.invoiceNumber}${invoiceImport.series ? `/${invoiceImport.series}` : ""}`,
          description: normalizeText(
            `NF-E ${invoiceImport.invoiceNumber}${invoiceImport.series ? ` SÉRIE ${invoiceImport.series}` : ""} - ${invoiceImport.supplier?.legalName || "FORNECEDOR"}`,
          )!,
          issueDate: invoiceImport.issueDate,
          totalAmount: roundMoney(invoiceImport.totalInvoiceAmount || 0),
          supplierNameSnapshot:
            invoiceImport.supplier?.legalName || "FORNECEDOR NÃO IDENTIFICADO",
          supplierDocumentSnapshot: invoiceImport.supplier?.document || null,
          createdBy: payload.requestedBy || null,
          updatedBy: payload.requestedBy || null,
        },
      });

      const installmentsCount = invoiceImport.installments.length || 1;

      for (const installment of invoiceImport.installments) {
        await tx.payableInstallment.create({
          data: {
            companyId: invoiceImport.companyId,
            titleId: payableTitle.id,
            installmentNumber: installment.installmentNumber,
            installmentCount: installmentsCount,
            dueDate: installment.dueDate,
            amount: installment.amount,
            openAmount: installment.amount,
            paidAmount: 0,
            status: "OPEN",
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
          payload.requestedBy,
          createdProductsCache,
        );

        await tx.payableInvoiceImportItem.update({
          where: { id: item.id },
          data: {
            productId: resolution.product?.id || null,
            approvalAction: resolution.action,
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
