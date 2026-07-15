import { Module } from "@nestjs/common";
import { NfceService } from "./application/nfce/nfce.service";
import { NfceController } from "./infrastructure/nfce.controller";

@Module({
  controllers: [NfceController],
  providers: [NfceService],
  exports: [NfceService],
})
export class FiscalDocumentsModule {}
