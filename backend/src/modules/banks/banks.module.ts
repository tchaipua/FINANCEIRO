import { Module } from "@nestjs/common";
import { BanksController } from "./infrastructure/banks.controller";
import { BanksService } from "./application/banks.service";
import { SicoobBankStatementService } from "./application/sicoob-bank-statement.service";
import { SicoobDdaService } from "./application/sicoob-dda.service";
import { SicrediBillingService } from "../receivables/application/sicredi-billing.service";
import { BankSecretsMigrationService } from "./application/bank-secrets-migration.service";

@Module({
  controllers: [BanksController],
  providers: [
    BanksService,
    SicoobBankStatementService,
    SicoobDdaService,
    SicrediBillingService,
    BankSecretsMigrationService,
  ],
  exports: [BanksService],
})
export class BanksModule {}
