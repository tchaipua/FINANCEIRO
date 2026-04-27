export type GridExportFormat = 'excel' | 'csv' | 'pdf' | 'json' | 'txt';
export type GridPdfOrientation = 'portrait' | 'landscape';
export type GridPdfRowDensity = 'compact' | 'comfortable' | 'spacious';
export type GridPdfFontScale = 'small' | 'medium' | 'large';
export type GridPdfWidthStrategy = 'compact' | 'balanced' | 'detailed';
export type GridPdfLineClamp = 0 | 1 | 2 | 3 | 4;

export type GridPdfOptions = {
  orientation: GridPdfOrientation;
  rowDensity: GridPdfRowDensity;
  fontScale: GridPdfFontScale;
  widthStrategy: GridPdfWidthStrategy;
  lineClamp: GridPdfLineClamp;
  showColumnHeaders: boolean;
  showRowStripes: boolean;
};

export type GridBranding = {
  title?: string;
  subtitle?: string;
  schoolName?: string;
  logoUrl?: string | null;
};

export type GridColumnDefinition<RowType, ColumnKey extends string = string> = {
  key: ColumnKey;
  label: string;
  getValue: (row: RowType) => string;
  align?: 'left' | 'center' | 'right';
};

export const DEFAULT_GRID_PDF_OPTIONS: GridPdfOptions = {
  orientation: 'landscape',
  rowDensity: 'comfortable',
  fontScale: 'medium',
  widthStrategy: 'balanced',
  lineClamp: 2,
  showColumnHeaders: true,
  showRowStripes: true,
};

export function normalizeGridPdfOptions(
  options?: Partial<GridPdfOptions> | null,
): GridPdfOptions {
  const lineClamp = options?.lineClamp;
  const normalizedLineClamp: GridPdfLineClamp =
    lineClamp === 0 ||
    lineClamp === 1 ||
    lineClamp === 2 ||
    lineClamp === 3 ||
    lineClamp === 4
      ? lineClamp
      : DEFAULT_GRID_PDF_OPTIONS.lineClamp;

  return {
    orientation:
      options?.orientation === 'portrait' || options?.orientation === 'landscape'
        ? options.orientation
        : DEFAULT_GRID_PDF_OPTIONS.orientation,
    rowDensity:
      options?.rowDensity === 'compact' ||
      options?.rowDensity === 'comfortable' ||
      options?.rowDensity === 'spacious'
        ? options.rowDensity
        : DEFAULT_GRID_PDF_OPTIONS.rowDensity,
    fontScale:
      options?.fontScale === 'small' ||
      options?.fontScale === 'medium' ||
      options?.fontScale === 'large'
        ? options.fontScale
        : DEFAULT_GRID_PDF_OPTIONS.fontScale,
    widthStrategy:
      options?.widthStrategy === 'compact' ||
      options?.widthStrategy === 'balanced' ||
      options?.widthStrategy === 'detailed'
        ? options.widthStrategy
        : DEFAULT_GRID_PDF_OPTIONS.widthStrategy,
    lineClamp: normalizedLineClamp,
    showColumnHeaders:
      typeof options?.showColumnHeaders === 'boolean'
        ? options.showColumnHeaders
        : DEFAULT_GRID_PDF_OPTIONS.showColumnHeaders,
    showRowStripes:
      typeof options?.showRowStripes === 'boolean'
        ? options.showRowStripes
        : DEFAULT_GRID_PDF_OPTIONS.showRowStripes,
  };
}

function escapeCsvValue(value: string) {
  const normalized = String(value ?? '').replace(/"/g, '""');
  return `"${normalized}"`;
}

function escapeHtmlValue(value: string) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getExcelColumnName(index: number) {
  let current = index;
  let result = '';

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
}

async function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () =>
      reject(new Error('Não foi possível converter o logotipo para exportação.'));
    reader.readAsDataURL(blob);
  });
}

function detectImageExtension(source: string, mimeType?: string | null) {
  const normalizedMimeType = String(mimeType || '').toLowerCase();
  if (normalizedMimeType.includes('png')) return 'png';
  if (normalizedMimeType.includes('jpeg') || normalizedMimeType.includes('jpg')) return 'jpeg';
  if (normalizedMimeType.includes('gif')) return 'gif';

  const normalizedSource = source.toLowerCase();
  if (normalizedSource.includes('.png')) return 'png';
  if (normalizedSource.includes('.jpg') || normalizedSource.includes('.jpeg')) return 'jpeg';
  if (normalizedSource.includes('.gif')) return 'gif';
  return 'png';
}

async function resolveExcelLogoImage(logoUrl?: string | null) {
  if (!logoUrl) return null;

  try {
    if (logoUrl.startsWith('data:')) {
      const mimeMatch = logoUrl.match(/^data:(image\/[^;]+);base64,/i);
      return {
        base64: logoUrl,
        extension: detectImageExtension(logoUrl, mimeMatch?.[1] || null),
      } as const;
    }

    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    const base64 = await blobToDataUrl(blob);
    return {
      base64,
      extension: detectImageExtension(logoUrl, blob.type),
    } as const;
  } catch {
    return null;
  }
}

function downloadFile(
  content: BlobPart,
  mimeType: string,
  extension: string,
  fileBaseName: string,
) {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateLabel = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `${fileBaseName}-${dateLabel}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function buildDefaultExportColumns<ColumnKey extends string>(
  columns: Array<{ key: ColumnKey }>,
) {
  return columns.reduce<Record<ColumnKey, boolean>>((accumulator, column) => {
    accumulator[column.key] = true;
    return accumulator;
  }, {} as Record<ColumnKey, boolean>);
}

export async function exportGridRows<RowType, ColumnKey extends string>(options: {
  rows: RowType[];
  columns: GridColumnDefinition<RowType, ColumnKey>[];
  selectedColumns: Record<ColumnKey, boolean>;
  format: GridExportFormat;
  fileBaseName: string;
  branding?: GridBranding;
  pdfOptions?: Partial<GridPdfOptions>;
}) {
  const branding = {
    ...options.branding,
    logoUrl: options.branding?.logoUrl || null,
  };
  const pdfOptions = normalizeGridPdfOptions(options.pdfOptions);
  const activeColumns = options.columns.filter(
    (column) => options.selectedColumns[column.key],
  );

  if (options.rows.length === 0) {
    throw new Error('Não há dados visíveis no grid para exportar.');
  }

  if (activeColumns.length === 0) {
    throw new Error('Selecione pelo menos uma coluna para exportar.');
  }

  const headers = activeColumns.map((column) => column.label);
  const rows = options.rows.map((row) =>
    activeColumns.map((column) => column.getValue(row)),
  );
  const exportRows = options.rows.map((row) =>
    activeColumns.reduce<Record<string, string>>((accumulator, column) => {
      accumulator[column.label] = column.getValue(row);
      return accumulator;
    }, {}),
  );

  if (options.format === 'csv') {
    const csvContent = [headers, ...rows]
      .map((row) => row.map((value) => escapeCsvValue(value)).join(';'))
      .join('\r\n');
    downloadFile(csvContent, 'text/csv;charset=utf-8;', 'csv', options.fileBaseName);
    return;
  }

  if (options.format === 'txt') {
    const txtContent = [headers.join(' | '), ...rows.map((row) => row.join(' | '))].join(
      '\r\n',
    );
    downloadFile(txtContent, 'text/plain;charset=utf-8;', 'txt', options.fileBaseName);
    return;
  }

  if (options.format === 'json') {
    downloadFile(
      JSON.stringify(exportRows, null, 2),
      'application/json;charset=utf-8;',
      'json',
      options.fileBaseName,
    );
    return;
  }

  if (options.format === 'excel') {
    const ExcelJSImport = await import('exceljs/dist/exceljs.min.js');
    const ExcelJS = (ExcelJSImport as { default?: { Workbook: new () => any }; Workbook?: new () => any }).default || ExcelJSImport;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MSINFOR';
    workbook.company = 'MSINFOR';
    workbook.created = new Date();
    workbook.modified = new Date();
    const worksheet = workbook.addWorksheet('Exportação');

    const totalColumns = Math.max(activeColumns.length, 1);
    const lastColumnName = getExcelColumnName(totalColumns);
    const schoolName = branding.schoolName || '';
    const exportTitle = branding.title || 'Exportação de dados';
    const exportSubtitle =
      branding.subtitle || 'Exportação com os filtros atualmente aplicados.';
    const logoImage = await resolveExcelLogoImage(branding.logoUrl);

    worksheet.properties.defaultRowHeight = 22;
    worksheet.views = [{ state: 'frozen', ySplit: 5 }];
    worksheet.pageSetup = {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
    };
    worksheet.mergeCells(`B1:${lastColumnName}1`);
    worksheet.mergeCells(`B2:${lastColumnName}2`);
    worksheet.mergeCells(`B3:${lastColumnName}3`);

    worksheet.getCell('B1').value = schoolName || 'EMPRESA';
    worksheet.getCell('B2').value = exportTitle;
    worksheet.getCell('B3').value = exportSubtitle;

    worksheet.getCell('B1').font = { size: 16, bold: true, color: { argb: 'FF153A6A' } };
    worksheet.getCell('B2').font = { size: 12, bold: true, color: { argb: 'FF2563EB' } };
    worksheet.getCell('B3').font = { size: 10, color: { argb: 'FF64748B' } };

    worksheet.getCell('B1').alignment = { vertical: 'middle', horizontal: 'left' };
    worksheet.getCell('B2').alignment = { vertical: 'middle', horizontal: 'left' };
    worksheet.getCell('B3').alignment = { vertical: 'middle', horizontal: 'left' };

    worksheet.getRow(1).height = 24;
    worksheet.getRow(2).height = 20;
    worksheet.getRow(3).height = 18;
    worksheet.getRow(4).height = 8;

    if (logoImage) {
      const imageId = workbook.addImage({
        base64: logoImage.base64,
        extension: logoImage.extension as 'png' | 'jpeg' | 'gif',
      });

      worksheet.mergeCells('A1:A3');
      worksheet.addImage(imageId, {
        tl: { col: 0.15, row: 0.15 },
        ext: { width: 72, height: 72 },
        editAs: 'oneCell',
      });
    }

    const headerRowIndex = 5;
    const headerRow = worksheet.getRow(headerRowIndex);

    activeColumns.forEach((column, columnIndex) => {
      const cell = headerRow.getCell(columnIndex + 1);
      cell.value = column.label;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF153A6A' },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal:
          column.align === 'right'
            ? 'right'
            : column.align === 'center'
              ? 'center'
              : 'left',
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });

    headerRow.height = 22;

    rows.forEach((rowValues, rowIndex) => {
      const row = worksheet.getRow(headerRowIndex + 1 + rowIndex);
      rowValues.forEach((value, columnIndex) => {
        const cell = row.getCell(columnIndex + 1);
        cell.value = value;
        cell.alignment = {
          vertical: 'middle',
          horizontal:
            activeColumns[columnIndex]?.align === 'right'
              ? 'right'
              : activeColumns[columnIndex]?.align === 'center'
                ? 'center'
                : 'left',
          wrapText: false,
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };

        if (rowIndex % 2 === 1) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8FAFC' },
          };
        }
      });
      row.height = 22;
    });

    worksheet.columns = activeColumns.map((column, columnIndex) => {
      const headerLength = column.label.length;
      const maxValueLength = Math.max(
        ...rows.map((row) =>
          String(row[columnIndex] ?? '')
            .split(/\r?\n/)
            .reduce((longest, part) => Math.max(longest, part.length), 0),
        ),
        headerLength,
        12,
      );

      return {
        key: column.key,
        width: Math.min(Math.max(maxValueLength + 4, headerLength + 2, 12), 80),
      };
    });

    worksheet.autoFilter = {
      from: `A${headerRowIndex}`,
      to: `${lastColumnName}${headerRowIndex}`,
    };

    const footerRowIndex = headerRowIndex + rows.length + 2;
    worksheet.mergeCells(`A${footerRowIndex}:${lastColumnName}${footerRowIndex}`);
    const footerCell = worksheet.getCell(`A${footerRowIndex}`);
    footerCell.value = `TOTAL DE REGISTROS EXPORTADOS: ${options.rows.length}`;
    footerCell.font = { size: 11, bold: true, color: { argb: 'FF153A6A' } };
    footerCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0F2FE' },
    };
    footerCell.alignment = { vertical: 'middle', horizontal: 'right' };
    footerCell.border = {
      top: { style: 'thin', color: { argb: 'FFBFDBFE' } },
      left: { style: 'thin', color: { argb: 'FFBFDBFE' } },
      bottom: { style: 'thin', color: { argb: 'FFBFDBFE' } },
      right: { style: 'thin', color: { argb: 'FFBFDBFE' } },
    };
    worksheet.getRow(footerRowIndex).height = 22;

    const buffer = await workbook.xlsx.writeBuffer();
    downloadFile(
      buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'xlsx',
      options.fileBaseName,
    );
    return;
  }

  const printWindow = window.open('', '_blank', 'width=1100,height=800');
  if (!printWindow) {
    throw new Error(
      'Não foi possível abrir a visualização para PDF. Verifique se o navegador bloqueou a janela.',
    );
  }

  const schoolName = branding.schoolName || '';
  const logoMarkup = branding.logoUrl
    ? `<img src="${escapeHtmlValue(branding.logoUrl)}" alt="${escapeHtmlValue(
        `Logo de ${schoolName || 'empresa'}`,
      )}" style="width:84px;height:84px;object-fit:contain;border:1px solid #cbd5e1;border-radius:16px;background:#ffffff;padding:8px;" />`
    : '';

  const headerMarkup =
    schoolName || branding.title
      ? `
            <div class="pdf-header">
                ${logoMarkup || `<div style="width:84px;height:84px;"></div>`}
                <div class="pdf-header-copy">
                    <div class="eyebrow">${escapeHtmlValue(branding.title || 'Exportação')}</div>
                    ${schoolName ? `<div class="school-name">${escapeHtmlValue(schoolName)}</div>` : ''}
                    <div class="subtitle">${escapeHtmlValue(branding.subtitle || 'Exportação com os filtros atualmente aplicados.')}</div>
                </div>
            </div>
        `
      : '';

  const pageMargin = pdfOptions.orientation === 'landscape' ? '10mm' : '12mm';
  const fontSize =
    pdfOptions.fontScale === 'small'
      ? '10px'
      : pdfOptions.fontScale === 'large'
        ? '12px'
        : '11px';
  const headerFontSize =
    pdfOptions.fontScale === 'small'
      ? '10px'
      : pdfOptions.fontScale === 'large'
        ? '12px'
        : '11px';
  const cellPadding =
    pdfOptions.rowDensity === 'compact'
      ? '5px 6px'
      : pdfOptions.rowDensity === 'spacious'
        ? '10px 11px'
        : '8px 9px';
  const lineClampCss =
    pdfOptions.lineClamp === 0
      ? 'display:block; white-space:normal;'
      : `display:-webkit-box; -webkit-line-clamp:${pdfOptions.lineClamp}; -webkit-box-orient:vertical; overflow:hidden;`;
  const tableLayout = pdfOptions.widthStrategy === 'detailed' ? 'auto' : 'fixed';
  const headerCellBg = pdfOptions.widthStrategy === 'compact' ? '#dbeafe' : '#e2e8f0';
  const rowStripeCss = pdfOptions.showRowStripes
    ? '.grid-export-table tbody tr:nth-child(even) td { background:#f8fafc; }'
    : '';
  const widthStrategyCss =
    pdfOptions.widthStrategy === 'compact'
      ? '.grid-export-table th, .grid-export-table td { max-width: 120px; }'
      : pdfOptions.widthStrategy === 'balanced'
        ? '.grid-export-table th, .grid-export-table td { max-width: 180px; }'
        : '.grid-export-table th, .grid-export-table td { max-width: none; }';
  const totalRecords = options.rows.length;
  const headerlessColumnsPerRow =
    pdfOptions.orientation === 'portrait'
      ? 2
      : pdfOptions.widthStrategy === 'compact'
        ? 4
        : pdfOptions.widthStrategy === 'detailed'
          ? 2
          : 3;
  const headerlessLabelWidth =
    headerlessColumnsPerRow >= 4
      ? '96px'
      : headerlessColumnsPerRow === 3
        ? '118px'
        : pdfOptions.widthStrategy === 'detailed'
          ? '176px'
          : '144px';
  const getHeaderlessFieldSpan = (label: string, value: string) => {
    if (headerlessColumnsPerRow <= 1) return 1;
    const normalizedValue = value.trim();
    const needsExtraSpace =
      normalizedValue.length > (headerlessColumnsPerRow >= 4 ? 42 : 34) ||
      label.length > 18 ||
      normalizedValue.includes('\n');
    return needsExtraSpace ? Math.min(2, headerlessColumnsPerRow) : 1;
  };
  const pdfTableHtml = `
        <table border="1" cellspacing="0" cellpadding="8" class="grid-export-table ${pdfOptions.showColumnHeaders ? '' : 'headerless-grid'}">
            ${pdfOptions.showColumnHeaders ? `<thead><tr>${headers.map((header) => `<th style="background:${headerCellBg};">${escapeHtmlValue(header)}</th>`).join('')}</tr></thead>` : ''}
            <tbody>
                ${options.rows
                  .map(
                    (row) => `
                    <tr>
                        ${activeColumns
                          .map((column) => {
                            const value = column.getValue(row);
                            return pdfOptions.showColumnHeaders
                              ? `<td><div class="cell-content">${escapeHtmlValue(value)}</div></td>`
                              : `<td><div class="cell-content"><span class="cell-prefix">${escapeHtmlValue(column.label)}:</span> ${escapeHtmlValue(value)}</div></td>`;
                          })
                          .join('')}
                    </tr>
                `,
                  )
                  .join('')}
            </tbody>
        </table>
    `;
  const pdfRecordListHtml = `
        <div class="record-list">
            ${options.rows
              .map(
                (row, rowIndex) => `
                <section class="record-card">
                    <div class="record-card-header">Registro ${rowIndex + 1}</div>
                    <div class="record-card-grid">
                        ${activeColumns
                          .map((column) => {
                            const value = column.getValue(row);
                            const fieldSpan = getHeaderlessFieldSpan(column.label, value);
                            return `
                            <div class="record-field" style="grid-column: span ${fieldSpan};">
                                <span class="record-field-label">${escapeHtmlValue(column.label)}:</span>
                                <span class="record-field-value">${escapeHtmlValue(value)}</span>
                            </div>
                        `;
                          })
                          .join('')}
                    </div>
                </section>
            `,
              )
              .join('')}
        </div>
    `;

  printWindow.document.open();
  printWindow.document.write(`
        <html>
            <head>
                <meta charset="utf-8" />
                <title>${escapeHtmlValue(branding.title || 'Exportação')}</title>
                <style>
                    @page { size: A4 ${pdfOptions.orientation}; margin: ${pageMargin}; }
                    body { font-family: Arial, sans-serif; padding: 0; color: #0f172a; }
                    .page-shell { display:flex; flex-direction:column; gap:18px; }
                    .pdf-header { display:flex; align-items:center; gap:18px; margin-bottom:24px; padding-bottom:18px; border-bottom:2px solid #e2e8f0; }
                    .pdf-header-copy { display:flex; flex-direction:column; gap:4px; }
                    .pdf-header-copy .eyebrow { font-size:11px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:#2563eb; }
                    .pdf-header-copy .school-name { font-size:24px; font-weight:800; color:#153a6a; }
                    .pdf-header-copy .subtitle { font-size:13px; font-weight:500; color:#64748b; }
                    .grid-export-table { width: 100%; border-collapse: collapse; font-size: ${fontSize}; table-layout:${tableLayout}; }
                    .grid-export-table th, .grid-export-table td { border: 1px solid #cbd5e1; padding: ${cellPadding}; text-align: left; vertical-align: top; }
                    .grid-export-table th { background: ${headerCellBg}; }
                    .grid-export-table .cell-content { ${lineClampCss} word-break: break-word; line-height:1.35; }
                    .grid-export-table .cell-prefix { font-weight:700; color:#153a6a; }
                    .grid-export-table.headerless-grid td { background:#ffffff; }
                    .record-list { display:flex; flex-direction:column; gap:12px; }
                    .record-card { border:1px solid #cbd5e1; border-radius:16px; overflow:hidden; background:#ffffff; }
                    .record-card-header { padding:7px 12px; background:#eff6ff; border-bottom:1px solid #dbeafe; font-size:${headerFontSize}; font-weight:800; color:#153a6a; }
                    .record-card-grid { display:grid; grid-template-columns:repeat(${headerlessColumnsPerRow}, minmax(0, 1fr)); grid-auto-flow:dense; gap:0; }
                    .record-field { display:flex; align-items:flex-start; gap:8px; min-height:${pdfOptions.rowDensity === 'compact' ? '28px' : pdfOptions.rowDensity === 'spacious' ? '40px' : '34px'}; padding:${cellPadding}; border-right:1px solid #e2e8f0; border-bottom:1px solid #e2e8f0; }
                    .record-card-grid .record-field:nth-last-child(-n + ${headerlessColumnsPerRow}) { border-bottom:none; }
                    .record-field-label { flex:none; width:${headerlessLabelWidth}; font-weight:800; color:#153a6a; white-space:normal; }
                    .record-field-value { min-width:0; flex:1; color:#0f172a; display:block; white-space:normal; word-break:break-word; }
                    .pdf-footer { margin-top:18px; padding-top:12px; border-top:2px solid #e2e8f0; text-align:right; font-size:${headerFontSize}; font-weight:800; color:#153a6a; }
                    ${rowStripeCss}
                    ${widthStrategyCss}
                </style>
            </head>
            <body>
                <div class="page-shell">
                    ${headerMarkup}
                    ${pdfOptions.showColumnHeaders ? pdfTableHtml : pdfRecordListHtml}
                    <div class="pdf-footer">Total de registros impressos: ${totalRecords}</div>
                </div>
            </body>
        </html>
    `);
  printWindow.document.close();

  const triggerPrint = () => {
    printWindow.focus();
    printWindow.print();
  };

  if (branding.logoUrl) {
    printWindow.addEventListener(
      'load',
      () => {
        window.setTimeout(triggerPrint, 400);
      },
      { once: true },
    );
  } else {
    window.setTimeout(triggerPrint, 100);
  }
}
