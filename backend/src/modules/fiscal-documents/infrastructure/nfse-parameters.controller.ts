import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  NfseContextDto,
  SaveNfseProfileDto,
  SaveNfseServiceItemDto,
  SyncNfseMunicipalParametersDto,
} from "../application/dto/nfse.dto";
import { NfseService } from "../application/nfse/nfse.service";

@ApiTags("Fiscal Parameters - NFS-e Nacional")
@Controller("fiscal-parameters/nfse")
export class NfseParametersController {
  constructor(private readonly nfseService: NfseService) {}

  @Get("overview")
  @ApiOperation({
    summary: "Consulta configuração e prontidão da NFS-e Nacional por filial",
  })
  overview(@Query() query: NfseContextDto) {
    return this.nfseService.getOverview(query);
  }

  @Put("profile")
  @ApiOperation({ summary: "Configura o perfil NFS-e Nacional da filial" })
  saveProfile(@Body() payload: SaveNfseProfileDto) {
    return this.nfseService.saveProfile(payload);
  }

  @Put("services")
  @ApiOperation({ summary: "Cria ou atualiza um serviço fiscal da NFS-e" })
  saveService(@Body() payload: SaveNfseServiceItemDto) {
    return this.nfseService.saveServiceItem(payload);
  }

  @Delete("services/:serviceItemId")
  @ApiOperation({ summary: "Cancela logicamente um serviço fiscal da NFS-e" })
  cancelService(
    @Param("serviceItemId") serviceItemId: string,
    @Body() payload: NfseContextDto,
  ) {
    return this.nfseService.cancelServiceItem(serviceItemId, payload);
  }

  @Post("municipal-parameters/sync")
  @ApiOperation({
    summary: "Consulta e persiste parâmetros municipais oficiais da NFS-e",
  })
  syncMunicipalParameters(
    @Body() payload: SyncNfseMunicipalParametersDto,
  ) {
    return this.nfseService.syncMunicipalParameters(payload);
  }
}
