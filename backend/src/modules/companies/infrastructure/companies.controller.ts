import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CompaniesService } from "../application/companies.service";
import {
  ListCompaniesDto,
  SaveCompanyBranchDto,
  SaveSalesScreenParametersDto,
  SyncSourceIntegrationSettingsDto,
  UpdateCompanyFinancialSettingsDto,
} from "../application/dto/companies.dto";

@ApiTags("Companies")
@Controller("companies")
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  private assertIntegrationApiKey(request: Request, sourceSystem?: string) {
    const normalizedSourceSystem = String(sourceSystem || "")
      .trim()
      .toUpperCase();
    const sourcePrefix = normalizedSourceSystem
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const expected = String(
      (sourcePrefix
        ? process.env[`SOURCE_SYSTEM_${sourcePrefix}_API_KEY`]
        : "") ||
        (normalizedSourceSystem === "ESCOLA"
          ? process.env.FINANCEIRO_INTEGRATION_API_KEY
          : "") ||
        "",
    ).trim();
    const incoming = String(request.headers["x-api-key"] || "").trim();
    if (!expected || !incoming || incoming !== expected) {
      throw new UnauthorizedException("INTEGRAÇÃO FINANCEIRA NÃO AUTORIZADA.");
    }
  }

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
    @Req() request: Request,
    @Body() payload: SyncSourceIntegrationSettingsDto,
  ) {
    this.assertIntegrationApiKey(request, payload.sourceSystem);
    return this.companiesService.syncSourceIntegrationSettings(payload);
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
