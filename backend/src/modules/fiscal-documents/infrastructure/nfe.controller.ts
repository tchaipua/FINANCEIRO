import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { Response } from "express";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CancelNfeDto,
  CorrectNfeDto,
  InutilizeNfeNumbersDto,
  IssueManualNfeDto,
  IssueSaleNfeDto,
  NfeContextDto,
  SendNfeEmailDto,
} from "../application/dto/nfe.dto";
import { NfeService } from "../application/nfe/nfe.service";

@ApiTags("Fiscal Documents - NF-e")
@Controller("fiscal-documents/nfe")
export class NfeController {
  constructor(private readonly nfeService: NfeService) {}

  @Get("status")
  @ApiOperation({ summary: "Consulta a disponibilidade da NF-e na SEFAZ-SP" })
  serviceStatus(@Query() query: NfeContextDto) {
    return this.nfeService.serviceStatus(query);
  }

  @Get("manual/overview")
  @ApiOperation({
    summary: "Carrega cadastros e emissões recentes para a NF-e manual",
  })
  manualOverview(@Query() query: NfeContextDto) {
    return this.nfeService.getManualOverview(query);
  }

  @Post("manual/issue")
  @ApiOperation({
    summary:
      "Emite NF-e manual e, após autorização, cria opcionalmente o Contas a Receber",
  })
  issueManual(@Body() payload: IssueManualNfeDto) {
    return this.nfeService.issueManual(payload);
  }

  @Get("sales/:saleId")
  @ApiOperation({ summary: "Consulta a NF-e modelo 55 vinculada à venda" })
  getSaleDocument(
    @Param("saleId") saleId: string,
    @Query() query: NfeContextDto,
  ) {
    return this.nfeService.getSaleDocument(saleId, query);
  }

  @Post("sales/:saleId/issue")
  @ApiOperation({
    summary: "Emite ou reprocessa de forma idempotente a NF-e da venda",
  })
  issueSale(
    @Param("saleId") saleId: string,
    @Body() payload: IssueSaleNfeDto,
  ) {
    return this.nfeService.issueSale(saleId, payload);
  }

  @Post("documents/:documentId/email")
  @ApiOperation({
    summary: "Envia ou reenvia o DANFE e o XML autorizado por e-mail",
  })
  sendDocumentEmail(
    @Param("documentId") documentId: string,
    @Body() payload: SendNfeEmailDto,
  ) {
    return this.nfeService.sendDocumentEmail(documentId, payload);
  }

  @Post("sales/:saleId/preview")
  @ApiOperation({
    summary: "Monta a prévia XML da NF-e sem consumir numeração ou transmitir",
  })
  previewSale(
    @Param("saleId") saleId: string,
    @Body() payload: IssueSaleNfeDto,
  ) {
    return this.nfeService.previewSale(saleId, payload);
  }

  @Post("documents/:documentId/cancel")
  @ApiOperation({ summary: "Solicita cancelamento da NF-e na SEFAZ-SP" })
  cancelDocument(
    @Param("documentId") documentId: string,
    @Body() payload: CancelNfeDto,
  ) {
    return this.nfeService.cancelDocument(documentId, payload);
  }

  @Post("documents/:documentId/correction")
  @ApiOperation({ summary: "Emite Carta de Correção da NF-e" })
  correctDocument(
    @Param("documentId") documentId: string,
    @Body() payload: CorrectNfeDto,
  ) {
    return this.nfeService.correctDocument(documentId, payload);
  }

  @Post("inutilizations")
  @ApiOperation({ summary: "Inutiliza uma faixa de numeração NF-e" })
  inutilizeNumbers(@Body() payload: InutilizeNfeNumbersDto) {
    return this.nfeService.inutilizeNumbers(payload);
  }

  @Get("documents/:documentId/danfe")
  @ApiOperation({ summary: "Baixa o DANFE armazenado da NF-e" })
  async downloadDanfe(
    @Param("documentId") documentId: string,
    @Query() query: NfeContextDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const artifact = await this.nfeService.getArtifact(
      documentId,
      query,
      "danfe",
    );
    response.setHeader("Content-Type", artifact.contentType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${artifact.fileName}"`,
    );
    return new StreamableFile(artifact.body);
  }

  @Get("documents/:documentId/xml")
  @ApiOperation({ summary: "Baixa o XML processado da NF-e" })
  async downloadXml(
    @Param("documentId") documentId: string,
    @Query() query: NfeContextDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const artifact = await this.nfeService.getArtifact(
      documentId,
      query,
      "xml",
    );
    response.setHeader("Content-Type", artifact.contentType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${artifact.fileName}"`,
    );
    return new StreamableFile(artifact.body);
  }
}
