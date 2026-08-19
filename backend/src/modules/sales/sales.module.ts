import { Module } from "@nestjs/common";
import { SalesController } from "./infrastructure/sales.controller";
import { SalesService } from "./application/sales.service";
import { SicoobPixService } from "./application/sicoob-pix.service";
import { FiscalDocumentsModule } from "../fiscal-documents/fiscal-documents.module";
import { FinancialNotificationsModule } from "../financial-notifications/financial-notifications.module";

@Module({
  imports: [FiscalDocumentsModule, FinancialNotificationsModule],
  controllers: [SalesController],
  providers: [SalesService, SicoobPixService],
  exports: [SicoobPixService],
})
export class SalesModule {}
