import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { DashboardService } from "../application/dashboard.service";
import { DashboardOverviewQueryDto } from "../application/dto/dashboard.dto";

@ApiTags("Dashboard")
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("overview")
  @ApiOperation({
    summary: "Carrega o resumo operacional do core financeiro",
  })
  overview(@Query() query: DashboardOverviewQueryDto) {
    return this.dashboardService.overview(query);
  }
}
