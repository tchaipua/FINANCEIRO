import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaService } from "../../../prisma/prisma.service";
import { normalizeText } from "../../../common/finance-core.utils";
import { decryptSecret } from "../../../common/secret-crypto.utils";
import { CreateS3FolderDto, DeleteS3FolderDto, DeleteS3ObjectDto, DeleteS3ObjectsBatchDto, ListS3ObjectsDto, S3FolderStatusDto, SaveS3ConfigurationDto, SearchS3ObjectsDto, S3ControlContextDto, S3UsageDto, UploadS3ObjectDto } from "./dto/s3-control.dto";

const MAX_USAGE_OBJECTS = 10_000;
const MAX_SEARCH_OBJECTS = 10_000;
const MAX_SEARCH_RESULTS = 2_000;

function normalizePrefix(value?: string | null) {
  return String(value || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

function normalizeEndpoint(value?: string | null) {
  const endpoint = String(value || "").trim();
  return endpoint ? (/^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`) : null;
}

@Injectable()
export class S3ControlService {
  constructor(private readonly prisma: PrismaService) {}

  private assertAdmin(userRole?: string | null) {
    if (normalizeText(userRole) !== "ADMIN") throw new ForbiddenException("O CONTROLE S3 EXIGE PERFIL ADMIN.");
  }

  private branchCode(value: unknown) {
    const branchCode = Number(value);
    if (!Number.isInteger(branchCode) || branchCode < 1) throw new BadRequestException("INFORME UMA FILIAL VÁLIDA.");
    return branchCode;
  }

  private actor(value?: string | null) { return normalizeText(value) || "ADMIN_FINANCEIRO"; }

  private async company(sourceSystem?: string, sourceTenantId?: string, required = true) {
    const normalizedSourceSystem = normalizeText(sourceSystem);
    const normalizedSourceTenantId = normalizeText(sourceTenantId);
    if (!normalizedSourceSystem || !normalizedSourceTenantId) throw new BadRequestException("INFORME O SISTEMA E O TENANT DE ORIGEM.");
    const company = await this.prisma.company.findUnique({ where: { sourceSystem_sourceTenantId: { sourceSystem: normalizedSourceSystem, sourceTenantId: normalizedSourceTenantId } } });
    if (!company || company.canceledAt) {
      if (required) throw new NotFoundException("EMPRESA FINANCEIRA NÃO ENCONTRADA.");
      return null;
    }
    return company;
  }

  private async resolveCompany(payload: SaveS3ConfigurationDto) {
    const existing = await this.company(payload.sourceSystem, payload.sourceTenantId, false);
    if (existing) return existing;
    const actor = this.actor(payload.requestedBy);
    const sourceSystem = normalizeText(payload.sourceSystem)!;
    const sourceTenantId = normalizeText(payload.sourceTenantId)!;
    return this.prisma.company.create({ data: { sourceSystem, sourceTenantId, name: normalizeText(payload.companyName) || `${sourceSystem} ${sourceTenantId}`, createdBy: actor, updatedBy: actor } });
  }

  private async configuration(context: S3ControlContextDto) {
    const company = await this.company(context.sourceSystem, context.sourceTenantId);
    if (!company) throw new NotFoundException("EMPRESA FINANCEIRA NÃO ENCONTRADA.");
    const branchCode = this.branchCode(context.sourceBranchCode);
    const configuration = await this.prisma.s3Configuration.findFirst({ where: { companyId: company.id, branchCode, canceledAt: null } });
    return { company, branchCode, configuration };
  }

  private mapConfiguration(configuration: any) {
    if (!configuration) return { configured: false };
    return {
      configured: true, id: configuration.id, active: configuration.status === "ACTIVE", endpoint: configuration.endpoint || "",
      region: configuration.region, bucket: configuration.bucket, basePrefix: configuration.basePrefix,
      capacityGb: configuration.capacityGb ?? null, imagesFolder: configuration.imagesFolder || "", sourceScope: configuration.sourceScope || "COMPANY",
      accessKeyConfigured: Boolean(configuration.accessKeyEncrypted), secretKeyConfigured: Boolean(configuration.secretKeyEncrypted),
      forcePathStyle: Boolean(configuration.forcePathStyle), updatedAt: configuration.updatedAt?.toISOString?.() || null,
    };
  }

  private relativePrefix(requested?: string | null) {
    const relative = normalizePrefix(requested);
    if (relative.split("/").some((part) => part === "." || part === "..")) throw new BadRequestException("CAMINHO S3 INVÁLIDO.");
    return relative;
  }

  private client(configuration: any) {
    return new S3Client({
      region: configuration.region,
      endpoint: configuration.endpoint || undefined,
      forcePathStyle: Boolean(configuration.forcePathStyle),
      credentials: { accessKeyId: decryptSecret(configuration.accessKeyEncrypted), secretAccessKey: decryptSecret(configuration.secretKeyEncrypted) },
    });
  }

  private async audit(companyId: string, branchCode: number, action: string, summary: string, actor: string, entityId?: string | null, metadata?: object) {
    return this.prisma.s3AuditEvent.create({ data: { companyId, branchCode, entityType: "S3_OBJECT", entityId: entityId || null, action, summary, metadataJson: metadata ? JSON.stringify(metadata) : null, performedBy: actor, createdBy: actor } });
  }

  async getConfiguration(query: S3ControlContextDto) {
    this.assertAdmin(query.userRole);
    const company = await this.company(query.sourceSystem, query.sourceTenantId, false);
    if (!company) return { configured: false };
    const branchCode = this.branchCode(query.sourceBranchCode);
    const configuration = await this.prisma.s3Configuration.findFirst({ where: { companyId: company.id, branchCode, canceledAt: null } });
    return this.mapConfiguration(configuration);
  }

  async saveConfiguration(payload: SaveS3ConfigurationDto) {
    this.assertAdmin(payload.userRole);
    throw new ForbiddenException(
      "A CONFIGURAÇÃO S3 É HERDADA DA EMPRESA OU FILIAL DO SISTEMA DE ORIGEM.",
    );
  }

  async listObjects(query: ListS3ObjectsDto) {
    this.assertAdmin(query.userRole);
    const { configuration } = await this.configuration(query);
    if (!configuration || configuration.status !== "ACTIVE") throw new BadRequestException("CONFIGURE O S3 NA EMPRESA OU FILIAL DO SISTEMA DE ORIGEM ANTES DE CONSULTAR OS ARQUIVOS.");
    const prefix = this.relativePrefix(query.prefix);
    const fullPrefix = prefix ? `${prefix}/` : undefined;
    const client = this.client(configuration);
    try {
      const [listing, usage] = await Promise.all([
        client.send(new ListObjectsV2Command({ Bucket: configuration.bucket, Prefix: fullPrefix, Delimiter: "/", MaxKeys: 100, ContinuationToken: query.continuationToken || undefined })),
        this.calculateUsage(client, configuration.bucket),
      ]);
      const currentPrefix = fullPrefix?.replace(/\/$/, "") || "";
      return {
        currentPrefix: normalizePrefix(query.prefix),
        folders: (listing.CommonPrefixes || []).map((item) => String(item.Prefix || "").replace(/\/$/, "")).filter(Boolean).map((key) => ({ name: key.slice(currentPrefix.length).replace(/^\//, ""), prefix: key })),
        files: (listing.Contents || []).filter((item) => item.Key && item.Key !== fullPrefix).map((item) => { const key = String(item.Key); return { name: key.slice(currentPrefix.length).replace(/^\//, "") || key, key, size: Number(item.Size || 0), lastModified: item.LastModified?.toISOString() || null }; }),
        nextContinuationToken: listing.NextContinuationToken || null, usage,
      };
    } catch (error: any) {
      if (error?.name === "NoSuchBucket") throw new BadRequestException("O BUCKET CONFIGURADO NÃO FOI LOCALIZADO.");
      throw new BadGatewayException("NÃO FOI POSSÍVEL CONSULTAR O S3. VERIFIQUE A CONFIGURAÇÃO.");
    }
  }

  async usage(query: S3UsageDto) {
    this.assertAdmin(query.userRole);
    const { configuration } = await this.configuration(query);
    if (!configuration || configuration.status !== "ACTIVE") throw new BadRequestException("CONFIGURE O S3 NO CADASTRO DA EMPRESA, FILIAL OU SOFTHOUSE DE ORIGEM ANTES DE CALCULAR O USO.");
    const requestedPrefix = this.relativePrefix(query.prefix);
    const client = this.client(configuration);
    try {
      if (!query.all) {
        const summary = await this.calculatePrefixUsage(client, configuration.bucket, requestedPrefix);
        return { prefix: requestedPrefix, summary };
      }
      const summaries = new Map<string, { objectCount: number; totalBytes: number }>();
      const add = (key: string, size: number) => { const current = summaries.get(key) || { objectCount: 0, totalBytes: 0 }; current.objectCount += 1; current.totalBytes += size; summaries.set(key, current); };
      let continuationToken: string | undefined;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: configuration.bucket, MaxKeys: 1000, ContinuationToken: continuationToken }));
        for (const item of page.Contents || []) {
          const key = String(item.Key || ""); if (!key || key.endsWith("/")) continue;
          const parts = key.split("/"); const size = Number(item.Size || 0); if (parts.length === 1) add("", size);
          for (let index = 1; index < parts.length; index += 1) add(parts.slice(0, index).join("/"), size);
        }
        continuationToken = page.NextContinuationToken;
      } while (continuationToken);
      return { prefix: "", summaries: Array.from(summaries.entries()).map(([prefix, summary]) => ({ prefix, ...summary })).sort((left, right) => left.prefix.localeCompare(right.prefix)) };
    } catch (error: any) {
      if (error?.name === "NoSuchBucket") throw new BadRequestException("O BUCKET CONFIGURADO NÃO FOI LOCALIZADO.");
      throw new BadGatewayException("NÃO FOI POSSÍVEL CALCULAR O USO DO S3. VERIFIQUE A CONFIGURAÇÃO.");
    }
  }

  private async calculatePrefixUsage(client: S3Client, bucket: string, prefix: string) {
    let continuationToken: string | undefined; let objectCount = 0; let totalBytes = 0;
    const fullPrefix = prefix ? `${prefix}/` : undefined;
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: fullPrefix, MaxKeys: 1000, ContinuationToken: continuationToken }));
      for (const item of page.Contents || []) { const key = String(item.Key || ""); if (!key || key.endsWith("/") || (!prefix && key.includes("/"))) continue; objectCount += 1; totalBytes += Number(item.Size || 0); }
      continuationToken = page.NextContinuationToken;
    } while (continuationToken);
    return { objectCount, totalBytes };
  }

  async searchObjects(query: SearchS3ObjectsDto) {
    this.assertAdmin(query.userRole);
    const { configuration } = await this.configuration(query);
    if (!configuration || configuration.status !== "ACTIVE") throw new BadRequestException("CONFIGURE O S3 NA EMPRESA OU FILIAL DO SISTEMA DE ORIGEM ANTES DE PESQUISAR OS ARQUIVOS.");
    const term = normalizeText(query.term) || "";
    const extension = (normalizeText(query.extension) || "").replace(/^\.+/, "");
    const prefix = this.relativePrefix(query.prefix);
    const fullPrefix = prefix ? `${prefix}/` : undefined;
    if (!term && !extension) throw new BadRequestException("INFORME O NOME OU A EXTENSÃO DO ARQUIVO PARA PESQUISAR.");

    const client = this.client(configuration);
    let continuationToken: string | undefined; let scannedObjectCount = 0; let matchedObjectCount = 0;
    const files: Array<{ name: string; key: string; size: number; lastModified: string | null }> = [];
    try {
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: configuration.bucket, Prefix: fullPrefix, MaxKeys: Math.min(1000, MAX_SEARCH_OBJECTS - scannedObjectCount), ContinuationToken: continuationToken }));
        for (const item of page.Contents || []) {
          scannedObjectCount += 1;
          const key = String(item.Key || "");
          if (!key || key.endsWith("/")) continue;
          const fileName = key.split("/").pop() || key;
          const normalizedFileName = normalizeText(fileName) || "";
          if ((term && !normalizedFileName.includes(term)) || (extension && !normalizedFileName.endsWith(`.${extension}`))) continue;
          matchedObjectCount += 1;
          if (files.length < MAX_SEARCH_RESULTS) files.push({ name: key, key, size: Number(item.Size || 0), lastModified: item.LastModified?.toISOString() || null });
        }
        continuationToken = page.NextContinuationToken;
      } while (continuationToken && scannedObjectCount < MAX_SEARCH_OBJECTS);
      return { files, matchedObjectCount, scannedObjectCount, complete: !continuationToken, resultsTruncated: matchedObjectCount > files.length };
    } catch (error: any) {
      if (error?.name === "NoSuchBucket") throw new BadRequestException("O BUCKET CONFIGURADO NÃO FOI LOCALIZADO.");
      throw new BadGatewayException("NÃO FOI POSSÍVEL PESQUISAR NO S3. VERIFIQUE A CONFIGURAÇÃO.");
    }
  }

  async createFolder(payload: CreateS3FolderDto) {
    this.assertAdmin(payload.userRole);
    const { company, branchCode, configuration } = await this.configuration(payload);
    if (!configuration || configuration.status !== "ACTIVE") throw new BadRequestException("CONFIGURAÇÃO S3 ATIVA NÃO ENCONTRADA.");
    const prefix = this.relativePrefix(payload.prefix);
    const folderName = normalizePrefix(payload.name);
    if (!folderName || folderName.includes("/") || folderName === "." || folderName === "..") throw new BadRequestException("INFORME UM NOME DE PASTA VÁLIDO.");
    const objectKey = [prefix, folderName].filter(Boolean).join("/") + "/";
    const actor = this.actor(payload.requestedBy);
    await this.audit(company.id, branchCode, "FOLDER_CREATE_REQUESTED", "SOLICITADA CRIAÇÃO DE PASTA NO S3.", actor, objectKey, { objectKey });
    try {
      await this.client(configuration).send(new PutObjectCommand({ Bucket: configuration.bucket, Key: objectKey, Body: "" }));
      await this.audit(company.id, branchCode, "FOLDER_CREATE_COMPLETED", "PASTA CRIADA NO S3.", actor, objectKey, { objectKey });
      return { success: true, key: objectKey };
    } catch {
      await this.audit(company.id, branchCode, "FOLDER_CREATE_FAILED", "FALHA AO CRIAR PASTA NO S3.", actor, objectKey, { objectKey });
      throw new BadGatewayException("NÃO FOI POSSÍVEL CRIAR A PASTA NO S3.");
    }
  }

  async uploadObject(payload: UploadS3ObjectDto, file?: { originalname: string; mimetype: string; size: number; buffer: Buffer }) {
    this.assertAdmin(payload.userRole);
    const { company, branchCode, configuration } = await this.configuration(payload);
    if (!configuration || configuration.status !== "ACTIVE") throw new BadRequestException("CONFIGURAÇÃO S3 ATIVA NÃO ENCONTRADA.");
    if (!file?.buffer?.length) throw new BadRequestException("SELECIONE UM ARQUIVO VÁLIDO PARA ENVIO.");
    const prefix = this.relativePrefix(payload.prefix);
    const fileName = String(file.originalname || "").replace(/\\/g, "/").split("/").pop()?.trim() || "";
    if (!fileName || fileName === "." || fileName === "..") throw new BadRequestException("NOME DE ARQUIVO INVÁLIDO.");
    const objectKey = [prefix, fileName].filter(Boolean).join("/");
    const actor = this.actor(payload.requestedBy);
    await this.audit(company.id, branchCode, "UPLOAD_REQUESTED", "SOLICITADO ENVIO DE ARQUIVO AO S3.", actor, objectKey, { objectKey, originalName: fileName, size: file.size });
    try {
      await this.client(configuration).send(new PutObjectCommand({ Bucket: configuration.bucket, Key: objectKey, Body: file.buffer, ContentType: file.mimetype || "application/octet-stream" }));
      await this.audit(company.id, branchCode, "UPLOAD_COMPLETED", "ARQUIVO ENVIADO AO S3.", actor, objectKey, { objectKey, originalName: fileName, size: file.size });
      return { success: true, key: objectKey };
    } catch {
      await this.audit(company.id, branchCode, "UPLOAD_FAILED", "FALHA AO ENVIAR ARQUIVO AO S3.", actor, objectKey, { objectKey, originalName: fileName, size: file.size });
      throw new BadGatewayException("NÃO FOI POSSÍVEL ENVIAR O ARQUIVO AO S3.");
    }
  }

  async deleteFolder(payload: DeleteS3FolderDto) {
    this.assertAdmin(payload.userRole);
    const { company, branchCode, configuration } = await this.configuration(payload);
    if (!configuration || configuration.status !== "ACTIVE") throw new BadRequestException("CONFIGURAÇÃO S3 ATIVA NÃO ENCONTRADA.");
    const prefix = this.relativePrefix(payload.prefix);
    if (!prefix) throw new BadRequestException("A RAIZ DO S3 NÃO PODE SER EXCLUÍDA.");
    const objectKey = `${prefix}/`;
    const actor = this.actor(payload.requestedBy);
    const client = this.client(configuration);
    const listing = await client.send(new ListObjectsV2Command({ Bucket: configuration.bucket, Prefix: objectKey, MaxKeys: 2 }));
    const hasContent = (listing.Contents || []).some((item) => String(item.Key || "") !== objectKey);
    if (hasContent || listing.IsTruncated) throw new ConflictException("A PASTA SÓ PODE SER EXCLUÍDA QUANDO ESTIVER VAZIA.");
    await this.audit(company.id, branchCode, "FOLDER_DELETE_REQUESTED", "SOLICITADA EXCLUSÃO DE PASTA S3.", actor, objectKey, { objectKey });
    try {
      await client.send(new DeleteObjectCommand({ Bucket: configuration.bucket, Key: objectKey }));
      await this.audit(company.id, branchCode, "FOLDER_DELETE_COMPLETED", "PASTA VAZIA EXCLUÍDA DO S3.", actor, objectKey, { objectKey });
      return { success: true };
    } catch {
      await this.audit(company.id, branchCode, "FOLDER_DELETE_FAILED", "FALHA AO EXCLUIR PASTA S3.", actor, objectKey, { objectKey });
      throw new BadGatewayException("NÃO FOI POSSÍVEL EXCLUIR A PASTA NO S3.");
    }
  }

  async folderStatus(query: S3FolderStatusDto) {
    this.assertAdmin(query.userRole);
    const { configuration } = await this.configuration(query);
    if (!configuration || configuration.status !== "ACTIVE") throw new BadRequestException("CONFIGURAÇÃO S3 ATIVA NÃO ENCONTRADA.");
    const prefix = this.relativePrefix(query.prefix);
    if (!prefix) throw new BadRequestException("A RAIZ DO S3 NÃO PODE SER EXCLUÍDA.");
    const objectKey = `${prefix}/`;
    const listing = await this.client(configuration).send(new ListObjectsV2Command({ Bucket: configuration.bucket, Prefix: objectKey, MaxKeys: 2 }));
    const empty = !(listing.Contents || []).some((item) => String(item.Key || "") !== objectKey) && !listing.IsTruncated;
    return { empty };
  }

  private async calculateUsage(client: S3Client, bucket: string) {
    let continuationToken: string | undefined; let objectCount = 0; let totalBytes = 0;
    do { const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: Math.min(1000, MAX_USAGE_OBJECTS - objectCount), ContinuationToken: continuationToken })); (page.Contents || []).forEach((item) => { objectCount += 1; totalBytes += Number(item.Size || 0); }); continuationToken = page.NextContinuationToken; } while (continuationToken && objectCount < MAX_USAGE_OBJECTS);
    return { objectCount, totalBytes, complete: !continuationToken };
  }

  async deleteObjectsBatch(payload: DeleteS3ObjectsBatchDto) {
    this.assertAdmin(payload.userRole);
    const { company, branchCode, configuration } = await this.configuration(payload);
    if (!configuration || configuration.status !== "ACTIVE") throw new BadRequestException("CONFIGURAÇÃO S3 ATIVA NÃO ENCONTRADA.");
    const keys = Array.from(new Set(payload.keys.map((key) => normalizePrefix(key))));
    if (!keys.length || keys.some((key) => !key || key.split("/").some((part) => part === "." || part === ".."))) throw new BadRequestException("ARQUIVO S3 INVÁLIDO.");
    const actor = this.actor(payload.requestedBy);
    await Promise.all(keys.map((key) => this.audit(company.id, branchCode, "DELETE_REQUESTED", "SOLICITADA EXCLUSÃO DE ARQUIVO S3 EM LOTE.", actor, key, { objectKey: key })));
    try {
      const response = await this.client(configuration).send(new DeleteObjectsCommand({ Bucket: configuration.bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }));
      const errors = response.Errors || [];
      const failedKeys = new Set(errors.map((item) => item.Key).filter(Boolean));
      await Promise.all(keys.filter((key) => !failedKeys.has(key)).map((key) => this.audit(company.id, branchCode, "DELETE_COMPLETED", "ARQUIVO S3 EXCLUÍDO EM LOTE.", actor, key, { objectKey: key })));
      await Promise.all(errors.map((item) => this.audit(company.id, branchCode, "DELETE_FAILED", "FALHA AO EXCLUIR ARQUIVO S3 EM LOTE.", actor, item.Key || "LOTE", { objectKey: item.Key, code: item.Code })));
      if (errors.length) throw new BadGatewayException(`NÃO FOI POSSÍVEL EXCLUIR ${errors.length} ARQUIVO(S) NO S3.`);
      return { success: true, deletedCount: keys.length };
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException("NÃO FOI POSSÍVEL EXCLUIR OS ARQUIVOS NO S3.");
    }
  }
  async deleteObject(payload: DeleteS3ObjectDto) {
    this.assertAdmin(payload.userRole);
    const { company, branchCode, configuration } = await this.configuration(payload);
    if (!configuration || configuration.status !== "ACTIVE") throw new BadRequestException("CONFIGURAÇÃO S3 ATIVA NÃO ENCONTRADA.");
    const relativeKey = normalizePrefix(payload.key);
    if (!relativeKey || relativeKey.split("/").some((part) => part === "." || part === "..")) throw new BadRequestException("ARQUIVO S3 INVÁLIDO.");
    const objectKey = relativeKey;
    const actor = this.actor(payload.requestedBy);
    await this.audit(company.id, branchCode, "DELETE_REQUESTED", "SOLICITADA EXCLUSÃO DE ARQUIVO S3.", actor, relativeKey, { objectKey });
    try {
      await this.client(configuration).send(new DeleteObjectCommand({ Bucket: configuration.bucket, Key: objectKey }));
      await this.audit(company.id, branchCode, "DELETE_COMPLETED", "ARQUIVO S3 EXCLUÍDO.", actor, relativeKey, { objectKey });
      return { success: true };
    } catch {
      await this.audit(company.id, branchCode, "DELETE_FAILED", "FALHA AO EXCLUIR ARQUIVO S3.", actor, relativeKey, { objectKey });
      throw new BadGatewayException("NÃO FOI POSSÍVEL EXCLUIR O ARQUIVO NO S3.");
    }
  }
}
