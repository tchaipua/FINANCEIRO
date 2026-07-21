import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { FiscalParametersService } from "../application/fiscal-parameters.service";
import {
  NfeContextDto,
  SaveFiscalBranchDto,
  SaveFiscalBenefitCodeDto,
  SaveFiscalOperationNatureDto,
  SaveFiscalTaxRuleDto,
  SaveNfeProfileDto,
} from "../application/dto/nfe.dto";

@ApiTags("Fiscal Parameters")
@Controller("fiscal-parameters")
export class FiscalParametersController {
  constructor(
    private readonly fiscalParametersService: FiscalParametersService,
  ) {}

  @Get("overview")
  @ApiOperation({
    summary: "Consulta parâmetros e prontidão da NF-e por empresa e filial",
  })
  getOverview(@Query() query: NfeContextDto) {
    return this.fiscalParametersService.getOverview(query);
  }

  @Put("branch")
  @ApiOperation({ summary: "Atualiza a identidade fiscal da filial emitente" })
  saveBranch(@Body() payload: SaveFiscalBranchDto) {
    return this.fiscalParametersService.saveBranch(payload);
  }

  @Put("operations")
  @ApiOperation({ summary: "Cria ou atualiza uma natureza de operação fiscal" })
  saveOperation(@Body() payload: SaveFiscalOperationNatureDto) {
    return this.fiscalParametersService.saveOperation(payload);
  }

  @Delete("operations/:operationId")
  @ApiOperation({ summary: "Cancela logicamente uma natureza de operação" })
  cancelOperation(
    @Param("operationId") operationId: string,
    @Body() payload: NfeContextDto,
  ) {
    return this.fiscalParametersService.cancelParameter(
      "operation",
      operationId,
      payload,
    );
  }

  @Put("tax-rules")
  @ApiOperation({ summary: "Cria ou atualiza uma regra tributária fiscal" })
  saveTaxRule(@Body() payload: SaveFiscalTaxRuleDto) {
    return this.fiscalParametersService.saveTaxRule(payload);
  }

  @Put("benefits")
  @ApiOperation({ summary: "Cria ou atualiza um código de benefício fiscal" })
  saveBenefit(@Body() payload: SaveFiscalBenefitCodeDto) {
    return this.fiscalParametersService.saveBenefit(payload);
  }

  @Delete("benefits/:benefitId")
  @ApiOperation({ summary: "Cancela logicamente um código de benefício fiscal" })
  cancelBenefit(
    @Param("benefitId") benefitId: string,
    @Body() payload: NfeContextDto,
  ) {
    return this.fiscalParametersService.cancelParameter(
      "benefit",
      benefitId,
      payload,
    );
  }

  @Delete("tax-rules/:ruleId")
  @ApiOperation({ summary: "Cancela logicamente uma regra tributária" })
  cancelTaxRule(
    @Param("ruleId") ruleId: string,
    @Body() payload: NfeContextDto,
  ) {
    return this.fiscalParametersService.cancelParameter(
      "rule",
      ruleId,
      payload,
    );
  }

  @Put("nfe-profile")
  @ApiOperation({ summary: "Configura o perfil NF-e modelo 55 da filial" })
  saveNfeProfile(@Body() payload: SaveNfeProfileDto) {
    return this.fiscalParametersService.saveProfile(payload);
  }
}
