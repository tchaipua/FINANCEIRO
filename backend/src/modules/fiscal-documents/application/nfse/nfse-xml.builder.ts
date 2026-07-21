import { BadRequestException } from "@nestjs/common";
import { SignedXml } from "xml-crypto";
import { NfceCertificateMaterial } from "../nfce/nfce.types";
import { NfseAddress, NfseDpsBuildInput } from "./nfse.types";

const NFSE_NAMESPACE = "http://www.sped.fazenda.gov.br/nfse";

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function digits(value?: string | null) {
  return String(value || "").replace(/\D+/g, "");
}

function money(value: number) {
  return Number(value || 0).toFixed(2);
}

function percentage(value: number) {
  return Number(value || 0).toFixed(2);
}

function dateOnly(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatNfseDateTime(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hour = String(value.getHours()).padStart(2, "0");
  const minute = String(value.getMinutes()).padStart(2, "0");
  const second = String(value.getSeconds()).padStart(2, "0");
  const rawOffset = -value.getTimezoneOffset();
  const sign = rawOffset >= 0 ? "+" : "-";
  const offsetHours = String(Math.floor(Math.abs(rawOffset) / 60)).padStart(
    2,
    "0",
  );
  const offsetMinutes = String(Math.abs(rawOffset) % 60).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${offsetHours}:${offsetMinutes}`;
}

function documentElement(document: string) {
  const normalized = digits(document);
  if (normalized.length === 11) return `<CPF>${normalized}</CPF>`;
  if (normalized.length === 14) return `<CNPJ>${normalized}</CNPJ>`;
  throw new BadRequestException(
    "O leiaute NFS-e Nacional 1.01 exige CPF com 11 ou CNPJ numérico com 14 dígitos.",
  );
}

function addressXml(address: NfseAddress) {
  const cityCode = digits(address.cityCode);
  const postalCode = digits(address.postalCode);
  if (cityCode.length !== 7 || postalCode.length !== 8) {
    throw new BadRequestException(
      "O endereço da NFS-e exige código IBGE com 7 dígitos e CEP com 8 dígitos.",
    );
  }
  return [
    "<end>",
    `<endNac><cMun>${cityCode}</cMun><CEP>${postalCode}</CEP></endNac>`,
    `<xLgr>${escapeXml(address.street)}</xLgr>`,
    `<nro>${escapeXml(address.number)}</nro>`,
    address.complement
      ? `<xCpl>${escapeXml(address.complement)}</xCpl>`
      : "",
    `<xBairro>${escapeXml(address.neighborhood)}</xBairro>`,
    "</end>",
  ].join("");
}

export function buildNfseDpsId(params: {
  municipalityCode: string;
  issuerDocument: string;
  series: number;
  number: number;
}) {
  const municipalityCode = digits(params.municipalityCode);
  const issuerDocument = digits(params.issuerDocument);
  if (municipalityCode.length !== 7) {
    throw new BadRequestException(
      "O código do município emissor da DPS deve possuir 7 dígitos.",
    );
  }
  const federalRegistrationType = issuerDocument.length === 14 ? "2" : "1";
  if (![11, 14].includes(issuerDocument.length)) {
    throw new BadRequestException(
      "O emitente da DPS deve possuir CPF ou CNPJ numérico válido.",
    );
  }
  const paddedDocument = issuerDocument.padStart(14, "0");
  const series = String(params.series).padStart(5, "0");
  const number = String(params.number).padStart(15, "0");
  const id = `DPS${municipalityCode}${federalRegistrationType}${paddedDocument}${series}${number}`;
  if (!/^DPS\d{42}$/.test(id)) {
    throw new BadRequestException("Não foi possível formar o identificador da DPS.");
  }
  return id;
}

export function buildNfseDpsXml(input: NfseDpsBuildInput) {
  if (input.service.ibsCbsEnabled) {
    throw new BadRequestException(
      "IBS/CBS DA NFS-E AINDA NÃO PODE SER ATIVADO SEM A CLASSIFICAÇÃO RTC COMPLETA DO SERVIÇO.",
    );
  }
  const issuerCityCode = digits(input.issuer.address.cityCode);
  const dpsId = buildNfseDpsId({
    municipalityCode: issuerCityCode,
    issuerDocument: input.issuer.document,
    series: input.series,
    number: input.number,
  });
  const serviceCityCode = digits(input.service.serviceCityCode);
  const nationalTaxCode = digits(input.service.nationalTaxCode);
  const municipalTaxCode = String(input.service.municipalTaxCode || "").trim();
  const nbsCode = digits(input.service.nbsCode);
  if (serviceCityCode.length !== 7 || nationalTaxCode.length !== 6) {
    throw new BadRequestException(
      "O serviço exige município IBGE com 7 dígitos e código de tributação nacional com 6 dígitos.",
    );
  }
  if (nbsCode && nbsCode.length !== 9) {
    throw new BadRequestException("O código NBS deve possuir 9 dígitos.");
  }
  const grossAmount = Number(input.grossAmount || 0);
  const discountAmount = Number(input.discountAmount || 0);
  const deductionAmount = Number(input.deductionAmount || 0);
  if (
    grossAmount <= 0 ||
    discountAmount < 0 ||
    deductionAmount < 0 ||
    discountAmount + deductionAmount >= grossAmount
  ) {
    throw new BadRequestException(
      "Os valores da NFS-e são inválidos; descontos e deduções devem ser menores que o serviço.",
    );
  }
  const issuerPhone = digits(input.issuer.phone);
  const takerPhone = digits(input.taker.phone);
  const includeFederalTaxes = Boolean(
    input.service.pisCofinsCst ||
      input.service.pisRate ||
      input.service.cofinsRate,
  );
  const totalTaxXml =
    Number(input.service.simpleNationalTotalTaxRate || 0) > 0
      ? `<pTotTribSN>${percentage(input.service.simpleNationalTotalTaxRate!)}</pTotTribSN>`
      : "<indTotTrib>0</indTotTrib>";

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<DPS xmlns="${NFSE_NAMESPACE}" versao="${input.schemaVersion}">`,
    `<infDPS Id="${dpsId}">`,
    `<tpAmb>${input.environment === "PRODUCTION" ? "1" : "2"}</tpAmb>`,
    `<dhEmi>${formatNfseDateTime(input.issuedAt)}</dhEmi>`,
    `<verAplic>${escapeXml(input.softwareVersion)}</verAplic>`,
    `<serie>${input.series}</serie>`,
    `<nDPS>${input.number}</nDPS>`,
    `<dCompet>${dateOnly(input.competenceDate)}</dCompet>`,
    "<tpEmit>1</tpEmit>",
    `<cLocEmi>${issuerCityCode}</cLocEmi>`,
    "<prest>",
    documentElement(input.issuer.document),
    input.issuer.municipalRegistration
      ? `<IM>${escapeXml(input.issuer.municipalRegistration)}</IM>`
      : "",
    `<xNome>${escapeXml(input.issuer.legalName)}</xNome>`,
    addressXml(input.issuer.address),
    issuerPhone ? `<fone>${issuerPhone}</fone>` : "",
    input.issuer.email ? `<email>${escapeXml(input.issuer.email)}</email>` : "",
    "<regTrib>",
    `<opSimpNac>${input.issuer.simpleNationalOption}</opSimpNac>`,
    input.issuer.simpleNationalOption === 3 &&
    input.issuer.simpleNationalTaxRegime
      ? `<regApTribSN>${input.issuer.simpleNationalTaxRegime}</regApTribSN>`
      : "",
    `<regEspTrib>${input.issuer.specialTaxRegime}</regEspTrib>`,
    "</regTrib>",
    "</prest>",
    "<toma>",
    documentElement(input.taker.document),
    input.taker.municipalRegistration
      ? `<IM>${escapeXml(input.taker.municipalRegistration)}</IM>`
      : "",
    `<xNome>${escapeXml(input.taker.name)}</xNome>`,
    addressXml(input.taker.address),
    takerPhone ? `<fone>${takerPhone}</fone>` : "",
    input.taker.email ? `<email>${escapeXml(input.taker.email)}</email>` : "",
    "</toma>",
    "<serv>",
    `<locPrest><cLocPrestacao>${serviceCityCode}</cLocPrestacao></locPrest>`,
    "<cServ>",
    `<cTribNac>${nationalTaxCode}</cTribNac>`,
    municipalTaxCode
      ? `<cTribMun>${escapeXml(municipalTaxCode)}</cTribMun>`
      : "",
    `<xDescServ>${escapeXml(input.service.description)}</xDescServ>`,
    nbsCode ? `<cNBS>${nbsCode}</cNBS>` : "",
    `<cIntContrib>${escapeXml(input.service.internalCode)}</cIntContrib>`,
    "</cServ>",
    "</serv>",
    "<valores>",
    `<vServPrest><vServ>${money(grossAmount)}</vServ></vServPrest>`,
    discountAmount > 0
      ? `<vDescCondIncond><vDescIncond>${money(discountAmount)}</vDescIncond></vDescCondIncond>`
      : "",
    deductionAmount > 0
      ? `<vDedRed><vDR>${money(deductionAmount)}</vDR></vDedRed>`
      : "",
    "<trib><tribMun>",
    `<tribISSQN>${input.service.issTaxationCode}</tribISSQN>`,
    `<tpRetISSQN>${input.service.issWithholdingCode}</tpRetISSQN>`,
    input.service.issRate != null
      ? `<pAliq>${percentage(input.service.issRate)}</pAliq>`
      : "",
    "</tribMun>",
    includeFederalTaxes
      ? [
          "<tribFed><piscofins>",
          `<CST>${escapeXml(input.service.pisCofinsCst || "00")}</CST>`,
          input.service.pisRate != null
            ? `<pAliqPis>${percentage(input.service.pisRate)}</pAliqPis>`
            : "",
          input.service.cofinsRate != null
            ? `<pAliqCofins>${percentage(input.service.cofinsRate)}</pAliqCofins>`
            : "",
          "</piscofins></tribFed>",
        ].join("")
      : "",
    `<totTrib>${totalTaxXml}</totTrib>`,
    "</trib></valores>",
    "</infDPS>",
    "</DPS>",
  ].join("");
  return { dpsId, xml };
}

export function signNfseDpsXml(
  unsignedXml: string,
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
    xpath: "//*[local-name(.)='infDPS']",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
  });
  signer.computeSignature(unsignedXml, {
    location: {
      reference: "//*[local-name(.)='infDPS']",
      action: "after",
    },
  });
  return signer.getSignedXml();
}
