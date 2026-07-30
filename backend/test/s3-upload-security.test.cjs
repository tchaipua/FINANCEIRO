const assert = require("node:assert/strict");
require("reflect-metadata");

const { plainToInstance } = require("class-transformer");
const { validate } = require("class-validator");
const {
  MultipartBodyMiddleware,
} = require("../dist/common/multipart-body.middleware.js");
const {
  financeContext,
} = require("../dist/common/finance-context.js");
const {
  UploadS3ObjectDto,
} = require("../dist/modules/s3-control/application/dto/s3-control.dto.js");
const {
  S3ControlService,
} = require("../dist/modules/s3-control/application/s3-control.service.js");

function multipartBody(fields = {}) {
  const boundary = "----msinfor-secure-upload-boundary";
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
        `${value}\r\n`,
    );
  }
  parts.push(
    `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="file"; filename="safe.txt"\r\n' +
      "Content-Type: text/plain\r\n\r\n" +
      "conteudo-seguro\r\n",
  );
  parts.push(`--${boundary}--\r\n`);
  return {
    boundary,
    body: Buffer.from(parts.join(""), "utf8"),
  };
}

async function parseMultipart(fields, requestPath = "/api/v1/s3-control/upload") {
  const { boundary, body } = multipartBody(fields);
  const request = {
    method: "POST",
    originalUrl: requestPath,
    url: requestPath,
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": String(body.length),
    },
    body,
    is: (type) => type === "multipart/form-data",
  };
  const middleware = new MultipartBodyMiddleware();
  const error = await new Promise((resolve) => {
    middleware.use(request, {}, (nextError) => resolve(nextError || null));
  });
  return { request, error };
}

async function run() {
  const accepted = await parseMultipart({ prefix: "documentos/2026" });
  assert.equal(accepted.error, null);
  assert.deepEqual(accepted.request.body, { prefix: "documentos/2026" });
  assert.equal(accepted.request.file.fieldname, "file");
  assert.equal(accepted.request.file.originalname, "safe.txt");

  const acceptedProductImage = await parseMultipart(
    {
      productId: "product-1",
      originScreenId: "PRINCIPAL_FINANCEIRO_VENDAS_2",
    },
    "/api/v1/s3-control/product-image",
  );
  assert.equal(acceptedProductImage.error, null);
  assert.deepEqual(acceptedProductImage.request.body, {
    productId: "product-1",
    originScreenId: "PRINCIPAL_FINANCEIRO_VENDAS_2",
  });

  const forbiddenAuthorityNames = [
    "contextPayload",
    "sourceSystem",
    "sourceTenantId",
    "sourceBranchCode",
    "tenant",
    "tenantId",
    "companyId",
    "branchId",
    "branchCode",
    "userId",
    "requestedBy",
    "userRole",
    "role",
    "permissions",
    "scopes",
  ];
  for (const fieldName of forbiddenAuthorityNames) {
    const rejected = await parseMultipart({ [fieldName]: "forged-value" });
    assert.equal(
      rejected.error?.getStatus?.(),
      400,
      `O multipart aceitou o campo de autoridade ${fieldName}.`,
    );

    const dto = plainToInstance(UploadS3ObjectDto, {
      prefix: "documentos",
      [fieldName]: "forged-value",
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    assert.ok(
      errors.some((error) => error.property === fieldName),
      `O DTO aceitou o campo de autoridade ${fieldName}.`,
    );
  }

  const companyLookups = [];
  const configurationLookups = [];
  const audits = [];
  const service = new S3ControlService({
    company: {
      findUnique: async (input) => {
        companyLookups.push(input);
        return {
          id: "company-from-hmac",
          status: "ACTIVE",
          canceledAt: null,
        };
      },
    },
    s3Configuration: {
      findFirst: async (input) => {
        configurationLookups.push(input);
        return {
          id: "s3-config",
          companyId: "company-from-hmac",
          branchCode: 7,
          bucket: "private-bucket",
          status: "ACTIVE",
          canceledAt: null,
        };
      },
    },
  });
  service.client = () => ({ send: async () => ({}) });
  service.audit = async (...input) => {
    audits.push(input);
    return {};
  };

  await financeContext.run(
    {
      authenticated: true,
      branchCode: 7,
      sourceSystem: "PROJETO_INICIAL",
      sourceTenantId: "TENANT-HMAC",
      sourceBranchCode: 7,
      sourceUserId: "user-from-hmac",
      companyId: "company-from-hmac",
      branchId: "branch-from-hmac",
      scopes: ["FINANCE_ADMIN", "MANAGE_FINANCIAL"],
    },
    () =>
      service.uploadObject(
        {
          prefix: "documentos",
          sourceSystem: "ESCOLA",
          sourceTenantId: "TENANT-FORGED",
          sourceBranchCode: 99,
          requestedBy: "attacker",
          userRole: "ADMIN",
          permissions: ["ALL"],
        },
        {
          originalname: "safe.txt",
          mimetype: "text/plain",
          size: 8,
          buffer: Buffer.from("conteudo"),
        },
      ),
  );

  assert.deepEqual(companyLookups[0], {
    where: { id: "company-from-hmac" },
  });
  assert.deepEqual(configurationLookups[0], {
    where: {
      companyId: "company-from-hmac",
      branchCode: 7,
      canceledAt: null,
    },
  });
  assert.ok(audits.length >= 2);
  assert.equal(audits.every((audit) => audit[4] === "user-from-hmac"), true);
  assert.equal(
    JSON.stringify({ companyLookups, configurationLookups, audits }).includes(
      "TENANT-FORGED",
    ),
    false,
  );

  const productImagePermissionChecks = [];
  let allowProductImageEdit = true;
  const productImageService = new S3ControlService({
    company: {
      findUnique: async () => ({
        id: "company-from-hmac",
        status: "ACTIVE",
        canceledAt: null,
      }),
    },
    companyBranch: {
      findFirst: async (input) => {
        productImagePermissionChecks.push(input);
        return { allowProductImageEdit };
      },
    },
    s3Configuration: {
      findFirst: async () => ({
        companyId: "company-from-hmac",
        branchCode: 7,
        status: "ACTIVE",
        sourceScope: "BRANCH",
        imagesFolder: "imagens-produtos",
        canceledAt: null,
      }),
    },
  });
  const readiness = await financeContext.run(
    {
      authenticated: true,
      branchCode: 7,
      sourceSystem: "ESCOLA",
      sourceTenantId: "TENANT-HMAC",
      sourceBranchCode: 7,
      sourceUserId: "cashier-from-hmac",
      companyId: "company-from-hmac",
      branchId: "branch-from-hmac",
      scopes: ["FINANCE_CASHIER"],
    },
    () => productImageService.productImageReadiness({
      originScreenId: "PRINCIPAL_FINANCEIRO_VENDAS_2",
    }),
  );
  assert.deepEqual(readiness, {
    ready: true,
    imagesFolder: "imagens-produtos",
  });
  assert.equal(productImagePermissionChecks.length, 1);
  allowProductImageEdit = false;
  await assert.rejects(
    () => financeContext.run(
      {
        authenticated: true,
        branchCode: 7,
        sourceSystem: "ESCOLA",
        sourceTenantId: "TENANT-HMAC",
        sourceBranchCode: 7,
        sourceUserId: "cashier-from-hmac",
        companyId: "company-from-hmac",
        branchId: "branch-from-hmac",
        scopes: ["FINANCE_CASHIER"],
      },
      () => productImageService.productImageReadiness({
        originScreenId: "PRINCIPAL_FINANCEIRO_VENDAS_2",
      }),
    ),
    (error) => error?.getStatus?.() === 403,
  );

  process.stdout.write(
    "Upload S3 e imagem de produto respeitam campos seguros, HMAC e parâmetro da filial.\n",
  );
}

run().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
