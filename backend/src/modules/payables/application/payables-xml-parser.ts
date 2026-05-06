import { createHash } from "crypto";
import { BadRequestException } from "@nestjs/common";
import { XMLParser } from "fast-xml-parser";
import {
  normalizeDigits,
  normalizeText,
  roundMoney,
} from "../../../common/finance-core.utils";

type ParsedSupplier = {
  legalName: string;
  tradeName: string | null;
  document: string | null;
  stateRegistration: string | null;
};

export type ParsedPayableInvoiceItem = {
  lineNumber: number;
  supplierItemCode: string | null;
  barcode: string | null;
  description: string;
  ncmCode: string | null;
  cfopCode: string | null;
  unitCode: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  tracksInventory: boolean;
};

export type ParsedPayableInvoiceInstallment = {
  installmentLabel: string | null;
  installmentNumber: number;
  dueDate: Date;
  amount: number;
};

export type ParsedPayableInvoiceXml = {
  xmlHash: string;
  accessKey: string;
  documentModel: string;
  invoiceNumber: string;
  series: string | null;
  operationNature: string | null;
  issueDate: Date;
  entryDate: Date | null;
  supplier: ParsedSupplier;
  items: ParsedPayableInvoiceItem[];
  installments: ParsedPayableInvoiceInstallment[];
  totalProductsAmount: number;
  totalInvoiceAmount: number;
  parsedSnapshot: Record<string, unknown>;
};

function ensureArray<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) {
    return value;
  }

  return value === undefined || value === null ? [] : [value];
}

function normalizeInvoiceNumber(value: unknown) {
  const digits = normalizeDigits(String(value || ""));
  if (digits) {
    return String(Number(digits));
  }

  return normalizeText(String(value || ""));
}

function parseMoney(value: unknown, label: string) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed)) {
    throw new BadRequestException(`Não foi possível ler ${label} no XML da nota.`);
  }

  return roundMoney(parsed);
}

function parseDateValue(value: unknown, label: string) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new BadRequestException(`Não foi possível ler ${label} no XML da nota.`);
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Não foi possível ler ${label} no XML da nota.`);
  }

  return parsed;
}

function extractAccessKey(infNFe: Record<string, unknown>, protNFe: Record<string, unknown> | null) {
  const protocolKey = normalizeDigits(
    (protNFe?.infProt as Record<string, unknown> | undefined)?.chNFe as string,
  );
  if (protocolKey) {
    return protocolKey;
  }

  const attributeKey = normalizeDigits(String(infNFe?.["@_Id"] || ""));
  if (attributeKey) {
    return attributeKey;
  }

  throw new BadRequestException("Não foi possível identificar a chave de acesso da nota.");
}

export function parsePayableInvoiceXml(xmlContent: string): ParsedPayableInvoiceXml {
  const normalizedXml = String(xmlContent || "").trim();
  if (!normalizedXml) {
    throw new BadRequestException("Cole ou envie o XML da nota para importar.");
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
    parseTagValue: false,
    parseAttributeValue: false,
    removeNSPrefix: true,
  });

  let parsedDocument: any;

  try {
    parsedDocument = parser.parse(normalizedXml);
  } catch {
    throw new BadRequestException("O XML informado não pôde ser lido.");
  }

  const nfeProc = parsedDocument?.nfeProc || null;
  const nfeNode = nfeProc?.NFe || parsedDocument?.NFe || null;
  const protNFe = nfeProc?.protNFe || null;
  const infNFe = nfeNode?.infNFe || null;

  if (!infNFe) {
    throw new BadRequestException("O XML informado não possui uma NF-e válida.");
  }

  const ide = infNFe.ide || {};
  const emit = infNFe.emit || {};
  const total = infNFe.total?.ICMSTot || {};
  const accessKey = extractAccessKey(infNFe, protNFe);
  const invoiceNumber = normalizeInvoiceNumber(ide.nNF);
  const documentModel = normalizeText(ide.mod) || "55";
  const issueDate = parseDateValue(ide.dhEmi || ide.dEmi, "a data de emissão");
  const entryDateValue = String(ide.dSaiEnt || "").trim();
  const entryDate = entryDateValue ? parseDateValue(entryDateValue, "a data de entrada") : null;
  const supplier: ParsedSupplier = {
    legalName: normalizeText(emit.xNome) || "FORNECEDOR NÃO IDENTIFICADO",
    tradeName: normalizeText(emit.xFant),
    document: normalizeDigits(emit.CNPJ || emit.CPF),
    stateRegistration: normalizeText(emit.IE),
  };

  if (!invoiceNumber) {
    throw new BadRequestException("Não foi possível identificar o número da nota no XML.");
  }

  const items = ensureArray<any>(infNFe.det).map((det, index) => {
    const prod = det?.prod || {};
    return {
      lineNumber: index + 1,
      supplierItemCode: normalizeText(prod.cProd),
      barcode: normalizeDigits(prod.cEAN) || normalizeDigits(prod.cEANTrib),
      description: normalizeText(prod.xProd) || `ITEM ${index + 1}`,
      ncmCode: normalizeDigits(prod.NCM),
      cfopCode: normalizeDigits(prod.CFOP),
      unitCode: normalizeText(prod.uCom) || normalizeText(prod.uTrib) || "UN",
      quantity: parseMoney(prod.qCom || prod.qTrib || 0, `a quantidade do item ${index + 1}`),
      unitPrice: parseMoney(prod.vUnCom || prod.vUnTrib || 0, `o valor unitário do item ${index + 1}`),
      totalPrice: parseMoney(prod.vProd || 0, `o valor total do item ${index + 1}`),
      tracksInventory: true,
    } satisfies ParsedPayableInvoiceItem;
  });

  if (!items.length) {
    throw new BadRequestException("A nota informada não possui itens para importar.");
  }

  const totalProductsAmount = parseMoney(total.vProd || 0, "o total de produtos");
  const totalInvoiceAmount = parseMoney(total.vNF || total.vProd || 0, "o valor total da nota");

  const duplicatas = ensureArray<any>(infNFe.cobr?.dup);
  const installments = duplicatas.length
    ? duplicatas.map((dup, index) => ({
        installmentLabel: normalizeText(dup.nDup) || null,
        installmentNumber: index + 1,
        dueDate: parseDateValue(
          dup.dVenc || ide.dSaiEnt || ide.dhEmi || ide.dEmi,
          `o vencimento da duplicata ${index + 1}`,
        ),
        amount: parseMoney(dup.vDup || 0, `o valor da duplicata ${index + 1}`),
      }))
    : [
        {
          installmentLabel: "ÚNICA",
          installmentNumber: 1,
          dueDate: entryDate || issueDate,
          amount: totalInvoiceAmount,
        },
      ];

  const xmlHash = createHash("sha256").update(normalizedXml).digest("hex");

  return {
    xmlHash,
    accessKey,
    documentModel,
    invoiceNumber: String(invoiceNumber),
    series: normalizeText(ide.serie),
    operationNature: normalizeText(ide.natOp),
    issueDate,
    entryDate,
    supplier,
    items,
    installments,
    totalProductsAmount,
    totalInvoiceAmount,
    parsedSnapshot: {
      accessKey,
      invoiceNumber: String(invoiceNumber),
      series: normalizeText(ide.serie),
      supplier: {
        legalName: supplier.legalName,
        tradeName: supplier.tradeName,
        document: supplier.document,
      },
      protocolNumber: normalizeText((protNFe?.infProt as any)?.nProt),
      protocolStatus: normalizeText((protNFe?.infProt as any)?.cStat),
      items: items.map((item) => ({
        lineNumber: item.lineNumber,
        supplierItemCode: item.supplierItemCode,
        barcode: item.barcode,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      })),
      installments: installments.map((installment) => ({
        installmentNumber: installment.installmentNumber,
        installmentLabel: installment.installmentLabel,
        dueDate: installment.dueDate.toISOString(),
        amount: installment.amount,
      })),
    },
  };
}
