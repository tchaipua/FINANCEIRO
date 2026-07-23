import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import { PrismaService } from "../../../prisma/prisma.service";
import { normalizeBranchCode } from "../../../common/branch.constants";
import { normalizeText } from "../../../common/finance-core.utils";
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
} from "./dto/printing.dto";
import {
  buildPrintReportPackage,
  validatePrintReportPackage,
} from "./print-report-package";
import { renderPrintTemplate } from "./print-template.renderer";

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "DINHEIRO",
  PIX: "PIX",
  CREDIT_CARD: "CARTÃO DE CRÉDITO",
  DEBIT_CARD: "CARTÃO DE DÉBITO",
  BANK_SLIP: "BOLETO",
  CUSTOMER_CREDIT: "CRÉDITO DO CLIENTE",
};

const DEFAULT_SALE_LAYOUT = {
  schemaVersion: 1,
  media: { type: "RECEIPT", columns: 40, widthMm: 80 },
  blocks: [
    { id: "company", type: "TEXT", value: "{{company.name}}", align: "CENTER", bold: true },
    { id: "title", type: "TEXT", value: "RECIBO DE VENDA", align: "CENTER", bold: true },
    { id: "sep-1", type: "SEPARATOR", character: "-" },
    { id: "sale", type: "FIELD", label: "VENDA ", path: "sale.saleNumber" },
    { id: "date", type: "FIELD", label: "DATA ", path: "sale.confirmedAt", format: "DATETIME" },
    { id: "customer", type: "FIELD", label: "CLIENTE ", path: "customer.name" },
    { id: "sep-2", type: "SEPARATOR", character: "-" },
    {
      id: "items",
      type: "TABLE",
      path: "items",
      columns: [
        { header: "QTD", path: "quantity", width: 5, align: "RIGHT", format: "NUMBER" },
        { header: "PRODUTO", path: "name", width: 22, align: "LEFT" },
        { header: "TOTAL", path: "total", width: 13, align: "RIGHT", format: "CURRENCY" },
      ],
    },
    { id: "sep-3", type: "SEPARATOR", character: "-" },
    { id: "subtotal", type: "TOTAL", label: "SUBTOTAL ", path: "totals.subtotal", format: "CURRENCY" },
    { id: "discount", type: "TOTAL", label: "DESCONTO ", path: "totals.discount", format: "CURRENCY" },
    { id: "total", type: "TOTAL", label: "TOTAL ", path: "totals.total", format: "CURRENCY", bold: true },
    { id: "payments-title", type: "TEXT", value: "PAGAMENTOS", align: "CENTER" },
    {
      id: "payments",
      type: "TABLE",
      path: "payments",
      showHeader: false,
      columns: [
        { path: "label", width: 25, align: "LEFT" },
        { path: "amount", width: 15, align: "RIGHT", format: "CURRENCY" },
      ],
    },
    { id: "sep-4", type: "SEPARATOR", character: "-" },
    { id: "operator", type: "FIELD", label: "OPERADOR ", path: "operator.name" },
    { id: "thanks", type: "TEXT", value: "OBRIGADO PELA PREFERÊNCIA", align: "CENTER" },
    { id: "end", type: "SPACER", lines: 3 },
  ],
};

const DEFAULT_SETTLEMENT_LAYOUT = {
  schemaVersion: 1,
  media: { type: "RECEIPT", columns: 40, widthMm: 80 },
  blocks: [
    { id: "company", type: "TEXT", value: "{{company.name}}", align: "CENTER", bold: true },
    { id: "title", type: "TEXT", value: "RECIBO DE PAGAMENTO", align: "CENTER", bold: true },
    { id: "sep-1", type: "SEPARATOR", character: "-" },
    { id: "payer", type: "FIELD", label: "PAGADOR ", path: "payer.name" },
    { id: "document", type: "FIELD", label: "DOCUMENTO ", path: "payer.document" },
    { id: "date", type: "FIELD", label: "RECEBIDO EM ", path: "settlement.settledAt", format: "DATETIME" },
    { id: "method", type: "FIELD", label: "FORMA ", path: "settlement.paymentMethodLabel" },
    { id: "sep-2", type: "SEPARATOR", character: "-" },
    {
      id: "installments",
      type: "TABLE",
      path: "installments",
      columns: [
        { header: "PARC", path: "number", width: 6, align: "LEFT" },
        { header: "DESCRIÇÃO", path: "description", width: 20, align: "LEFT" },
        { header: "RECEBIDO", path: "received", width: 14, align: "RIGHT", format: "CURRENCY" },
      ],
    },
    { id: "sep-3", type: "SEPARATOR", character: "-" },
    { id: "discount", type: "TOTAL", label: "DESCONTO ", path: "totals.discount", format: "CURRENCY" },
    { id: "interest", type: "TOTAL", label: "JUROS/MULTA ", path: "totals.addition", format: "CURRENCY" },
    { id: "total", type: "TOTAL", label: "TOTAL RECEBIDO ", path: "totals.received", format: "CURRENCY", bold: true },
    { id: "group", type: "FIELD", label: "CONTROLE ", path: "settlement.groupId" },
    { id: "operator", type: "FIELD", label: "OPERADOR ", path: "operator.name" },
    { id: "end", type: "SPACER", lines: 3 },
  ],
};

const DEFAULT_LABEL_LAYOUT = {
  schemaVersion: 1,
  media: { type: "LABEL", widthMm: 60, heightMm: 40, gapMm: 2, dpi: 203 },
  elements: [
    { id: "name", type: "TEXT", path: "product.name", xMm: 2, yMm: 2, widthMm: 56, heightMm: 9, fontSize: 10, bold: true, align: "CENTER" },
    { id: "price", type: "TEXT", path: "product.price", format: "CURRENCY", xMm: 2, yMm: 12, widthMm: 56, heightMm: 10, fontSize: 18, bold: true, align: "CENTER" },
    { id: "barcode", type: "BARCODE", path: "product.barcode", xMm: 5, yMm: 23, widthMm: 50, heightMm: 11, barcodeType: "CODE128", showText: true },
    { id: "code", type: "TEXT", value: "CÓDIGO {{product.internalCode}}", xMm: 2, yMm: 35, widthMm: 56, heightMm: 4, fontSize: 7, align: "CENTER" },
  ],
};

@Injectable()
export class PrintingService {
  constructor(private readonly prisma: PrismaService) {}

  private assertAdmin(scope: PrintingScopeDto) {
    if (normalizeText(scope.userRole) !== "ADMIN") {
      throw new ForbiddenException("A configuração de impressão exige perfil ADMIN.");
    }
  }

  private async resolveScope(scope: PrintingScopeDto) {
    const sourceSystem = normalizeText(scope.sourceSystem);
    const sourceTenantId = normalizeText(scope.sourceTenantId);
    const branchCode = normalizeBranchCode(scope.sourceBranchCode, -1);
    if (!sourceSystem || !sourceTenantId || branchCode < 1) {
      throw new BadRequestException("Contexto de empresa ou filial inválido.");
    }

    const company = await this.prisma.company.findUnique({
      where: { sourceSystem_sourceTenantId: { sourceSystem, sourceTenantId } },
    });
    if (!company || company.canceledAt) {
      throw new NotFoundException("Empresa financeira não encontrada.");
    }

    const branch = await this.prisma.companyBranch.findFirst({
      where: { companyId: company.id, branchCode, canceledAt: null, isActive: true },
    });
    if (!branch) throw new NotFoundException("Filial financeira não encontrada.");

    return { company, branch, branchCode, sourceSystem, sourceTenantId };
  }

  private async audit(params: {
    companyId: string;
    branchCode: number;
    entityType: string;
    entityId?: string | null;
    action: string;
    summary: string;
    before?: unknown;
    after?: unknown;
    metadata?: unknown;
    performedBy?: string | null;
  }) {
    await this.prisma.printAuditEvent.create({
      data: {
        companyId: params.companyId,
        branchCode: params.branchCode,
        entityType: normalizeText(params.entityType)!,
        entityId: params.entityId || null,
        action: normalizeText(params.action)!,
        summary: normalizeText(params.summary)!,
        beforeJson: params.before === undefined ? null : JSON.stringify(params.before),
        afterJson: params.after === undefined ? null : JSON.stringify(params.after),
        metadataJson: params.metadata === undefined ? null : JSON.stringify(params.metadata),
        performedBy: params.performedBy || null,
        createdBy: params.performedBy || null,
      },
    });
  }

  private parseJson<T>(value?: string | null, fallback?: T): T {
    try {
      return value ? (JSON.parse(value) as T) : (fallback as T);
    } catch {
      return fallback as T;
    }
  }

  private mapVersion(version: any) {
    return {
      ...version,
      layout: this.parseJson(version.layoutJson, {}),
      sampleData: this.parseJson(version.sampleDataJson, {}),
      layoutJson: undefined,
      sampleDataJson: undefined,
    };
  }

  async bootstrapDefaults(scope: PrintingScopeDto) {
    this.assertAdmin(scope);
    const resolved = await this.resolveScope(scope);
    const requestedBy = scope.requestedBy || "SYSTEM";
    const definitions = [
      { code: "RECIBO_VENDA", name: "RECIBO DE VENDA", documentType: "SALE_RECEIPT", mediaType: "RECEIPT", layout: DEFAULT_SALE_LAYOUT, eventType: "SALE_CONFIRMED" },
      { code: "RECIBO_PAGAMENTO_PARCELAS", name: "RECIBO DE PAGAMENTO DE PARCELAS", documentType: "INSTALLMENT_PAYMENT_RECEIPT", mediaType: "RECEIPT", layout: DEFAULT_SETTLEMENT_LAYOUT, eventType: "INSTALLMENTS_SETTLED" },
      { code: "ETIQUETA_PRODUTO", name: "ETIQUETA DE PRODUTO", documentType: "PRODUCT_LABEL", mediaType: "LABEL", layout: DEFAULT_LABEL_LAYOUT, eventType: "PRODUCT_LABEL_REQUESTED" },
    ];

    const created: any[] = [];
    for (const definition of definitions) {
      const existing = await this.prisma.printTemplate.findUnique({
        where: {
          companyId_branchCode_code: {
            companyId: resolved.company.id,
            branchCode: resolved.branchCode,
            code: definition.code,
          },
        },
      });
      if (existing && !existing.canceledAt) {
        created.push(existing);
        continue;
      }

      const template = await this.prisma.$transaction(async (tx) => {
        const saved = existing
          ? await tx.printTemplate.update({
              where: { id: existing.id },
              data: { canceledAt: null, canceledBy: null, status: "PUBLISHED", updatedBy: requestedBy },
            })
          : await tx.printTemplate.create({
              data: {
                companyId: resolved.company.id,
                branchCode: resolved.branchCode,
                code: definition.code,
                name: definition.name,
                description: "MODELO PADRÃO MSINFOR",
                documentType: definition.documentType,
                mediaType: definition.mediaType,
                status: "PUBLISHED",
                currentVersion: 1,
                createdBy: requestedBy,
                updatedBy: requestedBy,
              },
            });
        let version = await tx.printTemplateVersion.findUnique({
          where: { templateId_version: { templateId: saved.id, version: 1 } },
        });
        if (!version) {
          version = await tx.printTemplateVersion.create({
            data: {
              companyId: resolved.company.id,
              branchCode: resolved.branchCode,
              templateId: saved.id,
              version: 1,
              status: "PUBLISHED",
              layoutJson: JSON.stringify(definition.layout),
              sampleDataJson: JSON.stringify(this.sampleData(definition.documentType)),
              publishedAt: new Date(),
              publishedBy: requestedBy,
              createdBy: requestedBy,
              updatedBy: requestedBy,
            },
          });
        }
        const bindingKey = {
          companyId_branchCode_sourceSystem_eventType: {
            companyId: resolved.company.id,
            branchCode: resolved.branchCode,
            sourceSystem: resolved.sourceSystem,
            eventType: definition.eventType,
          },
        };
        const binding = await tx.printTemplateBinding.findUnique({ where: bindingKey });
        if (!binding) {
          await tx.printTemplateBinding.create({
            data: {
              companyId: resolved.company.id,
              branchCode: resolved.branchCode,
              sourceSystem: resolved.sourceSystem,
              eventType: definition.eventType,
              templateId: saved.id,
              templateVersionId: version.id,
              autoPrint: false,
              copies: 1,
              createdBy: requestedBy,
              updatedBy: requestedBy,
            },
          });
        }
        return saved;
      });
      await this.audit({
        companyId: resolved.company.id,
        branchCode: resolved.branchCode,
        entityType: "PRINT_TEMPLATE",
        entityId: template.id,
        action: "BOOTSTRAPPED",
        summary: `MODELO PADRÃO ${definition.name} CRIADO`,
        after: definition,
        performedBy: requestedBy,
      });
      created.push(template);
    }
    return { createdCount: created.length, templates: await this.listTemplates(scope) };
  }

  async listTemplates(scope: PrintingScopeDto) {
    this.assertAdmin(scope);
    const resolved = await this.resolveScope(scope);
    const templates = await this.prisma.printTemplate.findMany({
      where: { companyId: resolved.company.id, branchCode: resolved.branchCode, canceledAt: null },
      include: {
        versions: { where: { canceledAt: null }, orderBy: { version: "desc" } },
        bindings: { where: { canceledAt: null } },
      },
      orderBy: [{ documentType: "asc" }, { name: "asc" }],
    });
    return templates.map((template) => ({
      ...template,
      versions: template.versions.map((version) => this.mapVersion(version)),
    }));
  }

  async createTemplate(payload: CreatePrintTemplateDto) {
    this.assertAdmin(payload);
    const resolved = await this.resolveScope(payload);
    const requestedBy = payload.requestedBy || "ADMIN";
    const template = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.printTemplate.create({
        data: {
          companyId: resolved.company.id,
          branchCode: resolved.branchCode,
          code: normalizeText(payload.code)!,
          name: normalizeText(payload.name)!,
          description: normalizeText(payload.description) || null,
          documentType: normalizeText(payload.documentType)!,
          mediaType: normalizeText(payload.mediaType)!,
          status: "DRAFT",
          currentVersion: 1,
          createdBy: requestedBy,
          updatedBy: requestedBy,
        },
      });
      await tx.printTemplateVersion.create({
        data: {
          companyId: resolved.company.id,
          branchCode: resolved.branchCode,
          templateId: saved.id,
          version: 1,
          status: "DRAFT",
          layoutJson: JSON.stringify(payload.layout),
          sampleDataJson: payload.sampleData ? JSON.stringify(payload.sampleData) : null,
          createdBy: requestedBy,
          updatedBy: requestedBy,
        },
      });
      return saved;
    });
    await this.audit({ companyId: resolved.company.id, branchCode: resolved.branchCode, entityType: "PRINT_TEMPLATE", entityId: template.id, action: "CREATED", summary: `MODELO ${template.name} CRIADO`, after: template, performedBy: requestedBy });
    return this.getTemplate(template.id, payload);
  }

  async getTemplate(templateId: string, scope: PrintingScopeDto) {
    this.assertAdmin(scope);
    const resolved = await this.resolveScope(scope);
    const template = await this.prisma.printTemplate.findFirst({
      where: { id: templateId, companyId: resolved.company.id, branchCode: resolved.branchCode, canceledAt: null },
      include: { versions: { where: { canceledAt: null }, orderBy: { version: "desc" } }, bindings: { where: { canceledAt: null } } },
    });
    if (!template) throw new NotFoundException("Modelo de impressão não encontrado.");
    return { ...template, versions: template.versions.map((version) => this.mapVersion(version)) };
  }

  async updateTemplate(templateId: string, payload: UpdatePrintTemplateDto) {
    this.assertAdmin(payload);
    const resolved = await this.resolveScope(payload);
    const current = await this.getTemplate(templateId, payload);
    const updated = await this.prisma.printTemplate.update({
      where: { id: current.id },
      data: { name: payload.name ? normalizeText(payload.name) || undefined : undefined, description: payload.description === undefined ? undefined : normalizeText(payload.description), updatedBy: payload.requestedBy || "ADMIN" },
    });
    await this.audit({ companyId: resolved.company.id, branchCode: resolved.branchCode, entityType: "PRINT_TEMPLATE", entityId: updated.id, action: "UPDATED", summary: `MODELO ${updated.name} ATUALIZADO`, before: current, after: updated, performedBy: payload.requestedBy });
    return this.getTemplate(templateId, payload);
  }

  async createVersion(templateId: string, payload: CreatePrintTemplateVersionDto) {
    this.assertAdmin(payload);
    const resolved = await this.resolveScope(payload);
    const template = await this.getTemplate(templateId, payload);
    const nextVersion = Math.max(0, ...template.versions.map((item: any) => Number(item.version))) + 1;
    const version = await this.prisma.printTemplateVersion.create({
      data: {
        companyId: resolved.company.id,
        branchCode: resolved.branchCode,
        templateId,
        version: nextVersion,
        status: "DRAFT",
        layoutJson: JSON.stringify(payload.layout),
        sampleDataJson: payload.sampleData ? JSON.stringify(payload.sampleData) : null,
        createdBy: payload.requestedBy || "ADMIN",
        updatedBy: payload.requestedBy || "ADMIN",
      },
    });
    await this.audit({ companyId: resolved.company.id, branchCode: resolved.branchCode, entityType: "PRINT_TEMPLATE_VERSION", entityId: version.id, action: "CREATED", summary: `VERSÃO ${nextVersion} DO MODELO ${template.name} CRIADA`, after: version, performedBy: payload.requestedBy });
    return this.mapVersion(version);
  }

  async publishVersion(templateId: string, versionId: string, scope: PrintingScopeDto) {
    this.assertAdmin(scope);
    const resolved = await this.resolveScope(scope);
    const version = await this.prisma.printTemplateVersion.findFirst({ where: { id: versionId, templateId, companyId: resolved.company.id, branchCode: resolved.branchCode, canceledAt: null } });
    if (!version) throw new NotFoundException("Versão do modelo não encontrada.");
    const requestedBy = scope.requestedBy || "ADMIN";
    await this.prisma.$transaction(async (tx) => {
      await tx.printTemplateVersion.updateMany({ where: { templateId, status: "PUBLISHED", canceledAt: null }, data: { status: "ARCHIVED", updatedBy: requestedBy } });
      await tx.printTemplateVersion.update({ where: { id: version.id }, data: { status: "PUBLISHED", publishedAt: new Date(), publishedBy: requestedBy, updatedBy: requestedBy } });
      await tx.printTemplate.update({ where: { id: templateId }, data: { status: "PUBLISHED", currentVersion: version.version, updatedBy: requestedBy } });
      await tx.printTemplateBinding.updateMany({ where: { templateId, canceledAt: null }, data: { templateVersionId: version.id, updatedBy: requestedBy } });
    });
    await this.audit({ companyId: resolved.company.id, branchCode: resolved.branchCode, entityType: "PRINT_TEMPLATE_VERSION", entityId: version.id, action: "PUBLISHED", summary: `VERSÃO ${version.version} PUBLICADA`, after: version, performedBy: requestedBy });
    return this.getTemplate(templateId, scope);
  }

  async cancelTemplate(templateId: string, scope: PrintingScopeDto) {
    this.assertAdmin(scope);
    const resolved = await this.resolveScope(scope);
    const current = await this.getTemplate(templateId, scope);
    const requestedBy = scope.requestedBy || "ADMIN";
    const canceledAt = new Date();
    await this.prisma.$transaction([
      this.prisma.printTemplate.update({ where: { id: templateId }, data: { status: "INACTIVE", canceledAt, canceledBy: requestedBy, updatedBy: requestedBy } }),
      this.prisma.printTemplateBinding.updateMany({ where: { templateId, canceledAt: null }, data: { status: "INACTIVE", canceledAt, canceledBy: requestedBy, updatedBy: requestedBy } }),
    ]);
    await this.audit({ companyId: resolved.company.id, branchCode: resolved.branchCode, entityType: "PRINT_TEMPLATE", entityId: templateId, action: "CANCELED", summary: `MODELO ${current.name} INATIVADO`, before: current, performedBy: requestedBy });
    return { message: "Modelo de impressão inativado com sucesso." };
  }

  async listPrinterProfiles(scope: PrintingScopeDto) {
    this.assertAdmin(scope);
    const resolved = await this.resolveScope(scope);
    const profiles = await this.prisma.printerProfile.findMany({ where: { companyId: resolved.company.id, branchCode: resolved.branchCode, canceledAt: null }, orderBy: { name: "asc" } });
    return profiles.map((profile) => ({ ...profile, settings: this.parseJson(profile.settingsJson, {}), settingsJson: undefined }));
  }

  async savePrinterProfile(payload: SavePrinterProfileDto) {
    this.assertAdmin(payload);
    const resolved = await this.resolveScope(payload);
    const requestedBy = payload.requestedBy || "ADMIN";
    const data = {
      name: normalizeText(payload.name)!,
      printerName: payload.printerName.trim(),
      printerType: normalizeText(payload.printerType)!,
      connectionType: normalizeText(payload.connectionType) || "WINDOWS",
      language: normalizeText(payload.language)!,
      paperWidthMm: payload.paperWidthMm,
      paperHeightMm: payload.paperHeightMm ?? null,
      columns: payload.columns,
      dpi: payload.dpi,
      copies: payload.copies,
      cutterEnabled: payload.cutterEnabled,
      settingsJson: payload.settings ? JSON.stringify(payload.settings) : null,
      status: "ACTIVE",
      canceledAt: null,
      canceledBy: null,
      updatedBy: requestedBy,
    };
    const existing = payload.id ? await this.prisma.printerProfile.findFirst({ where: { id: payload.id, companyId: resolved.company.id, branchCode: resolved.branchCode } }) : null;
    const saved = existing
      ? await this.prisma.printerProfile.update({ where: { id: existing.id }, data })
      : await this.prisma.printerProfile.create({ data: { companyId: resolved.company.id, branchCode: resolved.branchCode, ...data, createdBy: requestedBy } });
    await this.audit({ companyId: resolved.company.id, branchCode: resolved.branchCode, entityType: "PRINTER_PROFILE", entityId: saved.id, action: existing ? "UPDATED" : "CREATED", summary: `IMPRESSORA ${saved.name} ${existing ? "ATUALIZADA" : "CRIADA"}`, before: existing, after: saved, performedBy: requestedBy });
    return { ...saved, settings: this.parseJson(saved.settingsJson, {}), settingsJson: undefined };
  }

  async listBindings(scope: PrintingScopeDto) {
    this.assertAdmin(scope);
    const resolved = await this.resolveScope(scope);
    return this.prisma.printTemplateBinding.findMany({
      where: { companyId: resolved.company.id, branchCode: resolved.branchCode, canceledAt: null },
      include: { template: true, templateVersion: true, printerProfile: true },
      orderBy: { eventType: "asc" },
    });
  }

  async saveBinding(payload: SavePrintBindingDto) {
    this.assertAdmin(payload);
    const resolved = await this.resolveScope(payload);
    const template = await this.prisma.printTemplate.findFirst({ where: { id: payload.templateId, companyId: resolved.company.id, branchCode: resolved.branchCode, canceledAt: null } });
    if (!template) throw new NotFoundException("Modelo de impressão não encontrado.");
    let versionId = payload.templateVersionId || null;
    if (!versionId) {
      const version = await this.prisma.printTemplateVersion.findFirst({ where: { templateId: template.id, status: "PUBLISHED", canceledAt: null }, orderBy: { version: "desc" } });
      versionId = version?.id || null;
    }
    if (!versionId) throw new BadRequestException("Publique uma versão do modelo antes de vinculá-lo.");
    if (payload.printerProfileId) {
      const printer = await this.prisma.printerProfile.findFirst({ where: { id: payload.printerProfileId, companyId: resolved.company.id, branchCode: resolved.branchCode, canceledAt: null } });
      if (!printer) throw new NotFoundException("Perfil de impressora não encontrado.");
    }
    const key = { companyId_branchCode_sourceSystem_eventType: { companyId: resolved.company.id, branchCode: resolved.branchCode, sourceSystem: resolved.sourceSystem, eventType: normalizeText(payload.eventType)! } };
    const existing = await this.prisma.printTemplateBinding.findUnique({ where: key });
    const data = { templateId: template.id, templateVersionId: versionId, printerProfileId: payload.printerProfileId || null, autoPrint: payload.autoPrint, copies: payload.copies, status: "ACTIVE", canceledAt: null, canceledBy: null, updatedBy: payload.requestedBy || "ADMIN" };
    const saved = existing
      ? await this.prisma.printTemplateBinding.update({ where: { id: existing.id }, data })
      : await this.prisma.printTemplateBinding.create({ data: { companyId: resolved.company.id, branchCode: resolved.branchCode, sourceSystem: resolved.sourceSystem, eventType: normalizeText(payload.eventType)!, ...data, createdBy: payload.requestedBy || "ADMIN" } });
    await this.audit({ companyId: resolved.company.id, branchCode: resolved.branchCode, entityType: "PRINT_BINDING", entityId: saved.id, action: existing ? "UPDATED" : "CREATED", summary: `VÍNCULO ${saved.eventType} SALVO`, before: existing, after: saved, performedBy: payload.requestedBy });
    return saved;
  }

  async preview(payload: PreviewPrintTemplateDto) {
    this.assertAdmin(payload);
    await this.resolveScope(payload);
    return renderPrintTemplate(payload.layout, payload.data);
  }

  async validatePackage(payload: ValidatePrintPackageDto) {
    this.assertAdmin(payload);
    await this.resolveScope(payload);
    return validatePrintReportPackage(payload.package);
  }

  async exportTemplatePackage(
    templateId: string,
    payload: ExportPrintPackageDto,
  ) {
    this.assertAdmin(payload);
    const resolved = await this.resolveScope(payload);
    const template = await this.getTemplate(templateId, payload);
    const version =
      template.versions.find((item: any) => item.id === payload.versionId) ||
      template.versions.find(
        (item: any) => Number(item.version) === Number(template.currentVersion),
      ) ||
      template.versions.find((item: any) => item.status === "PUBLISHED") ||
      template.versions[0];
    if (!version) {
      throw new BadRequestException("O modelo não possui uma versão exportável.");
    }

    const pkg = buildPrintReportPackage({
      code: template.code,
      name: template.name,
      description: template.description,
      documentType: template.documentType,
      mediaType: template.mediaType,
      layout: version.layout,
      sampleData: version.sampleData,
      templateVersion: version.version,
    });
    await this.audit({
      companyId: resolved.company.id,
      branchCode: resolved.branchCode,
      entityType: "PRINT_TEMPLATE",
      entityId: template.id,
      action: "PACKAGE_EXPORTED",
      summary: `PACOTE DO MODELO ${template.name} EXPORTADO`,
      metadata: {
        packageId: pkg.packageId,
        contentHash: pkg.integrity.contentHash,
        version: version.version,
      },
      performedBy: payload.requestedBy,
    });
    return pkg;
  }

  async importPackage(payload: ImportPrintPackageDto) {
    this.assertAdmin(payload);
    const resolved = await this.resolveScope(payload);
    const validation = validatePrintReportPackage(payload.package);
    const report = validation.package.report;
    const requestedBy = payload.requestedBy || "ADMIN";
    const existing = await this.prisma.printTemplate.findUnique({
      where: {
        companyId_branchCode_code: {
          companyId: resolved.company.id,
          branchCode: resolved.branchCode,
          code: report.code,
        },
      },
      include: {
        versions: {
          orderBy: { version: "desc" },
        },
      },
    });

    if (
      existing &&
      (existing.documentType !== report.documentType ||
        existing.mediaType !== report.mediaType)
    ) {
      throw new BadRequestException(
        "Já existe um modelo com este código e outro tipo de documento ou mídia.",
      );
    }

    const publish = payload.publish === true;
    const nextVersion = existing
      ? Math.max(0, ...existing.versions.map((item) => item.version)) + 1
      : 1;
    const saved = await this.prisma.$transaction(async (tx) => {
      const template = existing
        ? await tx.printTemplate.update({
            where: { id: existing.id },
            data: {
              name: report.name,
              description: report.description,
              canceledAt: null,
              canceledBy: null,
              status: publish ? "PUBLISHED" : "DRAFT",
              currentVersion: nextVersion,
              updatedBy: requestedBy,
            },
          })
        : await tx.printTemplate.create({
            data: {
              companyId: resolved.company.id,
              branchCode: resolved.branchCode,
              code: report.code,
              name: report.name,
              description: report.description,
              documentType: report.documentType,
              mediaType: report.mediaType,
              status: publish ? "PUBLISHED" : "DRAFT",
              currentVersion: nextVersion,
              createdBy: requestedBy,
              updatedBy: requestedBy,
            },
          });

      if (publish) {
        await tx.printTemplateVersion.updateMany({
          where: {
            templateId: template.id,
            status: "PUBLISHED",
            canceledAt: null,
          },
          data: { status: "ARCHIVED", updatedBy: requestedBy },
        });
      }
      const version = await tx.printTemplateVersion.create({
        data: {
          companyId: resolved.company.id,
          branchCode: resolved.branchCode,
          templateId: template.id,
          version: nextVersion,
          status: publish ? "PUBLISHED" : "DRAFT",
          layoutJson: JSON.stringify(report.layout),
          sampleDataJson: JSON.stringify(report.sampleData),
          publishedAt: publish ? new Date() : null,
          publishedBy: publish ? requestedBy : null,
          createdBy: requestedBy,
          updatedBy: requestedBy,
        },
      });
      if (publish) {
        await tx.printTemplateBinding.updateMany({
          where: { templateId: template.id, canceledAt: null },
          data: { templateVersionId: version.id, updatedBy: requestedBy },
        });
      }
      return { template, version };
    });

    await this.audit({
      companyId: resolved.company.id,
      branchCode: resolved.branchCode,
      entityType: "PRINT_TEMPLATE_VERSION",
      entityId: saved.version.id,
      action: "PACKAGE_IMPORTED",
      summary: `PACOTE ${report.name} IMPORTADO COMO VERSÃO ${nextVersion}`,
      after: {
        templateId: saved.template.id,
        versionId: saved.version.id,
        version: nextVersion,
        published: publish,
      },
      metadata: {
        packageId: validation.package.packageId,
        contentHash: validation.package.integrity.contentHash,
        source: validation.package.source,
      },
      performedBy: requestedBy,
    });

    return {
      valid: true,
      published: publish,
      importedVersion: this.mapVersion(saved.version),
      template: await this.getTemplate(saved.template.id, payload),
      preview: validation.preview,
      warnings: validation.warnings,
    };
  }

  private sampleData(documentType: string) {
    if (documentType === "PRODUCT_LABEL") return { product: { name: "PRODUTO DE EXEMPLO", price: 19.9, barcode: "7891234567890", internalCode: "123" } };
    if (documentType === "INSTALLMENT_PAYMENT_RECEIPT") return { company: { name: "EMPRESA EXEMPLO" }, payer: { name: "CLIENTE EXEMPLO", document: "000.000.000-00" }, settlement: { settledAt: new Date().toISOString(), paymentMethodLabel: "DINHEIRO", groupId: "EXEMPLO" }, installments: [{ number: "1/3", description: "MENSALIDADE", received: 250 }], totals: { discount: 0, addition: 0, received: 250 }, operator: { name: "OPERADOR" } };
    return { company: { name: "EMPRESA EXEMPLO" }, sale: { saleNumber: "V-000001", confirmedAt: new Date().toISOString() }, customer: { name: "CONSUMIDOR FINAL" }, items: [{ quantity: 1, name: "PRODUTO EXEMPLO", total: 19.9 }], totals: { subtotal: 19.9, discount: 0, total: 19.9 }, payments: [{ label: "DINHEIRO", amount: 19.9 }], operator: { name: "OPERADOR" } };
  }

  private async resolveBinding(resolved: Awaited<ReturnType<PrintingService["resolveScope"]>>, eventType: string) {
    const binding = await this.prisma.printTemplateBinding.findUnique({
      where: { companyId_branchCode_sourceSystem_eventType: { companyId: resolved.company.id, branchCode: resolved.branchCode, sourceSystem: resolved.sourceSystem, eventType } },
      include: { template: true, templateVersion: true, printerProfile: true },
    });
    if (!binding || binding.canceledAt || binding.status !== "ACTIVE" || binding.template.canceledAt) return null;
    let version = binding.templateVersion;
    if (!version || version.status !== "PUBLISHED" || version.canceledAt) {
      version = await this.prisma.printTemplateVersion.findFirst({ where: { templateId: binding.templateId, status: "PUBLISHED", canceledAt: null }, orderBy: { version: "desc" } });
    }
    if (!version) return null;
    return { binding, version };
  }

  private async persistJob(params: {
    scope: Awaited<ReturnType<PrintingService["resolveScope"]>>;
    eventType: string;
    businessEntityType: string;
    businessEntityId: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
    requestedBy?: string | null;
  }) {
    const resolvedBinding = await this.resolveBinding(params.scope, params.eventType);
    if (!resolvedBinding) return { configured: false, autoPrint: false, message: "Nenhum modelo publicado está vinculado a esta operação." };
    const { binding, version } = resolvedBinding;
    const layout = this.parseJson<Record<string, unknown>>(version.layoutJson, {});
    const rendered = renderPrintTemplate(layout, params.payload);
    const contentHash = createHash("sha256").update(rendered.serializedContent).digest("hex");
    const existing = await this.prisma.printJob.findUnique({ where: { companyId_branchCode_idempotencyKey: { companyId: params.scope.company.id, branchCode: params.scope.branchCode, idempotencyKey: params.idempotencyKey } }, include: { printerProfile: true } });
    if (existing) return { configured: true, autoPrint: binding.autoPrint, job: this.mapDispatchJob(existing, layout) };
    const job = await this.prisma.printJob.create({
      data: {
        companyId: params.scope.company.id,
        branchCode: params.scope.branchCode,
        sourceSystem: params.scope.sourceSystem,
        sourceTenantId: params.scope.sourceTenantId,
        eventType: params.eventType,
        businessEntityType: params.businessEntityType,
        businessEntityId: params.businessEntityId,
        idempotencyKey: params.idempotencyKey,
        templateId: binding.templateId,
        templateVersionId: version.id,
        printerProfileId: binding.printerProfileId,
        payloadJson: JSON.stringify(params.payload),
        renderedFormat: rendered.format,
        renderedContent: rendered.serializedContent,
        contentHash,
        copies: Math.max(1, binding.copies),
        requestedBy: params.requestedBy || null,
        createdBy: params.requestedBy || null,
        updatedBy: params.requestedBy || null,
      },
      include: { printerProfile: true },
    });
    await this.audit({ companyId: params.scope.company.id, branchCode: params.scope.branchCode, entityType: "PRINT_JOB", entityId: job.id, action: "CREATED", summary: `TRABALHO DE IMPRESSÃO ${params.eventType} CRIADO`, metadata: { businessEntityType: params.businessEntityType, businessEntityId: params.businessEntityId, contentHash }, performedBy: params.requestedBy });
    return { configured: true, autoPrint: binding.autoPrint && Boolean(job.printerProfile), job: this.mapDispatchJob(job, layout) };
  }

  private mapDispatchJob(job: any, layout?: Record<string, unknown>) {
    return {
      id: job.id,
      eventType: job.eventType,
      status: job.status,
      renderedFormat: job.renderedFormat,
      renderedContent: job.renderedContent,
      layout: layout || undefined,
      copies: job.copies,
      printer: job.printerProfile
        ? {
            id: job.printerProfile.id,
            name: job.printerProfile.name,
            printerName: job.printerProfile.printerName,
            printerType: job.printerProfile.printerType,
            connectionType: job.printerProfile.connectionType,
            language: job.printerProfile.language,
            paperWidthMm: job.printerProfile.paperWidthMm,
            paperHeightMm: job.printerProfile.paperHeightMm,
            columns: job.printerProfile.columns,
            dpi: job.printerProfile.dpi,
            cutterEnabled: job.printerProfile.cutterEnabled,
          }
        : null,
    };
  }

  async createSaleJob(saleId: string, payload: CreateBusinessPrintJobDto) {
    const scope = await this.resolveScope(payload);
    const sale = await this.prisma.sale.findFirst({ where: { id: saleId, companyId: scope.company.id, branchCode: scope.branchCode, canceledAt: null }, include: { items: { where: { canceledAt: null }, orderBy: { lineNumber: "asc" } }, payments: { where: { canceledAt: null }, orderBy: { createdAt: "asc" } } } });
    if (!sale) throw new NotFoundException("Venda não encontrada para impressão.");
    const data = {
      company: { name: scope.company.name },
      sale: { id: sale.id, saleNumber: sale.saleNumber, confirmedAt: sale.confirmedAt },
      customer: { name: sale.customerNameSnapshot || "CONSUMIDOR FINAL", document: sale.customerDocumentSnapshot || "" },
      items: sale.items.map((item) => ({ quantity: item.quantity, name: item.productNameSnapshot, code: item.productCodeSnapshot || "", unitPrice: item.unitPrice, discount: item.discountAmount, total: item.totalAmount })),
      payments: sale.payments.map((payment) => ({ method: payment.paymentMethod, label: PAYMENT_LABELS[payment.paymentMethod] || payment.paymentMethod, amount: payment.amount, dueDate: payment.dueDate })),
      totals: { subtotal: sale.subtotalAmount, discount: sale.discountAmount, total: sale.totalAmount, paid: sale.paidAmount, receivable: sale.receivableAmount },
      operator: { id: payload.requestedBy || sale.createdBy || "", name: payload.requestedBy || sale.createdBy || "OPERADOR" },
    };
    return this.persistJob({ scope, eventType: "SALE_CONFIRMED", businessEntityType: "SALE", businessEntityId: sale.id, idempotencyKey: payload.idempotencyKey || `SALE_RECEIPT:${sale.id}`, payload: data, requestedBy: payload.requestedBy });
  }

  async createSettlementGroupJob(settlementGroupId: string, payload: CreateBusinessPrintJobDto) {
    const scope = await this.resolveScope(payload);
    const settlements = await this.prisma.installmentSettlement.findMany({ where: { companyId: scope.company.id, branchCode: scope.branchCode, settlementGroupId, canceledAt: null }, include: { installment: true }, orderBy: { settledAt: "asc" } });
    if (!settlements.length) throw new NotFoundException("Grupo de baixa não encontrado para impressão.");
    const first = settlements[0];
    const data = {
      company: { name: scope.company.name },
      payer: { name: first.installment.payerNameSnapshot, document: first.installment.payerDocumentSnapshot || "" },
      settlement: { groupId: settlementGroupId, settledAt: first.settledAt, paymentMethod: first.paymentMethod, paymentMethodLabel: PAYMENT_LABELS[first.paymentMethod] || first.paymentMethod },
      installments: settlements.map((item) => ({ id: item.installmentId, number: `${item.installment.installmentNumber}/${item.installment.installmentCount}`, description: item.installment.descriptionSnapshot, dueDate: item.installment.dueDate, original: item.installment.amount, discount: item.discountAmount, interest: item.interestAmount, penalty: item.penaltyAmount, received: item.receivedAmount })),
      totals: { discount: settlements.reduce((total, item) => total + item.discountAmount, 0), addition: settlements.reduce((total, item) => total + item.interestAmount + item.penaltyAmount, 0), received: settlements.reduce((total, item) => total + item.receivedAmount, 0) },
      operator: { id: payload.requestedBy || first.requestedBy || "", name: payload.requestedBy || first.requestedBy || "OPERADOR" },
    };
    return this.persistJob({ scope, eventType: "INSTALLMENTS_SETTLED", businessEntityType: "SETTLEMENT_GROUP", businessEntityId: settlementGroupId, idempotencyKey: payload.idempotencyKey || `SETTLEMENT_RECEIPT:${settlementGroupId}`, payload: data, requestedBy: payload.requestedBy });
  }

  async createProductLabelJob(productId: string, payload: CreateBusinessPrintJobDto) {
    const scope = await this.resolveScope(payload);
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        companyId: scope.company.id,
        branchCode: scope.branchCode,
        canceledAt: null,
      },
    });
    if (!product) throw new NotFoundException("Produto não encontrado para impressão da etiqueta.");
    const data = {
      company: { name: scope.company.name },
      product: {
        id: product.id,
        name: product.name,
        internalCode: product.internalCode || "",
        sku: product.sku || "",
        barcode: product.barcode || product.gtinCode || product.internalCode || "",
        unitCode: product.unitCode,
        price: product.salePrice || 0,
      },
      operator: { id: payload.requestedBy || "", name: payload.requestedBy || "OPERADOR" },
    };
    return this.persistJob({
      scope,
      eventType: "PRODUCT_LABEL_REQUESTED",
      businessEntityType: "PRODUCT",
      businessEntityId: product.id,
      idempotencyKey: payload.idempotencyKey || `PRODUCT_LABEL:${product.id}:${randomUUID()}`,
      payload: data,
      requestedBy: payload.requestedBy,
    });
  }

  async listJobs(query: ListPrintJobsDto) {
    this.assertAdmin(query);
    const scope = await this.resolveScope(query);
    const jobs = await this.prisma.printJob.findMany({ where: { companyId: scope.company.id, branchCode: scope.branchCode, canceledAt: null, ...(query.status ? { status: normalizeText(query.status)! } : {}) }, include: { template: true, templateVersion: true, printerProfile: true }, orderBy: { requestedAt: "desc" }, take: query.limit || 50 });
    return jobs.map((job) => ({ ...job, payload: this.parseJson(job.payloadJson, {}), payloadJson: undefined, renderedContent: job.renderedFormat === "PLAIN_TEXT" ? job.renderedContent : undefined }));
  }

  async updateJobStatus(jobId: string, payload: UpdatePrintJobStatusDto) {
    const scope = await this.resolveScope(payload);
    const current = await this.prisma.printJob.findFirst({ where: { id: jobId, companyId: scope.company.id, branchCode: scope.branchCode, canceledAt: null } });
    if (!current) throw new NotFoundException("Trabalho de impressão não encontrado.");
    const status = normalizeText(payload.status)!;
    const now = new Date();
    const updated = await this.prisma.printJob.update({ where: { id: current.id }, data: { status, dispatchedAt: status === "DISPATCHED" && !current.dispatchedAt ? now : undefined, completedAt: status === "COMPLETED" || status === "FAILED" || status === "CANCELED" ? now : undefined, errorMessage: payload.errorMessage || null, localPrinterName: payload.localPrinterName || current.localPrinterName, updatedBy: payload.requestedBy || current.requestedBy } });
    await this.audit({ companyId: scope.company.id, branchCode: scope.branchCode, entityType: "PRINT_JOB", entityId: updated.id, action: status, summary: `TRABALHO DE IMPRESSÃO ${status}`, before: { status: current.status }, after: { status: updated.status, errorMessage: updated.errorMessage, localPrinterName: updated.localPrinterName }, performedBy: payload.requestedBy });
    return updated;
  }

  async reprint(jobId: string, payload: CreateBusinessPrintJobDto) {
    const scope = await this.resolveScope(payload);
    const original = await this.prisma.printJob.findFirst({ where: { id: jobId, companyId: scope.company.id, branchCode: scope.branchCode, canceledAt: null }, include: { printerProfile: true } });
    if (!original) throw new NotFoundException("Trabalho de impressão não encontrado.");
    const copy = await this.prisma.printJob.create({ data: { companyId: original.companyId, branchCode: original.branchCode, sourceSystem: original.sourceSystem, sourceTenantId: original.sourceTenantId, eventType: original.eventType, businessEntityType: original.businessEntityType, businessEntityId: original.businessEntityId, idempotencyKey: payload.idempotencyKey || `REPRINT:${original.id}:${randomUUID()}`, templateId: original.templateId, templateVersionId: original.templateVersionId, printerProfileId: original.printerProfileId, payloadJson: original.payloadJson, renderedFormat: original.renderedFormat, renderedContent: original.renderedContent, contentHash: original.contentHash, copies: original.copies, status: "PENDING", requestedBy: payload.requestedBy || null, createdBy: payload.requestedBy || null, updatedBy: payload.requestedBy || null }, include: { printerProfile: true } });
    await this.audit({ companyId: scope.company.id, branchCode: scope.branchCode, entityType: "PRINT_JOB", entityId: copy.id, action: "REPRINT_CREATED", summary: `REIMPRESSÃO DO TRABALHO ${original.id} CRIADA`, metadata: { originalJobId: original.id }, performedBy: payload.requestedBy });
    return { configured: true, autoPrint: true, job: this.mapDispatchJob(copy) };
  }
}
