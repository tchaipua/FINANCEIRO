import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { BanksService } from "../application/banks.service";
import {
  ChangeBankStatusDto,
  GetBankDto,
  ListBanksDto,
  SaveBankDto,
} from "../application/dto/banks.dto";

@ApiTags("Banks")
@Controller("banks")
export class BanksController {
  constructor(private readonly banksService: BanksService) {}

  @Get()
  @ApiOperation({
    summary: "Lista os bancos cadastrados para a empresa financeira informada",
  })
  list(@Query() query: ListBanksDto) {
    return this.banksService.list(query);
  }

  @Get(":bankId")
  @ApiOperation({
    summary: "Carrega o cadastro completo do banco informado",
  })
  get(@Param("bankId") bankId: string, @Query() query: GetBankDto) {
    return this.banksService.get(bankId, query);
  }

  @Post()
  @ApiOperation({
    summary: "Cria um novo cadastro de banco no core financeiro",
  })
  create(@Body() payload: SaveBankDto) {
    return this.banksService.create(payload);
  }

  @Patch(":bankId")
  @ApiOperation({
    summary: "Atualiza o cadastro de banco informado",
  })
  update(@Param("bankId") bankId: string, @Body() payload: SaveBankDto) {
    return this.banksService.update(bankId, payload);
  }

  @Post(":bankId/activate")
  @ApiOperation({
    summary: "Reativa um cadastro de banco inativo",
  })
  activate(
    @Param("bankId") bankId: string,
    @Body() payload: ChangeBankStatusDto,
  ) {
    return this.banksService.activate(bankId, payload);
  }

  @Post(":bankId/inactivate")
  @ApiOperation({
    summary: "Inativa um cadastro de banco no core financeiro",
  })
  inactivate(
    @Param("bankId") bankId: string,
    @Body() payload: ChangeBankStatusDto,
  ) {
    return this.banksService.inactivate(bankId, payload);
  }
}
