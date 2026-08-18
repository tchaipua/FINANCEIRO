import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { FinanceAccessService } from "../application/finance-access.service";
import {
  CreateFinanceSystemUserDto,
  ResolveFinanceSystemPersonDto,
  SaveFinanceAccessAssignmentDto,
  SynchronizeFinanceAccessSubjectsDto,
} from "../application/dto/finance-access.dto";

@ApiTags("Finance Access")
@Controller("finance-access")
export class FinanceAccessController {
  constructor(private readonly financeAccessService: FinanceAccessService) {}

  @Get("profiles")
  @ApiOperation({ summary: "Lista os perfis financeiros disponíveis" })
  listProfiles() {
    return this.financeAccessService.listProfiles();
  }

  @Get("source-profiles")
  @ApiOperation({ summary: "Lista os perfis administrativos do sistema de origem" })
  listSourceProfiles() {
    return this.financeAccessService.listSourceProfiles();
  }

  @Post("system-users/resolve-person")
  @ApiOperation({ summary: "Localiza uma pessoa na origem pelo CPF" })
  resolvePerson(@Body() payload: ResolveFinanceSystemPersonDto) {
    return this.financeAccessService.resolvePerson(payload);
  }

  @Post("system-users")
  @ApiOperation({ summary: "Cria ou vincula um usuário do sistema pelo Financeiro" })
  createSystemUser(@Body() payload: CreateFinanceSystemUserDto) {
    return this.financeAccessService.createSystemUser(payload);
  }

  @Get("subjects")
  @ApiOperation({ summary: "Lista usuários projetados e seus acessos na filial" })
  listSubjects() {
    return this.financeAccessService.listSubjects();
  }

  @Post("subjects/synchronize")
  @ApiOperation({ summary: "Sincroniza usuários administrativos do sistema de origem" })
  synchronize(@Body() payload: SynchronizeFinanceAccessSubjectsDto) {
    return this.financeAccessService.synchronize(payload);
  }

  @Patch("subjects/:subjectId/assignment")
  @ApiOperation({ summary: "Configura o perfil financeiro de um usuário na filial" })
  saveAssignment(
    @Param("subjectId") subjectId: string,
    @Body() payload: SaveFinanceAccessAssignmentDto,
  ) {
    return this.financeAccessService.saveAssignment(subjectId, payload);
  }
}
