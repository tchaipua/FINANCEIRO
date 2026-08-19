import { Module } from "@nestjs/common";
import { ReceivablesController } from "./infrastructure/receivables.controller";
import { ReceivablesService } from "./application/receivables.service";
import { SicoobBillingService } from "./application/sicoob-billing.service";
import { SicrediBillingService } from "./application/sicredi-billing.service";
import { FinancialNotificationsModule } from "../financial-notifications/financial-notifications.module";

@Module({
  imports: [FinancialNotificationsModule],
  controllers: [ReceivablesController],
  providers: [ReceivablesService, SicoobBillingService, SicrediBillingService],
  exports: [ReceivablesService],
})
export class ReceivablesModule {}
