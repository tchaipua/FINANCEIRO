import { Module } from "@nestjs/common";
import { ReceivablesController } from "./infrastructure/receivables.controller";
import { ReceivablesService } from "./application/receivables.service";
import { SicoobBillingService } from "./application/sicoob-billing.service";

@Module({
  controllers: [ReceivablesController],
  providers: [ReceivablesService, SicoobBillingService],
  exports: [ReceivablesService],
})
export class ReceivablesModule {}
