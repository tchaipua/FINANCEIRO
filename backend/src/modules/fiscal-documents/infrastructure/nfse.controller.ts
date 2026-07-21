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
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import {
  IssueNfseDto,
  NfseContextDto,
  SendNfseEmailDto,
} from "../application/dto/nfse.dto";
import { NfseService } from "../application/nfse/nfse.service";

@ApiTags("Fiscal Documents - NFS-e Nacional")
@Controller("fiscal-documents/nfse")
export class NfseController {
  constructor(private readonly nfseService: NfseService) {}

  @Get("status")
  @ApiOperation({ summary: "Consulta a adesão municipal no Sistema Nacional" })
  status(@Query() query: NfseContextDto) {
    return this.nfseService.serviceStatus(query);
  }

  @Get("manual/overview")
  @ApiOperation({
    summary: "Carrega cadastros e emissões recentes para a NFS-e manual",
  })
  manualOverview(@Query() query: NfseContextDto) {
    return this.nfseService.getManualOverview(query);
  }

  @Get("documents")
  @ApiOperation({ summary: "Lista as NFS-e da empresa e filial" })
  documents(@Query() query: NfseContextDto) {
    return this.nfseService.listDocuments(query);
  }

  @Post("issue")
  @ApiOperation({
    summary: "Emite uma DPS e obtém a NFS-e Nacional de forma idempotente",
  })
  issue(@Body() payload: IssueNfseDto) {
    return this.nfseService.issue(payload);
  }

  @Post("documents/:documentId/email")
  @ApiOperation({ summary: "Envia ou reenvia XML e DANFSe por e-mail" })
  email(
    @Param("documentId") documentId: string,
    @Body() payload: SendNfseEmailDto,
  ) {
    return this.nfseService.sendDocumentEmail(documentId, payload);
  }

  @Get("documents/:documentId/xml")
  @ApiOperation({ summary: "Baixa o XML autorizado da NFS-e" })
  async xml(
    @Param("documentId") documentId: string,
    @Query() query: NfseContextDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const artifact = await this.nfseService.getArtifact(documentId, query, "xml");
    response.setHeader("Content-Type", artifact.contentType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${artifact.fileName}"`,
    );
    return new StreamableFile(artifact.body);
  }

  @Get("documents/:documentId/danfse")
  @ApiOperation({ summary: "Baixa o DANFSe oficial armazenado" })
  async danfse(
    @Param("documentId") documentId: string,
    @Query() query: NfseContextDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const artifact = await this.nfseService.getArtifact(
      documentId,
      query,
      "danfse",
    );
    response.setHeader("Content-Type", artifact.contentType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${artifact.fileName}"`,
    );
    return new StreamableFile(artifact.body);
  }
}
