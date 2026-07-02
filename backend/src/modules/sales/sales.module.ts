import { Module } from "@nestjs/common";
import { SalesController } from "./infrastructure/sales.controller";
import { SalesService } from "./application/sales.service";

@Module({
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
