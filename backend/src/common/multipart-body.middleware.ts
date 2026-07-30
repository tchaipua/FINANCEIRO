import {
  BadRequestException,
  Injectable,
  NestMiddleware,
  PayloadTooLargeException,
} from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import Busboy from "busboy";
import { getUploadLimitBytes } from "./security-config";

const S3_UPLOAD_PATH = "/api/v1/s3-control/upload";
const S3_UPLOAD_ALLOWED_FIELDS = new Set(["prefix"]);
const PRODUCT_IMAGE_SYNC_PATH = "/api/v1/s3-control/product-image";
const PRODUCT_IMAGE_SYNC_ALLOWED_FIELDS = new Set(["productId", "originScreenId"]);

@Injectable()
export class MultipartBodyMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction) {
    if (!request.is("multipart/form-data")) {
      next();
      return;
    }
    if (!Buffer.isBuffer(request.body)) {
      next(new BadRequestException("Corpo multipart inválido."));
      return;
    }

    const fields: Record<string, string> = {};
    const requestPath = new URL(
      request.originalUrl || request.url,
      "http://internal.invalid",
    ).pathname;
    const isS3Upload =
      request.method.toUpperCase() === "POST" &&
      requestPath === S3_UPLOAD_PATH;
    const isProductImageSync =
      request.method.toUpperCase() === "POST" &&
      requestPath === PRODUCT_IMAGE_SYNC_PATH;
    const multipartOperation = isS3Upload || isProductImageSync;
    const allowedFields = isS3Upload
      ? S3_UPLOAD_ALLOWED_FIELDS
      : PRODUCT_IMAGE_SYNC_ALLOWED_FIELDS;
    let uploadedFile:
      | {
          fieldname: string;
          originalname: string;
          mimetype: string;
          size: number;
          buffer: Buffer;
        }
      | undefined;
    let parsingError: Error | null = null;

    try {
      const parser = Busboy({
        headers: request.headers,
        limits: {
          fileSize: getUploadLimitBytes(),
          files: 1,
          fields: isProductImageSync ? 2 : multipartOperation ? 1 : 20,
          parts: isProductImageSync ? 4 : multipartOperation ? 3 : 21,
          fieldSize: multipartOperation ? 1_024 : 64 * 1024,
        },
      });

      parser.on("field", (name, value) => {
        if (
          multipartOperation &&
          (!allowedFields.has(name) ||
            Object.prototype.hasOwnProperty.call(fields, name))
        ) {
          parsingError = new BadRequestException(
            isProductImageSync
              ? "A sincronização da imagem aceita somente productId, originScreenId e file."
              : "O upload S3 aceita somente prefix e file.",
          );
          return;
        }
        fields[name] = value;
      });
      parser.on("file", (fieldname, stream, info) => {
        if ((multipartOperation && fieldname !== "file") || uploadedFile) {
          parsingError = new BadRequestException(
            isProductImageSync
              ? "A sincronização da imagem aceita somente um arquivo no campo file."
              : "O upload S3 aceita somente um arquivo no campo file.",
          );
          stream.resume();
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          size += chunk.length;
        });
        stream.on("limit", () => {
          parsingError = new PayloadTooLargeException(
            "Arquivo acima do limite permitido.",
          );
        });
        stream.on("end", () => {
          uploadedFile = {
            fieldname,
            originalname: info.filename,
            mimetype: info.mimeType,
            size,
            buffer: Buffer.concat(chunks),
          };
        });
      });
      parser.on("filesLimit", () => {
        parsingError = new BadRequestException(
          "Envie somente um arquivo por requisição.",
        );
      });
      parser.on("fieldsLimit", () => {
        parsingError = new BadRequestException(
          "Quantidade de campos multipart excedida.",
        );
      });
      parser.on("partsLimit", () => {
        parsingError = new BadRequestException(
          "Quantidade de partes multipart excedida.",
        );
      });
      parser.on("error", () => {
        parsingError = new BadRequestException("Corpo multipart inválido.");
      });
      parser.on("finish", () => {
        if (parsingError) {
          next(parsingError);
          return;
        }
        request.body = fields;
        request.file = uploadedFile;
        next();
      });
      parser.end(request.body);
    } catch {
      next(new BadRequestException("Corpo multipart inválido."));
    }
  }
}
