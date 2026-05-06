import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { FiscalCertificatesService } from "../application/fiscal-certificates.service";
import {
  ChangeFiscalCertificateStatusDto,
  GetFiscalCertificateDto,
  ListFiscalCertificatesDto,
  SaveFiscalCertificateDto,
  SyncFiscalCertificateDfeDto,
} from "../application/dto/fiscal-certificates.dto";

@ApiTags("Fiscal Certificates")
@Controller("fiscal-certificates")
export class FiscalCertificatesController {
  constructor(
    private readonly fiscalCertificatesService: FiscalCertificatesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "Lista os certificados fiscais da empresa financeira informada",
  })
  list(@Query() query: ListFiscalCertificatesDto) {
    return this.fiscalCertificatesService.list(query);
  }

  @Get(":certificateId")
  @ApiOperation({
    summary: "Carrega o certificado fiscal informado",
  })
  get(
    @Param("certificateId") certificateId: string,
    @Query() query: GetFiscalCertificateDto,
  ) {
    return this.fiscalCertificatesService.get(certificateId, query);
  }

  @Post()
  @ApiOperation({
    summary: "Cadastra um certificado fiscal A1 da empresa",
  })
  create(@Body() payload: SaveFiscalCertificateDto) {
    return this.fiscalCertificatesService.create(payload);
  }

  @Patch(":certificateId")
  @ApiOperation({
    summary: "Atualiza os dados do certificado fiscal informado",
  })
  update(
    @Param("certificateId") certificateId: string,
    @Body() payload: SaveFiscalCertificateDto,
  ) {
    return this.fiscalCertificatesService.update(certificateId, payload);
  }

  @Post(":certificateId/activate")
  @ApiOperation({
    summary: "Ativa um certificado fiscal inativo",
  })
  activate(
    @Param("certificateId") certificateId: string,
    @Body() payload: ChangeFiscalCertificateStatusDto,
  ) {
    return this.fiscalCertificatesService.activate(certificateId, payload);
  }

  @Post(":certificateId/inactivate")
  @ApiOperation({
    summary: "Inativa um certificado fiscal",
  })
  inactivate(
    @Param("certificateId") certificateId: string,
    @Body() payload: ChangeFiscalCertificateStatusDto,
  ) {
    return this.fiscalCertificatesService.inactivate(certificateId, payload);
  }

  @Post(":certificateId/set-default")
  @ApiOperation({
    summary: "Define o certificado fiscal padrão por ambiente/finalidade",
  })
  setDefault(
    @Param("certificateId") certificateId: string,
    @Body() payload: ChangeFiscalCertificateStatusDto,
  ) {
    return this.fiscalCertificatesService.setDefault(certificateId, payload);
  }

  @Post(":certificateId/sync-dfe")
  @ApiOperation({
    summary: "Consulta a SEFAZ pelo DF-e e importa notas completas no contas a pagar",
  })
  syncDfe(
    @Param("certificateId") certificateId: string,
    @Body() payload: SyncFiscalCertificateDfeDto,
  ) {
    return this.fiscalCertificatesService.syncDfe(certificateId, payload);
  }
}
