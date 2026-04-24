import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CompaniesService } from "../application/companies.service";
import {
  ListCompaniesDto,
  SyncCompanyFinancialSettingsDto,
  UpdateCompanyFinancialSettingsDto,
} from "../application/dto/companies.dto";

@ApiTags("Companies")
@Controller("companies")
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @ApiOperation({
    summary: "Lista empresas multi-origem cadastradas no core financeiro",
  })
  list(@Query() query: ListCompaniesDto) {
    return this.companiesService.list(query);
  }

  @Post("sync-financial-settings")
  @ApiOperation({
    summary:
      "Sincroniza configurações financeiras padrão da empresa multi-origem",
  })
  syncFinancialSettings(@Body() payload: SyncCompanyFinancialSettingsDto) {
    return this.companiesService.syncFinancialSettings(payload);
  }

  @Patch(":id/financial-settings")
  @ApiOperation({
    summary: "Atualiza as configurações financeiras padrão da empresa",
  })
  updateFinancialSettings(
    @Param("id") id: string,
    @Query() query: ListCompaniesDto,
    @Body() payload: UpdateCompanyFinancialSettingsDto,
  ) {
    return this.companiesService.updateFinancialSettings(id, query, payload);
  }
}
