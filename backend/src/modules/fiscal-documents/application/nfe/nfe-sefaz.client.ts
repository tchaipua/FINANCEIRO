import https from "https";
import tls from "tls";
import { BadRequestException } from "@nestjs/common";
import { XMLParser } from "fast-xml-parser";
import { SignedXml } from "xml-crypto";
import { NfceCertificateMaterial } from "../nfce/nfce.types";
import { buildNfeBatchId } from "./nfe-xml.builder";
import { NfeAuthorizationResult, NfeEnvironment } from "./nfe.types";

const NAMESPACE = "http://www.portalfiscal.inf.br/nfe";
const ENDPOINTS = {
  HOMOLOGATION: {
    authorization:
      "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
    query:
      "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx",
    event:
      "https://homologacao.nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx",
    inutilization:
      "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeinutilizacao4.asmx",
    status:
      "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx",
  },
  PRODUCTION: {
    authorization:
      "https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
    query:
      "https://nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx",
    event:
      "https://nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx",
    inutilization:
      "https://nfe.fazenda.sp.gov.br/ws/nfeinutilizacao4.asmx",
    status:
      "https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx",
  },
} as const;

const ACTIONS = {
  authorization:
    "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote",
  query:
    "http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4/nfeConsultaNF",
  event:
    "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento",
  inutilization:
    "http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4/nfeInutilizacaoNF",
  status:
    "http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4/nfeStatusServicoNF",
} as const;

const SERVICE_NAMESPACES = {
  authorization:
    "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4",
  query:
    "http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4",
  event:
    "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4",
  inutilization:
    "http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4",
  status:
    "http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4",
} as const;

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getSystemCertificateAuthorities() {
  const getCa = (tls as typeof tls & {
    getCACertificates?: (type: "system") => string[];
  }).getCACertificates;
  return getCa
    ? [...tls.rootCertificates, ...getCa("system")]
    : [...tls.rootCertificates];
}

function buildSoapEnvelope(
  service: keyof typeof SERVICE_NAMESPACES,
  payload: string,
) {
  return `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="${SERVICE_NAMESPACES[service]}">${payload}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;
}

async function postSoap(
  endpoint: string,
  body: string,
  certificate: NfceCertificateMaterial,
  soapAction: string,
) {
  const agent = new https.Agent({
    pfx: certificate.pfxBuffer,
    passphrase: certificate.passphrase,
    rejectUnauthorized: true,
    minVersion: "TLSv1.2",
    ca: getSystemCertificateAuthorities(),
  });
  return new Promise<string>((resolve, reject) => {
    const request = https.request(
      endpoint,
      {
        method: "POST",
        agent,
        headers: {
          "Content-Type": `application/soap+xml; charset=utf-8; action="${soapAction}"`,
          "Content-Length": Buffer.byteLength(body, "utf8"),
          SOAPAction: soapAction,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) =>
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
        );
        response.on("end", () => {
          const responseBody = Buffer.concat(chunks).toString("utf8");
          if ((response.statusCode || 500) >= 400) {
            reject(
              new BadRequestException(
                `O serviço da SEFAZ-SP respondeu HTTP ${response.statusCode}.`,
              ),
            );
            return;
          }
          resolve(responseBody);
        });
      },
    );
    request.on("error", (error) =>
      reject(
        new BadRequestException(
          `Não foi possível comunicar com a SEFAZ-SP: ${error.message}`,
        ),
      ),
    );
    request.write(body);
    request.end();
  });
}

function parseSoapResult(responseXml: string, candidates: string[]) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
    parseTagValue: false,
    removeNSPrefix: true,
  });
  const parsed = parser.parse(responseXml);
  const body = parsed?.Envelope?.Body || parsed;
  let result: any = body;
  for (const candidate of candidates) {
    if (result?.[candidate] !== undefined) {
      result = result[candidate];
    }
  }
  if (typeof result === "string") {
    result = parser.parse(
      result
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&"),
    );
  }
  return { parser, result, body };
}

function signXml(
  unsignedXml: string,
  referenceLocalName: string,
  certificate: NfceCertificateMaterial,
) {
  const signer = new SignedXml({
    privateKey: certificate.privateKeyPem,
    publicCert: certificate.certificatePem,
    getKeyInfoContent: SignedXml.getKeyInfoContent,
    canonicalizationAlgorithm:
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
  });
  signer.addReference({
    xpath: `//*[local-name(.)='${referenceLocalName}']`,
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
  });
  signer.computeSignature(unsignedXml, {
    location: {
      reference: `//*[local-name(.)='${referenceLocalName}']`,
      action: "after",
    },
  });
  return signer.getSignedXml();
}

export function signNfeXmlForValidation(
  unsignedXml: string,
  certificate: NfceCertificateMaterial,
) {
  return signXml(unsignedXml, "infNFe", certificate);
}

function protocolXmlFromResponse(responseXml: string) {
  return (
    responseXml.match(
      /<(?:\w+:)?protNFe[\s\S]*?<\/(?:\w+:)?protNFe>/,
    )?.[0] || null
  );
}

function parseAuthorizationResponse(
  environment: NfeEnvironment,
  responseXml: string,
  signedXml: string,
): NfeAuthorizationResult {
  const { result, body } = parseSoapResult(responseXml, [
    "nfeAutorizacaoLoteResponse",
    "nfeAutorizacaoLoteResult",
  ]);
  const ret =
    result?.retEnviNFe ||
    body?.nfeResultMsg?.retEnviNFe ||
    body?.retEnviNFe ||
    result;
  if (!ret) {
    throw new BadRequestException(
      "A SEFAZ-SP devolveu uma resposta inválida para a autorização da NF-e.",
    );
  }
  const protocol = ret?.protNFe?.infProt;
  const statusCode = String(protocol?.cStat || ret?.cStat || "").trim();
  const statusMessage = String(protocol?.xMotivo || ret?.xMotivo || "").trim();
  const protocolXml = protocolXmlFromResponse(responseXml);
  const authorized = statusCode === "100";
  return {
    authorized,
    environment,
    statusCode,
    statusMessage,
    protocol: protocol?.nProt ? String(protocol.nProt).trim() : null,
    receivedAt: protocol?.dhRecbto ? String(protocol.dhRecbto).trim() : null,
    responseXml,
    processedXml:
      authorized && protocolXml
        ? `<nfeProc xmlns="${NAMESPACE}" versao="4.00">${signedXml}${protocolXml}</nfeProc>`
        : null,
  };
}

export async function authorizeNfe(options: {
  environment: NfeEnvironment;
  accessKey: string;
  unsignedXml: string;
  certificate: NfceCertificateMaterial;
}) {
  const signedXml = signXml(options.unsignedXml, "infNFe", options.certificate);
  const batch = `<enviNFe xmlns="${NAMESPACE}" versao="4.00"><idLote>${buildNfeBatchId(options.accessKey)}</idLote><indSinc>1</indSinc>${signedXml}</enviNFe>`;
  const envelope = buildSoapEnvelope("authorization", batch);
  const responseXml = await postSoap(
    ENDPOINTS[options.environment].authorization,
    envelope,
    options.certificate,
    ACTIONS.authorization,
  );
  return {
    signedXml,
    envelope,
    ...parseAuthorizationResponse(
      options.environment,
      responseXml,
      signedXml,
    ),
  };
}

export async function queryNfeProtocol(options: {
  environment: NfeEnvironment;
  accessKey: string;
  signedXml: string;
  certificate: NfceCertificateMaterial;
}) {
  const tpAmb = options.environment === "PRODUCTION" ? "1" : "2";
  const queryXml = `<consSitNFe xmlns="${NAMESPACE}" versao="4.00"><tpAmb>${tpAmb}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${options.accessKey}</chNFe></consSitNFe>`;
  const responseXml = await postSoap(
    ENDPOINTS[options.environment].query,
    buildSoapEnvelope("query", queryXml),
    options.certificate,
    ACTIONS.query,
  );
  const { result, body } = parseSoapResult(responseXml, [
    "nfeConsultaNFResponse",
    "nfeConsultaNFResult",
  ]);
  const ret =
    result?.retConsSitNFe ||
    body?.nfeResultMsg?.retConsSitNFe ||
    body?.retConsSitNFe ||
    result;
  const protocol = ret?.protNFe?.infProt;
  const statusCode = String(protocol?.cStat || ret?.cStat || "").trim();
  const statusMessage = String(protocol?.xMotivo || ret?.xMotivo || "").trim();
  const authorized = statusCode === "100";
  const protocolXml = protocolXmlFromResponse(responseXml);
  return {
    authorized,
    environment: options.environment,
    statusCode,
    statusMessage,
    protocol: protocol?.nProt ? String(protocol.nProt).trim() : null,
    receivedAt: protocol?.dhRecbto ? String(protocol.dhRecbto).trim() : null,
    responseXml,
    processedXml:
      authorized && protocolXml
        ? `<nfeProc xmlns="${NAMESPACE}" versao="4.00">${options.signedXml}${protocolXml}</nfeProc>`
        : null,
  };
}

export async function queryNfeServiceStatus(options: {
  environment: NfeEnvironment;
  stateCode: string;
  certificate: NfceCertificateMaterial;
}) {
  const tpAmb = options.environment === "PRODUCTION" ? "1" : "2";
  const payload = `<consStatServ xmlns="${NAMESPACE}" versao="4.00"><tpAmb>${tpAmb}</tpAmb><cUF>${escapeXml(options.stateCode)}</cUF><xServ>STATUS</xServ></consStatServ>`;
  const responseXml = await postSoap(
    ENDPOINTS[options.environment].status,
    buildSoapEnvelope("status", payload),
    options.certificate,
    ACTIONS.status,
  );
  const { result, body } = parseSoapResult(responseXml, [
    "nfeStatusServicoNFResponse",
    "nfeStatusServicoNFResult",
  ]);
  const ret =
    result?.retConsStatServ ||
    body?.nfeResultMsg?.retConsStatServ ||
    body?.retConsStatServ ||
    result;
  return {
    available: String(ret?.cStat || "") === "107",
    statusCode: String(ret?.cStat || "").trim(),
    statusMessage: String(ret?.xMotivo || "").trim(),
    averageTime: String(ret?.tMed || "").trim() || null,
    responseXml,
  };
}

export async function sendNfeEvent(options: {
  environment: NfeEnvironment;
  stateCode: string;
  issuerCnpj: string;
  accessKey: string;
  eventType: "110111" | "110110";
  sequence: number;
  eventAt: string;
  protocol?: string | null;
  justification?: string | null;
  correctionText?: string | null;
  certificate: NfceCertificateMaterial;
}) {
  const tpAmb = options.environment === "PRODUCTION" ? "1" : "2";
  const sequence = String(options.sequence).padStart(2, "0");
  const id = `ID${options.eventType}${options.accessKey}${sequence}`;
  const details =
    options.eventType === "110111"
      ? `<detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>${escapeXml(options.protocol)}</nProt><xJust>${escapeXml(options.justification)}</xJust></detEvento>`
      : `<detEvento versao="1.00"><descEvento>Carta de Correcao</descEvento><xCorrecao>${escapeXml(options.correctionText)}</xCorrecao><xCondUso>A Carta de Correcao e disciplinada pelo paragrafo 1o-A do art. 7o do Convenio S/N, de 15 de dezembro de 1970 e pode ser utilizada para regularizacao de erro ocorrido na emissao de documento fiscal, desde que o erro nao esteja relacionado com: I - as variaveis que determinam o valor do imposto tais como: base de calculo, aliquota, diferenca de preco, quantidade, valor da operacao ou da prestacao; II - a correcao de dados cadastrais que implique mudanca do remetente ou do destinatario; III - a data de emissao ou de saida.</xCondUso></detEvento>`;
  const eventXml = `<evento xmlns="${NAMESPACE}" versao="1.00"><infEvento Id="${id}"><cOrgao>${escapeXml(options.stateCode)}</cOrgao><tpAmb>${tpAmb}</tpAmb><CNPJ>${escapeXml(options.issuerCnpj)}</CNPJ><chNFe>${options.accessKey}</chNFe><dhEvento>${options.eventAt}</dhEvento><tpEvento>${options.eventType}</tpEvento><nSeqEvento>${options.sequence}</nSeqEvento><verEvento>1.00</verEvento>${details}</infEvento></evento>`;
  const signedXml = signXml(eventXml, "infEvento", options.certificate);
  const batchId = buildNfeBatchId(`${options.accessKey}${sequence}`);
  const payload = `<envEvento xmlns="${NAMESPACE}" versao="1.00"><idLote>${batchId}</idLote>${signedXml}</envEvento>`;
  const responseXml = await postSoap(
    ENDPOINTS[options.environment].event,
    buildSoapEnvelope("event", payload),
    options.certificate,
    ACTIONS.event,
  );
  const { result, body } = parseSoapResult(responseXml, [
    "nfeRecepcaoEventoResponse",
    "nfeRecepcaoEventoResult",
  ]);
  const ret =
    result?.retEnvEvento ||
    body?.nfeResultMsg?.retEnvEvento ||
    body?.retEnvEvento ||
    result;
  const eventResult = Array.isArray(ret?.retEvento)
    ? ret.retEvento[0]?.infEvento
    : ret?.retEvento?.infEvento;
  const statusCode = String(eventResult?.cStat || ret?.cStat || "").trim();
  const statusMessage = String(eventResult?.xMotivo || ret?.xMotivo || "").trim();
  const protocol = eventResult?.nProt
    ? String(eventResult.nProt).trim()
    : null;
  const authorized = ["135", "136"].includes(statusCode);
  return {
    authorized,
    statusCode,
    statusMessage,
    protocol,
    signedXml,
    responseXml,
    processedXml: authorized
      ? `<procEventoNFe xmlns="${NAMESPACE}" versao="1.00">${signedXml}${responseXml.match(/<(?:\w+:)?retEvento[\s\S]*?<\/(?:\w+:)?retEvento>/)?.[0] || ""}</procEventoNFe>`
      : null,
  };
}

export async function inutilizeNfeNumbers(options: {
  environment: NfeEnvironment;
  stateCode: string;
  issuerCnpj: string;
  year: number;
  series: number;
  startNumber: number;
  endNumber: number;
  justification: string;
  certificate: NfceCertificateMaterial;
}) {
  const tpAmb = options.environment === "PRODUCTION" ? "1" : "2";
  const id = [
    "ID",
    String(options.stateCode).padStart(2, "0"),
    String(options.year).slice(-2),
    options.issuerCnpj,
    "55",
    String(options.series).padStart(3, "0"),
    String(options.startNumber).padStart(9, "0"),
    String(options.endNumber).padStart(9, "0"),
  ].join("");
  const unsignedXml = `<inutNFe xmlns="${NAMESPACE}" versao="4.00"><infInut Id="${id}"><tpAmb>${tpAmb}</tpAmb><xServ>INUTILIZAR</xServ><cUF>${escapeXml(options.stateCode)}</cUF><ano>${String(options.year).slice(-2)}</ano><CNPJ>${escapeXml(options.issuerCnpj)}</CNPJ><mod>55</mod><serie>${options.series}</serie><nNFIni>${options.startNumber}</nNFIni><nNFFin>${options.endNumber}</nNFFin><xJust>${escapeXml(options.justification)}</xJust></infInut></inutNFe>`;
  const signedXml = signXml(unsignedXml, "infInut", options.certificate);
  const responseXml = await postSoap(
    ENDPOINTS[options.environment].inutilization,
    buildSoapEnvelope("inutilization", signedXml),
    options.certificate,
    ACTIONS.inutilization,
  );
  const { result, body } = parseSoapResult(responseXml, [
    "nfeInutilizacaoNFResponse",
    "nfeInutilizacaoNFResult",
  ]);
  const ret =
    result?.retInutNFe ||
    body?.nfeResultMsg?.retInutNFe ||
    body?.retInutNFe ||
    result;
  const inf = ret?.infInut || ret;
  const statusCode = String(inf?.cStat || "").trim();
  const statusMessage = String(inf?.xMotivo || "").trim();
  const authorized = statusCode === "102";
  return {
    authorized,
    statusCode,
    statusMessage,
    protocol: inf?.nProt ? String(inf.nProt).trim() : null,
    signedXml,
    responseXml,
    processedXml: authorized
      ? `<ProcInutNFe xmlns="${NAMESPACE}" versao="4.00">${signedXml}${responseXml.match(/<(?:\w+:)?retInutNFe[\s\S]*?<\/(?:\w+:)?retInutNFe>/)?.[0] || ""}</ProcInutNFe>`
      : null,
  };
}
