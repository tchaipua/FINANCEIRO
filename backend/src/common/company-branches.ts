import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  DEFAULT_BRANCH_CODE,
  SHARED_BRANCH_CODE,
  normalizeBranchCode,
} from "./branch.constants";

type CompanyBranchClient = PrismaService | Prisma.TransactionClient;

function normalizeStockParameterMode(value?: string | null) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();

  return ["NO", "YES", "BY_PRODUCT"].includes(normalized)
    ? normalized
    : "BY_PRODUCT";
}

type SourceOwnedBranchStockSettings = {
  inventoryControlType?: string | null;
  quantityPrecision?: string | null;
  stockControlMode?: string | null;
  stockIntegerQuantityMode?: string | null;
  stockLotControlMode?: string | null;
  stockExpirationControlMode?: string | null;
  stockGridControlMode?: string | null;
  stockNegativeControlMode?: string | null;
  stockClassificationMode?: string | null;
};

const SOURCE_OWNED_STOCK_MODE_FIELDS = [
  "stockControlMode",
  "stockIntegerQuantityMode",
  "stockLotControlMode",
  "stockExpirationControlMode",
  "stockGridControlMode",
  "stockNegativeControlMode",
  "stockClassificationMode",
] as const;

function normalizeInventoryControlType(value?: string | null) {
  const normalized = String(value || "").trim().toUpperCase();
  return ["TRADITIONAL", "COLOR_SIZE", "LOT"].includes(normalized)
    ? normalized
    : "TRADITIONAL";
}

function normalizeQuantityPrecision(value?: string | null) {
  const normalized = String(value || "").trim().toUpperCase();
  return ["INTEGER_ONLY", "DECIMAL_ALLOWED", "PRODUCT_DEFINED"].includes(
    normalized,
  )
    ? normalized
    : "INTEGER_ONLY";
}

function normalizeStockClassificationMode(value?: string | null) {
  const normalized = String(value || "").trim().toUpperCase();
  return ["NONE", "GROUP_ONLY", "GROUP_AND_SUBGROUP"].includes(normalized)
    ? normalized
    : "GROUP_ONLY";
}

export function hasSourceOwnedBranchStockChanges(
  requested: SourceOwnedBranchStockSettings,
  current: SourceOwnedBranchStockSettings,
) {
  if (
    requested.inventoryControlType !== undefined &&
    normalizeInventoryControlType(requested.inventoryControlType) !==
      normalizeInventoryControlType(current.inventoryControlType)
  ) {
    return true;
  }

  if (
    requested.quantityPrecision !== undefined &&
    normalizeQuantityPrecision(requested.quantityPrecision) !==
      normalizeQuantityPrecision(current.quantityPrecision)
  ) {
    return true;
  }

  return SOURCE_OWNED_STOCK_MODE_FIELDS.some(
    (field) =>
      requested[field] !== undefined &&
      (field === "stockClassificationMode"
        ? normalizeStockClassificationMode(requested[field]) !==
          normalizeStockClassificationMode(current[field])
        : normalizeStockParameterMode(requested[field]) !==
          normalizeStockParameterMode(current[field])),
  );
}

export async function ensureDefaultCompanyBranch(
  prisma: CompanyBranchClient,
  companyId: string,
  userId?: string | null,
) {
  const existing = await prisma.companyBranch.findFirst({
    where: {
      companyId,
      branchCode: DEFAULT_BRANCH_CODE,
    },
    select: { id: true },
  });

  if (existing) {
    return existing;
  }

  throw new BadRequestException(
    "A filial deve ser cadastrada e sincronizada pelo sistema de origem.",
  );
}

export async function listCompanyBranches(
  prisma: CompanyBranchClient,
  companyId: string,
) {
  await ensureDefaultCompanyBranch(prisma, companyId);

  return prisma.companyBranch.findMany({
    where: {
      companyId,
      canceledAt: null,
    },
    orderBy: [{ branchCode: "asc" }, { name: "asc" }],
  });
}

export async function resolveWritableCompanyBranchCode(
  prisma: CompanyBranchClient,
  companyId: string,
  requestedBranchCode?: unknown,
  fallbackBranchCode = DEFAULT_BRANCH_CODE,
) {
  const branches = await listCompanyBranches(prisma, companyId);

  if (branches.length <= 1) {
    return DEFAULT_BRANCH_CODE;
  }

  if (
    requestedBranchCode === undefined ||
    requestedBranchCode === null ||
    String(requestedBranchCode).trim() === ""
  ) {
    return normalizeBranchCode(fallbackBranchCode, DEFAULT_BRANCH_CODE);
  }

  const normalizedBranchCode = normalizeBranchCode(requestedBranchCode, -1);
  if (normalizedBranchCode < 0) {
    throw new BadRequestException("Filial inválida.");
  }

  if (normalizedBranchCode === SHARED_BRANCH_CODE) {
    return SHARED_BRANCH_CODE;
  }

  const branchExists = branches.some(
    (branch) => branch.branchCode === normalizedBranchCode,
  );

  if (!branchExists) {
    throw new BadRequestException("A filial informada não existe.");
  }

  return normalizedBranchCode;
}

export function mapCompanyBranchSummary(branch: {
  id: string;
  branchCode: number;
  name: string;
  fiscalDocument?: string | null;
  isActive: boolean;
  isDefault: boolean;
  inventoryControlType?: string;
  quantityPrecision?: string;
  stockControlMode?: string;
  stockIntegerQuantityMode?: string;
  stockLotControlMode?: string;
  stockExpirationControlMode?: string;
  stockGridControlMode?: string;
  stockNegativeControlMode?: string;
  notifyMinimumStockOnMovement?: boolean | null;
  stockClassificationMode?: string;
  allowSaleUnitPriceEdit?: boolean | null;
  allowSaleItemDiscount?: boolean | null;
  allowProductImageEdit?: boolean | null;
  requirePasswordToRemoveSaleItems?: boolean | null;
}) {
  return {
    id: branch.id,
    branchCode: branch.branchCode,
    name: branch.name,
    fiscalDocument: branch.fiscalDocument || null,
    isActive: branch.isActive,
    isDefault: branch.isDefault,
    isShared: branch.branchCode === SHARED_BRANCH_CODE,
    inventoryControlType: branch.inventoryControlType || "TRADITIONAL",
    quantityPrecision: branch.quantityPrecision || "INTEGER_ONLY",
    stockControlMode: normalizeStockParameterMode(branch.stockControlMode),
    stockIntegerQuantityMode: normalizeStockParameterMode(
      branch.stockIntegerQuantityMode,
    ),
    stockLotControlMode: normalizeStockParameterMode(branch.stockLotControlMode),
    stockExpirationControlMode: normalizeStockParameterMode(
      branch.stockExpirationControlMode,
    ),
    stockGridControlMode: normalizeStockParameterMode(branch.stockGridControlMode),
    stockNegativeControlMode: normalizeStockParameterMode(
      branch.stockNegativeControlMode,
    ),
    notifyMinimumStockOnMovement:
      branch.notifyMinimumStockOnMovement === true,
    stockClassificationMode:
      branch.stockClassificationMode === "NONE"
        ? "NONE"
        : branch.stockClassificationMode === "GROUP_AND_SUBGROUP"
          ? "GROUP_AND_SUBGROUP"
          : "GROUP_ONLY",
    allowSaleUnitPriceEdit: branch.allowSaleUnitPriceEdit !== false,
    allowSaleItemDiscount: branch.allowSaleItemDiscount !== false,
    allowProductImageEdit: branch.allowProductImageEdit !== false,
    requirePasswordToRemoveSaleItems: branch.requirePasswordToRemoveSaleItems === true,
  };
}
