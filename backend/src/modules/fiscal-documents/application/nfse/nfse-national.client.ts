import https from "https";
import tls from "tls";
import { gunzipSync, gzipSync } from "zlib";
import { BadRequestException } from "@nestjs/common";
import { NfceCertificateMaterial } from "../nfce/nfce.types";
import { NfseEnvironment, NfseNationalResponse } from "./nfse.types";

const ENDPOINTS = {
  HOMOLOGATION: {
    sefin: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
    adn: "https://adn.producaorestrita.nfse.gov.br",
  },
  PRODUCTION: {
    sefin: "https://sefin.nfse.gov.br/SefinNacional",
    adn: "https://adn.nfse.gov.br",
  },
} as const;

function getSystemCertificateAuthorities() {
  const getCa = (tls as typeof tls & {
    getCACertificates?: (type: "system") => string[];
  }).getCACertificates;
  return getCa
    ? [...tls.rootCertificates, ...getCa("system")]
    : [...tls.rootCertificates];
}

function agent(certificate: NfceCertificateMaterial) {
  return new https.Agent({
    pfx: certificate.pfxBuffer,
    passphrase: certificate.passphrase,
    rejectUnauthorized: true,
    minVersion: "TLSv1.2",
    ca: getSystemCertificateAuthorities(),
  });
}

function parseBody(rawBody: string) {
  if (!rawBody.trim()) return null;
  try {
    return JSON.parse(rawBody);
  } catch {
    return rawBody;
  }
}

async function request(options: {
  url: string;
  method?: "GET" | "POST" | "HEAD";
  certificate: NfceCertificateMaterial;
  body?: string;
  accept?: string;
  timeoutSeconds?: number;
}): Promise<NfseNationalResponse & { buffer: Buffer; contentType: string | null }> {
  const body = options.body || "";
  const timeoutSeconds = Math.max(
    5,
    Math.min(300, Number(options.timeoutSeconds || 60)),
  );
  return new Promise((resolve, reject) => {
    const req = https.request(
      options.url,
      {
        method: options.method || "GET",
        agent: agent(options.certificate),
        headers: {
          Accept: options.accept || "application/json",
          ...(body
            ? {
                "Content-Type": "application/json; charset=utf-8",
                "Content-Length": Buffer.byteLength(body, "utf8"),
              }
            : {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) =>
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
        );
        response.on("end", () => {
          const buffer = Buffer.concat(chunks);
          const rawBody = buffer.toString("utf8");
          resolve({
            httpStatus: response.statusCode || 0,
            body: parseBody(rawBody),
            rawBody,
            buffer,
            contentType:
              typeof response.headers["content-type"] === "string"
                ? response.headers["content-type"]
                : null,
          });
        });
      },
    );
    req.setTimeout(timeoutSeconds * 1000, () => {
      req.destroy(new Error("TEMPO LIMITE EXCEDIDO NA API NACIONAL DA NFS-E."));
    });
    req.on("error", (error) =>
      reject(
        new BadRequestException(
          `NÃO FOI POSSÍVEL COMUNICAR COM A API NACIONAL DA NFS-E: ${error.message}`,
        ),
      ),
    );
    if (body) req.write(body);
    req.end();
  });
}

export function encodeNfseDpsPayload(signedDpsXml: string) {
  return gzipSync(Buffer.from(signedDpsXml, "utf8")).toString("base64");
}

export function decodeNfseXml(body: any) {
  const encoded = body?.nfseXmlGZipB64 || body?.NfseXmlGZipB64;
  if (!encoded || typeof encoded !== "string") return null;
  try {
    return gunzipSync(Buffer.from(encoded, "base64")).toString("utf8");
  } catch {
    throw new BadRequestException(
      "A API NACIONAL DEVOLVEU O XML DA NFS-E EM FORMATO INVÁLIDO.",
    );
  }
}

export function nfseResponseMessage(body: any) {
  if (!body) return null;
  const errors = body.erros || body.errors;
  if (Array.isArray(errors) && errors.length) {
    return errors
      .map((item) =>
        [
          item?.codigo || item?.Codigo || item?.code,
          item?.descricao || item?.Descricao || item?.message,
        ]
          .filter(Boolean)
          .join(" - "),
      )
      .filter(Boolean)
      .join(" | ");
  }
  return String(
    body.mensagem || body.message || body.descricao || body.title || "",
  ).trim() || null;
}

export async function issueNfseNational(options: {
  environment: NfseEnvironment;
  signedDpsXml: string;
  certificate: NfceCertificateMaterial;
  timeoutSeconds?: number;
}) {
  const dpsXmlGZipB64 = encodeNfseDpsPayload(options.signedDpsXml);
  const requestBody = JSON.stringify({ dpsXmlGZipB64 });
  const response = await request({
    url: `${ENDPOINTS[options.environment].sefin}/nfse`,
    method: "POST",
    certificate: options.certificate,
    body: requestBody,
    timeoutSeconds: options.timeoutSeconds,
  });
  return {
    ...response,
    requestBody,
    authorizedXml: decodeNfseXml(response.body),
    accessKey:
      String((response.body as any)?.chaveAcesso || "").trim() || null,
    dpsId: String((response.body as any)?.idDps || "").trim() || null,
    statusMessage: nfseResponseMessage(response.body),
  };
}

export async function consultNfseByDps(options: {
  environment: NfseEnvironment;
  dpsId: string;
  certificate: NfceCertificateMaterial;
  timeoutSeconds?: number;
}) {
  const response = await request({
    url: `${ENDPOINTS[options.environment].sefin}/dps/${encodeURIComponent(options.dpsId)}`,
    certificate: options.certificate,
    timeoutSeconds: options.timeoutSeconds,
  });
  return {
    ...response,
    authorizedXml: decodeNfseXml(response.body),
    accessKey:
      String((response.body as any)?.chaveAcesso || "").trim() || null,
    statusMessage: nfseResponseMessage(response.body),
  };
}

export async function downloadNationalDanfse(options: {
  environment: NfseEnvironment;
  accessKey: string;
  certificate: NfceCertificateMaterial;
  timeoutSeconds?: number;
}) {
  return request({
    url: `${ENDPOINTS[options.environment].adn}/danfse/${encodeURIComponent(options.accessKey)}`,
    certificate: options.certificate,
    accept: "application/pdf",
    timeoutSeconds: options.timeoutSeconds,
  });
}

export type NfseMunicipalParameterType =
  | "CONVENTION"
  | "RATE"
  | "SPECIAL_REGIMES"
  | "WITHHOLDINGS";

export function buildNfseMunicipalParameterPath(params: {
  type: NfseMunicipalParameterType;
  municipalityCode: string;
  nationalTaxCode?: string | null;
  competence?: string | null;
}) {
  const base = `/${params.municipalityCode}`;
  if (params.type === "CONVENTION") return `${base}/convenio`;
  if (!params.competence) {
    throw new BadRequestException(
      "INFORME A COMPETÊNCIA PARA CONSULTAR OS PARÂMETROS MUNICIPAIS.",
    );
  }
  if (params.type === "WITHHOLDINGS") {
    return `${base}/${params.competence}/retencoes`;
  }
  if (!params.nationalTaxCode) {
    throw new BadRequestException(
      "INFORME O CÓDIGO NACIONAL DO SERVIÇO PARA CONSULTAR O MUNICÍPIO.",
    );
  }
  if (!/^\d{9}$/.test(params.nationalTaxCode)) {
    throw new BadRequestException(
      "O CÓDIGO DO SERVIÇO PARA PARAMETRIZAÇÃO MUNICIPAL DEVE POSSUIR 9 DÍGITOS.",
    );
  }
  if (params.type === "RATE") {
    return `${base}/${params.nationalTaxCode}/${params.competence}/aliquota`;
  }
  return `${base}/${params.nationalTaxCode}/${params.competence}/regimes_especiais`;
}

export async function queryNfseMunicipalParameter(options: {
  environment: NfseEnvironment;
  municipalityCode: string;
  nationalTaxCode?: string | null;
  competence?: string | null;
  type: NfseMunicipalParameterType;
  certificate: NfceCertificateMaterial;
  timeoutSeconds?: number;
}) {
  const path = buildNfseMunicipalParameterPath(options);
  const response = await request({
    url: `${ENDPOINTS[options.environment].adn}/parametrizacao${path}`,
    certificate: options.certificate,
    timeoutSeconds: options.timeoutSeconds,
  });
  return { ...response, path, statusMessage: nfseResponseMessage(response.body) };
}
