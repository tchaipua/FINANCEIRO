import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { PrismaService } from "../../../prisma/prisma.service";
import { normalizeText } from "../../../common/finance-core.utils";
import { decryptSecret } from "../../../common/secret-crypto.utils";
import {
  getFinanceContext,
  hasAuthenticatedFinanceScope,
} from "../../../common/finance-context";
import { CreateS3FolderDto, DeleteS3FolderDto, DeleteS3ObjectDto, DeleteS3ObjectsBatchDto, DownloadProductImageDto, ListS3ObjectsDto, ProductImageReadinessDto, S3FolderStatusDto, SaveS3ConfigurationDto, SearchS3ObjectsDto, S3ControlContextDto, S3UsageDto, SyncProductImageDto, UploadS3ObjectDto } from "./dto/s3-control.dto";

const MAX_USAGE_OBJECTS = 10_000;
const MAX_SEARCH_OBJECTS = 10_000;
const MAX_SEARCH_RESULTS = 2_000;
const MAX_PRODUCT_IMAGE_SYNC_OBJECTS = 20_000;
const PRODUCT_IMAGE_EXTENSIONS = new Set(["webp", "png", "jpg", "jpeg", "bmp"]);
const CENTRAL_SIGNATURE_VERSION = "v1";
const CENTRAL_SYSTEM_ID = "FINANCEIRO";

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

  private centralS3Cache?: {
    value: { configured: boolean; active: boolean; endpoint: string; region: string; bucket: string; basePrefix: string; capacityGb: number | null; imagesFolder: string; description: string; sourceScope: "SOFTHOUSE"; accessKeyConfigured: boolean; secretKeyConfigured: boolean; forcePathStyle: boolean };
    operational: any;
    expiresAt: number;
  };

  private assertAdmin(_userRole?: string | null) {
    if (!hasAuthenticatedFinanceScope("FINANCE_ADMIN")) throw new ForbiddenException("O CONTROLE S3 EXIGE ESCOPO FINANCE_ADMIN.");
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

  private async configuration(_context: S3ControlContextDto) {
    const resolved = await this.authenticatedConfiguration();
    const sourceScope = normalizeText(resolved.configuration?.sourceScope);
    if (resolved.configuration && (sourceScope === "BRANCH" || sourceScope === "COMPANY")) return resolved;
    return { ...resolved, configuration: await this.getCentralOperationalConfiguration() };
  }

  private async authenticatedConfiguration() {
    const context = getFinanceContext();
    if (
      !context?.authenticated ||
      !context.companyId ||
      !context.sourceBranchCode ||
      !context.sourceUserId
    ) {
      throw new ForbiddenException(
        "O CONTEXTO AUTENTICADO DO FINANCEIRO É OBRIGATÓRIO.",
      );
    }

    const company = await this.prisma.company.findUnique({
      where: { id: context.companyId },
    });
    if (!company || company.canceledAt || company.status !== "ACTIVE") {
      throw new ForbiddenException("EMPRESA FINANCEIRA NÃO AUTORIZADA.");
    }
    const branchCode = this.branchCode(context.sourceBranchCode);
    const configuration = await this.prisma.s3Configuration.findFirst({
      where: {
        companyId: context.companyId,
        branchCode,
        canceledAt: null,
      },
    });
    return {
      company,
      branchCode,
      configuration,
      actor: context.sourceUserId,
    };
  }

  private async assertProductImageMutationAllowed(
    companyId: string,
    branchCode: number,
    originScreenId?: string | null,
  ) {
    if (hasAuthenticatedFinanceScope("FINANCE_ADMIN")) return;
    if (normalizeText(originScreenId) !== "PRINCIPAL_FINANCEIRO_VENDAS_2") {
      throw new ForbiddenException("A ALTERAÇÃO DA IMAGEM DO PRODUTO NÃO ESTÁ AUTORIZADA.");
    }
    const branch = await this.prisma.companyBranch.findFirst({
      where: { companyId, branchCode, canceledAt: null, isActive: true },
      select: { allowProductImageEdit: true },
    });
    if (!branch?.allowProductImageEdit) {
      throw new ForbiddenException("A ALTERAÇÃO DA FOTO DO PRODUTO NÃO ESTÁ LIBERADA NOS PARÂMETROS DA TELA.");
    }
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

  private centralConfigurationTarget() {
    const configuredUrl = String(process.env.MSINFOR_CENTRAL_API_URL || "").trim();
    if (!configuredUrl && String(process.env.NODE_ENV || "").toLowerCase() === "production") {
      throw new ServiceUnavailableException("ENDEREÇO DA CENTRAL MSINFOR NÃO CONFIGURADO.");
    }
    try {
      const base = new URL(configuredUrl || "http://127.0.0.1:3201/api/v1");
      const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
      const target = new URL("global-settings/effective", `${base.origin}${basePath}`);
      if (target.origin !== base.origin || !target.pathname.startsWith(basePath)) {
        throw new Error("target-outside-central-base");
      }
      if (String(process.env.NODE_ENV || "").toLowerCase() === "production" && target.protocol !== "https:") {
        throw new ServiceUnavailableException("A CENTRAL MSINFOR DEVE USAR HTTPS EM PRODUÇÃO.");
      }
      return target;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException("ENDEREÇO DA CENTRAL MSINFOR INVÁLIDO.");
    }
  }

  private async getCentralConfiguration() {
    const now = Date.now();
    if (this.centralS3Cache && this.centralS3Cache.expiresAt > now) return this.centralS3Cache.value;

    const secret = String(process.env.MSINFOR_CENTRAL_SYSTEM_KEY || "").trim();
    if (Buffer.byteLength(secret, "utf8") < 32) {
      throw new ServiceUnavailableException("CREDENCIAL TÉCNICA DA CENTRAL NÃO CONFIGURADA.");
    }

    const target = this.centralConfigurationTarget();
    const timestamp = now.toString();
    const nonce = randomBytes(24).toString("base64url");
    const bodyHash = createHash("sha256").update(Buffer.alloc(0)).digest("hex");
    const signaturePayload = [
      CENTRAL_SIGNATURE_VERSION,
      CENTRAL_SYSTEM_ID,
      "GET",
      `${target.pathname}${target.search}`,
      timestamp,
      nonce,
      bodyHash,
    ].join("\n");
    const signature = createHmac("sha256", secret).update(signaturePayload).digest("hex");

    let response: Response;
    try {
      response = await fetch(target, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
        headers: {
          Accept: "application/json",
          "x-msinfor-signature-version": CENTRAL_SIGNATURE_VERSION,
          "x-msinfor-system-id": CENTRAL_SYSTEM_ID,
          "x-msinfor-timestamp": timestamp,
          "x-msinfor-nonce": nonce,
          "x-msinfor-content-sha256": bodyHash,
          "x-msinfor-signature": signature,
        },
      });
    } catch {
      throw new BadGatewayException("A CENTRAL MSINFOR ESTÁ INDISPONÍVEL.");
    }

    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || !payload) {
      throw new BadGatewayException("NÃO FOI POSSÍVEL CONSULTAR A CONFIGURAÇÃO S3 DA CENTRAL.");
    }

    const value = {
      configured: Boolean(payload.s3Enabled && payload.s3Bucket && payload.s3Region && payload.s3AccessKey && payload.s3SecretKey),
      active: Boolean(payload.s3Enabled),
      endpoint: String(payload.s3Endpoint || "").trim(),
      region: String(payload.s3Region || "").trim(),
      bucket: String(payload.s3Bucket || "").trim(),
      basePrefix: String(payload.s3BaseFolder || "").trim(),
      capacityGb: Number.isFinite(Number(payload.s3CapacityGb)) ? Number(payload.s3CapacityGb) : null,
      imagesFolder: String(payload.s3ImagesFolderName || "").trim(),
      description: String(payload.s3Description || "").trim(),
      sourceScope: "SOFTHOUSE" as const,
      accessKeyConfigured: Boolean(payload.s3AccessKey),
      secretKeyConfigured: Boolean(payload.s3SecretKey),
      forcePathStyle: Boolean(payload.s3ForcePathStyle),
    };
    this.centralS3Cache = {
      value,
      operational: {
        ...value,
        status: "ACTIVE",
        __centralAccessKey: String(payload.s3AccessKey || ""),
        __centralSecretKey: String(payload.s3SecretKey || ""),
      },
      expiresAt: now + 60_000,
    };
    return value;
  }

  private async getCentralOperationalConfiguration() {
    await this.getCentralConfiguration();
    if (!this.centralS3Cache?.operational?.configured) throw new BadRequestException("CONFIGURE O S3 NA SOFTHOUSE ANTES DE CONSULTAR OS ARQUIVOS.");
    return this.centralS3Cache.operational;
  }

  async getEffectiveConfiguration() {
    this.assertAdmin();
    const { configuration } = await this.authenticatedConfiguration();
    const sourceScope = normalizeText(configuration?.sourceScope);

    if (configuration && (sourceScope === "BRANCH" || sourceScope === "COMPANY")) {
      const centralDescription = await this.getCentralConfiguration()
        .then((central) => central.description)
        .catch(() => "");
      return { ...this.mapConfiguration(configuration), description: centralDescription };
    }

    return this.getCentralConfiguration();
  }

  private relativePrefix(requested?: string | null) {
    const relative = normalizePrefix(requested);
    if (relative.split("/").some((part) => part === "." || part === "..")) throw new BadRequestException("CAMINHO S3 INVÁLIDO.");
    return relative;
  }

  private productImageCode(product: { internalCode?: string | null; sku?: string | null; barcode?: string | null }) {
    return String(product.internalCode || product.sku || product.barcode || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "");
  }

  private imageExtension(file?: { originalname: string; mimetype: string; size: number; buffer: Buffer }) {
    const contentType = String(file?.mimetype || "").toLowerCase().split(";")[0].trim();
    const byContentType: Record<string, string> = {
      "image/webp": "webp",
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/bmp": "bmp",
    };
    const extension = byContentType[contentType];
    if (!extension) throw new BadRequestException("A IMAGEM LOCAL POSSUI UM FORMATO NÃO SUPORTADO PARA O S3.");
    return extension;
  }

  private imageContentType(key: string, contentType?: string | null) {
    const normalized = String(contentType || "").toLowerCase().split(";")[0].trim();
    if (["image/webp", "image/png", "image/jpeg", "image/bmp"].includes(normalized)) return normalized;
    const extension = key.split(".").pop()?.toLowerCase();
    return extension === "webp"
      ? "image/webp"
      : extension === "png"
        ? "image/png"
        : extension === "bmp"
          ? "image/bmp"
          : "image/jpeg";
  }

  private async productImageConfiguration() {
    this.assertAdmin();
    const { company, branchCode, configuration: configuredLocally } = await this.authenticatedConfiguration();
    const sourceScope = normalizeText(configuredLocally?.sourceScope);
    const configuration = configuredLocally && (sourceScope === "BRANCH" || sourceScope === "COMPANY")
      ? configuredLocally
      : await this.getCentralOperationalConfiguration();
    if (!configuration || configuration.status !== "ACTIVE") {
      throw new BadRequestException("CONFIGURAÇÃO S3 ATIVA NÃO ENCONTRADA.");
    }
    const imagesFolder = this.relativePrefix(configuration.imagesFolder);
    if (!imagesFolder) {
      throw new BadRequestException("INFORME A PASTA DE IMAGENS NA CONFIGURAÇÃO S3 DE ORIGEM.");
    }
    return { company, branchCode, configuration, imagesFolder };
  }

  async productImagesManifest() {
    const { company, branchCode, configuration, imagesFolder } = await this.productImageConfiguration();
    const products = await this.prisma.product.findMany({
      where: { companyId: company.id, canceledAt: null, status: "ACTIVE", branchCode: { in: [0, branchCode] } },
      select: { id: true, internalCode: true, sku: true, barcode: true },
    });
    const productsByCode = new Map<string, { id: string; code: string }>();
    for (const product of products) {
      const code = this.productImageCode(product);
      if (code && !productsByCode.has(code)) productsByCode.set(code, { id: product.id, code });
    }

    const newestObjectByCode = new Map<string, { key: string; fileName: string; lastModified: Date; size: number }>();
    let continuationToken: string | undefined;
    let scannedObjectCount = 0;
    const prefix = `${imagesFolder}/`;
    try {
      do {
        const page = await this.client(configuration).send(new ListObjectsV2Command({
          Bucket: configuration.bucket,
          Prefix: prefix,
          MaxKeys: Math.min(1000, MAX_PRODUCT_IMAGE_SYNC_OBJECTS - scannedObjectCount),
          ContinuationToken: continuationToken,
        }));
        for (const item of page.Contents || []) {
          scannedObjectCount += 1;
          const key = String(item.Key || "");
          const fileName = key.split("/").pop() || "";
          const separator = fileName.lastIndexOf(".");
          const code = separator > 0 ? normalizeText(fileName.slice(0, separator)) : "";
          const extension = separator > 0 ? fileName.slice(separator + 1).toLowerCase() : "";
          const lastModified = item.LastModified;
          if (!code || !PRODUCT_IMAGE_EXTENSIONS.has(extension) || !lastModified || !productsByCode.has(code)) continue;
          const previous = newestObjectByCode.get(code);
          if (!previous || lastModified.getTime() > previous.lastModified.getTime()) {
            newestObjectByCode.set(code, { key, fileName, lastModified, size: Number(item.Size || 0) });
          }
        }
        continuationToken = page.NextContinuationToken;
      } while (continuationToken && scannedObjectCount < MAX_PRODUCT_IMAGE_SYNC_OBJECTS);
    } catch (error: any) {
      if (error?.name === "NoSuchBucket") throw new BadRequestException("O BUCKET CONFIGURADO NÃO FOI LOCALIZADO.");
      throw new BadGatewayException("NÃO FOI POSSÍVEL CONSULTAR AS IMAGENS DO S3.");
    }

    return {
      imagesFolder,
      scannedObjectCount,
      complete: !continuationToken,
      files: Array.from(newestObjectByCode.entries()).map(([code, item]) => ({
        productId: productsByCode.get(code)!.id,
        productCode: code,
        key: item.key,
        fileName: item.fileName,
        size: item.size,
        lastModified: item.lastModified.toISOString(),
      })),
    };
  }

  async downloadProductImage(productId: string, query: DownloadProductImageDto) {
    const { company, branchCode, configuration, imagesFolder } = await this.productImageConfiguration();
    const product = await this.prisma.product.findFirst({
      where: { id: String(productId || "").trim(), companyId: company.id, canceledAt: null, status: "ACTIVE", branchCode: { in: [0, branchCode] } },
      select: { internalCode: true, sku: true, barcode: true },
    });
    const productCode = product ? this.productImageCode(product) : "";
    const key = this.relativePrefix(query.key);
    const expectedPrefix = `${imagesFolder}/${productCode}.`;
    const extension = key.split(".").pop()?.toLowerCase();
    if (!productCode || !key.startsWith(expectedPrefix) || !extension || !PRODUCT_IMAGE_EXTENSIONS.has(extension)) {
      throw new ForbiddenException("IMAGEM DE PRODUTO NÃO AUTORIZADA PARA ESTA FILIAL.");
    }
    try {
      const object = await this.client(configuration).send(new GetObjectCommand({ Bucket: configuration.bucket, Key: key }));
      if (!object.Body) throw new NotFoundException("IMAGEM NÃO ENCONTRADA NO S3.");
      return {
        body: object.Body,
        contentType: this.imageContentType(key, object.ContentType),
        contentLength: Number(object.ContentLength || 0),
      };
    } catch (error: any) {
      if (error instanceof ForbiddenException || error instanceof NotFoundException) throw error;
      if (error?.name === "NoSuchKey") throw new NotFoundException("IMAGEM NÃO ENCONTRADA NO S3.");
      throw new BadGatewayException("NÃO FOI POSSÍVEL BAIXAR A IMAGEM DO S3.");
    }
  }

  private client(configuration: any) {
    return new S3Client({
      region: configuration.region,
      endpoint: configuration.endpoint || undefined,
      forcePathStyle: Boolean(configuration.forcePathStyle),
      credentials: configuration.__centralAccessKey
        ? { accessKeyId: configuration.__centralAccessKey, secretAccessKey: configuration.__centralSecretKey }
        : { accessKeyId: decryptSecret(configuration.accessKeyEncrypted), secretAccessKey: decryptSecret(configuration.secretKeyEncrypted) },
    });
  }

  private async audit(companyId: string, branchCode: number, action: string, summary: string, actor: string, entityId?: string | null, metadata?: object) {
    return this.prisma.s3AuditEvent.create({ data: { companyId, branchCode, entityType: "S3_OBJECT", entityId: entityId || null, action, summary, metadataJson: metadata ? JSON.stringify(metadata) : null, performedBy: actor, createdBy: actor } });
  }

  async getConfiguration(_query: S3ControlContextDto) {
    return this.getEffectiveConfiguration();
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

  async listObjectNames(query: { prefix?: string }) {
    this.assertAdmin();
    const { configuration } = await this.authenticatedConfiguration();
    if (!configuration || configuration.status !== "ACTIVE") throw new BadRequestException("CONFIGURAÇÃO S3 ATIVA NÃO ENCONTRADA.");
    const prefix = this.relativePrefix(query.prefix);
    const fullPrefix = prefix ? `${prefix}/` : undefined;
    const names: string[] = [];
    let continuationToken: string | undefined;
    try {
      do {
        const page = await this.client(configuration).send(new ListObjectsV2Command({
          Bucket: configuration.bucket,
          Prefix: fullPrefix,
          MaxKeys: 1000,
          ContinuationToken: continuationToken,
        }));
        for (const item of page.Contents || []) {
          const key = String(item.Key || "");
          if (!key || key.endsWith("/")) continue;
          const name = prefix ? key.slice(prefix.length + 1) : key;
          if (name && !name.includes("/")) names.push(name);
        }
        continuationToken = page.NextContinuationToken;
      } while (continuationToken);
      return { prefix, names };
    } catch {
      throw new BadGatewayException("NÃO FOI POSSÍVEL CONFERIR OS ARQUIVOS JÁ ENVIADOS AO S3.");
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
    this.assertAdmin();
    const { company, branchCode, configuration, actor } =
      await this.authenticatedConfiguration();
    if (!configuration || configuration.status !== "ACTIVE") throw new BadRequestException("CONFIGURAÇÃO S3 ATIVA NÃO ENCONTRADA.");
    if (!file?.buffer?.length) throw new BadRequestException("SELECIONE UM ARQUIVO VÁLIDO PARA ENVIO.");
    const prefix = this.relativePrefix(payload.prefix);
    const fileName = String(file.originalname || "").replace(/\\/g, "/").split("/").pop()?.trim() || "";
    if (!fileName || fileName.length > 255 || fileName === "." || fileName === ".." || /[\u0000-\u001f\u007f]/.test(fileName)) throw new BadRequestException("NOME DE ARQUIVO INVÁLIDO.");
    const objectKey = [prefix, fileName].filter(Boolean).join("/");
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

  async syncProductImage(payload: SyncProductImageDto, file?: { originalname: string; mimetype: string; size: number; buffer: Buffer }) {
    const { company, branchCode, configuration: configuredLocally, actor } = await this.authenticatedConfiguration();
    await this.assertProductImageMutationAllowed(company.id, branchCode, payload.originScreenId);
    const productId = String(payload.productId || "").trim();
    const product = await this.prisma.product.findFirst({
      where: { id: productId, companyId: company.id, canceledAt: null },
    });
    if (!product || ![0, branchCode].includes(Number(product.branchCode))) {
      throw new NotFoundException("PRODUTO NÃO ENCONTRADO PARA A FILIAL ATUAL.");
    }
    if (!file?.buffer?.length || file.size > 10_000_000) {
      throw new BadRequestException("A IMAGEM LOCAL É INVÁLIDA OU ULTRAPASSA O LIMITE DE 10 MB.");
    }

    const productCode = this.productImageCode(product);
    if (!productCode) throw new BadRequestException("O PRODUTO NÃO POSSUI CÓDIGO VÁLIDO PARA SINCRONIZAR A IMAGEM.");

    let objectKey: string | null = null;
    try {
      const sourceScope = normalizeText(configuredLocally?.sourceScope);
      const configuration = configuredLocally && (sourceScope === "BRANCH" || sourceScope === "COMPANY")
        ? configuredLocally
        : await this.getCentralOperationalConfiguration();
      if (!configuration || configuration.status !== "ACTIVE") {
        throw new BadRequestException("CONFIGURAÇÃO S3 ATIVA NÃO ENCONTRADA.");
      }

      const imagesFolder = this.relativePrefix(configuration.imagesFolder);
      if (!imagesFolder) {
        throw new BadRequestException("INFORME A PASTA DE IMAGENS NA CONFIGURAÇÃO S3 DE ORIGEM.");
      }
      const extension = this.imageExtension(file);
      objectKey = `${imagesFolder}/${productCode}.${extension}`;
      await this.audit(company.id, branchCode, "PRODUCT_IMAGE_SYNC_REQUESTED", "SOLICITADA SINCRONIZAÇÃO DA IMAGEM LOCAL DO PRODUTO NO S3.", actor, product.id, { productId: product.id, productCode, objectKey, size: file.size });
      await this.client(configuration).send(new PutObjectCommand({
        Bucket: configuration.bucket,
        Key: objectKey,
        Body: file.buffer,
        ContentType: file.mimetype || "application/octet-stream",
      }));
      await this.prisma.product.update({
        where: { id: product.id },
        data: { imageS3SyncStatus: "SYNCED", imageS3ObjectKey: objectKey, imageS3LastError: null, imageS3SyncedAt: new Date(), updatedBy: actor },
      });
      await this.audit(company.id, branchCode, "PRODUCT_IMAGE_SYNC_COMPLETED", "IMAGEM LOCAL DO PRODUTO SINCRONIZADA NO S3.", actor, product.id, { productId: product.id, productCode, objectKey, size: file.size });
      return { success: true, status: "SYNCED", key: objectKey };
    } catch (error) {
      const message = error instanceof Error ? error.message : "NÃO FOI POSSÍVEL SINCRONIZAR A IMAGEM NO S3.";
      await this.prisma.product.update({
        where: { id: product.id },
        data: { imageS3SyncStatus: "PENDING", imageS3LastError: message.slice(0, 1000), imageS3SyncedAt: null, updatedBy: actor },
      });
      await this.audit(company.id, branchCode, "PRODUCT_IMAGE_SYNC_PENDING", "IMAGEM GRAVADA LOCALMENTE, COM SINCRONIZAÇÃO S3 PENDENTE.", actor, product.id, { productId: product.id, productCode, objectKey, reason: message.slice(0, 300) });
      throw error;
    }
  }

  async productImageReadiness(query: ProductImageReadinessDto) {
    const { company, branchCode, configuration: configuredLocally } = await this.authenticatedConfiguration();
    await this.assertProductImageMutationAllowed(company.id, branchCode, query.originScreenId);
    const sourceScope = normalizeText(configuredLocally?.sourceScope);
    const configuration = configuredLocally && (sourceScope === "BRANCH" || sourceScope === "COMPANY")
      ? configuredLocally
      : await this.getCentralOperationalConfiguration();
    if (!configuration || configuration.status !== "ACTIVE") {
      throw new BadRequestException("CONFIGURAÇÃO S3 ATIVA NÃO ENCONTRADA.");
    }
    const imagesFolder = this.relativePrefix(configuration.imagesFolder);
    if (!imagesFolder) {
      throw new BadRequestException("INFORME A PASTA DE IMAGENS NA CONFIGURAÇÃO S3 DE ORIGEM.");
    }
    return { ready: true, imagesFolder };
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
