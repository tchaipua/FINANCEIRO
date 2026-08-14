import type { PrismaService } from "../prisma/prisma.service";

export type StockClassificationMode =
  | "NONE"
  | "GROUP_ONLY"
  | "GROUP_AND_SUBGROUP";

type ProductClassificationClient = Pick<
  PrismaService,
  "product" | "productGroup" | "productSubgroup"
>;

export const DEFAULT_PRODUCT_CLASSIFICATION_NAME = "PADRÃO";

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

/**
 * Garante uma classificação padrão e corrige produtos legados sem grupo ou
 * subgrupo quando a filial passa a exigir classificação de estoque.
 * A operação é idempotente e aceita tanto o PrismaService quanto um cliente
 * transacional para que a alteração do parâmetro e o saneamento sejam atômicos.
 */
export async function ensureDefaultProductClassification(
  prisma: ProductClassificationClient,
  input: {
    companyId: string;
    branchCode: number;
    mode?: string | null;
    requestedBy?: string | null;
  },
) {
  const mode = normalizeStockClassificationMode(input.mode);
  if (
    mode === "NONE" ||
    !prisma.product ||
    !prisma.productGroup ||
    !prisma.productSubgroup
  ) {
    return {
      mode,
      groupId: null,
      subgroupId: null,
      groupsCreated: 0,
      subgroupsCreated: 0,
      productsAssignedToDefaultGroup: 0,
      productsAssignedToDefaultSubgroup: 0,
    };
  }

  const productsNeedingClassification = await prisma.product.findMany({
    where: {
      companyId: input.companyId,
      branchCode: input.branchCode,
      canceledAt: null,
      ...(mode === "GROUP_ONLY"
        ? { groupId: null }
        : {
            OR: [{ groupId: null }, { subgroupId: null }],
          }),
    },
    select: { id: true, groupId: true, subgroupId: true },
  });

  if (!productsNeedingClassification.length) {
    return {
      mode,
      groupId: null,
      subgroupId: null,
      groupsCreated: 0,
      subgroupsCreated: 0,
      productsAssignedToDefaultGroup: 0,
      productsAssignedToDefaultSubgroup: 0,
    };
  }

  const requestedBy = input.requestedBy || null;
  const existingDefaultGroup = await prisma.productGroup.findUnique({
    where: {
      companyId_branchCode_name: {
        companyId: input.companyId,
        branchCode: input.branchCode,
        name: DEFAULT_PRODUCT_CLASSIFICATION_NAME,
      },
    },
    select: { id: true },
  });
  const defaultGroup = await prisma.productGroup.upsert({
    where: {
      companyId_branchCode_name: {
        companyId: input.companyId,
        branchCode: input.branchCode,
        name: DEFAULT_PRODUCT_CLASSIFICATION_NAME,
      },
    },
    create: {
      companyId: input.companyId,
      branchCode: input.branchCode,
      name: DEFAULT_PRODUCT_CLASSIFICATION_NAME,
      description: "Classificação criada automaticamente para produtos legados.",
      status: "ACTIVE",
      createdBy: requestedBy,
      updatedBy: requestedBy,
    },
    update: {
      status: "ACTIVE",
      canceledAt: null,
      canceledBy: null,
      updatedBy: requestedBy,
    },
    select: { id: true },
  });

  let defaultSubgroup: { id: string } | null = null;
  let subgroupsCreated = 0;
  if (mode === "GROUP_AND_SUBGROUP") {
    const existingDefaultSubgroup = await prisma.productSubgroup.findUnique({
      where: {
        companyId_branchCode_groupId_name: {
          companyId: input.companyId,
          branchCode: input.branchCode,
          groupId: defaultGroup.id,
          name: DEFAULT_PRODUCT_CLASSIFICATION_NAME,
        },
      },
      select: { id: true },
    });
    defaultSubgroup = await prisma.productSubgroup.upsert({
      where: {
        companyId_branchCode_groupId_name: {
          companyId: input.companyId,
          branchCode: input.branchCode,
          groupId: defaultGroup.id,
          name: DEFAULT_PRODUCT_CLASSIFICATION_NAME,
        },
      },
      create: {
        companyId: input.companyId,
        branchCode: input.branchCode,
        groupId: defaultGroup.id,
        name: DEFAULT_PRODUCT_CLASSIFICATION_NAME,
        description: "Subgrupo criado automaticamente para produtos legados.",
        status: "ACTIVE",
        createdBy: requestedBy,
        updatedBy: requestedBy,
      },
      update: {
        status: "ACTIVE",
        canceledAt: null,
        canceledBy: null,
        updatedBy: requestedBy,
      },
      select: { id: true },
    });
    subgroupsCreated = existingDefaultSubgroup ? 0 : 1;
  }

  const ungroupedProducts = productsNeedingClassification.filter(
    (product) => !product.groupId,
  );
  let productsAssignedToDefaultGroup = 0;
  let productsAssignedToDefaultSubgroup = 0;

  if (ungroupedProducts.length) {
    const updated = await prisma.product.updateMany({
      where: { id: { in: ungroupedProducts.map((product) => product.id) } },
      data: {
        groupId: defaultGroup.id,
        subgroupId: mode === "GROUP_AND_SUBGROUP" ? defaultSubgroup?.id : null,
        updatedBy: requestedBy,
      },
    });
    productsAssignedToDefaultGroup = updated.count;
    productsAssignedToDefaultSubgroup =
      mode === "GROUP_AND_SUBGROUP" ? updated.count : 0;
  }

  if (mode === "GROUP_AND_SUBGROUP") {
    const groupedProductsWithoutSubgroup = productsNeedingClassification.filter(
      (product) => Boolean(product.groupId) && !product.subgroupId,
    );
    const groupIds = Array.from(
      new Set(groupedProductsWithoutSubgroup.map((product) => product.groupId!)),
    );

    for (const groupId of groupIds) {
      const subgroup =
        groupId === defaultGroup.id
          ? defaultSubgroup!
          : await prisma.productSubgroup.upsert({
              where: {
                companyId_branchCode_groupId_name: {
                  companyId: input.companyId,
                  branchCode: input.branchCode,
                  groupId,
                  name: DEFAULT_PRODUCT_CLASSIFICATION_NAME,
                },
              },
              create: {
                companyId: input.companyId,
                branchCode: input.branchCode,
                groupId,
                name: DEFAULT_PRODUCT_CLASSIFICATION_NAME,
                description: "Subgrupo criado automaticamente para produtos legados.",
                status: "ACTIVE",
                createdBy: requestedBy,
                updatedBy: requestedBy,
              },
              update: {
                status: "ACTIVE",
                canceledAt: null,
                canceledBy: null,
                updatedBy: requestedBy,
              },
              select: { id: true },
            });

      const updated = await prisma.product.updateMany({
        where: {
          companyId: input.companyId,
          branchCode: input.branchCode,
          canceledAt: null,
          groupId,
          subgroupId: null,
        },
        data: { subgroupId: subgroup.id, updatedBy: requestedBy },
      });
      productsAssignedToDefaultSubgroup += updated.count;
    }
  }

  return {
    mode,
    groupId: defaultGroup.id,
    subgroupId: defaultSubgroup?.id || null,
    groupsCreated: existingDefaultGroup ? 0 : 1,
    subgroupsCreated,
    productsAssignedToDefaultGroup,
    productsAssignedToDefaultSubgroup,
  };
}
