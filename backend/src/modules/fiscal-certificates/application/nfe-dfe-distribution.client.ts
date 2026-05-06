import https from "https";
import { gunzipSync } from "zlib";
import { BadRequestException } from "@nestjs/common";
import { XMLParser } from "fast-xml-parser";
import { normalizeDigits, normalizeText } from "../../../common/finance-core.utils";

const SOAP_ACTION =
  "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse";

const ENDPOINTS = {
  PRODUCTION:
    "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  HOMOLOGATION:
    "https://hom.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
} as const;

export type DistributedDfeDocument = {
  nsu: string;
  schema: string;
  xml: string;
};

export type DfeSyncBatch = {
  environment: "PRODUCTION" | "HOMOLOGATION";
  statusCode: string;
  statusMessage: string;
  lastNsu: string;
  maxNsu: string;
  documents: DistributedDfeDocument[];
};

function ensureArray<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return value;
  }

  return value === undefined || value === null ? [] : [value];
}

function normalizeNsu(value?: string | null) {
  const digits = normalizeDigits(value) || "0";
  return digits.padStart(15, "0");
}

function buildSoapEnvelope(params: {
  environment: "PRODUCTION" | "HOMOLOGATION";
  authorStateCode: string;
  interestedDocument: string;
  lastNsu: string;
}) {
  const tpAmb = params.environment === "PRODUCTION" ? "1" : "2";
  const documentTag = params.interestedDocument.length === 11 ? "CPF" : "CNPJ";

  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${tpAmb}</tpAmb>
          <cUFAutor>${params.authorStateCode}</cUFAutor>
          <${documentTag}>${params.interestedDocument}</${documentTag}>
          <distNSU>
            <ultNSU>${params.lastNsu}</ultNSU>
          </distNSU>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
}

function parseSoapResponse(xml: string): DfeSyncBatch {
  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
    parseTagValue: false,
    removeNSPrefix: true,
  });

  const parsed = parser.parse(xml);
  const ret =
    parsed?.Envelope?.Body?.nfeDistDFeInteresseResponse?.nfeDistDFeInteresseResult?.retDistDFeInt ||
    parsed?.retDistDFeInt;

  if (!ret) {
    throw new BadRequestException("A SEFAZ devolveu uma resposta inválida para a distribuição DF-e.");
  }

  const documents = ensureArray<any>(ret.loteDistDFeInt?.docZip).map((item) => {
    const compressedPayload = Buffer.from(String(item?.["#text"] || item || ""), "base64");
    const xmlPayload = gunzipSync(compressedPayload).toString("utf8");

    return {
      nsu: normalizeNsu(item?.["@_NSU"]),
      schema: String(item?.["@_schema"] || "").trim(),
      xml: xmlPayload,
    } satisfies DistributedDfeDocument;
  });

  return {
    environment:
      String(ret.tpAmb || "") === "2" ? "HOMOLOGATION" : "PRODUCTION",
    statusCode: String(ret.cStat || "").trim(),
    statusMessage: String(ret.xMotivo || "").trim(),
    lastNsu: normalizeNsu(ret.ultNSU),
    maxNsu: normalizeNsu(ret.maxNSU),
    documents,
  };
}

export async function fetchDfeDistributionBatch(options: {
  environment: "PRODUCTION" | "HOMOLOGATION";
  authorStateCode: string;
  interestedDocument: string;
  lastNsu?: string | null;
  pfxBuffer: Buffer;
  passphrase: string;
}) {
  const normalizedEnvironment =
    options.environment === "HOMOLOGATION" ? "HOMOLOGATION" : "PRODUCTION";
  const normalizedStateCode = normalizeDigits(options.authorStateCode);
  const normalizedDocument = normalizeDigits(options.interestedDocument);

  if (!normalizedStateCode || normalizedStateCode.length !== 2) {
    throw new BadRequestException("Informe o código IBGE da UF do autor para usar a SEFAZ.");
  }

  if (!normalizedDocument || ![11, 14].includes(normalizedDocument.length)) {
    throw new BadRequestException("Informe o CPF ou CNPJ do titular para usar a SEFAZ.");
  }

  const endpoint = ENDPOINTS[normalizedEnvironment];
  const body = buildSoapEnvelope({
    environment: normalizedEnvironment,
    authorStateCode: normalizedStateCode,
    interestedDocument: normalizedDocument,
    lastNsu: normalizeNsu(options.lastNsu),
  });

  const agent = new https.Agent({
    pfx: options.pfxBuffer,
    passphrase: options.passphrase,
    rejectUnauthorized: true,
    secureProtocol: "TLSv1_2_method",
  });

  const responseBody = await new Promise<string>((resolve, reject) => {
    const request = https.request(
      endpoint,
      {
        method: "POST",
        agent,
        headers: {
          "Content-Type": `application/soap+xml; charset=utf-8; action="${SOAP_ACTION}"`,
          "Content-Length": Buffer.byteLength(body, "utf8"),
          SOAPAction: SOAP_ACTION,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if ((response.statusCode || 500) >= 400) {
            reject(
              new BadRequestException(
                `A SEFAZ rejeitou a consulta DF-e (${response.statusCode}).`,
              ),
            );
            return;
          }

          resolve(text);
        });
      },
    );

    request.on("error", (error) => {
      reject(
        new BadRequestException(
          `Não foi possível consultar a SEFAZ: ${error.message}`,
        ),
      );
    });

    request.write(body);
    request.end();
  });

  return parseSoapResponse(responseBody);
}
