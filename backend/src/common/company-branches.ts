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

  return prisma.companyBranch.create({
    data: {
      companyId,
      branchCode: DEFAULT_BRANCH_CODE,
      name: "FILIAL 1",
      isActive: true,
      isDefault: true,
      inventoryControlType: "TRADITIONAL",
      quantityPrecision: "INTEGER_ONLY",
      stockControlMode: "BY_PRODUCT",
      stockIntegerQuantityMode: "YES",
      stockLotControlMode: "NO",
      stockExpirationControlMode: "NO",
      stockGridControlMode: "NO",
      stockNegativeControlMode: "NO",
      createdBy: userId || undefined,
      updatedBy: userId || undefined,
    },
    select: { id: true },
  });
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
}) {
  return {
    id: branch.id,
    branchCode: branch.branchCode,
    name: branch.name,
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
  };
}
