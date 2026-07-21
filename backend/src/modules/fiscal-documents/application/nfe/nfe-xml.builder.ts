import { createHash, randomInt } from "crypto";
import { BadRequestException } from "@nestjs/common";
import {
  assertValidCnpj,
  calculateFiscalAccessKeyDigit,
  isCnpj,
  isCpf,
  isValidBrazilTaxId,
  normalizeTaxId,
} from "../../../../common/brazil-tax-id.utils";
import {
  BuildNfeOptions,
  BuiltNfe,
  BuiltNfeItem,
  NfeItem,
} from "./nfe.types";

const NAMESPACE = "http://www.portalfiscal.inf.br/nfe";
const HOMOLOGATION_RECIPIENT_NAME =
  "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";
const CBENEF_SEM_CODIGO_END_DATE = "2026-07-01";

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

function decimal(value: number, scale = 4) {
  return Number(value || 0).toFixed(scale);
}

function padDigits(value: number | string, length: number) {
  return digits(value).padStart(length, "0").slice(-length);
}

function optionalXml(tag: string, value?: unknown | null) {
  const normalized = String(value ?? "").trim();
  return normalized ? `<${tag}>${escapeXml(normalized)}</${tag}>` : "";
}

export function formatNfeDateTime(date: Date) {
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

function normalizeGtin(value?: string | null) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized || normalized === "SEM GTIN") return "SEM GTIN";
  if (!/^\d{8}$|^\d{12,14}$/.test(normalized)) {
    throw new BadRequestException(
      `GTIN inválido (${normalized}). Informe 8, 12, 13 ou 14 dígitos, ou SEM GTIN.`,
    );
  }
  return normalized;
}

function validateBenefitCode(
  value: string | null | undefined,
  issuedAt: Date,
  issuerState: string,
) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return null;
  if (
    normalized === "SEM CBENEF" &&
    issuerState.toUpperCase() === "SP" &&
    formatNfeDateTime(issuedAt).slice(0, 10) >= CBENEF_SEM_CODIGO_END_DATE
  ) {
    throw new BadRequestException(
      "SEM CBENEF não é aceito em São Paulo desde 01/07/2026. Informe um código vigente ou deixe o campo vazio quando não houver benefício.",
    );
  }
  if (normalized !== "SEM CBENEF" && !/^[!-ÿ]{8}$|^[!-ÿ]{10}$/.test(normalized)) {
    throw new BadRequestException(`Código de benefício fiscal inválido: ${normalized}.`);
  }
  return normalized;
}

function buildAccessKey(options: BuildNfeOptions, randomCode: string) {
  const issuerCnpj = assertValidCnpj(options.issuer.cnpj, "o CNPJ do emitente");
  const issuedAt = formatNfeDateTime(options.issuedAt);
  const yearMonth = `${issuedAt.slice(2, 4)}${issuedAt.slice(5, 7)}`;
  const base = [
    padDigits(options.issuer.stateCode, 2),
    yearMonth,
    issuerCnpj,
    "55",
    padDigits(options.series, 3),
    padDigits(options.number, 9),
    "1",
    padDigits(randomCode, 8),
  ].join("");
  return `${base}${calculateFiscalAccessKeyDigit(base)}`;
}

function validateOptions(options: BuildNfeOptions) {
  if (!isValidBrazilTaxId(options.recipient.document)) {
    throw new BadRequestException("O destinatário da NF-e precisa possuir CPF/CNPJ válido.");
  }
  assertValidCnpj(options.issuer.cnpj, "o CNPJ do emitente");
  if (!digits(options.issuer.stateRegistration)) {
    throw new BadRequestException("Informe a inscrição estadual da filial emitente.");
  }
  if (!options.items.length) {
    throw new BadRequestException("A NF-e precisa possuir ao menos um item.");
  }
  if (!options.payments.length) {
    throw new BadRequestException("A NF-e precisa possuir ao menos uma forma de pagamento.");
  }
  if (options.series < 0 || options.series > 999 || options.number <= 0) {
    throw new BadRequestException("Série ou número da NF-e inválido.");
  }
  if (!/^\d{7}$/.test(digits(options.issuer.cityCode))) {
    throw new BadRequestException("Código IBGE do município emitente inválido.");
  }
  if (!/^\d{7}$/.test(digits(options.recipient.cityCode))) {
    throw new BadRequestException("Código IBGE do município destinatário inválido.");
  }
}

function buildIcms(item: NfeItem, itemTotal: number) {
  const origin = padDigits(item.originCode, 1);
  const csosn = digits(item.icmsCsosnCode);
  const cst = digits(item.icmsCstCode);

  if (["102", "103", "300", "400"].includes(csosn)) {
    return {
      xml: `<ICMS><ICMSSN102><orig>${origin}</orig><CSOSN>${csosn}</CSOSN></ICMSSN102></ICMS>`,
      base: 0,
      amount: 0,
      code: csosn,
    };
  }

  if (cst === "00") {
    const rate = Number(item.icmsRate || 0);
    const amount = itemTotal * (rate / 100);
    return {
      xml: `<ICMS><ICMS00><orig>${origin}</orig><CST>00</CST><modBC>3</modBC><vBC>${money(itemTotal)}</vBC><pICMS>${decimal(rate)}</pICMS><vICMS>${money(amount)}</vICMS></ICMS00></ICMS>`,
      base: itemTotal,
      amount,
      code: cst,
    };
  }

  if (["40", "41", "50"].includes(cst)) {
    return {
      xml: `<ICMS><ICMS40><orig>${origin}</orig><CST>${cst}</CST></ICMS40></ICMS>`,
      base: 0,
      amount: 0,
      code: cst,
    };
  }

  throw new BadRequestException(
    `Regra de ICMS sem grupo XML suportado para o item ${item.description}.`,
  );
}

function buildPis(item: NfeItem, itemTotal: number) {
  const cst = padDigits(item.pisCstCode, 2);
  if (["04", "05", "06", "07", "08", "09"].includes(cst)) {
    return {
      xml: `<PIS><PISNT><CST>${cst}</CST></PISNT></PIS>`,
      amount: 0,
    };
  }
  if (
    [
      "49", "50", "51", "52", "53", "54", "55", "56", "60", "61", "62",
      "63", "64", "65", "66", "67", "70", "71", "72", "73", "74", "75",
      "98", "99",
    ].includes(cst)
  ) {
    const rate = Number(item.pisRate || 0);
    const amount = itemTotal * (rate / 100);
    return {
      xml: `<PIS><PISOutr><CST>${cst}</CST><vBC>${money(itemTotal)}</vBC><pPIS>${decimal(rate)}</pPIS><vPIS>${money(amount)}</vPIS></PISOutr></PIS>`,
      amount,
    };
  }
  throw new BadRequestException(`CST de PIS ${cst} não suportado para emissão.`);
}

function buildCofins(item: NfeItem, itemTotal: number) {
  const cst = padDigits(item.cofinsCstCode, 2);
  if (["04", "05", "06", "07", "08", "09"].includes(cst)) {
    return {
      xml: `<COFINS><COFINSNT><CST>${cst}</CST></COFINSNT></COFINS>`,
      amount: 0,
    };
  }
  if (
    [
      "49", "50", "51", "52", "53", "54", "55", "56", "60", "61", "62",
      "63", "64", "65", "66", "67", "70", "71", "72", "73", "74", "75",
      "98", "99",
    ].includes(cst)
  ) {
    const rate = Number(item.cofinsRate || 0);
    const amount = itemTotal * (rate / 100);
    return {
      xml: `<COFINS><COFINSOutr><CST>${cst}</CST><vBC>${money(itemTotal)}</vBC><pCOFINS>${decimal(rate)}</pCOFINS><vCOFINS>${money(amount)}</vCOFINS></COFINSOutr></COFINS>`,
      amount,
    };
  }
  throw new BadRequestException(`CST de COFINS ${cst} não suportado para emissão.`);
}

function buildIpi(item: NfeItem, itemTotal: number) {
  const cst = digits(item.ipiCstCode);
  if (!cst) return { xml: "", amount: 0 };
  const frameworkCode = padDigits(item.ipiFrameworkCode || "999", 3);
  if (["01", "02", "03", "04", "05", "51", "52", "53", "54", "55"].includes(cst)) {
    return {
      xml: `<IPI><cEnq>${frameworkCode}</cEnq><IPINT><CST>${padDigits(cst, 2)}</CST></IPINT></IPI>`,
      amount: 0,
    };
  }
  if (["00", "49", "50", "99"].includes(cst)) {
    const rate = Number(item.ipiRate || 0);
    const amount = itemTotal * (rate / 100);
    return {
      xml: `<IPI><cEnq>${frameworkCode}</cEnq><IPITrib><CST>${padDigits(cst, 2)}</CST><vBC>${money(itemTotal)}</vBC><pIPI>${decimal(rate)}</pIPI><vIPI>${money(amount)}</vIPI></IPITrib></IPI>`,
      amount,
    };
  }
  throw new BadRequestException(`CST de IPI ${cst} não suportado para emissão.`);
}

function buildItemXml(
  item: NfeItem,
  index: number,
  options: BuildNfeOptions,
): { xml: string; built: BuiltNfeItem; icmsBase: number } {
  const gross = Number(item.quantity) * Number(item.unitPrice);
  const discount = Number(item.discountAmount || 0);
  const total = gross - discount;
  if (total < 0) {
    throw new BadRequestException(`O desconto do item ${item.description} é inválido.`);
  }
  const ncm = digits(item.ncmCode);
  if (ncm.length !== 8 || ncm === "00000000") {
    throw new BadRequestException(`Informe NCM válido no item ${item.description}.`);
  }
  const cest = digits(item.cestCode);
  if (cest && cest.length !== 7) {
    throw new BadRequestException(`CEST inválido no item ${item.description}.`);
  }
  const benefitCode = validateBenefitCode(
    item.fiscalBenefitCode,
    options.issuedAt,
    options.issuer.state,
  );
  const icms = buildIcms(item, total);
  const pis = buildPis(item, total);
  const cofins = buildCofins(item, total);
  const ipi = buildIpi(item, total);
  if (item.ibsCbsEnabled) {
    throw new BadRequestException(
      "A regra IBS/CBS está ativa, mas o grupo do item ainda não foi liberado para este CRT e data de emissão.",
    );
  }
  const commercialUnit = String(item.unitCode || "UN").trim().toUpperCase();
  const taxableUnit = String(item.taxableUnitCode || commercialUnit)
    .trim()
    .toUpperCase();
  const conversionFactor = Number(item.taxableConversionFactor || 1);
  const taxableQuantity = Number(item.quantity) * conversionFactor;
  const taxableUnitPrice =
    conversionFactor > 0 ? Number(item.unitPrice) / conversionFactor : Number(item.unitPrice);
  const discountXml = discount > 0 ? `<vDesc>${money(discount)}</vDesc>` : "";
  const cestXml = cest ? `<CEST>${cest}</CEST>` : "";
  const benefitXml = benefitCode ? `<cBenef>${escapeXml(benefitCode)}</cBenef>` : "";
  const productXml = [
    `<prod><cProd>${escapeXml(item.code)}</cProd>`,
    `<cEAN>${normalizeGtin(item.gtinCode)}</cEAN>`,
    `<xProd>${escapeXml(item.description)}</xProd>`,
    `<NCM>${ncm}</NCM>${cestXml}${benefitXml}`,
    `<CFOP>${padDigits(item.cfopCode, 4)}</CFOP>`,
    `<uCom>${escapeXml(commercialUnit)}</uCom>`,
    `<qCom>${decimal(item.quantity, 4)}</qCom>`,
    `<vUnCom>${decimal(item.unitPrice, 10)}</vUnCom>`,
    `<vProd>${money(gross)}</vProd>`,
    `<cEANTrib>${normalizeGtin(item.taxableGtinCode || item.gtinCode)}</cEANTrib>`,
    `<uTrib>${escapeXml(taxableUnit)}</uTrib>`,
    `<qTrib>${decimal(taxableQuantity, 4)}</qTrib>`,
    `<vUnTrib>${decimal(taxableUnitPrice, 10)}</vUnTrib>`,
    `${discountXml}<indTot>1</indTot></prod>`,
  ].join("");
  const xml = `<det nItem="${index + 1}">${productXml}<imposto><vTotTrib>0.00</vTotTrib>${icms.xml}${ipi.xml}${pis.xml}${cofins.xml}</imposto></det>`;
  return {
    xml,
    icmsBase: icms.base,
    built: {
      ...item,
      lineNumber: index + 1,
      grossAmount: Number(money(gross)),
      discountAmount: Number(money(discount)),
      totalAmount: Number(money(total)),
      icmsAmount: Number(money(icms.amount)),
      pisAmount: Number(money(pis.amount)),
      cofinsAmount: Number(money(cofins.amount)),
      ipiAmount: Number(money(ipi.amount)),
      fiscalBenefitCode: benefitCode,
      taxDetails: {
        originCode: padDigits(item.originCode, 1),
        icmsCode: icms.code,
        icmsBase: Number(money(icms.base)),
        icmsRate: Number(item.icmsRate || 0),
        icmsAmount: Number(money(icms.amount)),
        pisCstCode: padDigits(item.pisCstCode, 2),
        pisRate: Number(item.pisRate || 0),
        pisAmount: Number(money(pis.amount)),
        cofinsCstCode: padDigits(item.cofinsCstCode, 2),
        cofinsRate: Number(item.cofinsRate || 0),
        cofinsAmount: Number(money(cofins.amount)),
        ipiCstCode: item.ipiCstCode || null,
        ipiRate: Number(item.ipiRate || 0),
        ipiAmount: Number(money(ipi.amount)),
        fiscalBenefitCode: benefitCode,
        ibsCbsEnabled: false,
      },
    },
  };
}

function buildRecipientXml(options: BuildNfeOptions) {
  const recipient = options.recipient;
  const document = normalizeTaxId(recipient.document)!;
  const documentTag = isCpf(document) ? "CPF" : isCnpj(document) ? "CNPJ" : "";
  if (!documentTag) {
    throw new BadRequestException("CPF/CNPJ do destinatário inválido.");
  }
  const recipientName =
    options.environment === "HOMOLOGATION"
      ? HOMOLOGATION_RECIPIENT_NAME
      : recipient.name;
  const complement = optionalXml("xCpl", recipient.complement);
  const cep = digits(recipient.postalCode);
  const phone = digits(recipient.phone);
  const ie =
    recipient.stateRegistrationIndicator === "1" && digits(recipient.stateRegistration)
      ? `<IE>${digits(recipient.stateRegistration)}</IE>`
      : "";
  return [
    `<dest><${documentTag}>${document}</${documentTag}>`,
    `<xNome>${escapeXml(recipientName)}</xNome>`,
    `<enderDest><xLgr>${escapeXml(recipient.street)}</xLgr><nro>${escapeXml(recipient.number)}</nro>${complement}`,
    `<xBairro>${escapeXml(recipient.neighborhood)}</xBairro>`,
    `<cMun>${padDigits(recipient.cityCode, 7)}</cMun><xMun>${escapeXml(recipient.city)}</xMun>`,
    `<UF>${escapeXml(recipient.state)}</UF>`,
    `${cep ? `<CEP>${padDigits(cep, 8)}</CEP>` : ""}`,
    `<cPais>${padDigits(recipient.countryCode || "1058", 4)}</cPais>`,
    `<xPais>${escapeXml(recipient.countryName || "BRASIL")}</xPais>`,
    `${phone ? `<fone>${phone}</fone>` : ""}</enderDest>`,
    `<indIEDest>${recipient.stateRegistrationIndicator}</indIEDest>${ie}`,
    `${optionalXml("email", recipient.email)}</dest>`,
  ].join("");
}

function buildPaymentsXml(options: BuildNfeOptions, invoiceTotal: number) {
  const paymentTotal = options.payments.reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0,
  );
  const onlyLaterPayment = options.payments.every(
    (payment) => padDigits(payment.methodCode, 2) === "91",
  );
  if (
    (!onlyLaterPayment && Math.abs(paymentTotal - invoiceTotal) > 0.01) ||
    (onlyLaterPayment && Math.abs(paymentTotal) > 0.01)
  ) {
    throw new BadRequestException(
      "A soma das formas de pagamento deve corresponder ao total da NF-e.",
    );
  }
  const details = options.payments
    .map((payment) => {
      const methodCode = padDigits(payment.methodCode, 2);
      const cardXml = payment.cardIntegrationType
        ? `<card><tpIntegra>${payment.cardIntegrationType}</tpIntegra></card>`
        : "";
      const paymentDate = payment.paymentDate
        ? `<dPag>${escapeXml(payment.paymentDate)}</dPag>`
        : "";
      return `<detPag><indPag>${payment.indicator}</indPag><tPag>${methodCode}</tPag><vPag>${money(payment.amount)}</vPag>${paymentDate}${cardXml}</detPag>`;
    })
    .join("");
  return `<pag>${details}<vTroco>0.00</vTroco></pag>`;
}

function buildBillingXml(options: BuildNfeOptions, invoiceTotal: number) {
  const installments = options.installments || [];
  if (!installments.length) return "";
  const installmentTotal = installments.reduce(
    (sum, installment) => sum + Number(installment.amount || 0),
    0,
  );
  if (Math.abs(installmentTotal - invoiceTotal) > 0.01) {
    throw new BadRequestException(
      "A soma das duplicatas deve corresponder ao total da NF-e.",
    );
  }
  const reference = String(options.invoiceReference || options.number)
    .trim()
    .slice(0, 60);
  const duplicates = installments
    .map(
      (installment) =>
        `<dup><nDup>${escapeXml(installment.number.slice(0, 60))}</nDup><dVenc>${escapeXml(installment.dueDate)}</dVenc><vDup>${money(installment.amount)}</vDup></dup>`,
    )
    .join("");
  return `<cobr><fat><nFat>${escapeXml(reference)}</nFat><vOrig>${money(invoiceTotal)}</vOrig><vDesc>0.00</vDesc><vLiq>${money(invoiceTotal)}</vLiq></fat>${duplicates}</cobr>`;
}

function buildTechnicalResponsibleXml(options: BuildNfeOptions) {
  const responsible = options.technicalResponsible;
  if (!responsible) return "";
  const cnpj = assertValidCnpj(
    responsible.cnpj,
    "o CNPJ do responsável técnico",
  );
  return [
    `<infRespTec><CNPJ>${cnpj}</CNPJ>`,
    `<xContato>${escapeXml(responsible.contact)}</xContato>`,
    `<email>${escapeXml(responsible.email)}</email>`,
    `<fone>${digits(responsible.phone)}</fone>`,
    `${optionalXml("idCSRT", responsible.csrtId)}`,
    `${optionalXml("hashCSRT", responsible.csrtHash)}</infRespTec>`,
  ].join("");
}

export function buildNfeXml(options: BuildNfeOptions): BuiltNfe {
  validateOptions(options);
  const randomCode = padDigits(options.randomCode || randomInt(1, 99_999_999), 8);
  const accessKey = buildAccessKey(options, randomCode);
  const checkDigit = accessKey.slice(-1);
  const issuedAt = formatNfeDateTime(options.issuedAt);
  const builtItems = options.items.map((item, index) =>
    buildItemXml(item, index, options),
  );
  const totals = builtItems.reduce(
    (result, item) => ({
      products: result.products + item.built.grossAmount,
      discount: result.discount + item.built.discountAmount,
      icmsBase: result.icmsBase + item.icmsBase,
      icms: result.icms + item.built.icmsAmount,
      pis: result.pis + item.built.pisAmount,
      cofins: result.cofins + item.built.cofinsAmount,
      ipi: result.ipi + item.built.ipiAmount,
    }),
    {
      products: 0,
      discount: 0,
      icmsBase: 0,
      icms: 0,
      pis: 0,
      cofins: 0,
      ipi: 0,
    },
  );
  const invoiceTotal = totals.products - totals.discount + totals.ipi;
  const issuer = options.issuer;
  const issuerComplement = optionalXml("xCpl", issuer.complement);
  const issuerTradeName = optionalXml("xFant", issuer.tradeName);
  const issuerPhone = digits(issuer.phone);
  const issuerMunicipalRegistration = digits(issuer.municipalRegistration);
  const ideXml = [
    `<ide><cUF>${padDigits(issuer.stateCode, 2)}</cUF><cNF>${randomCode}</cNF>`,
    `<natOp>${escapeXml(options.operationNature)}</natOp><mod>55</mod>`,
    `<serie>${options.series}</serie><nNF>${options.number}</nNF><dhEmi>${issuedAt}</dhEmi>`,
    `<tpNF>${options.operationType || "1"}</tpNF><idDest>${options.destinationType}</idDest>`,
    `<cMunFG>${padDigits(issuer.cityCode, 7)}</cMunFG><tpImp>1</tpImp><tpEmis>1</tpEmis>`,
    `<cDV>${checkDigit}</cDV><tpAmb>${options.environment === "PRODUCTION" ? "1" : "2"}</tpAmb>`,
    `<finNFe>${options.purposeCode || "1"}</finNFe>`,
    `<indFinal>${options.finalConsumer === false ? "0" : "1"}</indFinal>`,
    `<indPres>${options.presenceIndicator || "1"}</indPres>`,
    `${options.intermediaryIndicator ? `<indIntermed>${escapeXml(options.intermediaryIndicator)}</indIntermed>` : ""}`,
    `<procEmi>0</procEmi><verProc>${escapeXml((options.softwareVersion || "MSINFOR FIN 1.0").slice(0, 20))}</verProc></ide>`,
  ].join("");
  const issuerXml = [
    `<emit><CNPJ>${normalizeTaxId(issuer.cnpj)}</CNPJ>`,
    `<xNome>${escapeXml(issuer.legalName)}</xNome>${issuerTradeName}`,
    `<enderEmit><xLgr>${escapeXml(issuer.street)}</xLgr><nro>${escapeXml(issuer.number)}</nro>${issuerComplement}`,
    `<xBairro>${escapeXml(issuer.neighborhood)}</xBairro>`,
    `<cMun>${padDigits(issuer.cityCode, 7)}</cMun><xMun>${escapeXml(issuer.city)}</xMun>`,
    `<UF>${escapeXml(issuer.state)}</UF><CEP>${padDigits(issuer.postalCode, 8)}</CEP>`,
    `<cPais>${padDigits(issuer.countryCode || "1058", 4)}</cPais>`,
    `<xPais>${escapeXml(issuer.countryName || "BRASIL")}</xPais>`,
    `${issuerPhone ? `<fone>${issuerPhone}</fone>` : ""}</enderEmit>`,
    `<IE>${digits(issuer.stateRegistration)}</IE>`,
    `${issuerMunicipalRegistration ? `<IM>${issuerMunicipalRegistration}</IM>` : ""}`,
    `<CRT>${issuer.taxRegimeCode}</CRT></emit>`,
  ].join("");
  const icmsTotalXml = [
    `<ICMSTot><vBC>${money(totals.icmsBase)}</vBC><vICMS>${money(totals.icms)}</vICMS>`,
    `<vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST>`,
    `<vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet>`,
    `<vProd>${money(totals.products)}</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg>`,
    `<vDesc>${money(totals.discount)}</vDesc><vII>0.00</vII><vIPI>${money(totals.ipi)}</vIPI>`,
    `<vIPIDevol>0.00</vIPIDevol><vPIS>${money(totals.pis)}</vPIS>`,
    `<vCOFINS>${money(totals.cofins)}</vCOFINS><vOutro>0.00</vOutro>`,
    `<vNF>${money(invoiceTotal)}</vNF><vTotTrib>0.00</vTotTrib></ICMSTot>`,
  ].join("");
  const billingXml = buildBillingXml(options, invoiceTotal);
  const paymentsXml = buildPaymentsXml(options, invoiceTotal);
  const additionalInformation = String(options.additionalInformation || "")
    .trim()
    .slice(0, 5000);
  const additionalXml = additionalInformation
    ? `<infAdic><infCpl>${escapeXml(additionalInformation)}</infCpl></infAdic>`
    : "";
  const technicalResponsibleXml = buildTechnicalResponsibleXml(options);
  const unsignedXml = [
    `<NFe xmlns="${NAMESPACE}"><infNFe Id="NFe${accessKey}" versao="4.00">`,
    ideXml,
    issuerXml,
    buildRecipientXml(options),
    builtItems.map((item) => item.xml).join(""),
    `<total>${icmsTotalXml}</total>`,
    `<transp><modFrete>${escapeXml(options.freightMode || "9")}</modFrete></transp>`,
    billingXml,
    paymentsXml,
    additionalXml,
    technicalResponsibleXml,
    `</infNFe></NFe>`,
  ].join("");
  return {
    accessKey,
    checkDigit,
    randomCode,
    unsignedXml,
    consultationUrl:
      "https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=completa",
    items: builtItems.map((item) => item.built),
    totals: {
      products: Number(money(totals.products)),
      discount: Number(money(totals.discount)),
      icmsBase: Number(money(totals.icmsBase)),
      icms: Number(money(totals.icms)),
      pis: Number(money(totals.pis)),
      cofins: Number(money(totals.cofins)),
      ipi: Number(money(totals.ipi)),
      invoice: Number(money(invoiceTotal)),
    },
  };
}

export function buildNfeBatchId(accessKey: string) {
  const digest = createHash("sha256").update(accessKey).digest("hex");
  return BigInt(`0x${digest.slice(0, 14)}`).toString().slice(0, 15).padStart(15, "0");
}
