import { Injectable } from "@nestjs/common";
import bwipjs from "bwip-js";
import PDFDocument from "pdfkit";

type DanfeItem = {
  code: string;
  description: string;
  ncmCode: string;
  cfopCode: string;
  unitCode: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  icmsCode: string;
};

export type GenerateDanfeOptions = {
  environment: "PRODUCTION" | "HOMOLOGATION";
  accessKey: string;
  protocol: string;
  receivedAt?: Date | null;
  series: number;
  number: number;
  issuedAt: Date;
  operationNature: string;
  issuer: {
    legalName: string;
    tradeName?: string | null;
    document: string;
    stateRegistration: string;
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    postalCode: string;
    phone?: string | null;
  };
  recipient: {
    name: string;
    document: string;
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    postalCode: string;
    email?: string | null;
  };
  items: DanfeItem[];
  totals: {
    products: number;
    discount: number;
    icmsBase: number;
    icms: number;
    pis: number;
    cofins: number;
    ipi: number;
    invoice: number;
  };
  installments: Array<{
    number: string;
    dueDate: string;
    amount: number;
  }>;
  additionalInformation?: string | null;
};

function money(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function quantity(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function dateTime(value?: Date | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(value);
}

function dateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function groupedAccessKey(value: string) {
  return String(value || "")
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

function formatDocument(value: string) {
  const normalized = String(value || "").toUpperCase();
  if (/^\d{11}$/.test(normalized)) {
    return normalized.replace(
      /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
      "$1.$2.$3-$4",
    );
  }
  if (/^\d{14}$/.test(normalized)) {
    return normalized.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      "$1.$2.$3/$4-$5",
    );
  }
  return normalized;
}

@Injectable()
export class NfeDanfeService {
  private drawBox(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    height: number,
    label?: string,
  ) {
    doc.rect(x, y, width, height).lineWidth(0.7).stroke("#111827");
    if (label) {
      doc
        .font("Helvetica-Bold")
        .fontSize(6)
        .fillColor("#111827")
        .text(label, x + 3, y + 2, {
          width: width - 6,
          lineBreak: false,
        });
    }
  }

  private field(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    value: string,
    options?: { align?: "left" | "center" | "right"; size?: number },
  ) {
    this.drawBox(doc, x, y, width, height, label);
    doc
      .font("Helvetica")
      .fontSize(options?.size || 8)
      .fillColor("#111827")
      .text(value || "", x + 3, y + 11, {
        width: width - 6,
        height: height - 13,
        align: options?.align || "left",
        ellipsis: true,
      });
  }

  async generate(options: GenerateDanfeOptions) {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 22, right: 22, bottom: 22, left: 22 },
      compress: true,
      info: {
        Title: `DANFE NF-e ${options.number}/${options.series}`,
        Author: "MSINFOR FINANCEIRO",
        Subject: "Documento Auxiliar da Nota Fiscal Eletrônica",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    const completed = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });
    const pageWidth = doc.page.width - 44;
    const left = 22;
    let y = 22;
    if (options.environment === "HOMOLOGATION") {
      doc
        .save()
        .rotate(-35, {
          origin: [doc.page.width / 2, doc.page.height / 2],
        })
        .font("Helvetica-Bold")
        .fontSize(42)
        .fillColor("#dc2626")
        .opacity(0.1)
        .text(
          "SEM VALOR FISCAL - HOMOLOGAÇÃO",
          40,
          doc.page.height / 2 - 20,
          {
            width: doc.page.width - 80,
            align: "center",
          },
        )
        .restore();
    }

    this.drawBox(doc, left, y, 238, 92);
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(options.issuer.legalName, left + 7, y + 8, {
        width: 224,
        align: "center",
      });
    doc
      .font("Helvetica")
      .fontSize(7)
      .text(
        `${options.issuer.street}, ${options.issuer.number} - ${options.issuer.neighborhood}`,
        left + 7,
        y + 34,
        { width: 224, align: "center" },
      )
      .text(
        `${options.issuer.city} - ${options.issuer.state} - CEP ${options.issuer.postalCode}`,
        left + 7,
        y + 46,
        { width: 224, align: "center" },
      )
      .text(
        `CNPJ ${formatDocument(options.issuer.document)}  IE ${options.issuer.stateRegistration}`,
        left + 7,
        y + 58,
        { width: 224, align: "center" },
      );

    this.drawBox(doc, left + 238, y, 92, 92);
    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .text("DANFE", left + 241, y + 9, {
        width: 86,
        align: "center",
      })
      .fontSize(7)
      .text("Documento Auxiliar da", left + 241, y + 30, {
        width: 86,
        align: "center",
      })
      .text("Nota Fiscal Eletrônica", left + 241, y + 40, {
        width: 86,
        align: "center",
      })
      .fontSize(9)
      .text("1 - SAÍDA", left + 241, y + 56, {
        width: 86,
        align: "center",
      })
      .fontSize(10)
      .text(`Nº ${String(options.number).padStart(9, "0")}`, left + 241, y + 68, {
        width: 86,
        align: "center",
      })
      .fontSize(7)
      .text(`SÉRIE ${options.series}`, left + 241, y + 81, {
        width: 86,
        align: "center",
      });

    this.drawBox(doc, left + 330, y, pageWidth - 330, 92);
    const barcode = await bwipjs.toBuffer({
      bcid: "code128",
      text: options.accessKey,
      scale: 2,
      height: 10,
      includetext: false,
      backgroundcolor: "FFFFFF",
    });
    doc.image(barcode, left + 341, y + 7, {
      width: pageWidth - 352,
      height: 35,
    });
    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .text(groupedAccessKey(options.accessKey), left + 336, y + 46, {
        width: pageWidth - 342,
        align: "center",
      })
      .font("Helvetica")
      .fontSize(6.5)
      .text(
        "Consulta de autenticidade no portal nacional da NF-e ou no site da SEFAZ autorizadora",
        left + 336,
        y + 61,
        { width: pageWidth - 342, align: "center" },
      )
      .font("Helvetica-Bold")
      .fontSize(6.5)
      .text(
        `PROTOCOLO ${options.protocol} - ${dateTime(options.receivedAt)}`,
        left + 336,
        y + 78,
        { width: pageWidth - 342, align: "center" },
      );

    y += 96;
    this.field(
      doc,
      left,
      y,
      pageWidth * 0.62,
      28,
      "NATUREZA DA OPERAÇÃO",
      options.operationNature,
    );
    this.field(
      doc,
      left + pageWidth * 0.62,
      y,
      pageWidth * 0.38,
      28,
      "DATA E HORA DE EMISSÃO",
      dateTime(options.issuedAt),
    );

    y += 32;
    doc.font("Helvetica-Bold").fontSize(7).text("DESTINATÁRIO / REMETENTE", left, y);
    y += 10;
    this.field(doc, left, y, pageWidth * 0.55, 28, "NOME / RAZÃO SOCIAL", options.recipient.name);
    this.field(
      doc,
      left + pageWidth * 0.55,
      y,
      pageWidth * 0.23,
      28,
      "CPF / CNPJ",
      formatDocument(options.recipient.document),
    );
    this.field(
      doc,
      left + pageWidth * 0.78,
      y,
      pageWidth * 0.22,
      28,
      "DATA DA EMISSÃO",
      dateTime(options.issuedAt).split(" ")[0],
    );
    y += 28;
    this.field(
      doc,
      left,
      y,
      pageWidth * 0.5,
      28,
      "ENDEREÇO",
      `${options.recipient.street}, ${options.recipient.number}`,
    );
    this.field(
      doc,
      left + pageWidth * 0.5,
      y,
      pageWidth * 0.2,
      28,
      "BAIRRO",
      options.recipient.neighborhood,
    );
    this.field(
      doc,
      left + pageWidth * 0.7,
      y,
      pageWidth * 0.15,
      28,
      "CEP",
      options.recipient.postalCode,
    );
    this.field(
      doc,
      left + pageWidth * 0.85,
      y,
      pageWidth * 0.15,
      28,
      "UF",
      options.recipient.state,
      { align: "center" },
    );
    y += 28;
    this.field(
      doc,
      left,
      y,
      pageWidth * 0.5,
      28,
      "MUNICÍPIO",
      options.recipient.city,
    );
    this.field(
      doc,
      left + pageWidth * 0.5,
      y,
      pageWidth * 0.5,
      28,
      "E-MAIL",
      options.recipient.email || "",
    );

    y += 34;
    if (options.installments.length) {
      doc.font("Helvetica-Bold").fontSize(7).text("FATURA / DUPLICATAS", left, y);
      y += 10;
      const width = pageWidth / Math.min(options.installments.length, 4);
      options.installments.slice(0, 4).forEach((installment, index) => {
        this.field(
          doc,
          left + width * index,
          y,
          width,
          27,
          `DUPLICATA ${installment.number}`,
          `${dateOnly(installment.dueDate)}  R$ ${money(installment.amount)}`,
          { align: "center", size: 7 },
        );
      });
      y += 33;
    }

    doc.font("Helvetica-Bold").fontSize(7).text("CÁLCULO DO IMPOSTO", left, y);
    y += 10;
    const totalFields = [
      ["BASE ICMS", options.totals.icmsBase],
      ["VALOR ICMS", options.totals.icms],
      ["VALOR PIS", options.totals.pis],
      ["VALOR COFINS", options.totals.cofins],
      ["VALOR IPI", options.totals.ipi],
      ["TOTAL PRODUTOS", options.totals.products],
      ["DESCONTO", options.totals.discount],
      ["TOTAL DA NF-e", options.totals.invoice],
    ] as const;
    const totalWidth = pageWidth / totalFields.length;
    totalFields.forEach(([label, value], index) => {
      this.field(
        doc,
        left + totalWidth * index,
        y,
        totalWidth,
        30,
        label,
        money(value),
        { align: "right", size: 7 },
      );
    });

    y += 36;
    doc.font("Helvetica-Bold").fontSize(7).text("DADOS DOS PRODUTOS / SERVIÇOS", left, y);
    y += 10;
    const columns = [
      { label: "CÓDIGO", width: 47 },
      { label: "DESCRIÇÃO", width: 181 },
      { label: "NCM", width: 48 },
      { label: "CST", width: 31 },
      { label: "CFOP", width: 34 },
      { label: "UN", width: 24 },
      { label: "QUANT.", width: 48 },
      { label: "V. UNIT.", width: 55 },
      { label: "V. TOTAL", width: pageWidth - 468 },
    ];
    let x = left;
    columns.forEach((column) => {
      this.drawBox(doc, x, y, column.width, 18);
      doc
        .font("Helvetica-Bold")
        .fontSize(5.8)
        .text(column.label, x + 2, y + 6, {
          width: column.width - 4,
          align: "center",
        });
      x += column.width;
    });
    y += 18;
    options.items.slice(0, 16).forEach((item) => {
      const values = [
        item.code,
        item.description,
        item.ncmCode,
        item.icmsCode,
        item.cfopCode,
        item.unitCode,
        quantity(item.quantity),
        money(item.unitPrice),
        money(item.totalAmount),
      ];
      let rowX = left;
      columns.forEach((column, index) => {
        this.drawBox(doc, rowX, y, column.width, 22);
        doc
          .font("Helvetica")
          .fontSize(index === 1 ? 6.4 : 6)
          .text(values[index], rowX + 2, y + 5, {
            width: column.width - 4,
            height: 14,
            align: index >= 6 ? "right" : index === 1 ? "left" : "center",
            ellipsis: true,
          });
        rowX += column.width;
      });
      y += 22;
    });

    y += 8;
    doc.font("Helvetica-Bold").fontSize(7).text("DADOS ADICIONAIS", left, y);
    y += 10;
    const remainingHeight = Math.max(58, doc.page.height - 22 - y);
    this.field(
      doc,
      left,
      y,
      pageWidth,
      remainingHeight,
      "INFORMAÇÕES COMPLEMENTARES",
      options.additionalInformation || "",
      { size: 7 },
    );
    doc.end();
    return completed;
  }
}
