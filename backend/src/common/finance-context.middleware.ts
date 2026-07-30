import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { financeContext } from "./finance-context";
import { DEFAULT_BRANCH_CODE } from "./branch.constants";

@Injectable()
export class FinanceContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    return financeContext.run(
      {
        authenticated: false,
        branchCode: DEFAULT_BRANCH_CODE,
      },
      () => next(),
    );
  }
}
