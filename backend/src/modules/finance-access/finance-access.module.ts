import { Module } from "@nestjs/common";
import { FinanceAccessService } from "./application/finance-access.service";
import { FinanceAccessController } from "./infrastructure/finance-access.controller";

@Module({
  controllers: [FinanceAccessController],
  providers: [FinanceAccessService],
  exports: [FinanceAccessService],
})
export class FinanceAccessModule {}

