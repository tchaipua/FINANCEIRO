import { createHash, randomInt } from "crypto";
import { BadRequestException } from "@nestjs/common";
import { BuildNfceOptions, BuiltNfce, NfceItem } from "./nfce.types";

const HOMOLOGATION_PRODUCT_DESCRIPTION =
  "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";
const NAMESPACE = "http://www.portalfiscal.inf.br/nfe";

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function money(value: number) {
  return (Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100).toFixed(2);
}

function quantity(value: number) {
  return Number(value || 0).toFixed(4);
}

function rate(value: number) {
  return Number(value || 0).toFixed(4);
}

function pad(value: number | string, length: number) {
  return digits(value).padStart(length, "0").slice(-length);
}

function modulo11(base: string) {
  let weight = 2;
  let sum = 0;
  for (let index = base.length - 1; index >= 0; index -= 1) {
    sum += Number(base[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const digit = 11 - remainder;
  return digit === 10 || digit === 11 ? "0" : String(digit);
}

function formatSaoPauloDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}-03:00`;
}

function buildAccessKey(options: BuildNfceOptions, randomCode: string) {
  const stateCode = pad(options.issuer.stateCode, 2);
  const issuedAt = formatSaoPauloDate(options.issuedAt);
  const yearMonth = `${issuedAt.slice(2, 4)}${issuedAt.slice(5, 7)}`;
  const base = [
    stateCode,
    yearMonth,
    pad(options.issuer.cnpj, 14),
    "65",
    pad(options.series, 3),
    pad(options.number, 9),
    "1",
    pad(randomCode, 8),
  ].join("");
  return `${base}${modulo11(base)}`;
}

function validateOptions(options: BuildNfceOptions) {
  if (digits(options.issuer.cnpj).length !== 14) {
    throw new BadRequestException("O emitente da NFC-e precisa possuir CNPJ válido.");
  }
  if (!digits(options.issuer.stateRegistration)) {
    throw new BadRequestException("Informe a inscrição estadual do emitente da NFC-e.");
  }
  if (!options.items.length) {
    throw new BadRequestException("A NFC-e precisa possuir ao menos um item.");
  }
  if (!options.payments.length) {
    throw new BadRequestException("A NFC-e precisa possuir ao menos um pagamento.");
  }
  if (options.series < 0 || options.series > 999 || options.number <= 0) {
    throw new BadRequestException("Série ou número da NFC-e inválido.");
  }
}

function buildIcms(item: NfceItem) {
  const itemTotal = Number(item.quantity) * Number(item.unitPrice) - Number(item.discountAmount || 0);
  if (item.icmsCst === "00") {
    const icmsRate = Number(item.icmsRate || 0);
    const icmsAmount = itemTotal * (icmsRate / 100);
    return {
      xml: `<ICMS><ICMS00><orig>${escapeXml(item.originCode)}</orig><CST>00</CST><modBC>3</modBC><vBC>${money(itemTotal)}</vBC><pICMS>${rate(icmsRate)}</pICMS><vICMS>${money(icmsAmount)}</vICMS></ICMS00></ICMS>`,
      base: itemTotal,
      amount: icmsAmount,
    };
  }
  if (["40", "41", "50"].includes(item.icmsCst)) {
    return {
      xml: `<ICMS><ICMS40><orig>${escapeXml(item.originCode)}</orig><CST>${escapeXml(item.icmsCst)}</CST></ICMS40></ICMS>`,
      base: 0,
      amount: 0,
    };
  }
  throw new BadRequestException(`CST de ICMS ${item.icmsCst} ainda não suportado na NFC-e.`);
}

function buildItemXml(item: NfceItem, index: number, homologation: boolean) {
  const gross = Number(item.quantity) * Number(item.unitPrice);
  const discount = Number(item.discountAmount || 0);
  const icms = buildIcms(item);
  const description = homologation && index === 0
    ? HOMOLOGATION_PRODUCT_DESCRIPTION
    : item.description;
  const cest = digits(item.cestCode);
  const discountXml = discount > 0 ? `<vDesc>${money(discount)}</vDesc>` : "";
  const cestXml = cest ? `<CEST>${cest}</CEST>` : "";
  const ibsCbsBase = gross - discount;
  const ibsStateRate = Number(item.ibsStateRate ?? 0.1);
  const ibsMunicipalRate = Number(item.ibsMunicipalRate ?? 0);
  const cbsRate = Number(item.cbsRate ?? 0.9);
  const ibsUfAmount = ibsCbsBase * (ibsStateRate / 100);
  const ibsMunicipalAmount = ibsCbsBase * (ibsMunicipalRate / 100);
  const ibsAmount = ibsUfAmount + ibsMunicipalAmount;
  const cbsAmount = ibsCbsBase * (cbsRate / 100);
  const ibsCbsXml = `<IBSCBS><CST>${pad(item.ibsCbsCst || "000", 3)}</CST><cClassTrib>${pad(item.ibsCbsClassCode || "000001", 6)}</cClassTrib><gIBSCBS><vBC>${money(ibsCbsBase)}</vBC><gIBSUF><pIBSUF>${rate(ibsStateRate)}</pIBSUF><vIBSUF>${money(ibsUfAmount)}</vIBSUF></gIBSUF><gIBSMun><pIBSMun>${rate(ibsMunicipalRate)}</pIBSMun><vIBSMun>${money(ibsMunicipalAmount)}</vIBSMun></gIBSMun><vIBS>${money(ibsAmount)}</vIBS><gCBS><pCBS>${rate(cbsRate)}</pCBS><vCBS>${money(cbsAmount)}</vCBS></gCBS></gIBSCBS></IBSCBS>`;
  const xml = [
    `<det nItem="${index + 1}"><prod><cProd>${escapeXml(item.code)}</cProd><cEAN>SEM GTIN</cEAN><xProd>${escapeXml(description)}</xProd><NCM>${pad(item.ncmCode || "00000000", 8)}</NCM>${cestXml}<CFOP>${pad(item.cfopCode, 4)}</CFOP><uCom>${escapeXml(item.unitCode)}</uCom><qCom>${quantity(item.quantity)}</qCom><vUnCom>${money(item.unitPrice)}</vUnCom><vProd>${money(gross)}</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>${escapeXml(item.unitCode)}</uTrib><qTrib>${quantity(item.quantity)}</qTrib><vUnTrib>${money(item.unitPrice)}</vUnTrib>${discountXml}<indTot>1</indTot></prod>`,
    `<imposto><vTotTrib>0.00</vTotTrib>${icms.xml}`,
    `<PIS><PISNT><CST>${escapeXml(item.pisCst)}</CST></PISNT></PIS>`,
    `<COFINS><COFINSNT><CST>${escapeXml(item.cofinsCst)}</CST></COFINSNT></COFINS>`,
    `${ibsCbsXml}</imposto></det>`,
  ].join("");
  return {
    xml,
    gross,
    discount,
    icmsBase: icms.base,
    icmsAmount: icms.amount,
    ibsCbsBase,
    ibsUfAmount,
    ibsMunicipalAmount,
    ibsAmount,
    cbsAmount,
  };
}

export function buildNfceXml(options: BuildNfceOptions): BuiltNfce {
  validateOptions(options);
  const homologation = options.environment === "HOMOLOGATION";
  const randomCode = pad(options.randomCode || randomInt(1, 99_999_999), 8);
  const accessKey = buildAccessKey(options, randomCode);
  const checkDigit = accessKey.slice(-1);
  const issuedAt = formatSaoPauloDate(options.issuedAt);
  const builtItems = options.items.map((item, index) => buildItemXml(item, index, homologation));
  const totals = builtItems.reduce(
    (result, item) => ({
      products: result.products + item.gross,
      discount: result.discount + item.discount,
      icmsBase: result.icmsBase + item.icmsBase,
      icms: result.icms + item.icmsAmount,
      ibsCbsBase: result.ibsCbsBase + item.ibsCbsBase,
      ibsUf: result.ibsUf + item.ibsUfAmount,
      ibsMunicipal: result.ibsMunicipal + item.ibsMunicipalAmount,
      ibs: result.ibs + item.ibsAmount,
      cbs: result.cbs + item.cbsAmount,
    }),
    {
      products: 0,
      discount: 0,
      icmsBase: 0,
      icms: 0,
      ibsCbsBase: 0,
      ibsUf: 0,
      ibsMunicipal: 0,
      ibs: 0,
      cbs: 0,
    },
  );
  const invoiceTotal = totals.products - totals.discount;
  const paymentTotal = options.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  if (Math.abs(paymentTotal - invoiceTotal) > 0.01) {
    throw new BadRequestException("A soma dos pagamentos deve ser igual ao total da NFC-e.");
  }
  options.softwareVersion = (options.softwareVersion || "MSINFOR FIN 1.0").slice(0, 20);

  const issuer = options.issuer;
  const publicConsultationUrl = options.environment === "PRODUCTION"
    ? "https://www.nfce.fazenda.sp.gov.br/consulta"
    : "https://www.homologacao.nfce.fazenda.sp.gov.br/consulta";
  const qrBase = options.environment === "PRODUCTION"
    ? "https://www.nfce.fazenda.sp.gov.br/qrcode"
    : "https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode";
  const qrCodeUrl = `${qrBase}?p=${accessKey}|3|${homologation ? "2" : "1"}`;
  const additionalInformation = [
    options.additionalInformation,
    homologation ? "DOCUMENTO EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL" : null,
  ].filter(Boolean).join(" | ");
  const additionalXml = additionalInformation
    ? `<infAdic><infCpl>${escapeXml(additionalInformation)}</infCpl></infAdic>`
    : "";
  const paymentsXml = options.payments
    .map((payment) => {
      const cardXml = payment.cardIntegrationType
        ? `<card><tpIntegra>${payment.cardIntegrationType}</tpIntegra></card>`
        : "";
      return `<detPag><tPag>${pad(payment.methodCode, 2)}</tPag><vPag>${money(payment.amount)}</vPag>${cardXml}</detPag>`;
    })
    .join("");
  const complementXml = issuer.complement ? `<xCpl>${escapeXml(issuer.complement)}</xCpl>` : "";
  const tradeNameXml = issuer.tradeName ? `<xFant>${escapeXml(issuer.tradeName)}</xFant>` : "";
  const phoneXml = digits(issuer.phone) ? `<fone>${digits(issuer.phone)}</fone>` : "";
  const recipientDocument = digits(options.recipient?.document);
  const recipientName = homologation
    ? "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
    : options.recipient?.name;
  const recipientXml = recipientDocument.length === 11 || recipientDocument.length === 14
    ? `<dest><${recipientDocument.length === 11 ? "CPF" : "CNPJ"}>${recipientDocument}</${recipientDocument.length === 11 ? "CPF" : "CNPJ"}><xNome>${escapeXml(recipientName)}</xNome><indIEDest>9</indIEDest></dest>`
    : "";

  const ideXml = `<ide><cUF>${pad(issuer.stateCode, 2)}</cUF><cNF>${randomCode}</cNF><natOp>VENDA DE MERCADORIA</natOp><mod>65</mod><serie>${options.series}</serie><nNF>${options.number}</nNF><dhEmi>${issuedAt}</dhEmi><tpNF>1</tpNF><idDest>1</idDest><cMunFG>${pad(issuer.cityCode, 7)}</cMunFG><tpImp>4</tpImp><tpEmis>1</tpEmis><cDV>${checkDigit}</cDV><tpAmb>${homologation ? "2" : "1"}</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>${escapeXml(options.softwareVersion)}</verProc></ide>`;
  const issuerXml = `<emit><CNPJ>${digits(issuer.cnpj)}</CNPJ><xNome>${escapeXml(issuer.legalName)}</xNome>${tradeNameXml}<enderEmit><xLgr>${escapeXml(issuer.street)}</xLgr><nro>${escapeXml(issuer.number)}</nro>${complementXml}<xBairro>${escapeXml(issuer.neighborhood)}</xBairro><cMun>${pad(issuer.cityCode, 7)}</cMun><xMun>${escapeXml(issuer.city)}</xMun><UF>${escapeXml(issuer.state)}</UF><CEP>${pad(issuer.postalCode, 8)}</CEP><cPais>1058</cPais><xPais>BRASIL</xPais>${phoneXml}</enderEmit><IE>${digits(issuer.stateRegistration)}</IE><CRT>${issuer.taxRegimeCode}</CRT></emit>`;
  const icmsTotalXml = `<ICMSTot><vBC>${money(totals.icmsBase)}</vBC><vICMS>${money(totals.icms)}</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${money(totals.products)}</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>${money(totals.discount)}</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>${money(invoiceTotal)}</vNF><vTotTrib>0.00</vTotTrib></ICMSTot>`;
  const ibsCbsTotalXml = `<IBSCBSTot><vBCIBSCBS>${money(totals.ibsCbsBase)}</vBCIBSCBS><gIBS><gIBSUF><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSUF>${money(totals.ibsUf)}</vIBSUF></gIBSUF><gIBSMun><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSMun>${money(totals.ibsMunicipal)}</vIBSMun></gIBSMun><vIBS>${money(totals.ibs)}</vIBS><vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus></gIBS><gCBS><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vCBS>${money(totals.cbs)}</vCBS><vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus></gCBS></IBSCBSTot><vNFTot>${money(invoiceTotal + totals.ibs + totals.cbs)}</vNFTot>`;
  const unsignedXml = [
    `<NFe xmlns="${NAMESPACE}"><infNFe Id="NFe${accessKey}" versao="4.00">`,
    ideXml,
    issuerXml,
    recipientXml,
    builtItems.map((item) => item.xml).join(""),
    `<total>${icmsTotalXml}${ibsCbsTotalXml}</total>`,
    `<transp><modFrete>9</modFrete></transp><pag>${paymentsXml}<vTroco>0.00</vTroco></pag>`,
    `${additionalXml}</infNFe><infNFeSupl><qrCode>${escapeXml(qrCodeUrl)}</qrCode><urlChave>${escapeXml(publicConsultationUrl)}</urlChave></infNFeSupl></NFe>`,
  ].join("");

  return {
    accessKey,
    checkDigit,
    randomCode,
    unsignedXml,
    qrCodeUrl,
    publicConsultationUrl,
    totals: {
      products: Number(money(totals.products)),
      discount: Number(money(totals.discount)),
      icmsBase: Number(money(totals.icmsBase)),
      icms: Number(money(totals.icms)),
      invoice: Number(money(invoiceTotal)),
    },
  };
}

export function buildBatchId(accessKey: string) {
  const digest = createHash("sha256").update(accessKey).digest("hex");
  return BigInt(`0x${digest.slice(0, 14)}`).toString().slice(0, 15).padStart(15, "0");
}
