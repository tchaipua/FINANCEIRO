import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { json, raw, urlencoded } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import {
  getAllowedOrigins,
  getBindHost,
  getBodyLimit,
  getPort,
  getTrustProxyHops,
  getUploadLimitBytes,
  isSwaggerEnabled,
  validateProductionSecurityConfig,
} from "./common/security-config";

async function bootstrap() {
  validateProductionSecurityConfig();

  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const bodyLimit = getBodyLimit();
  const allowedOrigins = new Set(getAllowedOrigins());
  const trustProxyHops = getTrustProxyHops();

  app.use(
    helmet({
      contentSecurityPolicy: isSwaggerEnabled() ? false : undefined,
    }),
  );
  app.getHttpAdapter().getInstance().disable("x-powered-by");
  if (trustProxyHops > 0) {
    app.getHttpAdapter().getInstance().set("trust proxy", trustProxyHops);
  }

  const captureRawBody = (request: { rawBody?: Buffer }, body: Buffer) => {
    request.rawBody = Buffer.from(body);
  };
  app.use(
    raw({
      type: (request) =>
        String(request.headers["content-type"] || "")
          .toLowerCase()
          .startsWith("multipart/form-data"),
      limit: getUploadLimitBytes() + 1024 * 1024,
      verify: (request, _response, body) =>
        captureRawBody(request as { rawBody?: Buffer }, body),
    }),
  );
  app.use(
    json({
      limit: bodyLimit,
      verify: (request, _response, body) =>
        captureRawBody(request as { rawBody?: Buffer }, body),
    }),
  );
  app.use(
    urlencoded({
      extended: true,
      limit: bodyLimit,
      verify: (request, _response, body) =>
        captureRawBody(request as { rawBody?: Buffer }, body),
    }),
  );

  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (isSwaggerEnabled()) {
    const config = new DocumentBuilder()
      .setTitle("Financeiro Core API")
      .setDescription("Core financeiro multiempresa desacoplado")
      .setVersion("0.1")
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/docs", app, document);
  }

  app.enableCors({
    credentials: true,
    origin(
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origem não autorizada pelo CORS."));
    },
  });
  app.enableShutdownHooks();

  await app.listen(getPort(), getBindHost());
}

bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Falha desconhecida na inicialização.";
  process.stderr.write(`Falha ao iniciar o backend Financeiro: ${message}\n`);
  process.exitCode = 1;
});
