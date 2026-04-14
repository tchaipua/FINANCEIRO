import { Module } from "@nestjs/common";
import { CashSessionsController } from "./infrastructure/cash-sessions.controller";
import { CashSessionsService } from "./application/cash-sessions.service";

@Module({
  controllers: [CashSessionsController],
  providers: [CashSessionsService],
  exports: [CashSessionsService],
})
export class CashSessionsModule {}
