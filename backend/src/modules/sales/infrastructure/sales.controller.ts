import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SalesService } from "../application/sales.service";
import {
  CancelSaleDto,
  CheckSalePixStatusDto,
  CreateSaleReturnDto,
  CreateSaleDto,
  GetSaleDto,
  IssueSalePixQrDto,
  ListSalesDto,
} from "../application/dto/sales.dto";

@ApiTags("Sales")
@Controller("sales")
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @ApiOperation({
    summary: "Lista as vendas registradas para a empresa financeira informada",
  })
  list(@Query() query: ListSalesDto) {
    return this.salesService.list(query);
  }

  @Get(":saleId")
  @ApiOperation({
    summary: "Carrega o detalhe da venda informada",
  })
  get(@Param("saleId") saleId: string, @Query() query: GetSaleDto) {
    return this.salesService.get(saleId, query);
  }

  @Get(":saleId/return-context")
  @ApiOperation({
    summary: "Carrega a venda com quantidades disponíveis para devolução",
  })
  getReturnContext(@Param("saleId") saleId: string, @Query() query: GetSaleDto) {
    return this.salesService.getReturnContext(saleId, query);
  }

  @Post()
  @ApiOperation({
    summary: "Confirma uma venda com baixa de estoque, caixa e recebíveis",
  })
  create(@Body() payload: CreateSaleDto) {
    return this.salesService.create(payload);
  }

  @Post(":saleId/pix-qrcode")
  @ApiOperation({
    summary: "Emite a cobrança PIX Sicoob da parcela PIX de uma venda",
  })
  issuePixQr(
    @Param("saleId") saleId: string,
    @Body() payload: IssueSalePixQrDto,
  ) {
    return this.salesService.issuePixQr(saleId, payload);
  }

  @Post(":saleId/pix-qrcode/status")
  @ApiOperation({ summary: "Consulta e baixa o PIX Sicoob recebido para a venda" })
  checkPixStatus(@Param("saleId") saleId: string, @Body() payload: CheckSalePixStatusDto) {
    return this.salesService.checkPixStatus(saleId, payload);
  }

  @Post(":saleId/pix-qrcode/cancel")
  @ApiOperation({ summary: "Cancela a cobrança PIX Sicoob e a venda pendente" })
  cancelPix(@Param("saleId") saleId: string, @Body() payload: CancelSaleDto) {
    return this.salesService.cancelPix(saleId, payload);
  }

  @Post(":saleId/cancel")
  @ApiOperation({
    summary: "Cancela uma venda com estorno de caixa, estoque e recebíveis",
  })
  cancel(@Param("saleId") saleId: string, @Body() payload: CancelSaleDto) {
    return this.salesService.cancel(saleId, payload);
  }

  @Post(":saleId/returns")
  @ApiOperation({
    summary: "Registra devolução de mercadorias com crédito para o cliente",
  })
  createReturn(@Param("saleId") saleId: string, @Body() payload: CreateSaleReturnDto) {
    return this.salesService.createReturn(saleId, payload);
  }
}
