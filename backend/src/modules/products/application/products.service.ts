import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  normalizeDigits,
  normalizeText,
  roundMoney,
} from "../../../common/finance-core.utils";
import { DEFAULT_BRANCH_CODE } from "../../../common/branch.constants";
import { ensureDefaultCompanyBranch } from "../../../common/company-branches";
import { getFinanceContext } from "../../../common/finance-context";
import {
  ChangeProductStatusDto,
  GetProductDto,
  ListProductsDto,
  ListStockMovementsDto,
  SaveProductDto,
} from "./dto/products.dto";

type NormalizedProductPayload = {
  name: string;
  internalCode: string | null;
  sku: string | null;
  barcode: string | null;
  unitCode: string;
  productType: string;
  tracksInventory: boolean;
  allowFraction: boolean;
  usesColorSize: boolean;
  usesLotControl: boolean;
  usesExpirationControl: boolean;
  allowsNegativeStock: boolean;
  currentStock: number;
  minimumStock: number;
  purchasePrice: number | null;
  salePrice: number | null;
  ncmCode: string | null;
  cestCode: string | null;
  notes: string | null;
};

type BranchInventoryConfig = {
  branchCode: number;
  inventoryControlType: string;
  quantityPrecision: string;
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeOptionalNumber(value?: number | null) {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = Number(value);
    if (!Number.isFinite(normalized)) {
      return null;
    }

    return roundMoney(Math.max(0, normalized));
  }

  private normalizeBoolean(value: boolean | undefined, fallback: boolean) {
    return typeof value === "boolean" ? value : fallback;
  }

  private currentBranchCode() {
    const branchCode = getFinanceContext()?.branchCode;
    return Number.isInteger(branchCode) && Number(branchCode) >= 0
      ? Number(branchCode)
      : DEFAULT_BRANCH_CODE;
  }

  private async loadCurrentBranchConfig(
    companyId: string,
  ): Promise<BranchInventoryConfig> {
    await ensureDefaultCompanyBranch(this.prisma, companyId);

    const requestedBranchCode = this.currentBranchCode() || DEFAULT_BRANCH_CODE;
    const branch =
      (await this.prisma.companyBranch.findFirst({
        where: {
          companyId,
          branchCode: requestedBranchCode,
          canceledAt: null,
        },
      })) ||
      (await this.prisma.companyBranch.findFirst({
        where: {
          companyId,
          branchCode: DEFAULT_BRANCH_CODE,
          canceledAt: null,
        },
      }));

    return {
      branchCode: branch?.branchCode || DEFAULT_BRANCH_CODE,
      inventoryControlType: branch?.inventoryControlType || "TRADITIONAL",
      quantityPrecision: branch?.quantityPrecision || "INTEGER_ONLY",
    };
  }

  private async loadBranchConfigByCode(
    companyId: string,
    branchCode: number,
  ): Promise<BranchInventoryConfig> {
    const branch = await this.prisma.companyBranch.findFirst({
      where: {
        companyId,
        branchCode,
        canceledAt: null,
      },
    });

    return {
      branchCode,
      inventoryControlType: branch?.inventoryControlType || "TRADITIONAL",
      quantityPrecision: branch?.quantityPrecision || "INTEGER_ONLY",
    };
  }

  private normalizeStockQuantity(
    value: number | null | undefined,
    allowFraction: boolean,
    fieldLabel: string,
  ) {
    const normalized = this.normalizeOptionalNumber(value) ?? 0;

    if (!allowFraction && !Number.isInteger(normalized)) {
      throw new BadRequestException(
        `${fieldLabel} deve usar quantidade inteira nesta filial.`,
      );
    }

    return allowFraction ? normalized : Math.trunc(normalized);
  }

  private buildVariantKey(payload: NormalizedProductPayload) {
    const parts = [
      payload.usesColorSize ? "GRADE" : "GERAL",
      payload.usesLotControl ? "LOTE" : "SEM_LOTE",
    ];

    return parts.join("|");
  }

  private async upsertInitialStockBalances(
    productId: string,
    companyId: string,
    branchCode: number,
    payload: NormalizedProductPayload,
    requestedBy?: string | null,
  ) {
    if (!payload.tracksInventory) {
      return;
    }

    const variantKey = this.buildVariantKey(payload);
    const quantity = payload.currentStock;

    for (const balanceBranchCode of [0, branchCode]) {
      await this.prisma.productStockBalance.upsert({
        where: {
          companyId_productId_branchCode_variantKey: {
            companyId,
            productId,
            branchCode: balanceBranchCode,
            variantKey,
          },
        },
        create: {
          companyId,
          productId,
          branchCode: balanceBranchCode,
          variantKey,
          quantity,
          reservedQuantity: 0,
          createdBy: requestedBy || null,
          updatedBy: requestedBy || null,
        },
        update: {
          quantity,
          updatedBy: requestedBy || null,
        },
      });
    }
  }

  private getBranchSummary(
    product: { branchCode?: number | null },
    branchConfig?: BranchInventoryConfig,
  ) {
    return {
      branchCode:
        branchConfig?.branchCode || product.branchCode || DEFAULT_BRANCH_CODE,
      inventoryControlType:
        branchConfig?.inventoryControlType || "TRADITIONAL",
      quantityPrecision: branchConfig?.quantityPrecision || "INTEGER_ONLY",
    };
  }

  private buildNormalizedPayload(
    payload: SaveProductDto,
    branchConfig: BranchInventoryConfig,
  ): NormalizedProductPayload {
    const normalizedName = normalizeText(payload.name);
    if (!normalizedName) {
      throw new BadRequestException("Informe o nome do produto.");
    }

    const usesColorSize =
      branchConfig.inventoryControlType === "COLOR_SIZE"
        ? this.normalizeBoolean(payload.usesColorSize, false)
        : false;
    const usesLotControl =
      branchConfig.inventoryControlType === "LOT"
        ? this.normalizeBoolean(payload.usesLotControl, false)
        : false;
    const allowFraction =
      branchConfig.quantityPrecision === "DECIMAL_ALLOWED"
        ? true
        : branchConfig.quantityPrecision === "PRODUCT_DEFINED"
          ? this.normalizeBoolean(payload.allowFraction, false)
          : false;
    const tracksInventory = this.normalizeBoolean(payload.tracksInventory, true);

    return {
      name: normalizedName,
      internalCode: normalizeText(payload.internalCode),
      sku: normalizeText(payload.sku),
      barcode: normalizeDigits(payload.barcode) || normalizeText(payload.barcode),
      unitCode: normalizeText(payload.unitCode) || "UN",
      productType: normalizeText(payload.productType) || "GOODS",
      tracksInventory,
      allowFraction,
      usesColorSize: tracksInventory ? usesColorSize : false,
      usesLotControl: tracksInventory ? usesLotControl : false,
      usesExpirationControl: tracksInventory
        ? this.normalizeBoolean(payload.usesExpirationControl, false)
        : false,
      allowsNegativeStock: tracksInventory
        ? this.normalizeBoolean(payload.allowsNegativeStock, false)
        : false,
      currentStock: this.normalizeStockQuantity(
        payload.currentStock,
        allowFraction,
        "O estoque atual",
      ),
      minimumStock: this.normalizeStockQuantity(
        payload.minimumStock,
        allowFraction,
        "O estoque mínimo",
      ),
      purchasePrice: this.normalizeOptionalNumber(payload.purchasePrice),
      salePrice: this.normalizeOptionalNumber(payload.salePrice),
      ncmCode: normalizeDigits(payload.ncmCode) || normalizeText(payload.ncmCode),
      cestCode:
        normalizeDigits(payload.cestCode) || normalizeText(payload.cestCode),
      notes: normalizeText(payload.notes),
    };
  }

  private getInventorySituation(product: {
    tracksInventory: boolean;
    currentStock: number;
    minimumStock: number;
  }) {
    if (!product.tracksInventory) {
      return "WITHOUT_CONTROL";
    }

    if ((product.currentStock || 0) <= 0) {
      return "OUT";
    }

    if ((product.currentStock || 0) <= (product.minimumStock || 0)) {
      return "LOW";
    }

    return "OK";
  }

  private mapProduct(product: any, branchConfig?: BranchInventoryConfig) {
    return {
      id: product.id,
      companyId: product.companyId,
      companyName: product.company?.name || null,
      sourceSystem: product.company?.sourceSystem || null,
      sourceTenantId: product.company?.sourceTenantId || null,
      status: product.status,
      name: product.name,
      internalCode: product.internalCode || null,
      sku: product.sku || null,
      barcode: product.barcode || null,
      unitCode: product.unitCode,
      productType: product.productType,
      tracksInventory: Boolean(product.tracksInventory),
      allowFraction: Boolean(product.allowFraction),
      usesColorSize: Boolean(product.usesColorSize),
      usesLotControl: Boolean(product.usesLotControl),
      usesExpirationControl: Boolean(product.usesExpirationControl),
      allowsNegativeStock: Boolean(product.allowsNegativeStock),
      currentStock: roundMoney(product.currentStock || 0),
      minimumStock: roundMoney(product.minimumStock || 0),
      purchasePrice:
        product.purchasePrice === null || product.purchasePrice === undefined
          ? null
          : roundMoney(product.purchasePrice),
      salePrice:
        product.salePrice === null || product.salePrice === undefined
          ? null
          : roundMoney(product.salePrice),
      ncmCode: product.ncmCode || null,
      cestCode: product.cestCode || null,
      notes: product.notes || null,
      inventorySituation: this.getInventorySituation(product),
      branchCode: product.branchCode || DEFAULT_BRANCH_CODE,
      branch: this.getBranchSummary(product, branchConfig),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
      canceledAt: product.canceledAt ? product.canceledAt.toISOString() : null,
    };
  }

  private getMovementTypeLabel(value?: string | null) {
    const normalized = normalizeText(value);

    if (normalized === "ENTRY") {
      return "ENTRADA";
    }

    if (normalized === "EXIT") {
      return "SAÍDA";
    }

    if (normalized === "ADJUSTMENT") {
      return "AJUSTE";
    }

    if (normalized === "REVERSAL") {
      return "ESTORNO";
    }

    if (normalized === "TRANSFER") {
      return "TRANSFERÊNCIA";
    }

    return normalized || "MOVIMENTAÇÃO";
  }

  private mapStockMovement(movement: any) {
    const sourceImport = movement.sourceImport;
    const product = movement.product;
    const movementType = normalizeText(movement.movementType) || "MOVEMENT";

    return {
      id: movement.id,
      companyId: movement.companyId,
      branchCode: movement.branchCode || DEFAULT_BRANCH_CODE,
      productId: movement.productId,
      productName: product?.name || "PRODUTO NÃO IDENTIFICADO",
      productInternalCode: product?.internalCode || null,
      productBarcode: product?.barcode || null,
      productUnitCode: product?.unitCode || null,
      movementType,
      movementTypeLabel: this.getMovementTypeLabel(movementType),
      quantity: roundMoney(movement.quantity || 0),
      previousStock: roundMoney(movement.previousStock || 0),
      resultingStock: roundMoney(movement.resultingStock || 0),
      unitCost:
        movement.unitCost === null || movement.unitCost === undefined
          ? null
          : roundMoney(movement.unitCost),
      sourceType: sourceImport ? "NF-E" : "SISTEMA",
      sourceDocument:
        sourceImport?.invoiceNumber
          ? `NF-E ${sourceImport.invoiceNumber}${sourceImport.series ? `/${sourceImport.series}` : ""}`
          : null,
      sourceAccessKey: sourceImport?.accessKey || null,
      notes: movement.notes || null,
      occurredAt: movement.occurredAt.toISOString(),
      createdBy: movement.createdBy || null,
      createdAt: movement.createdAt.toISOString(),
    };
  }

  private async findCompany(sourceSystem?: string | null, sourceTenantId?: string | null) {
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

  private async resolveOrCreateCompany(payload: SaveProductDto) {
    const normalizedSourceSystem = normalizeText(payload.sourceSystem);
    const normalizedSourceTenantId = normalizeText(payload.sourceTenantId);

    if (!normalizedSourceSystem || !normalizedSourceTenantId) {
      throw new BadRequestException(
        "Informe o sistema de origem e o tenant para operar produtos.",
      );
    }

    const existing = await this.findCompany(
      normalizedSourceSystem,
      normalizedSourceTenantId,
    );

    if (existing) {
      return existing;
    }

    return this.prisma.company.create({
      data: {
        sourceSystem: normalizedSourceSystem,
        sourceTenantId: normalizedSourceTenantId,
        name:
          normalizeText(payload.companyName) ||
          `${normalizedSourceSystem} ${normalizedSourceTenantId}`,
        document: normalizeDigits(payload.companyDocument),
        createdBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
    });
  }

  private async loadScopedProduct(
    productId: string,
    sourceSystem?: string | null,
    sourceTenantId?: string | null,
  ) {
    const normalizedProductId = String(productId || "").trim();
    if (!normalizedProductId) {
      throw new BadRequestException("Produto inválido.");
    }

    const company = await this.findCompany(sourceSystem, sourceTenantId);
    if (!company) {
      throw new NotFoundException(
        "Empresa financeira não encontrada para o tenant informado.",
      );
    }

    const product = await this.prisma.product.findFirst({
      where: {
        id: normalizedProductId,
        companyId: company.id,
      },
      include: {
        company: true,
      },
    });

    if (!product) {
      throw new NotFoundException(
        "Produto não encontrado para a empresa financeira informada.",
      );
    }

    return { company, product };
  }

  private async ensureNoDuplicateProduct(
    companyId: string,
    payload: NormalizedProductPayload,
    excludedProductId?: string,
  ) {
    const duplicateFilters: Array<
      | { internalCode: string }
      | { sku: string }
      | { barcode: string }
    > = [];

    if (payload.internalCode) {
      duplicateFilters.push({ internalCode: payload.internalCode });
    }

    if (payload.sku) {
      duplicateFilters.push({ sku: payload.sku });
    }

    if (payload.barcode) {
      duplicateFilters.push({ barcode: payload.barcode });
    }

    if (!duplicateFilters.length) {
      return;
    }

    const duplicatedProduct = await this.prisma.product.findFirst({
      where: {
        companyId,
        ...(excludedProductId
          ? {
              id: {
                not: excludedProductId,
              },
            }
          : {}),
        OR: duplicateFilters,
      },
    });

    if (!duplicatedProduct) {
      return;
    }

    const duplicateField =
      payload.internalCode &&
      duplicatedProduct.internalCode === payload.internalCode
        ? "código interno"
        : payload.sku && duplicatedProduct.sku === payload.sku
          ? "SKU"
          : "código de barras";

    if (duplicatedProduct.status === "INACTIVE") {
      throw new BadRequestException(
        `Já existe um produto inativo com o mesmo ${duplicateField}. Reative o cadastro existente.`,
      );
    }

    throw new BadRequestException(
      `Já existe um produto com o mesmo ${duplicateField}.`,
    );
  }

  async list(query: ListProductsDto) {
    const company = await this.findCompany(
      query.sourceSystem,
      query.sourceTenantId,
    );

    if (!company) {
      return [];
    }

    const normalizedSearch = normalizeText(query.search);
    const normalizedDigits = normalizeDigits(query.search);
    const normalizedStatus = normalizeText(query.status);

    const products = await this.prisma.product.findMany({
      where: {
        companyId: company.id,
        ...(normalizedStatus && normalizedStatus !== "ALL"
          ? { status: normalizedStatus }
          : {}),
        ...(normalizedSearch
          ? {
              OR: [
                { name: { contains: normalizedSearch } },
                { internalCode: { contains: normalizedSearch } },
                { sku: { contains: normalizedSearch } },
                {
                  barcode: {
                    contains: normalizedDigits || normalizedSearch,
                  },
                },
                {
                  ncmCode: {
                    contains: normalizedDigits || normalizedSearch,
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        company: true,
      },
      orderBy: [{ name: "asc" }],
    });

    const branches = await this.prisma.companyBranch.findMany({
      where: {
        companyId: company.id,
        canceledAt: null,
      },
    });
    const branchConfigs = new Map(
      branches.map((branch) => [
        branch.branchCode,
        {
          branchCode: branch.branchCode,
          inventoryControlType: branch.inventoryControlType,
          quantityPrecision: branch.quantityPrecision,
        },
      ]),
    );

    return products.map((product) =>
      this.mapProduct(product, branchConfigs.get(product.branchCode)),
    );
  }

  async listStockMovements(query: ListStockMovementsDto) {
    const company = await this.findCompany(
      query.sourceSystem,
      query.sourceTenantId,
    );

    if (!company) {
      return [];
    }

    const normalizedSearch = normalizeText(query.search);
    const normalizedDigits = normalizeDigits(query.search);
    const normalizedMovementType = normalizeText(query.movementType);
    const requestedBranchCode =
      Number.isInteger(query.sourceBranchCode) && Number(query.sourceBranchCode) >= 0
        ? Number(query.sourceBranchCode)
        : this.currentBranchCode();

    const movements = await this.prisma.stockMovement.findMany({
      where: {
        companyId: company.id,
        canceledAt: null,
        branchCode: requestedBranchCode,
        ...(normalizedMovementType && normalizedMovementType !== "ALL"
          ? { movementType: normalizedMovementType }
          : {}),
        ...(normalizedSearch
          ? {
              OR: [
                { notes: { contains: normalizedSearch } },
                {
                  product: {
                    is: {
                      name: { contains: normalizedSearch },
                    },
                  },
                },
                {
                  product: {
                    is: {
                      internalCode: { contains: normalizedSearch },
                    },
                  },
                },
                {
                  product: {
                    is: {
                      barcode: {
                        contains: normalizedDigits || normalizedSearch,
                      },
                    },
                  },
                },
                {
                  sourceImport: {
                    is: {
                      invoiceNumber: { contains: normalizedSearch },
                    },
                  },
                },
                {
                  sourceImport: {
                    is: {
                      accessKey: {
                        contains: normalizedDigits || normalizedSearch,
                      },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        product: true,
        sourceImport: true,
        sourceImportItem: true,
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 500,
    });

    return movements.map((movement) => this.mapStockMovement(movement));
  }

  async get(productId: string, query: GetProductDto) {
    const { product } = await this.loadScopedProduct(
      productId,
      query.sourceSystem,
      query.sourceTenantId,
    );

    return this.mapProduct(
      product,
      await this.loadBranchConfigByCode(product.companyId, product.branchCode),
    );
  }

  async create(payload: SaveProductDto) {
    const company = await this.resolveOrCreateCompany(payload);
    const branchConfig = await this.loadCurrentBranchConfig(company.id);
    const normalizedPayload = this.buildNormalizedPayload(payload, branchConfig);

    await this.ensureNoDuplicateProduct(company.id, normalizedPayload);

    const product = await this.prisma.product.create({
      data: {
        companyId: company.id,
        status: "ACTIVE",
        ...normalizedPayload,
        createdBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
      include: {
        company: true,
      },
    });

    await this.upsertInitialStockBalances(
      product.id,
      product.companyId,
      branchConfig.branchCode,
      normalizedPayload,
      payload.requestedBy,
    );

    return this.mapProduct(product, branchConfig);
  }

  async update(productId: string, payload: SaveProductDto) {
    const { product } = await this.loadScopedProduct(
      productId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const branchConfig = await this.loadCurrentBranchConfig(product.companyId);
    const normalizedPayload = this.buildNormalizedPayload(payload, branchConfig);

    await this.ensureNoDuplicateProduct(
      product.companyId,
      normalizedPayload,
      product.id,
    );

    const updatedProduct = await this.prisma.product.update({
      where: { id: product.id },
      data: {
        ...normalizedPayload,
        updatedBy: payload.requestedBy || null,
      },
      include: {
        company: true,
      },
    });

    await this.upsertInitialStockBalances(
      updatedProduct.id,
      updatedProduct.companyId,
      branchConfig.branchCode,
      normalizedPayload,
      payload.requestedBy,
    );

    return this.mapProduct(updatedProduct, branchConfig);
  }

  async activate(productId: string, payload: ChangeProductStatusDto) {
    const { product } = await this.loadScopedProduct(
      productId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    const updatedProduct = await this.prisma.product.update({
      where: { id: product.id },
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

    return this.mapProduct(
      updatedProduct,
      await this.loadBranchConfigByCode(
        updatedProduct.companyId,
        updatedProduct.branchCode,
      ),
    );
  }

  async inactivate(productId: string, payload: ChangeProductStatusDto) {
    const { product } = await this.loadScopedProduct(
      productId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );

    const updatedProduct = await this.prisma.product.update({
      where: { id: product.id },
      data: {
        status: "INACTIVE",
        canceledAt: new Date(),
        canceledBy: payload.requestedBy || null,
        updatedBy: payload.requestedBy || null,
      },
      include: {
        company: true,
      },
    });

    return this.mapProduct(
      updatedProduct,
      await this.loadBranchConfigByCode(
        updatedProduct.companyId,
        updatedProduct.branchCode,
      ),
    );
  }
}
