import { renderPrintTemplate } from "../src/modules/printing/application/print-template.renderer";

const data = {
  company: {
    name: "CEC - CENTRO EDUCAÇÃO CRESCER",
    document: "69.342.038/0001-49",
  },
  sale: {
    number: "VENDA-1-20260716172859-C7360B2B",
    shortNumber: "C7360B2B",
    code: "A000001",
    displayCode: "VENDA: A000001",
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
    { name: "UNIFORME CAMISETA TESTE", quantity: 13, unitPrice: 59.9, total: 778.7 },
    { name: "CADERNO CAPA DURA TESTE", quantity: 10, unitPrice: 24.9, total: 249 },
    { name: "LAPIS GRAFITE TESTE", quantity: 1, unitPrice: 2.5, total: 2.5 },
    { name: "GARRAFA AGUA TESTE", quantity: 1, unitPrice: 4.5, total: 4.5 },
    { name: "APOSTILA MATEMATICA TESTE", quantity: 1, unitPrice: 89.9, total: 89.9 },
    { name: "UNIFORME SHORT TESTE", quantity: 1, unitPrice: 44.9, total: 44.9 },
    { name: "APOSTILA PORTUGUES TESTE", quantity: 3, unitPrice: 89.9, total: 269.7 },
    { name: "PRODUTO TESTE NFC-E HOMOLOGACAO", quantity: 1, unitPrice: 1, total: 1 },
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
    { header: "QTD", path: "quantity", width: 5, align: "RIGHT", format: "NUMBER" },
    { header: "V.UNIT", path: "unitPrice", width: 8, align: "RIGHT", format: "NUMBER" },
    { header: "TOTAL", path: "total", width: 9, align: "RIGHT", format: "NUMBER" },
  ],
};

const faithfulLayout = {
  schemaVersion: 1,
  media: { type: "RECEIPT", columns: 40, widthMm: 80 },
  blocks: [
    { id: "top", type: "SEPARATOR", character: "=" },
    { id: "company", type: "TEXT", value: "{{company.name}}", align: "CENTER", bold: true },
    { id: "company-doc", type: "TEXT", value: "CNPJ {{company.document}}", align: "CENTER" },
    { id: "top-2", type: "SEPARATOR", character: "=" },
    { id: "title", type: "TEXT", value: "COMPROVANTE DE VENDA", align: "CENTER", bold: true },
    { id: "program", type: "TEXT", value: "PROG: VENDAS 2    OPER: {{operator.shortName}}" },
    { id: "customer", type: "FIELD", label: "CLIENTE ", path: "customer.name" },
    { id: "document", type: "FIELD", label: "CPF/CNPJ ", path: "customer.document" },
    { id: "date", type: "TEXT", value: "DATA {{sale.date}}   HORA {{sale.time}}" },
    { id: "sale", type: "TEXT", value: "VENDA {{sale.shortNumber}}", align: "RIGHT" },
    { id: "sep-items", type: "SEPARATOR", character: "-" },
    itemTable,
    { id: "sep-total", type: "SEPARATOR", character: "-" },
    { id: "payment", type: "FIELD", label: "FORMA ", path: "payment.label" },
    { id: "due-date", type: "FIELD", label: "VENCIMENTO ", path: "payment.dueDate" },
    { id: "total", type: "TOTAL", label: "TOTAL ", path: "totals.total", format: "CURRENCY", bold: true },
    { id: "installment", type: "TEXT", value: "PARCELA {{payment.installment}}", align: "RIGHT", bold: true },
    { id: "sep-balance", type: "SEPARATOR", character: "-" },
    { id: "customer-repeat", type: "TEXT", value: "{{customer.name}}", align: "CENTER", bold: true },
    { id: "previous", type: "TOTAL", label: "VALOR ABERTO ANTERIOR ", path: "balance.previousOpen", format: "CURRENCY" },
    { id: "since", type: "TEXT", value: "DESDE {{balance.sinceDate}}" },
    { id: "current", type: "TOTAL", label: "VALOR ATUAL ", path: "balance.currentOpen", format: "CURRENCY", bold: true },
    { id: "observe", type: "TEXT", value: "*********** OBSERVAR ***********", align: "CENTER", bold: true },
    { id: "fiscal", type: "TEXT", value: "NÃO É DOCUMENTO FISCAL", align: "CENTER" },
    { id: "end", type: "SPACER", lines: 3 },
  ],
};

const cleanLayout = {
  schemaVersion: 1,
  media: { type: "RECEIPT", columns: 40, widthMm: 80 },
  blocks: [
    { id: "company", type: "TEXT", value: "{{company.name}}", align: "CENTER", bold: true },
    { id: "company-doc", type: "TEXT", value: "CNPJ {{company.document}}", align: "CENTER" },
    { id: "sep-1", type: "SEPARATOR", character: "=" },
    { id: "title", type: "TEXT", value: "RECIBO DE VENDA A PRAZO", align: "CENTER", bold: true },
    { id: "sep-2", type: "SEPARATOR", character: "-" },
    {
      id: "date",
      type: "FIELD",
      label: "{{sale.date}} {{sale.time}}",
      path: "sale.displayCode",
    },
    { id: "operator", type: "FIELD", label: "OPERADOR ", path: "operator.shortName" },
    { id: "customer", type: "FIELD", label: "CLIENTE ", path: "customer.name" },
    { id: "document", type: "FIELD", label: "CPF/CNPJ ", path: "customer.document" },
    { id: "sep-items", type: "SEPARATOR", character: "-" },
    itemTable,
    { id: "sep-total", type: "SEPARATOR", character: "=" },
    {
      id: "subtotal",
      type: "TOTAL",
      label: "SUBTOTAL ",
      path: "totals.subtotal",
      format: "CURRENCY",
      visibleWhen: { path: "totals.hasDiscount", truthy: true },
    },
    {
      id: "discount",
      type: "TOTAL",
      label: "DESCONTO ",
      path: "totals.discount",
      format: "CURRENCY",
      visibleWhen: { path: "totals.hasDiscount", truthy: true },
    },
    {
      id: "sep-balance",
      type: "SEPARATOR",
      character: "=",
      visibleWhen: { path: "customer.identified", truthy: true },
    },
    { id: "total", type: "TOTAL", label: "TOTAL DA VENDA ", path: "totals.total", format: "CURRENCY", bold: true },
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
    { id: "observe", type: "TEXT", value: "*********** OBSERVAR ***********", align: "CENTER", bold: true },
    { id: "thanks", type: "TEXT", value: "OBRIGADO PELA PREFERÊNCIA", align: "CENTER" },
    { id: "fiscal", type: "TEXT", value: "NÃO É DOCUMENTO FISCAL", align: "CENTER" },
    { id: "end", type: "SPACER", lines: 3 },
  ],
};

for (const [name, layout] of [
  ["FIEL", faithfulLayout],
  ["LIMPO", cleanLayout],
] as const) {
  const preview = renderPrintTemplate(layout, data);
  console.log(`===== ${name} =====`);
  console.log(preview.serializedContent);
}
