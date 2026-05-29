import { Module } from "@nestjs/common";
import { BanksController } from "./infrastructure/banks.controller";
import { BanksService } from "./application/banks.service";
import { SicoobBankStatementService } from "./application/sicoob-bank-statement.service";
import { SicoobDdaService } from "./application/sicoob-dda.service";

@Module({
  controllers: [BanksController],
  providers: [BanksService, SicoobBankStatementService, SicoobDdaService],
  exports: [BanksService],
})
export class BanksModule {}
