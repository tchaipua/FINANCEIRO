import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ReceivablesService } from "../application/receivables.service";
import {
  ApplyBankReturnLiquidationsDto,
  AssignBankToInstallmentsDto,
  ExistingBusinessKeysDto,
  GetBankReturnImportDto,
  GetInstallmentBankSlipPdfDto,
  ImportBankReturnDto,
  IssueBankSlipsDto,
  ListBankReturnImportsDto,
  ListReceivableBatchesDto,
  ListReceivableInstallmentsDto,
  ReceivablesImportDto,
} from "../application/dto/receivables.dto";

@ApiTags("Receivables")
@Controller("receivables")
export class ReceivablesController {
  constructor(private readonly receivablesService: ReceivablesService) {}

  @Post("import")
  @ApiOperation({
    summary: "Importa títulos e parcelas a receber a partir de um sistema origem",
  })
  import(@Body() payload: ReceivablesImportDto) {
    return this.receivablesService.import(payload);
  }

  @Post("existing-business-keys")
  @ApiOperation({
    summary: "Consulta quais business keys já existem no core financeiro",
  })
  existingBusinessKeys(@Body() payload: ExistingBusinessKeysDto) {
    return this.receivablesService.existingBusinessKeys(payload);
  }

  @Get("batches")
  @ApiOperation({
    summary: "Lista lotes recebidos pelo core financeiro",
  })
  listBatches(@Query() query: ListReceivableBatchesDto) {
    return this.receivablesService.listBatches(query);
  }

  @Get("batches/:batchId")
  @ApiOperation({
    summary: "Detalha um lote financeiro com títulos e parcelas",
  })
  getBatch(
    @Param("batchId") batchId: string,
    @Query() query: ListReceivableBatchesDto,
  ) {
    return this.receivablesService.getBatch(batchId, query);
  }

  @Post("batches/:batchId/assign-bank")
  @ApiOperation({
    summary: "Vincula um banco ativo às parcelas selecionadas de um lote",
  })
  assignBankToInstallments(
    @Param("batchId") batchId: string,
    @Body() payload: AssignBankToInstallmentsDto,
  ) {
    return this.receivablesService.assignBankToInstallments(batchId, payload);
  }

  @Post("batches/:batchId/issue-bank-slips")
  @ApiOperation({
    summary: "Emite boletos para as parcelas selecionadas no banco informado",
  })
  issueBankSlips(
    @Param("batchId") batchId: string,
    @Body() payload: IssueBankSlipsDto,
  ) {
    return this.receivablesService.issueBankSlips(batchId, payload);
  }

  @Get("installments")
  @ApiOperation({
    summary: "Lista parcelas a receber do core financeiro",
  })
  listInstallments(@Query() query: ListReceivableInstallmentsDto) {
    return this.receivablesService.listInstallments(query);
  }

  @Get("installments/:installmentId/bank-slip-pdf")
  @ApiOperation({
    summary: "Carrega o PDF base64 do boleto emitido para a parcela informada",
  })
  getInstallmentBankSlipPdf(
    @Param("installmentId") installmentId: string,
    @Query() query: GetInstallmentBankSlipPdfDto,
  ) {
    return this.receivablesService.getInstallmentBankSlipPdf(
      installmentId,
      query,
    );
  }

  @Get("bank-return-imports")
  @ApiOperation({
    summary: "Lista importações de retorno bancário já registradas",
  })
  listBankReturnImports(@Query() query: ListBankReturnImportsDto) {
    return this.receivablesService.listBankReturnImports(query);
  }

  @Post("bank-return-imports")
  @ApiOperation({
    summary: "Importa movimentações de retorno bancário por período",
  })
  importBankReturns(@Body() payload: ImportBankReturnDto) {
    return this.receivablesService.importBankReturns(payload);
  }

  @Get("bank-return-imports/:importId")
  @ApiOperation({
    summary: "Detalha uma importação de retorno bancário com as parcelas vinculadas",
  })
  getBankReturnImport(
    @Param("importId") importId: string,
    @Query() query: GetBankReturnImportDto,
  ) {
    return this.receivablesService.getBankReturnImport(importId, query);
  }

  @Post("bank-return-imports/:importId/apply-liquidations")
  @ApiOperation({
    summary: "Efetiva a baixa das parcelas liquidada no retorno bancário importado",
  })
  applyBankReturnLiquidations(
    @Param("importId") importId: string,
    @Body() payload: ApplyBankReturnLiquidationsDto,
  ) {
    return this.receivablesService.applyBankReturnLiquidations(importId, payload);
  }
}
