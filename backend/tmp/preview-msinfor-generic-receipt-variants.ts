import { readFileSync } from "fs";
import { join } from "path";
import { renderPrintTemplate } from "../src/modules/printing/application/print-template.renderer";

const sharp = require(
  "C:/Sistemas/IA/MSINFOR_CENTRAL_IA/node_modules/sharp",
);

const outputDirectory = "C:/Temp";
const reportPackage = JSON.parse(
  readFileSync(
    "C:/Sistemas/IA/Financeiro/output/recibos/modelo-softhouse-venda-prazo-80mm.msreport.json",
    "utf8",
  ),
);

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
      (line: string, index: number) =>
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
</svg>`;
}

async function main() {
  const layout = reportPackage.report.layout;
  const sampleData = reportPackage.report.sampleData;
  const variants = [
    {
      fileName: "recibo-venda-a-prazo-80mm.png",
      data: {
        ...sampleData,
        sale: {
          ...sampleData.sale,
          receiptTitle: "RECIBO DE VENDA A PRAZO",
        },
        customer: { ...sampleData.customer, identified: true },
      },
    },
    {
      fileName: "recibo-venda-a-vista-80mm.png",
      data: {
        ...sampleData,
        sale: {
          ...sampleData.sale,
          receiptTitle: "RECIBO DE VENDA À VISTA",
        },
        customer: {
          identified: false,
          name: "",
          document: "",
          saleSequence: "",
          saleSequenceDisplay: "",
          openSinceLabel: "",
        },
        totals: { ...sampleData.totals, discount: 0, hasDiscount: false },
        balance: {
          previousOpen: 0,
          currentOpen: 0,
          sinceDate: "",
          firstOpenInstallmentDate: "",
        },
      },
    },
  ];

  for (const variant of variants) {
    const preview = renderPrintTemplate(layout, variant.data);
    await sharp(Buffer.from(buildPreviewSvg(preview.serializedContent)))
      .png()
      .toFile(join(outputDirectory, variant.fileName));
  }

  console.log(
    JSON.stringify({
      valid: true,
      previews: variants.map((variant) => join(outputDirectory, variant.fileName)),
    }),
  );
}

void main();
