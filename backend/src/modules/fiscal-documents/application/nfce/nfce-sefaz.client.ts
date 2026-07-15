import https from "https";
import tls from "tls";
import { BadRequestException } from "@nestjs/common";
import { XMLParser } from "fast-xml-parser";
import { SignedXml } from "xml-crypto";
import { buildBatchId } from "./nfce-xml.builder";
import {
  NfceAuthorizationResult,
  NfceCertificateMaterial,
  NfceEnvironment,
} from "./nfce.types";

const NAMESPACE = "http://www.portalfiscal.inf.br/nfe";
const AUTHORIZATION_SOAP_ACTION =
  "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote";
const ENDPOINTS = {
  HOMOLOGATION:
    "https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx",
  PRODUCTION: "https://nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx",
} as const;
const QUERY_ENDPOINTS = {
  HOMOLOGATION:
    "https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeConsultaProtocolo4.asmx",
  PRODUCTION: "https://nfce.fazenda.sp.gov.br/ws/NFeConsultaProtocolo4.asmx",
} as const;
const QUERY_SOAP_ACTION =
  "http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4/nfeConsultaNF";

function signNfceXml(unsignedXml: string, certificate: NfceCertificateMaterial) {
  const signer = new SignedXml({
    privateKey: certificate.privateKeyPem,
    publicCert: certificate.certificatePem,
    getKeyInfoContent: SignedXml.getKeyInfoContent,
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
  });
  signer.addReference({
    xpath: "//*[local-name(.)='infNFe']",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
  });
  signer.computeSignature(unsignedXml, {
    location: { reference: "//*[local-name(.)='infNFeSupl']", action: "after" },
  });
  return signer.getSignedXml();
}

function buildEnvelope(signedXml: string, accessKey: string) {
  const batch = `<enviNFe xmlns="${NAMESPACE}" versao="4.00"><idLote>${buildBatchId(accessKey)}</idLote><indSinc>1</indSinc>${signedXml}</enviNFe>`;
  return `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">${batch}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;
}

function getSystemCertificateAuthorities() {
  const getCa = (tls as typeof tls & {
    getCACertificates?: (type: "system") => string[];
  }).getCACertificates;
  return getCa
    ? [...tls.rootCertificates, ...getCa("system")]
    : [...tls.rootCertificates];
}

function postSoap(
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
                `A SEFAZ rejeitou a autorização da NFC-e (${response.statusCode}).`,
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
          `Não foi possível comunicar com a SEFAZ: ${error.message}`,
        ),
      ),
    );
    request.write(body);
    request.end();
  });
}

function parseAuthorizationResponse(
  environment: NfceEnvironment,
  responseXml: string,
  signedXml: string,
): NfceAuthorizationResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
    parseTagValue: false,
    removeNSPrefix: true,
  });
  const parsed = parser.parse(responseXml);
  let result =
    parsed?.Envelope?.Body?.nfeAutorizacaoLoteResponse?.nfeAutorizacaoLoteResult ||
    parsed?.Envelope?.Body?.nfeAutorizacaoLoteResult ||
    parsed?.Envelope?.Body?.nfeResultMsg ||
    parsed?.retEnviNFe;
  if (typeof result === "string") {
    result = parser.parse(
      result
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&"),
    );
  }
  const ret = result?.retEnviNFe || result;
  if (!ret) {
    const bodyKeys = Object.keys(parsed?.Envelope?.Body || {}).join(", ");
    throw new BadRequestException(
      `A SEFAZ devolveu uma resposta inválida para a NFC-e. Conteúdo SOAP: ${bodyKeys || "VAZIO"}.`,
    );
  }
  const protocol = ret?.protNFe?.infProt;
  const statusCode = String(protocol?.cStat || ret?.cStat || "").trim();
  const statusMessage = String(protocol?.xMotivo || ret?.xMotivo || "").trim();
  const protocolNumber = protocol?.nProt ? String(protocol.nProt).trim() : null;
  const receivedAt = protocol?.dhRecbto ? String(protocol.dhRecbto).trim() : null;
  const authorized = statusCode === "100";
  const protocolXmlMatch = responseXml.match(/<(?:\w+:)?protNFe[\s\S]*?<\/(?:\w+:)?protNFe>/);
  const processedXml = authorized && protocolXmlMatch
    ? `<nfeProc xmlns="${NAMESPACE}" versao="4.00">${signedXml}${protocolXmlMatch[0]}</nfeProc>`
    : null;
  return {
    authorized,
    environment,
    statusCode,
    statusMessage,
    protocol: protocolNumber,
    receivedAt,
    responseXml,
    processedXml,
  };
}

export async function authorizeNfce(options: {
  environment: NfceEnvironment;
  accessKey: string;
  unsignedXml: string;
  certificate: NfceCertificateMaterial;
}) {
  const signedXml = signNfceXml(options.unsignedXml, options.certificate);
  const envelope = buildEnvelope(signedXml, options.accessKey);
  const responseXml = await postSoap(
    ENDPOINTS[options.environment],
    envelope,
    options.certificate,
    AUTHORIZATION_SOAP_ACTION,
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

export async function queryNfceProtocol(options: {
  environment: NfceEnvironment;
  accessKey: string;
  signedXml: string;
  certificate: NfceCertificateMaterial;
}) {
  const tpAmb = options.environment === "PRODUCTION" ? "1" : "2";
  const queryXml = `<consSitNFe xmlns="${NAMESPACE}" versao="4.00"><tpAmb>${tpAmb}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${options.accessKey}</chNFe></consSitNFe>`;
  const envelope = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4">${queryXml}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;
  const responseXml = await postSoap(
    QUERY_ENDPOINTS[options.environment],
    envelope,
    options.certificate,
    QUERY_SOAP_ACTION,
  );
  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
    parseTagValue: false,
    removeNSPrefix: true,
  });
  const parsed = parser.parse(responseXml);
  let result =
    parsed?.Envelope?.Body?.nfeConsultaNFResponse?.nfeConsultaNFResult ||
    parsed?.Envelope?.Body?.nfeConsultaNFResult ||
    parsed?.Envelope?.Body?.nfeResultMsg ||
    parsed?.retConsSitNFe;
  if (typeof result === "string") {
    result = parser.parse(
      result
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&"),
    );
  }
  const ret = result?.retConsSitNFe || result;
  const protocol = ret?.protNFe?.infProt;
  const statusCode = String(protocol?.cStat || ret?.cStat || "").trim();
  const statusMessage = String(protocol?.xMotivo || ret?.xMotivo || "").trim();
  const authorized = statusCode === "100";
  const protocolXmlMatch = responseXml.match(/<(?:\w+:)?protNFe[\s\S]*?<\/(?:\w+:)?protNFe>/);
  return {
    authorized,
    environment: options.environment,
    statusCode,
    statusMessage,
    protocol: protocol?.nProt ? String(protocol.nProt).trim() : null,
    receivedAt: protocol?.dhRecbto ? String(protocol.dhRecbto).trim() : null,
    responseXml,
    processedXml: authorized && protocolXmlMatch
      ? `<nfeProc xmlns="${NAMESPACE}" versao="4.00">${options.signedXml}${protocolXmlMatch[0]}</nfeProc>`
      : null,
  };
}
