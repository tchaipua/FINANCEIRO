import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ReceivablesService } from "../application/receivables.service";
import {
  ExistingBusinessKeysDto,
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

  @Get("installments")
  @ApiOperation({
    summary: "Lista parcelas a receber do core financeiro",
  })
  listInstallments(@Query() query: ListReceivableInstallmentsDto) {
    return this.receivablesService.listInstallments(query);
  }
}
