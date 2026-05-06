import { Module } from "@nestjs/common";
import { FiscalCertificatesService } from "./application/fiscal-certificates.service";
import { FiscalCertificatesController } from "./infrastructure/fiscal-certificates.controller";
import { PayablesModule } from "../payables/payables.module";

@Module({
  imports: [PayablesModule],
  controllers: [FiscalCertificatesController],
  providers: [FiscalCertificatesService],
  exports: [FiscalCertificatesService],
})
export class FiscalCertificatesModule {}
