import { Module } from "@nestjs/common";
import { CompaniesController } from "./infrastructure/companies.controller";
import { CompaniesService } from "./application/companies.service";
import { CentralBranchEditorClient } from "./application/central-branch-editor.client";

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, CentralBranchEditorClient],
  exports: [CompaniesService],
})
export class CompaniesModule {}
