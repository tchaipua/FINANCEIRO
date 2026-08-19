import { Module } from "@nestjs/common";
import { PayablesService } from "./application/payables.service";
import { PayablesController } from "./infrastructure/payables.controller";
import { FinancialNotificationsModule } from "../financial-notifications/financial-notifications.module";

@Module({
  imports: [FinancialNotificationsModule],
  controllers: [PayablesController],
  providers: [PayablesService],
  exports: [PayablesService],
})
export class PayablesModule {}
