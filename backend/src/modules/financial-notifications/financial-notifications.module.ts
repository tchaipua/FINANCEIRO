import { Module } from "@nestjs/common";
import { FinancialNotificationsService } from "./application/financial-notifications.service";
import { FinancialNotificationsController } from "./infrastructure/financial-notifications.controller";

@Module({
  controllers: [FinancialNotificationsController],
  providers: [FinancialNotificationsService],
  exports: [FinancialNotificationsService],
})
export class FinancialNotificationsModule {}
