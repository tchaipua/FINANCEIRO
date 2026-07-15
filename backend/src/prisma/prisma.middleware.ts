import { ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { getVisibleBranchCodes } from "../common/branch.constants";
import { getFinanceContext } from "../common/finance-context";

const IGNORED_MODELS = ["Company", "CompanyBranch"];
const BRANCH_MODELS = [
  "Product",
  "ProductStockBalance",
  "FiscalCertificate",
  "Supplier",
  "PayableInvoiceImport",
  "PayableTitle",
  "PayableInstallment",
  "StockMovement",
  "BankAccount",
  "Party",
  "ReceivableBatch",
  "ReceivableTitle",
  "ReceivableInstallment",
  "CashSession",
  "CashMovement",
  "InstallmentSettlement",
  "BankReturnImport",
  "BankReturnImportItem",
  "BankStatementImport",
  "BankStatementMovement",
  "Sale",
  "SaleItem",
  "SalePayment",
];

function modelSupportsBranchScope(model?: string | null) {
  return Boolean(model && BRANCH_MODELS.includes(model));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function flattenCompoundUniqueWhere(where: Record<string, unknown>) {
  return Object.entries(where).reduce<Record<string, unknown>>(
    (flattened, [key, value]) => {
      if (key.includes("_") && isPlainObject(value)) {
        return {
          ...flattened,
          ...value,
        };
      }

      flattened[key] = value;
      return flattened;
    },
    {},
  );
}

export function branchMiddleware(): Prisma.Middleware {
  return async (params, next) => {
    const model = params.model;
    const context = getFinanceContext();

    if (!model || IGNORED_MODELS.includes(model)) {
      return next(params);
    }

    if (!context || !modelSupportsBranchScope(model)) {
      return next(params);
    }

    const visibleBranchCodes = getVisibleBranchCodes(context.branchCode);
    const action = params.action;
    const readOrUpdateActions = [
      "findUnique",
      "findUniqueOrThrow",
      "findFirst",
      "findFirstOrThrow",
      "findMany",
      "update",
      "updateMany",
      "delete",
      "deleteMany",
      "count",
      "aggregate",
      "groupBy",
    ];

    if (readOrUpdateActions.includes(action)) {
      if (!params.args) params.args = {};
      if (!params.args.where) params.args.where = {};

      const uniqueScopedActions = [
        "findUnique",
        "findUniqueOrThrow",
        "update",
        "delete",
      ];
      let originalWhere = params.args.where;

      if (uniqueScopedActions.includes(action)) {
        originalWhere = flattenCompoundUniqueWhere(originalWhere);
      }

      const requestedBranchFilter = originalWhere.branchCode;
      const explicitlyRequestedBranchCodes = isPlainObject(requestedBranchFilter)
        ? [
            ...(requestedBranchFilter.equals !== undefined
              ? [Number(requestedBranchFilter.equals)]
              : []),
            ...(Array.isArray(requestedBranchFilter.in)
              ? requestedBranchFilter.in.map(Number)
              : []),
          ]
        : requestedBranchFilter !== undefined
          ? [Number(requestedBranchFilter)]
          : [];

      if (
        explicitlyRequestedBranchCodes.some(
          (branchCode) =>
            !Number.isInteger(branchCode) ||
            !visibleBranchCodes.includes(branchCode),
        )
      ) {
        throw new ForbiddenException(
          "Tentativa de acesso a filial fora do escopo atual.",
        );
      }

      if (action === "findUnique" || action === "findUniqueOrThrow") {
        params.action = action.replace("Unique", "First") as typeof params.action;
      }

      if (uniqueScopedActions.includes(action)) {
        params.args.where = {
          ...originalWhere,
          ...(originalWhere.branchCode === undefined
            ? {
                branchCode: {
                  in: visibleBranchCodes,
                },
              }
            : {}),
        };
        return next(params);
      }

      params.args.where = {
        AND: [
          originalWhere,
          {
            branchCode: {
              in: visibleBranchCodes,
            },
          },
        ],
      };
    }

    if (action === "create") {
      if (!params.args) params.args = {};
      if (!params.args.data) params.args.data = {};

      if (params.args.data.branchCode === undefined) {
        params.args.data.branchCode = context.branchCode;
      }
    }

    if (action === "createMany" && params.args?.data) {
      const dataArray = Array.isArray(params.args.data)
        ? params.args.data
        : [params.args.data];

      dataArray.forEach((item: Record<string, unknown>) => {
        if (item.branchCode === undefined) {
          item.branchCode = context.branchCode;
        }
      });
    }

    return next(params);
  };
}
