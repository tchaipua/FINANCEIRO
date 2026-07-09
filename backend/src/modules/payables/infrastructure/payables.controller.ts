import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PayablesService } from "../application/payables.service";
import {
  ApprovePayableInvoiceImportDto,
  CancelPayableInvoiceImportDto,
  GetPayableInvoiceImportDto,
  ImportInvoiceXmlDto,
  ListPayableInvoiceImportsDto,
  ListPayableSuppliersDto,
  UpdatePayableInvoiceImportItemApprovalDraftDto,
  UpdatePayableInvoiceImportInstallmentsDto,
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

  @Get("suppliers")
  @ApiOperation({
    summary: "Lista os fornecedores do contas a pagar",
  })
  listSuppliers(@Query() query: ListPayableSuppliersDto) {
    return this.payablesService.listSuppliers(query);
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

  @Patch("invoice-imports/:importId/installments")
  @ApiOperation({
    summary: "Atualiza as parcelas da nota importada antes da aprovação",
  })
  updateInvoiceImportInstallments(
    @Param("importId") importId: string,
    @Body() payload: UpdatePayableInvoiceImportInstallmentsDto,
  ) {
    return this.payablesService.updateInvoiceImportInstallments(importId, payload);
  }

  @Patch("invoice-imports/:importId/items/:itemId/approval-draft")
  @ApiOperation({
    summary:
      "Salva a conferência do produto do item importado sem criar estoque",
  })
  updateInvoiceImportItemApprovalDraft(
    @Param("importId") importId: string,
    @Param("itemId") itemId: string,
    @Body() payload: UpdatePayableInvoiceImportItemApprovalDraftDto,
  ) {
    return this.payablesService.updateInvoiceImportItemApprovalDraft(
      importId,
      itemId,
      payload,
    );
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

  @Post("invoice-imports/:importId/cancel")
  @ApiOperation({
    summary: "Cancela logicamente uma nota importada pendente de aprovação",
  })
  cancelInvoiceImport(
    @Param("importId") importId: string,
    @Body() payload: CancelPayableInvoiceImportDto,
  ) {
    return this.payablesService.cancelInvoiceImport(importId, payload);
  }
}
