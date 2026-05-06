import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import {
  normalizeDigits,
  normalizeText,
  roundMoney,
} from "../../../common/finance-core.utils";
import {
  ChangeProductStatusDto,
  GetProductDto,
  ListProductsDto,
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
  currentStock: number;
  minimumStock: number;
  purchasePrice: number | null;
  salePrice: number | null;
  ncmCode: string | null;
  cestCode: string | null;
  notes: string | null;
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

  private buildNormalizedPayload(payload: SaveProductDto): NormalizedProductPayload {
    const normalizedName = normalizeText(payload.name);
    if (!normalizedName) {
      throw new BadRequestException("Informe o nome do produto.");
    }

    return {
      name: normalizedName,
      internalCode: normalizeText(payload.internalCode),
      sku: normalizeText(payload.sku),
      barcode: normalizeDigits(payload.barcode) || normalizeText(payload.barcode),
      unitCode: normalizeText(payload.unitCode) || "UN",
      productType: normalizeText(payload.productType) || "GOODS",
      tracksInventory: this.normalizeBoolean(payload.tracksInventory, true),
      allowFraction: this.normalizeBoolean(payload.allowFraction, false),
      currentStock: this.normalizeOptionalNumber(payload.currentStock) ?? 0,
      minimumStock: this.normalizeOptionalNumber(payload.minimumStock) ?? 0,
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

  private mapProduct(product: any) {
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
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
      canceledAt: product.canceledAt ? product.canceledAt.toISOString() : null,
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

    return products.map((product) => this.mapProduct(product));
  }

  async get(productId: string, query: GetProductDto) {
    const { product } = await this.loadScopedProduct(
      productId,
      query.sourceSystem,
      query.sourceTenantId,
    );

    return this.mapProduct(product);
  }

  async create(payload: SaveProductDto) {
    const company = await this.resolveOrCreateCompany(payload);
    const normalizedPayload = this.buildNormalizedPayload(payload);

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

    return this.mapProduct(product);
  }

  async update(productId: string, payload: SaveProductDto) {
    const { product } = await this.loadScopedProduct(
      productId,
      payload.sourceSystem,
      payload.sourceTenantId,
    );
    const normalizedPayload = this.buildNormalizedPayload(payload);

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

    return this.mapProduct(updatedProduct);
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

    return this.mapProduct(updatedProduct);
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

    return this.mapProduct(updatedProduct);
  }
}
