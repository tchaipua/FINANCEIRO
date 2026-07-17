import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SuperTefService } from "../application/supertef.service";
import {
  ChangeSuperTefTerminalStatusDto,
  CreateSuperTefPaymentDto,
  ListSuperTefAuditDto,
  ListSuperTefPaymentsDto,
  SaveSuperTefCheckoutDto,
  SaveSuperTefConfigurationDto,
  SuperTefContextDto,
  SuperTefMutationContextDto,
} from "../application/dto/supertef.dto";

@ApiTags("SuperTEF")
@Controller("supertef")
export class SuperTefController {
  constructor(private readonly superTefService: SuperTefService) {}

  @Get("configuration")
  @ApiOperation({ summary: "Consulta a configuração protegida do SuperTEF" })
  getConfiguration(@Query() query: SuperTefContextDto) {
    return this.superTefService.getConfiguration(query);
  }

  @Put("configuration")
  @ApiOperation({ summary: "Grava a configuração protegida do SuperTEF" })
  saveConfiguration(@Body() payload: SaveSuperTefConfigurationDto) {
    return this.superTefService.saveConfiguration(payload);
  }

  @Post("test-connection")
  @ApiOperation({ summary: "Testa a credencial do SuperTEF sem expor o token" })
  testConnection(@Body() payload: SuperTefMutationContextDto) {
    return this.superTefService.testConnection(payload);
  }

  @Get("terminals")
  @ApiOperation({ summary: "Lista as máquinas POS sincronizadas da filial" })
  listTerminals(@Query() query: SuperTefContextDto) {
    return this.superTefService.listTerminals(query);
  }

  @Post("terminals/sync")
  @ApiOperation({ summary: "Sincroniza as máquinas POS pela API do SuperTEF" })
  syncTerminals(@Body() payload: SuperTefMutationContextDto) {
    return this.superTefService.syncTerminals(payload);
  }

  @Patch("terminals/:terminalId/status")
  @ApiOperation({ summary: "Altera a situação operacional local de uma POS" })
  changeTerminalStatus(
    @Param("terminalId") terminalId: string,
    @Body() payload: ChangeSuperTefTerminalStatusDto,
  ) {
    return this.superTefService.changeTerminalStatus(terminalId, payload);
  }

  @Get("checkouts")
  @ApiOperation({ summary: "Lista checkouts e prioridades de POS da filial" })
  listCheckouts(@Query() query: SuperTefContextDto) {
    return this.superTefService.listCheckouts(query);
  }

  @Post("checkouts")
  @ApiOperation({ summary: "Cadastra um checkout e seu roteamento de POS" })
  createCheckout(@Body() payload: SaveSuperTefCheckoutDto) {
    return this.superTefService.createCheckout(payload);
  }

  @Patch("checkouts/:checkoutId")
  @ApiOperation({ summary: "Atualiza checkout e prioridades de POS" })
  updateCheckout(
    @Param("checkoutId") checkoutId: string,
    @Body() payload: SaveSuperTefCheckoutDto,
  ) {
    return this.superTefService.updateCheckout(checkoutId, payload);
  }

  @Post("checkouts/:checkoutId/inactivate")
  @ApiOperation({ summary: "Inativa logicamente um checkout e seu roteamento" })
  inactivateCheckout(
    @Param("checkoutId") checkoutId: string,
    @Body() payload: SuperTefMutationContextDto,
  ) {
    return this.superTefService.inactivateCheckout(checkoutId, payload);
  }

  @Get("payments")
  @ApiOperation({ summary: "Lista pagamentos emitidos no SuperTEF" })
  listPayments(@Query() query: ListSuperTefPaymentsDto) {
    return this.superTefService.listPayments(query);
  }

  @Post("payments")
  @ApiOperation({
    summary: "Solicita pagamento de débito ou crédito no SuperTEF",
  })
  createPayment(@Body() payload: CreateSuperTefPaymentDto) {
    return this.superTefService.createPayment(payload);
  }

  @Post("payments/:paymentId/refresh")
  @ApiOperation({ summary: "Atualiza a situação de um pagamento SuperTEF" })
  refreshPayment(
    @Param("paymentId") paymentId: string,
    @Body() payload: SuperTefMutationContextDto,
  ) {
    return this.superTefService.refreshPayment(paymentId, payload);
  }

  @Post("payments/:paymentId/reject")
  @ApiOperation({ summary: "Rejeita uma solicitação ainda não paga no SuperTEF" })
  rejectPayment(
    @Param("paymentId") paymentId: string,
    @Body() payload: SuperTefMutationContextDto,
  ) {
    return this.superTefService.rejectPayment(paymentId, payload);
  }

  @Get("audit")
  @ApiOperation({ summary: "Lista a trilha append-only do módulo SuperTEF" })
  listAudit(@Query() query: ListSuperTefAuditDto) {
    return this.superTefService.listAudit(query);
  }
}
