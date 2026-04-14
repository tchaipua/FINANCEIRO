import { Module } from "@nestjs/common";
import { CompaniesController } from "./infrastructure/companies.controller";
import { CompaniesService } from "./application/companies.service";

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
