import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CompaniesService } from "../application/companies.service";
import {
  ListCompaniesDto,
  ProvisionSourceTenantDto,
  SaveCompanyBranchDto,
  SaveSalesScreenParametersDto,
  SyncSourceIntegrationSettingsDto,
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

  @Post("sync-source-integration-settings")
  @ApiOperation({
    summary:
      "Sincroniza configurações seguras da empresa e filial do sistema de origem",
  })
  syncSourceIntegrationSettings(
    @Body() payload: SyncSourceIntegrationSettingsDto,
  ) {
    return this.companiesService.syncSourceIntegrationSettings(payload);
  }

  @Post("provision-source-tenant")
  @ApiOperation({
    summary: "Provisiona de forma idempotente o vínculo inicial de empresa e filiais",
  })
  provisionSourceTenant(@Body() payload: ProvisionSourceTenantDto) {
    return this.companiesService.provisionSourceTenant(payload);
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

  @Get(":id/branches")
  @ApiOperation({
    summary: "Lista as filiais ativas da empresa financeira",
  })
  listBranches(@Param("id") id: string, @Query() query: ListCompaniesDto) {
    return this.companiesService.listBranches(id, query);
  }

  @Get(":id/branches/:branchId/screen-parameters/vendas")
  @ApiOperation({
    summary: "Consulta os parâmetros da tela de vendas da filial",
  })
  getSalesScreenParameters(
    @Param("id") id: string,
    @Param("branchId") branchId: string,
    @Query() query: ListCompaniesDto,
  ) {
    return this.companiesService.getSalesScreenParameters(id, branchId, query);
  }

  @Patch(":id/branches/:branchId/screen-parameters/vendas")
  @ApiOperation({
    summary: "Atualiza os parâmetros da tela de vendas da filial",
  })
  updateSalesScreenParameters(
    @Param("id") id: string,
    @Param("branchId") branchId: string,
    @Query() query: ListCompaniesDto,
    @Body() payload: SaveSalesScreenParametersDto,
  ) {
    return this.companiesService.updateSalesScreenParameters(
      id,
      branchId,
      query,
      payload,
    );
  }

  @Patch(":id/branches/:branchId")
  @ApiOperation({
    summary: "Atualiza os parâmetros operacionais de estoque da filial",
  })
  updateBranch(
    @Param("id") id: string,
    @Param("branchId") branchId: string,
    @Query() query: ListCompaniesDto,
    @Body() payload: SaveCompanyBranchDto,
  ) {
    return this.companiesService.updateBranch(id, branchId, query, payload);
  }
}
