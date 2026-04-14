import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CompaniesService } from "../application/companies.service";
import { ListCompaniesDto } from "../application/dto/companies.dto";

@ApiTags("Companies")
@Controller("companies")
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @ApiOperation({
    summary: "Lista empresas multi-origem cadastradas no core financeiro",
  })
  list(@Query() query: ListCompaniesDto) {
    return this.companiesService.list(query);
  }
}
