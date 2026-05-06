import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PayablesService } from "../application/payables.service";
import {
  ApprovePayableInvoiceImportDto,
  GetPayableInvoiceImportDto,
  ImportInvoiceXmlDto,
  ListPayableInvoiceImportsDto,
} from "../application/dto/payables.dto";

@ApiTags("Payables")
@Controller("payables")
export class PayablesController {
  constructor(private readonly payablesService: PayablesService) {}

  @Get("invoice-imports")
  @ApiOperation({
    summary: "Lista as notas de entrada importadas do contas a pagar",
  })
  listInvoiceImports(@Query() query: ListPayableInvoiceImportsDto) {
    return this.payablesService.listInvoiceImports(query);
  }

  @Get("invoice-imports/:importId")
  @ApiOperation({
    summary: "Carrega a nota importada e sua prévia de aprovação",
  })
  getInvoiceImport(
    @Param("importId") importId: string,
    @Query() query: GetPayableInvoiceImportDto,
  ) {
    return this.payablesService.getInvoiceImport(importId, query);
  }

  @Post("invoice-imports/from-xml")
  @ApiOperation({
    summary: "Importa uma NF-e de entrada a partir do XML",
  })
  importFromXml(@Body() payload: ImportInvoiceXmlDto) {
    return this.payablesService.importFromXml(payload);
  }

  @Post("invoice-imports/:importId/approve")
  @ApiOperation({
    summary:
      "Aprova a nota importada, gera duplicatas do contas a pagar e entrada no estoque",
  })
  approveInvoiceImport(
    @Param("importId") importId: string,
    @Body() payload: ApprovePayableInvoiceImportDto,
  ) {
    return this.payablesService.approveInvoiceImport(importId, payload);
  }
}
