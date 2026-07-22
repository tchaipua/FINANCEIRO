import { Body, Controller, Delete, Get, Post, Put, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { S3ControlService } from "../application/s3-control.service";
import { CreateS3FolderDto, DeleteS3FolderDto, DeleteS3ObjectDto, DeleteS3ObjectsBatchDto, ListS3ObjectsDto, S3FolderStatusDto, SaveS3ConfigurationDto, SearchS3ObjectsDto, S3ControlContextDto, S3UsageDto, UploadS3ObjectDto } from "../application/dto/s3-control.dto";

@ApiTags("Controle S3")
@Controller("s3-control")
export class S3ControlController {
  constructor(private readonly service: S3ControlService) {}

  @Get("configuration") @ApiOperation({ summary: "Consulta configuração S3 sem expor credenciais" })
  getConfiguration(@Query() query: S3ControlContextDto) { return this.service.getConfiguration(query); }

  @Put("configuration") @ApiOperation({ summary: "Grava configuração S3 criptografada" })
  saveConfiguration(@Body() payload: SaveS3ConfigurationDto) { return this.service.saveConfiguration(payload); }

  @Get("objects") @ApiOperation({ summary: "Lista arquivos e pastas autorizados do S3" })
  listObjects(@Query() query: ListS3ObjectsDto) { return this.service.listObjects(query); }

  @Get("usage") @ApiOperation({ summary: "Calcula quantidade e tamanho de arquivos por pasta S3" })
  usage(@Query() query: S3UsageDto) { return this.service.usage(query); }

  @Get("folder-status") @ApiOperation({ summary: "Verifica se uma pasta S3 está vazia antes da exclusão" })
  folderStatus(@Query() query: S3FolderStatusDto) { return this.service.folderStatus(query); }

  @Get("search") @ApiOperation({ summary: "Pesquisa arquivos por nome e extensão no S3" })
  searchObjects(@Query() query: SearchS3ObjectsDto) { return this.service.searchObjects(query); }

  @Post("folder") @ApiOperation({ summary: "Cria uma pasta no S3 com auditoria" })
  createFolder(@Body() payload: CreateS3FolderDto) { return this.service.createFolder(payload); }

  @Post("upload") @ApiConsumes("multipart/form-data") @ApiOperation({ summary: "Envia arquivo ao S3 com auditoria" })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 100 * 1024 * 1024 } }))
  uploadObject(@Body() payload: UploadS3ObjectDto, @UploadedFile() file?: { originalname: string; mimetype: string; size: number; buffer: Buffer }) { return this.service.uploadObject(payload, file); }

  @Delete("folder") @ApiOperation({ summary: "Exclui uma pasta S3 vazia com auditoria" })
  deleteFolder(@Body() payload: DeleteS3FolderDto) { return this.service.deleteFolder(payload); }

  @Delete("objects/batch") @ApiOperation({ summary: "Exclui arquivos S3 em lote com auditoria" })
  deleteObjectsBatch(@Body() payload: DeleteS3ObjectsBatchDto) { return this.service.deleteObjectsBatch(payload); }

  @Delete("object") @ApiOperation({ summary: "Exclui arquivo S3 com auditoria" })
  deleteObject(@Body() payload: DeleteS3ObjectDto) { return this.service.deleteObject(payload); }
}
