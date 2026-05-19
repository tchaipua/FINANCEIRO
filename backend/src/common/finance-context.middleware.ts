import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { financeContext } from "./finance-context";
import {
  DEFAULT_BRANCH_CODE,
  normalizeBranchCode,
} from "./branch.constants";

@Injectable()
export class FinanceContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const headerBranchCode = req.headers["x-source-branch-code"];
    const queryBranchCode =
      typeof req.query?.sourceBranchCode === "string"
        ? req.query.sourceBranchCode
        : undefined;
    const bodyBranchCode =
      req.body && typeof req.body.sourceBranchCode !== "undefined"
        ? req.body.sourceBranchCode
        : undefined;

    const branchCode = normalizeBranchCode(
      headerBranchCode || queryBranchCode || bodyBranchCode,
      DEFAULT_BRANCH_CODE,
    );

    return financeContext.run({ branchCode }, () => next());
  }
}
