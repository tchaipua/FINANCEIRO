import { BadRequestException } from "@nestjs/common";

type LayoutRecord = Record<string, any>;

function safeJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

export function readPrintPath(data: unknown, path?: string | null): unknown {
  if (!path) return "";

  return String(path)
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((current, key) => {
      if (!current || typeof current !== "object") return "";
      return (current as Record<string, unknown>)[key];
    }, data);
}

function formatNumber(value: unknown, decimals = 2) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric)
    ? numeric.toLocaleString("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : "0,00";
}

function formatPrintValue(value: unknown, format?: string | null) {
  if (value === null || value === undefined) return "";
  const normalizedFormat = String(format || "TEXT").toUpperCase();

  if (normalizedFormat === "CURRENCY") return `R$ ${formatNumber(value)}`;
  if (normalizedFormat === "NUMBER") return formatNumber(value);
  if (normalizedFormat === "INTEGER") return formatNumber(value, 0);
  if (normalizedFormat === "DATE" || normalizedFormat === "DATETIME") {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) {
      return normalizedFormat === "DATE"
        ? date.toLocaleDateString("pt-BR")
        : date.toLocaleString("pt-BR");
    }
  }

  return String(value);
}

function interpolate(value: unknown, data: Record<string, unknown>) {
  return String(value ?? "").replace(/\{\{\s*([A-Z0-9_.-]+)\s*\}\}/gi, (_match, path) =>
    formatPrintValue(readPrintPath(data, path)),
  );
}

function normalizeColumns(layout: LayoutRecord) {
  const columns = Number(layout?.media?.columns || layout?.columns || 40);
  return Number.isInteger(columns) && columns >= 16 && columns <= 160 ? columns : 40;
}

function alignText(value: string, width: number, align?: string | null) {
  const text = value.slice(0, width);
  const remaining = Math.max(0, width - text.length);
  const normalizedAlign = String(align || "LEFT").toUpperCase();
  if (normalizedAlign === "RIGHT") return `${" ".repeat(remaining)}${text}`;
  if (normalizedAlign === "CENTER") {
    const left = Math.floor(remaining / 2);
    return `${" ".repeat(left)}${text}${" ".repeat(remaining - left)}`;
  }
  return `${text}${" ".repeat(remaining)}`;
}

function wrapText(value: string, width: number) {
  const paragraphs = String(value || "").split(/\r?\n/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }

    let current = "";
    for (const word of words) {
      if (word.length > width) {
        if (current) lines.push(current);
        for (let index = 0; index < word.length; index += width) {
          lines.push(word.slice(index, index + width));
        }
        current = "";
        continue;
      }

      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > width) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

function renderReceiptTable(
  block: LayoutRecord,
  data: Record<string, unknown>,
  totalColumns: number,
) {
  const rows = readPrintPath(data, block.path);
  if (!Array.isArray(rows)) return [];

  const configuredColumns = Array.isArray(block.columns) ? block.columns : [];
  if (!configuredColumns.length) return [];

  const columns = configuredColumns.map((column: LayoutRecord) => ({
    ...column,
    width: Math.max(1, Number(column.width || 1)),
  }));
  const configuredWidth = columns.reduce((total: number, column: LayoutRecord) => total + column.width, 0);
  const widthFactor = configuredWidth > totalColumns ? totalColumns / configuredWidth : 1;
  const normalizedColumns = columns.map((column: LayoutRecord, index: number) => ({
    ...column,
    width:
      index === columns.length - 1
        ? Math.max(
            1,
            totalColumns -
              columns
                .slice(0, -1)
                .reduce(
                  (total: number, item: LayoutRecord) =>
                    total + Math.max(1, Math.floor(item.width * widthFactor)),
                  0,
                ),
          )
        : Math.max(1, Math.floor(column.width * widthFactor)),
  }));

  const lines: string[] = [];
  if (block.showHeader !== false) {
    lines.push(
      normalizedColumns
        .map((column: LayoutRecord) =>
          alignText(String(column.header || ""), column.width, column.align),
        )
        .join(""),
    );
  }

  for (const row of rows) {
    const values = normalizedColumns.map((column: LayoutRecord) =>
      formatPrintValue(readPrintPath(row, column.path), column.format),
    );
    const wrapped = values.map((value: string, index: number) =>
      wrapText(value, normalizedColumns[index].width),
    );
    const rowHeight = Math.max(...wrapped.map((item: string[]) => item.length), 1);
    for (let lineIndex = 0; lineIndex < rowHeight; lineIndex += 1) {
      lines.push(
        normalizedColumns
          .map((column: LayoutRecord, index: number) =>
            alignText(wrapped[index][lineIndex] || "", column.width, column.align),
          )
          .join(""),
      );
    }
  }

  return lines;
}

export function renderReceiptLayout(
  layout: LayoutRecord,
  data: Record<string, unknown>,
) {
  const columns = normalizeColumns(layout);
  const blocks = Array.isArray(layout.blocks) ? layout.blocks : [];
  const lines: string[] = [];

  for (const block of blocks) {
    const type = String(block?.type || "TEXT").toUpperCase();
    if (block?.visibleWhen?.path) {
      const actual = readPrintPath(data, block.visibleWhen.path);
      if (block.visibleWhen.equals !== undefined && actual !== block.visibleWhen.equals) continue;
      if (block.visibleWhen.truthy === true && !actual) continue;
    }

    if (type === "SPACER") {
      const count = Math.max(1, Math.min(10, Number(block.lines || 1)));
      lines.push(...Array.from({ length: count }, () => ""));
      continue;
    }

    if (type === "SEPARATOR") {
      lines.push(String(block.character || "-").slice(0, 1).repeat(columns));
      continue;
    }

    if (type === "FIELD" || type === "TOTAL") {
      const label = interpolate(block.label || "", data);
      const value = formatPrintValue(readPrintPath(data, block.path), block.format);
      const available = Math.max(1, columns - label.length);
      lines.push(`${label}${alignText(value, available, "RIGHT")}`.slice(0, columns));
      continue;
    }

    if (type === "TABLE") {
      lines.push(...renderReceiptTable(block, data, columns));
      continue;
    }

    if (type === "BARCODE" || type === "QRCODE") {
      const value = formatPrintValue(readPrintPath(data, block.path));
      if (value) lines.push(alignText(`[${type}: ${value}]`, columns, block.align || "CENTER"));
      continue;
    }

    const value = interpolate(block.value || "", data);
    const wrappedLines = wrapText(value, columns);
    lines.push(...wrappedLines.map((line) => alignText(line, columns, block.align)));
  }

  return {
    format: "PLAIN_TEXT",
    mediaType: "RECEIPT",
    columns,
    content: lines.join("\n").replace(/\s+$/gm, "").trimEnd(),
  };
}

export function renderLabelLayout(
  layout: LayoutRecord,
  data: Record<string, unknown>,
) {
  const media = {
    type: "LABEL",
    widthMm: Math.max(10, Number(layout?.media?.widthMm || 60)),
    heightMm: Math.max(5, Number(layout?.media?.heightMm || 40)),
    gapMm: Math.max(0, Number(layout?.media?.gapMm || 2)),
    dpi: Math.max(72, Number(layout?.media?.dpi || 203)),
  };
  const elements = (Array.isArray(layout.elements) ? layout.elements : []).map(
    (element: LayoutRecord) => ({
      ...element,
      type: String(element.type || "TEXT").toUpperCase(),
      value:
        element.path !== undefined
          ? formatPrintValue(readPrintPath(data, element.path), element.format)
          : interpolate(element.value || "", data),
      xMm: Math.max(0, Number(element.xMm || 0)),
      yMm: Math.max(0, Number(element.yMm || 0)),
      widthMm: Math.max(1, Number(element.widthMm || media.widthMm)),
      heightMm: Math.max(1, Number(element.heightMm || 6)),
    }),
  );

  return {
    format: "MSINFOR_LABEL_V1",
    mediaType: "LABEL",
    media,
    elements,
  };
}

export function renderPrintTemplate(
  layout: Record<string, unknown>,
  data: Record<string, unknown>,
) {
  if (!layout || typeof layout !== "object" || Array.isArray(layout)) {
    throw new BadRequestException("Layout de impressão inválido.");
  }

  const mediaType = String((layout as LayoutRecord)?.media?.type || "RECEIPT").toUpperCase();
  const rendered =
    mediaType === "LABEL"
      ? renderLabelLayout(layout as LayoutRecord, data)
      : renderReceiptLayout(layout as LayoutRecord, data);

  return {
    ...rendered,
    serializedContent:
      rendered.format === "PLAIN_TEXT"
        ? String((rendered as any).content || "")
        : safeJson(rendered),
  };
}
