import assert from "node:assert/strict";
import {
  readPrintPath,
  renderPrintTemplate,
} from "../src/modules/printing/application/print-template.renderer";
import {
  buildPrintReportPackage,
  validatePrintReportPackage,
} from "../src/modules/printing/application/print-report-package";

assert.equal(readPrintPath({ sale: { number: "V-1" } }, "sale.number"), "V-1");
assert.equal(readPrintPath({ sale: {} }, "sale.missing"), undefined);

const receipt = renderPrintTemplate(
  {
    media: { type: "RECEIPT", columns: 40 },
    blocks: [
      { type: "TEXT", value: "{{company.name}}", align: "CENTER" },
      { type: "SEPARATOR", character: "-" },
      { type: "FIELD", label: "TOTAL ", path: "total", format: "CURRENCY" },
    ],
  },
  { company: { name: "MSINFOR" }, total: 19.9 },
);
assert.equal(receipt.format, "PLAIN_TEXT");
assert.match(receipt.serializedContent, /MSINFOR/);
assert.match(receipt.serializedContent, /R\$ 19,90/);
assert.ok(receipt.serializedContent.split("\n").every((line) => line.length <= 40));

const label = renderPrintTemplate(
  {
    media: { type: "LABEL", widthMm: 60, heightMm: 40 },
    elements: [
      { type: "TEXT", path: "product.name", xMm: 2, yMm: 2, widthMm: 56, heightMm: 8 },
      { type: "BARCODE", path: "product.barcode", xMm: 5, yMm: 20, widthMm: 50, heightMm: 12 },
    ],
  },
  { product: { name: "PRODUTO TESTE", barcode: "7891234567890" } },
);
assert.equal(label.format, "MSINFOR_LABEL_V1");
assert.match(label.serializedContent, /PRODUTO TESTE/);
assert.match(label.serializedContent, /7891234567890/);

const portablePackage = buildPrintReportPackage({
  code: "RECIBO_TESTE",
  name: "RECIBO TESTE",
  documentType: "SALE_RECEIPT",
  mediaType: "RECEIPT",
  layout: {
    media: { type: "RECEIPT", columns: 40 },
    blocks: [{ type: "TEXT", value: "{{customer.name}}", align: "CENTER" }],
  },
  sampleData: { customer: { name: "CLIENTE EXEMPLO" } },
  packageId: "PACKAGE-TEST",
  now: new Date("2026-07-23T12:00:00.000Z"),
});
const validatedPackage = validatePrintReportPackage(portablePackage);
assert.equal(validatedPackage.valid, true);
assert.equal(validatedPackage.package.report.code, "RECIBO_TESTE");
assert.deepEqual(validatedPackage.package.report.variables, ["customer.name"]);
assert.match(validatedPackage.preview.serializedContent, /CLIENTE EXEMPLO/);
assert.equal(
  Object.prototype.hasOwnProperty.call(validatedPackage.package, "companyId"),
  false,
);

const tamperedPackage = structuredClone(portablePackage);
tamperedPackage.report.name = "PACOTE ALTERADO";
assert.throws(
  () => validatePrintReportPackage(tamperedPackage),
  /integridade do pacote não confere/i,
);

const scopedPackage = {
  ...portablePackage,
  sourceTenantId: "TENANT-NÃO-PERMITIDO",
};
assert.throws(
  () => validatePrintReportPackage(scopedPackage),
  /não pode transportar escopo de cliente/i,
);

console.log("Printing core tests passed.");
