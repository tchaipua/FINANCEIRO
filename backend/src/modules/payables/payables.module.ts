import { Module } from "@nestjs/common";
import { PayablesService } from "./application/payables.service";
import { PayablesController } from "./infrastructure/payables.controller";

@Module({
  controllers: [PayablesController],
  providers: [PayablesService],
  exports: [PayablesService],
})
export class PayablesModule {}
