import type { AuthenticatedFinanceRequestContext } from "../common/finance-context";

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
      file?: {
        fieldname: string;
        originalname: string;
        mimetype: string;
        size: number;
        buffer: Buffer;
      };
      sourceSystem?: string;
      sourceTenantId?: string;
      sourceBranchCode?: number;
      sourceUserId?: string;
      companyId?: string;
      branchId?: string;
      financeAuth?: Readonly<AuthenticatedFinanceRequestContext>;
    }
  }
}

export {};
