import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CashSessionsService } from "../application/cash-sessions.service";
import {
  CloseCurrentCashSessionDto,
  CreateCashMovementDto,
  CurrentCashSessionQueryDto,
  ListCashSessionsDto,
  OpenCashSessionDto,
  SettleCashInstallmentDto,
  SettleManualInstallmentDto,
} from "../application/dto/cash-sessions.dto";

@ApiTags("Cash Sessions")
@Controller()
export class CashSessionsController {
  constructor(private readonly cashSessionsService: CashSessionsService) {}

  @Get("cash-sessions")
  @ApiOperation({
    summary: "Lista sessões de caixa do core financeiro",
  })
  list(@Query() query: ListCashSessionsDto) {
    return this.cashSessionsService.list(query);
  }

  @Get("cash-sessions/current")
  @ApiOperation({
    summary: "Consulta o caixa atualmente aberto para um usuário",
  })
  getCurrent(@Query() query: CurrentCashSessionQueryDto) {
    return this.cashSessionsService.getCurrent(query);
  }

  @Get("cash-sessions/:sessionId")
  @ApiOperation({
    summary: "Consulta uma sessão de caixa detalhada",
  })
  getById(
    @Param("sessionId") sessionId: string,
    @Query() query: ListCashSessionsDto,
  ) {
    return this.cashSessionsService.getById(sessionId, query);
  }

  @Post("cash-sessions/open")
  @ApiOperation({
    summary: "Abre um novo caixa para o usuário na empresa informada",
  })
  open(@Body() payload: OpenCashSessionDto) {
    return this.cashSessionsService.open(payload);
  }

  @Post("cash-sessions/close-current")
  @ApiOperation({
    summary: "Fecha o caixa aberto do usuário na empresa informada",
  })
  closeCurrent(@Body() payload: CloseCurrentCashSessionDto) {
    return this.cashSessionsService.closeCurrent(payload);
  }

  @Post("cash-sessions/current/movements")
  @ApiOperation({
    summary: "Lança entrada, saída ou ajuste no caixa aberto",
  })
  createMovement(@Body() payload: CreateCashMovementDto) {
    return this.cashSessionsService.createMovement(payload);
  }

  @Post("receivables/installments/:installmentId/settle-cash")
  @ApiOperation({
    summary: "Registra baixa em dinheiro na parcela informada",
  })
  settleInstallment(
    @Param("installmentId") installmentId: string,
    @Body() payload: SettleCashInstallmentDto,
  ) {
    return this.cashSessionsService.settleInstallment(installmentId, payload);
  }

  @Post("receivables/installments/:installmentId/settle-manual")
  @ApiOperation({
    summary:
      "Registra baixa manual na parcela informada usando a forma de recebimento selecionada",
  })
  settleManualInstallment(
    @Param("installmentId") installmentId: string,
    @Body() payload: SettleManualInstallmentDto,
  ) {
    return this.cashSessionsService.settleManualInstallment(
      installmentId,
      payload,
    );
  }
}
