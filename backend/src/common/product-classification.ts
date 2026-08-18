import type { PrismaService } from "../prisma/prisma.service";

export type StockClassificationMode =
  | "NONE"
  | "GROUP_ONLY"
  | "GROUP_AND_SUBGROUP";

export type ProductClassificationStatus =
  | "NOT_REQUIRED"
  | "CLASSIFIED"
  | "PENDING_CLASSIFICATION";

type ProductClassificationClient = Pick<PrismaService, "product">;

export function normalizeStockClassificationMode(
  value?: string | null,
): StockClassificationMode {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "NONE"
    ? "NONE"
    : normalized === "GROUP_AND_SUBGROUP"
      ? "GROUP_AND_SUBGROUP"
      : "GROUP_ONLY";
}

export function getProductClassificationStatus(
  mode: StockClassificationMode | string | null | undefined,
  product: { groupId?: string | null; subgroupId?: string | null },
): ProductClassificationStatus {
  const normalizedMode = normalizeStockClassificationMode(mode);
  if (normalizedMode === "NONE") {
    return "NOT_REQUIRED";
  }

  const classified =
    Boolean(product.groupId) &&
    (normalizedMode === "GROUP_ONLY" || Boolean(product.subgroupId));

  return classified ? "CLASSIFIED" : "PENDING_CLASSIFICATION";
}

export function getProductClassificationStatusLabel(
  status: ProductClassificationStatus,
) {
  switch (status) {
    case "PENDING_CLASSIFICATION":
      return "AGUARDANDO CLASSIFICAÇÃO";
    case "CLASSIFIED":
      return "CLASSIFICADO";
    default:
      return null;
  }
}

/**
 * Resume a situação dos produtos quando a filial passa a exigir grupo ou
 * grupo e subgrupo. Produtos legados não são alterados automaticamente:
 * continuam sem vínculo e ficam disponíveis para classificação manual.
 */
export async function summarizeProductClassification(
  prisma: ProductClassificationClient,
  input: {
    companyId: string;
    branchCode: number;
    mode?: string | null;
  },
) {
  const mode = normalizeStockClassificationMode(input.mode);
  if (mode === "NONE" || !prisma.product) {
    return {
      mode,
      status: mode === "NONE" ? "NOT_REQUIRED" : "CLASSIFIED",
      productsAwaitingClassification: 0,
      productsWithoutGroup: 0,
      productsWithoutSubgroup: 0,
    } as const;
  }

  const products = await prisma.product.findMany({
    where: {
      companyId: input.companyId,
      branchCode: input.branchCode,
      canceledAt: null,
    },
    select: { groupId: true, subgroupId: true },
  });
  const productsWithoutGroup = products.filter((product) => !product.groupId).length;
  const productsWithoutSubgroup = products.filter(
    (product) => !product.subgroupId,
  ).length;
  const productsAwaitingClassification = products.filter((product) => {
    return getProductClassificationStatus(mode, product) === "PENDING_CLASSIFICATION";
  }).length;

  return {
    mode,
    status:
      productsAwaitingClassification > 0
        ? "PENDING_CLASSIFICATION"
        : "CLASSIFIED",
    productsAwaitingClassification,
    productsWithoutGroup,
    productsWithoutSubgroup,
  } as const;
}
