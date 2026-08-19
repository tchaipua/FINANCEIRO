import { Module } from "@nestjs/common";
import { CashSessionsController } from "./infrastructure/cash-sessions.controller";
import { CashSessionsService } from "./application/cash-sessions.service";
import { SalesModule } from "../sales/sales.module";
import { FinancialNotificationsModule } from "../financial-notifications/financial-notifications.module";

@Module({
  imports: [SalesModule, FinancialNotificationsModule],
  controllers: [CashSessionsController],
  providers: [CashSessionsService],
  exports: [CashSessionsService],
})
export class CashSessionsModule {}
