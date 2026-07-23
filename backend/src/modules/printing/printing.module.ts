import { Module } from "@nestjs/common";
import { PrintingService } from "./application/printing.service";
import { PrintingController } from "./infrastructure/printing.controller";

@Module({
  controllers: [PrintingController],
  providers: [PrintingService],
  exports: [PrintingService],
})
export class PrintingModule {}
