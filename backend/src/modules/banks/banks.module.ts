import { Module } from "@nestjs/common";
import { BanksController } from "./infrastructure/banks.controller";
import { BanksService } from "./application/banks.service";

@Module({
  controllers: [BanksController],
  providers: [BanksService],
  exports: [BanksService],
})
export class BanksModule {}
