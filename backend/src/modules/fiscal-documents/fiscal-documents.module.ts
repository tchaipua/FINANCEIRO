import { Module } from "@nestjs/common";
import { NfceService } from "./application/nfce/nfce.service";
import { NfceController } from "./infrastructure/nfce.controller";
import { NfeController } from "./infrastructure/nfe.controller";
import { FiscalParametersController } from "./infrastructure/fiscal-parameters.controller";
import { NfeService } from "./application/nfe/nfe.service";
import { NfeDanfeService } from "./application/nfe/nfe-danfe.service";
import { NfeEmailService } from "./application/nfe/nfe-email.service";
import { FiscalParametersService } from "./application/fiscal-parameters.service";
import { NfseController } from "./infrastructure/nfse.controller";
import { NfseParametersController } from "./infrastructure/nfse-parameters.controller";
import { NfseService } from "./application/nfse/nfse.service";
import { NfseEmailService } from "./application/nfse/nfse-email.service";
import { ManualFiscalReceivableService } from "./application/manual-fiscal-receivable.service";

@Module({
  controllers: [
    NfceController,
    NfeController,
    NfseController,
    NfseParametersController,
    FiscalParametersController,
  ],
  providers: [
    NfceService,
    NfeService,
    NfeDanfeService,
    NfeEmailService,
    NfseService,
    NfseEmailService,
    ManualFiscalReceivableService,
    FiscalParametersService,
  ],
  exports: [NfceService, NfeService, NfseService, FiscalParametersService],
})
export class FiscalDocumentsModule {}
