import { Module } from "@nestjs/common";
import { CashSessionsController } from "./infrastructure/cash-sessions.controller";
import { CashSessionsService } from "./application/cash-sessions.service";
import { SalesModule } from "../sales/sales.module";

@Module({
  imports: [SalesModule],
  controllers: [CashSessionsController],
  providers: [CashSessionsService],
  exports: [CashSessionsService],
})
export class CashSessionsModule {}
