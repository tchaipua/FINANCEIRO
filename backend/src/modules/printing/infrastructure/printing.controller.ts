import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CreateBusinessPrintJobDto,
  CreatePrintTemplateDto,
  CreatePrintTemplateVersionDto,
  ExportPrintPackageDto,
  ImportPrintPackageDto,
  ListPrintJobsDto,
  PreviewPrintTemplateDto,
  PrintingScopeDto,
  SavePrintBindingDto,
  SavePrinterProfileDto,
  UpdatePrintJobStatusDto,
  UpdatePrintTemplateDto,
  ValidatePrintPackageDto,
} from "../application/dto/printing.dto";
import { PrintingService } from "../application/printing.service";

@ApiTags("Impressão")
@Controller("printing")
export class PrintingController {
  constructor(private readonly printingService: PrintingService) {}

  @Post("bootstrap")
  @ApiOperation({ summary: "Cria os modelos de impressão padrão da empresa" })
  bootstrap(@Body() payload: PrintingScopeDto) {
    return this.printingService.bootstrapDefaults(payload);
  }

  @Get("templates")
  @ApiOperation({ summary: "Lista os modelos de impressão da filial" })
  listTemplates(@Query() query: PrintingScopeDto) {
    return this.printingService.listTemplates(query);
  }

  @Post("templates")
  @ApiOperation({ summary: "Cria um modelo de impressão versionado" })
  createTemplate(@Body() payload: CreatePrintTemplateDto) {
    return this.printingService.createTemplate(payload);
  }

  @Get("templates/:templateId")
  @ApiOperation({ summary: "Consulta um modelo e seu histórico de versões" })
  getTemplate(
    @Param("templateId") templateId: string,
    @Query() query: PrintingScopeDto,
  ) {
    return this.printingService.getTemplate(templateId, query);
  }

  @Patch("templates/:templateId")
  @ApiOperation({ summary: "Altera os dados cadastrais do modelo" })
  updateTemplate(
    @Param("templateId") templateId: string,
    @Body() payload: UpdatePrintTemplateDto,
  ) {
    return this.printingService.updateTemplate(templateId, payload);
  }

  @Delete("templates/:templateId")
  @ApiOperation({ summary: "Inativa logicamente um modelo de impressão" })
  cancelTemplate(
    @Param("templateId") templateId: string,
    @Body() payload: PrintingScopeDto,
  ) {
    return this.printingService.cancelTemplate(templateId, payload);
  }

  @Post("templates/:templateId/versions")
  @ApiOperation({ summary: "Grava uma nova versão de layout" })
  createVersion(
    @Param("templateId") templateId: string,
    @Body() payload: CreatePrintTemplateVersionDto,
  ) {
    return this.printingService.createVersion(templateId, payload);
  }

  @Post("templates/:templateId/versions/:versionId/publish")
  @ApiOperation({ summary: "Publica uma versão do modelo" })
  publishVersion(
    @Param("templateId") templateId: string,
    @Param("versionId") versionId: string,
    @Body() payload: PrintingScopeDto,
  ) {
    return this.printingService.publishVersion(templateId, versionId, payload);
  }

  @Post("preview")
  @ApiOperation({ summary: "Renderiza uma prévia sem criar trabalho de impressão" })
  preview(@Body() payload: PreviewPrintTemplateDto) {
    return this.printingService.preview(payload);
  }

  @Post("packages/validate")
  @ApiOperation({ summary: "Valida a integridade e renderiza a prévia de um pacote" })
  validatePackage(@Body() payload: ValidatePrintPackageDto) {
    return this.printingService.validatePackage(payload);
  }

  @Post("packages/import")
  @ApiOperation({ summary: "Importa um pacote como nova versão isolada na filial" })
  importPackage(@Body() payload: ImportPrintPackageDto) {
    return this.printingService.importPackage(payload);
  }

  @Post("templates/:templateId/export-package")
  @ApiOperation({ summary: "Exporta uma versão sem identificadores da empresa ou filial" })
  exportPackage(
    @Param("templateId") templateId: string,
    @Body() payload: ExportPrintPackageDto,
  ) {
    return this.printingService.exportTemplatePackage(templateId, payload);
  }

  @Get("printers")
  @ApiOperation({ summary: "Lista os perfis de impressora configurados" })
  listPrinters(@Query() query: PrintingScopeDto) {
    return this.printingService.listPrinterProfiles(query);
  }

  @Post("printers")
  @ApiOperation({ summary: "Cadastra ou atualiza um perfil de impressora" })
  savePrinter(@Body() payload: SavePrinterProfileDto) {
    return this.printingService.savePrinterProfile(payload);
  }

  @Get("bindings")
  @ApiOperation({ summary: "Lista os vínculos entre evento, modelo e impressora" })
  listBindings(@Query() query: PrintingScopeDto) {
    return this.printingService.listBindings(query);
  }

  @Put("bindings")
  @ApiOperation({ summary: "Configura o modelo e a impressora de um evento" })
  saveBinding(@Body() payload: SavePrintBindingDto) {
    return this.printingService.saveBinding(payload);
  }

  @Post("jobs/sales/:saleId")
  @ApiOperation({ summary: "Gera o recibo de uma venda concluída" })
  createSaleJob(
    @Param("saleId") saleId: string,
    @Body() payload: CreateBusinessPrintJobDto,
  ) {
    return this.printingService.createSaleJob(saleId, payload);
  }

  @Post("jobs/settlement-groups/:settlementGroupId")
  @ApiOperation({ summary: "Gera o recibo de um grupo de parcelas recebidas" })
  createSettlementJob(
    @Param("settlementGroupId") settlementGroupId: string,
    @Body() payload: CreateBusinessPrintJobDto,
  ) {
    return this.printingService.createSettlementGroupJob(
      settlementGroupId,
      payload,
    );
  }

  @Post("jobs/products/:productId")
  @ApiOperation({ summary: "Gera uma etiqueta usando os dados atuais do produto" })
  createProductLabelJob(
    @Param("productId") productId: string,
    @Body() payload: CreateBusinessPrintJobDto,
  ) {
    return this.printingService.createProductLabelJob(productId, payload);
  }

  @Get("jobs")
  @ApiOperation({ summary: "Lista o histórico auditável de impressões" })
  listJobs(@Query() query: ListPrintJobsDto) {
    return this.printingService.listJobs(query);
  }

  @Patch("jobs/:jobId/status")
  @ApiOperation({ summary: "Atualiza o retorno do agente local de impressão" })
  updateJobStatus(
    @Param("jobId") jobId: string,
    @Body() payload: UpdatePrintJobStatusDto,
  ) {
    return this.printingService.updateJobStatus(jobId, payload);
  }

  @Post("jobs/:jobId/reprint")
  @ApiOperation({ summary: "Gera uma reimpressão auditada" })
  reprint(
    @Param("jobId") jobId: string,
    @Body() payload: CreateBusinessPrintJobDto,
  ) {
    return this.printingService.reprint(jobId, payload);
  }
}
