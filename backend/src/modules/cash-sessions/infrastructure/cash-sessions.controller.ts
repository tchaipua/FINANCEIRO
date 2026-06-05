import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CashSessionsService } from "../application/cash-sessions.service";
import {
  CloseCurrentCashSessionDto,
  CreateCustomerCreditDto,
  CreateCashMovementDto,
  CurrentCashSessionQueryDto,
  ListInstallmentSettlementHistoryDto,
  ListCustomerCreditsDto,
  ListCashSessionsDto,
  OpenCashSessionDto,
  ReverseSettlementGroupDto,
  ReverseManualSettlementDto,
  SettleCashInstallmentDto,
  SettleManualInstallmentDto,
} from "../application/dto/cash-sessions.dto";

@ApiTags("Cash Sessions")
@Controller()
export class CashSessionsController {
  constructor(private readonly cashSessionsService: CashSessionsService) {}

  @Get("customer-credits")
  @ApiOperation({
    summary: "Lista créditos de clientes no contas a receber",
  })
  listCustomerCredits(@Query() query: ListCustomerCreditsDto) {
    return this.cashSessionsService.listCustomerCredits(query);
  }

  @Post("customer-credits")
  @ApiOperation({
    summary: "Lança crédito manual para cliente no caixa aberto",
  })
  createCustomerCredit(@Body() payload: CreateCustomerCreditDto) {
    return this.cashSessionsService.createCustomerCredit(payload);
  }

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

  @Get("receivables/settlements")
  @ApiOperation({
    summary: "Lista histórico de baixas de parcelas a receber",
  })
  listSettlementHistory(@Query() query: ListInstallmentSettlementHistoryDto) {
    return this.cashSessionsService.listSettlementHistory(query);
  }

  @Post("receivables/settlements/:settlementGroupId/reverse")
  @ApiOperation({
    summary: "Estorna uma baixa ou grupo de baixas de parcelas a receber",
  })
  reverseSettlementGroup(
    @Param("settlementGroupId") settlementGroupId: string,
    @Body() payload: ReverseSettlementGroupDto,
  ) {
    return this.cashSessionsService.reverseSettlementGroup(
      settlementGroupId,
      payload,
    );
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

  @Post("receivables/installments/:installmentId/reverse-latest-settlement")
  @ApiOperation({
    summary: "Estorna a última baixa ativa da parcela informada",
  })
  reverseLatestSettlement(
    @Param("installmentId") installmentId: string,
    @Body() payload: ReverseManualSettlementDto,
  ) {
    return this.cashSessionsService.reverseLatestSettlement(
      installmentId,
      payload,
    );
  }
}
