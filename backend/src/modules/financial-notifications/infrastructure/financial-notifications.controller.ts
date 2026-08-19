import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { FinancialNotificationsService } from "../application/financial-notifications.service";
import { SaveFinancialNotificationPreferencesDto, SimulateFinancialNotificationDto } from "../application/dto/financial-notifications.dto";

@ApiTags("Financial Notifications")
@Controller("financial-notifications")
export class FinancialNotificationsController {
  constructor(private readonly service: FinancialNotificationsService) {}

  @Get("events")
  @ApiOperation({ summary: "Lista os eventos financeiros configuráveis" })
  listEvents() { return this.service.listEvents(); }

  @Get("subjects/:subjectId/preferences")
  @ApiOperation({ summary: "Consulta as notificações financeiras do usuário" })
  getPreferences(@Param("subjectId") subjectId: string) {
    return this.service.getPreferences(subjectId);
  }

  @Patch("subjects/:subjectId/preferences")
  @ApiOperation({ summary: "Salva as notificações financeiras do usuário" })
  savePreferences(@Param("subjectId") subjectId: string, @Body() payload: SaveFinancialNotificationPreferencesDto) {
    return this.service.savePreferences(subjectId, payload);
  }

  @Post("simulate")
  @ApiOperation({ summary: "Simula eventos sem alterar movimentos financeiros" })
  simulate(@Body() payload: SimulateFinancialNotificationDto) {
    return this.service.simulate(payload);
  }
}
