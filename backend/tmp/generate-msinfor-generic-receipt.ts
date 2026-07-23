import { createHash } from "crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import {
  buildPrintReportPackage,
  validatePrintReportPackage,
} from "../src/modules/printing/application/print-report-package";
import { renderPrintTemplate } from "../src/modules/printing/application/print-template.renderer";

const sharp = require(
  "C:/Sistemas/IA/MSINFOR_CENTRAL_IA/node_modules/sharp",
);

const outputDirectory = "C:/Sistemas/IA/financeiro/output/recibos";
const baseName = "modelo-softhouse-venda-prazo-80mm";
const svgPath = join(outputDirectory, `${baseName}.svg`);
const pngPath = join(outputDirectory, `${baseName}.png`);
const packagePath = join(outputDirectory, `${baseName}.msreport.json`);

const sampleData = {
  company: {
    name: "MSINFOR SISTEMAS",
    document: "69.342.038/0001-49",
  },
  sale: {
    number: "VENDA-DEMONSTRACAO-000001",
    shortNumber: "A000001",
    code: "A000001",
    displayCode: "VENDA: A000001",
    receiptTitle: "RECIBO DE VENDA A PRAZO",
    date: "16/07/2026",
    time: "14:28:59",
  },
  customer: {
    identified: true,
    name: "MARÇAL ROCHA SACCARDO",
    document: "852.887.306-44",
    saleSequence: "000001",
    saleSequenceDisplay: "SEQ: 000001",
    openSinceLabel: "ABERTA DESDE: 16/08/2026",
  },
  operator: {
    name: "MARÇAL ROCHA SACCARDO",
    shortName: "MARÇAL",
  },
  items: [
    {
      name: "UNIFORME CAMISETA TESTE",
      quantity: 13,
      unitPrice: 59.9,
      total: 778.7,
    },
    {
      name: "CADERNO CAPA DURA TESTE",
      quantity: 10,
      unitPrice: 24.9,
      total: 249,
    },
    {
      name: "LAPIS GRAFITE TESTE",
      quantity: 1,
      unitPrice: 2.5,
      total: 2.5,
    },
    {
      name: "GARRAFA AGUA TESTE",
      quantity: 1,
      unitPrice: 4.5,
      total: 4.5,
    },
    {
      name: "APOSTILA MATEMATICA TESTE",
      quantity: 1,
      unitPrice: 89.9,
      total: 89.9,
    },
    {
      name: "UNIFORME SHORT TESTE",
      quantity: 1,
      unitPrice: 44.9,
      total: 44.9,
    },
    {
      name: "APOSTILA PORTUGUES TESTE",
      quantity: 3,
      unitPrice: 89.9,
      total: 269.7,
    },
    {
      name: "PRODUTO TESTE NFC-E HOMOLOGACAO",
      quantity: 1,
      unitPrice: 1,
      total: 1,
    },
  ],
  payment: {
    label: "PRAZO",
    installment: "1/1",
    dueDate: "16/08/2026",
  },
  totals: {
    subtotal: 1440.2,
    discount: 0,
    hasDiscount: false,
    total: 1440.2,
  },
  balance: {
    previousOpen: 0,
    currentOpen: 1440.2,
    sinceDate: "16/08/2026",
    firstOpenInstallmentDate: "16/08/2026",
  },
};

const itemTable = {
  id: "items",
  type: "TABLE",
  path: "items",
  columns: [
    { header: "PRODUTO", path: "name", width: 18, align: "LEFT" },
    {
      header: "QTD",
      path: "quantity",
      width: 5,
      align: "RIGHT",
      format: "NUMBER",
    },
    {
      header: "V.UNIT",
      path: "unitPrice",
      width: 8,
      align: "RIGHT",
      format: "NUMBER",
    },
    {
      header: "TOTAL",
      path: "total",
      width: 9,
      align: "RIGHT",
      format: "NUMBER",
    },
  ],
};

const layout = {
  schemaVersion: 1,
  media: { type: "RECEIPT", columns: 40, widthMm: 80 },
  blocks: [
    {
      id: "company",
      type: "TEXT",
      value: "{{company.name}}",
      align: "CENTER",
      bold: true,
    },
    {
      id: "company-doc",
      type: "TEXT",
      value: "CNPJ {{company.document}}",
      align: "CENTER",
    },
    { id: "sep-1", type: "SEPARATOR", character: "=" },
    {
      id: "title",
      type: "TEXT",
      value: "{{sale.receiptTitle}}",
      align: "CENTER",
      bold: true,
    },
    { id: "sep-2", type: "SEPARATOR", character: "-" },
    {
      id: "date",
      type: "FIELD",
      label: "{{sale.date}} {{sale.time}}",
      path: "sale.displayCode",
    },
    {
      id: "operator",
      type: "FIELD",
      label: "OPERADOR ",
      path: "operator.shortName",
    },
    {
      id: "customer",
      type: "FIELD",
      label: "CLIENTE ",
      path: "customer.name",
      visibleWhen: { path: "customer.identified", truthy: true },
    },
    {
      id: "document",
      type: "FIELD",
      label: "CPF/CNPJ ",
      path: "customer.document",
      visibleWhen: { path: "customer.identified", truthy: true },
    },
    { id: "sep-items", type: "SEPARATOR", character: "-" },
    itemTable,
    { id: "sep-total", type: "SEPARATOR", character: "=" },
    {
      id: "subtotal",
      type: "TOTAL",
      label: "TOTAL PRODUTOS ",
      path: "totals.subtotal",
      format: "CURRENCY",
      visibleWhen: { path: "totals.hasDiscount", truthy: true },
    },
    {
      id: "discount",
      type: "TOTAL",
      label: "DESCONTOS ",
      path: "totals.discount",
      format: "CURRENCY",
      visibleWhen: { path: "totals.hasDiscount", truthy: true },
    },
    {
      id: "total",
      type: "TOTAL",
      label: "TOTAL DA VENDA ",
      path: "totals.total",
      format: "CURRENCY",
      bold: true,
    },
    { id: "sep-balance", type: "SEPARATOR", character: "=" },
    {
      id: "previous",
      type: "TOTAL",
      label: "SALDO ANTERIOR ",
      path: "balance.previousOpen",
      format: "CURRENCY",
      visibleWhen: { path: "customer.identified", truthy: true },
    },
    {
      id: "current",
      type: "TOTAL",
      label: "SALDO ATUAL ",
      path: "balance.currentOpen",
      format: "CURRENCY",
      bold: true,
      visibleWhen: { path: "customer.identified", truthy: true },
    },
    {
      id: "open-since-and-customer-sequence",
      type: "FIELD",
      label: "{{customer.openSinceLabel}}",
      path: "customer.saleSequenceDisplay",
      visibleWhen: { path: "customer.identified", truthy: true },
    },
    {
      id: "customer-signature-space",
      type: "SPACER",
      lines: 2,
      visibleWhen: { path: "customer.identified", truthy: true },
    },
    {
      id: "customer-signature-line",
      type: "TEXT",
      value: "------------------------",
      align: "CENTER",
      visibleWhen: { path: "customer.identified", truthy: true },
    },
    {
      id: "customer-signature-name",
      type: "TEXT",
      value: "{{customer.name}}",
      align: "CENTER",
      visibleWhen: { path: "customer.identified", truthy: true },
    },
    {
      id: "observe",
      type: "TEXT",
      value: "*********** OBSERVAR ***********",
      align: "CENTER",
      bold: true,
    },
    {
      id: "thanks",
      type: "TEXT",
      value: "OBRIGADO PELA PREFERÊNCIA",
      align: "CENTER",
    },
    {
      id: "fiscal",
      type: "TEXT",
      value: "NÃO É DOCUMENTO FISCAL",
      align: "CENTER",
    },
    { id: "end", type: "SPACER", lines: 3 },
  ],
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPreviewSvg(serializedContent: string) {
  const lines = serializedContent.replace(/\r/g, "").split("\n");
  const tspans = lines
    .map(
      (line, index) =>
        `    <tspan x="64"${index ? ' dy="17"' : ""}>${
          line ? escapeXml(line) : "&#160;"
        }</tspan>`,
    )
    .join("\n");
  const height = Math.max(790, 95 + lines.length * 17);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="${height}" viewBox="0 0 520 ${height}">
  <rect width="520" height="${height}" fill="#e9eef5"/>
  <rect x="43" y="20" width="434" height="${height - 40}" rx="4" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <text x="64" y="56" fill="#111827" font-family="Courier New, monospace" font-size="13px" font-weight="600" xml:space="preserve">
${tspans}
  </text>
</svg>
`;
}

async function main() {
  mkdirSync(outputDirectory, { recursive: true });
  const preview = renderPrintTemplate(layout, sampleData);
  const svg = buildPreviewSvg(preview.serializedContent);
  writeFileSync(svgPath, svg, "utf8");
  await sharp(Buffer.from(svg)).png().toFile(pngPath);

  const imageHash = createHash("sha256")
    .update(readFileSync(pngPath))
    .digest("hex");
  const reportPackage = buildPrintReportPackage({
    code: "RECIBO_VENDA_PRAZO_80MM",
    name: "RECIBO DE VENDA A PRAZO 80MM",
    description:
      "MODELO GENÉRICO DA SOFTHOUSE PARA VENDA A PRAZO EM IMPRESSORA TÉRMICA DE 80 MM.",
    documentType: "SALE_RECEIPT",
    mediaType: "RECEIPT",
    layout,
    sampleData,
    referenceImageName: `${baseName}.png`,
    referenceImageSha256: imageHash,
  });
  validatePrintReportPackage(reportPackage);
  writeFileSync(packagePath, JSON.stringify(reportPackage, null, 2), "utf8");

  console.log(
    JSON.stringify({
      valid: true,
      image: pngPath,
      package: packagePath,
      previewLines: preview.serializedContent.split("\n").length,
      packageHash: reportPackage.integrity.contentHash,
    }),
  );
}

void main();
