import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res, StreamableFile, UploadedFile } from "@nestjs/common";
import { ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import type { Readable } from "node:stream";
import { S3ControlService } from "../application/s3-control.service";
import { CreateS3FolderDto, DeleteS3FolderDto, DeleteS3ObjectDto, DeleteS3ObjectsBatchDto, DownloadProductImageDto, ListRecentS3ObjectsDto, ListS3ObjectNamesDto, ListS3ObjectsDto, ProductImageReadinessDto, S3FolderStatusDto, SaveS3ConfigurationDto, SearchS3ObjectsDto, S3ControlContextDto, S3UsageDto, SyncProductImageDto, UploadS3ObjectDto, ViewS3ObjectDto } from "../application/dto/s3-control.dto";

@ApiTags("Controle S3")
@Controller("s3-control")
export class S3ControlController {
  constructor(private readonly service: S3ControlService) {}

  @Get("configuration") @ApiOperation({ summary: "Consulta configuração S3 sem expor credenciais" })
  getConfiguration(@Query() query: S3ControlContextDto) { return this.service.getConfiguration(query); }

  @Get("effective-configuration") @ApiOperation({ summary: "Resolve a configuração S3 por filial, empresa e softhouse" })
  getEffectiveConfiguration() { return this.service.getEffectiveConfiguration(); }

  @Put("configuration") @ApiOperation({ summary: "Grava configuração S3 criptografada" })
  saveConfiguration(@Body() payload: SaveS3ConfigurationDto) { return this.service.saveConfiguration(payload); }

  @Get("objects") @ApiOperation({ summary: "Lista arquivos e pastas autorizados do S3" })
  listObjects(@Query() query: ListS3ObjectsDto) { return this.service.listObjects(query); }

  @Get("recent-objects") @ApiOperation({ summary: "Lista os 100 arquivos alterados mais recentemente no S3" })
  recentObjects(@Query() query: ListRecentS3ObjectsDto) { return this.service.recentObjects(query); }

  @Get("object/view") @ApiOperation({ summary: "Visualiza um arquivo S3 autorizado sem expor as credenciais" })
  async viewObject(@Query() query: ViewS3ObjectDto, @Res({ passthrough: true }) response: Response) {
    const artifact = await this.service.viewObject(query);
    response.setHeader("Content-Type", artifact.contentType);
    response.setHeader("Content-Length", String(artifact.contentLength));
    response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(artifact.fileName)}`);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(artifact.body as unknown as Readable);
  }

  @Get("objects/names") @ApiOperation({ summary: "Lista os nomes de arquivos de uma pasta S3 para retomar envios" })
  listObjectNames(@Query() query: ListS3ObjectNamesDto) { return this.service.listObjectNames(query); }

  @Get("usage") @ApiOperation({ summary: "Calcula quantidade e tamanho de arquivos por pasta S3" })
  usage(@Query() query: S3UsageDto) { return this.service.usage(query); }

  @Get("folder-status") @ApiOperation({ summary: "Verifica se uma pasta S3 está vazia antes da exclusão" })
  folderStatus(@Query() query: S3FolderStatusDto) { return this.service.folderStatus(query); }

  @Get("search") @ApiOperation({ summary: "Pesquisa arquivos por nome e extensão no S3" })
  searchObjects(@Query() query: SearchS3ObjectsDto) { return this.service.searchObjects(query); }

  @Post("folder") @ApiOperation({ summary: "Cria uma pasta no S3 com auditoria" })
  createFolder(@Body() payload: CreateS3FolderDto) { return this.service.createFolder(payload); }

  @Post("upload") @ApiConsumes("multipart/form-data") @ApiOperation({ summary: "Envia arquivo ao S3 com auditoria" })
  uploadObject(@Body() payload: UploadS3ObjectDto, @UploadedFile() file?: { originalname: string; mimetype: string; size: number; buffer: Buffer }) { return this.service.uploadObject(payload, file); }

  @Post("product-image") @ApiConsumes("multipart/form-data") @ApiOperation({ summary: "Sincroniza a imagem local do produto no S3" })
  syncProductImage(@Body() payload: SyncProductImageDto, @UploadedFile() file?: { originalname: string; mimetype: string; size: number; buffer: Buffer }) { return this.service.syncProductImage(payload, file); }

  @Get("product-image-readiness") @ApiOperation({ summary: "Valida a permissão e a pasta S3 para alterar imagem de produto" })
  productImageReadiness(@Query() query: ProductImageReadinessDto) { return this.service.productImageReadiness(query); }

  @Get("product-images/manifest") @ApiOperation({ summary: "Lista as versões S3 das imagens de produtos da filial" })
  productImagesManifest() { return this.service.productImagesManifest(); }

  @Get("product-images/:productId/download") @ApiOperation({ summary: "Baixa uma imagem de produto validada pelo catálogo S3" })
  async downloadProductImage(
    @Param("productId") productId: string,
    @Query() query: DownloadProductImageDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const artifact = await this.service.downloadProductImage(productId, query);
    response.setHeader("Content-Type", artifact.contentType);
    response.setHeader("Content-Length", String(artifact.contentLength));
    response.setHeader("Cache-Control", "no-store");
    return new StreamableFile(artifact.body as unknown as Readable);
  }

  @Delete("folder") @ApiOperation({ summary: "Exclui uma pasta S3 vazia com auditoria" })
  deleteFolder(@Body() payload: DeleteS3FolderDto) { return this.service.deleteFolder(payload); }

  @Delete("objects/batch") @ApiOperation({ summary: "Exclui arquivos S3 em lote com auditoria" })
  deleteObjectsBatch(@Body() payload: DeleteS3ObjectsBatchDto) { return this.service.deleteObjectsBatch(payload); }

  @Delete("object") @ApiOperation({ summary: "Exclui arquivo S3 com auditoria" })
  deleteObject(@Body() payload: DeleteS3ObjectDto) { return this.service.deleteObject(payload); }
}
