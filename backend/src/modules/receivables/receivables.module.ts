import { Module } from "@nestjs/common";
import { ReceivablesController } from "./infrastructure/receivables.controller";
import { ReceivablesService } from "./application/receivables.service";

@Module({
  controllers: [ReceivablesController],
  providers: [ReceivablesService],
  exports: [ReceivablesService],
})
export class ReceivablesModule {}
