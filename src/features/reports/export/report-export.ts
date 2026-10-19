import JSZip from "jszip";
import * as XLSX from "xlsx";

export type ReportCell = string | number | null | undefined;

export interface ReportFilter {
  label: string;
  value: string | number;
}

export interface ReportMetric {
  label: string;
  value: string | number;
}

export interface ReportSection {
  title: string;
  headers: string[];
  rows: ReportCell[][];
}

export interface ReportDocument {
  title: string;
  filename?: string;
  source: string;
  generatedBy: string;
  generatedAt?: string;
  filters?: ReportFilter[];
  summary?: ReportMetric[];
  sections: ReportSection[];
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function nowIso(report: ReportDocument): string {
  return report.generatedAt || new Date().toISOString();
}

export function safeReportFilename(value: string): string {
  const result = String(value || "گزارش")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return result || "گزارش";
}

/** مقدار مشکوک را صریحاً سلول متنی می‌سازد تا هیچ Formulaای اجرا نشود. */
export function safeSpreadsheetCell(value: ReportCell): string | number | XLSX.CellObject {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "—");
  return /^[=+\-@]/.test(text) ? { t: "s", v: text } : text;
}

function sheetName(value: string, used: Set<string>): string {
  const base =
    String(value || "گزارش")
      .replace(/[\\/?*\[\]:]/g, "-")
      .slice(0, 31) || "گزارش";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    const tail = `-${suffix}`;
    candidate = `${base.slice(0, 31 - tail.length)}${tail}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function worksheetFromRows(rows: ReportCell[][], freezeHeader = false): XLSX.WorkSheet {
  const safeRows = rows.map((row) => row.map(safeSpreadsheetCell));
  const worksheet = XLSX.utils.aoa_to_sheet(safeRows);
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  worksheet["!cols"] = Array.from({ length: columnCount }, (_, columnIndex) => {
    const width = rows.reduce((max, row) => {
      const value = row[columnIndex];
      return Math.max(max, String(value ?? "").length);
    }, 8);
    return { wch: Math.min(45, Math.max(10, width + 2)) };
  });
  (worksheet as XLSX.WorkSheet & { "!views"?: unknown })["!views"] = [
    { rightToLeft: true, state: freezeHeader ? "frozen" : undefined, ySplit: freezeHeader ? 1 : 0 },
  ];
  if (freezeHeader && columnCount > 0 && safeRows.length > 0) {
    worksheet["!autofilter"] = {
      ref: XLSX.utils.encode_range({ r: 0, c: 0 }, { r: safeRows.length - 1, c: columnCount - 1 }),
    };
  }
  return worksheet;
}

export function buildReportWorkbook(report: ReportDocument): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  const generatedAt = new Date(nowIso(report));
  const metadata: ReportCell[][] = [
    ["عنوان گزارش", report.title],
    ["منبع داده", report.source],
    ["تولیدکننده", report.generatedBy],
    ["زمان تولید", generatedAt.toLocaleString("fa-IR")],
    [],
    ["فیلتر", "مقدار"],
    ...(report.filters ?? []).map((item) => [item.label, item.value]),
    [],
    ["شاخص", "مقدار"],
    ...(report.summary ?? []).map((item) => [item.label, item.value]),
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    worksheetFromRows(metadata),
    sheetName("مشخصات گزارش", usedNames),
  );

  for (const section of report.sections) {
    const rows: ReportCell[][] = [section.headers, ...section.rows];
    XLSX.utils.book_append_sheet(
      workbook,
      worksheetFromRows(rows, true),
      sheetName(section.title, usedNames),
    );
  }
  return workbook;
}

export function exportReportXlsx(report: ReportDocument): void {
  const workbook = buildReportWorkbook(report);
  XLSX.writeFile(workbook, `${safeReportFilename(report.filename || report.title)}.xlsx`, {
    bookType: "xlsx",
    compression: true,
  });
}

function escapeHtml(value: ReportCell): string {
  return String(value ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function htmlTable(section: ReportSection): string {
  const headers = section.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const rows = section.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<section class="report-section">
<h2>${escapeHtml(section.title)} <small>(${section.rows.length.toLocaleString("fa-IR")} ردیف)</small></h2>
<div class="table-wrap"><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>
</section>`;
}

export function buildReportPrintHtml(report: ReportDocument): string {
  const generatedAt = new Date(nowIso(report));
  const filters = (report.filters ?? [])
    .map(
      (item) =>
        `<div class="meta-item"><span>${escapeHtml(item.label)}</span><b>${escapeHtml(item.value)}</b></div>`,
    )
    .join("");
  const summary = (report.summary ?? [])
    .map(
      (item) =>
        `<div class="metric"><span>${escapeHtml(item.label)}</span><b>${escapeHtml(item.value)}</b></div>`,
    )
    .join("");
  const sections = report.sections.map(htmlTable).join("");
  const landscape = report.sections.some((section) => section.headers.length > 7);

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(report.title)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;800&display=swap');
@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 12mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #17231d; background: #fff; direction: rtl; font-family: Vazirmatn, Tahoma, Arial, sans-serif; font-size: 11px; }
.report-header { border: 2px solid #1a6b3c; border-radius: 14px; padding: 16px; margin-bottom: 14px; text-align: center; }
h1 { color: #14532d; font-size: 21px; margin: 0 0 7px; }
.report-header p { margin: 3px 0; color: #52645a; }
.meta-grid, .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; margin: 10px 0 14px; }
.meta-item, .metric { border: 1px solid #dce7df; border-radius: 9px; padding: 7px 9px; background: #f8fbf9; }
.meta-item span, .metric span { display: block; color: #64756b; font-size: 9px; margin-bottom: 3px; }
.meta-item b, .metric b { font-size: 11px; }
.report-section { margin: 0 0 18px; break-before: auto; }
.report-section + .report-section { break-before: page; }
h2 { color: #14532d; font-size: 15px; margin: 0 0 7px; border-right: 4px solid #d4af37; padding-right: 8px; }
h2 small { color: #738178; font-size: 9px; font-weight: 400; }
.table-wrap { width: 100%; overflow: visible; }
table { width: 100%; border-collapse: collapse; table-layout: auto; }
thead { display: table-header-group; }
tfoot { display: table-footer-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th { background: #1a6b3c !important; color: white !important; font-weight: 700; padding: 6px; border: 1px solid #0f5130; text-align: right; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
td { padding: 5px 6px; border: 1px solid #d9e1dc; text-align: right; vertical-align: top; overflow-wrap: anywhere; }
tbody tr:nth-child(even) td { background: #f6faf7 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.report-footer { border-top: 1px solid #d7e0da; padding-top: 8px; color: #7a8980; text-align: center; font-size: 9px; }
.no-print { margin: 18px 0; text-align: center; }
.no-print button { border: 0; border-radius: 8px; padding: 9px 25px; background: #1a6b3c; color: white; cursor: pointer; font: inherit; }
@media print { .no-print { display: none !important; } body { font-size: 9px; } .meta-grid, .summary-grid { grid-template-columns: repeat(4, 1fr); } }
</style>
</head>
<body>
<header class="report-header">
<h1>${escapeHtml(report.title)}</h1>
<p>مرکز تخصصی قرآن کریم بِرّ الوالدین</p>
<p>منبع داده: ${escapeHtml(report.source)} | تولیدکننده: ${escapeHtml(report.generatedBy)} | زمان: ${escapeHtml(generatedAt.toLocaleString("fa-IR"))}</p>
</header>
${filters ? `<div class="meta-grid">${filters}</div>` : ""}
${summary ? `<div class="summary-grid">${summary}</div>` : ""}
${sections}
<footer class="report-footer">این گزارش توسط سامانه مدیریت مرکز بِرّ الوالدین تولید شده است.</footer>
<div class="no-print"><button type="button" onclick="window.print()">ذخیره / چاپ PDF</button></div>
<script>
(async function () {
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (error) {}
  window.setTimeout(function () { window.print(); }, 100);
})();
</script>
</body>
</html>`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportReportPrint(report: ReportDocument): void {
  const html = buildReportPrintHtml(report);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const popup = window.open(url, "_blank");
  if (!popup) {
    downloadBlob(blob, `${safeReportFilename(report.filename || report.title)}-چاپ.html`);
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

function xmlEscape(value: ReportCell): string {
  return String(value ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function docxRun(value: ReportCell, bold = false, color?: string): string {
  return `<w:r><w:rPr><w:rtl/>${bold ? "<w:b/>" : ""}${color ? `<w:color w:val="${color}"/>` : ""}<w:rFonts w:ascii="Vazirmatn" w:hAnsi="Vazirmatn" w:cs="Vazirmatn"/></w:rPr><w:t xml:space="preserve">${xmlEscape(value)}</w:t></w:r>`;
}

function docxParagraph(
  value: ReportCell,
  options: { bold?: boolean; heading?: boolean; center?: boolean } = {},
): string {
  const spacing = options.heading
    ? '<w:spacing w:before="180" w:after="100"/>'
    : '<w:spacing w:after="40"/>';
  return `<w:p><w:pPr><w:bidi/><w:jc w:val="${options.center ? "center" : "right"}"/>${spacing}</w:pPr>${docxRun(value, options.bold || options.heading, options.heading ? "14532D" : undefined)}</w:p>`;
}

function docxCell(value: ReportCell, header = false): string {
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${header ? '<w:shd w:val="clear" w:color="auto" w:fill="1A6B3C"/>' : ""}</w:tcPr><w:p><w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr>${docxRun(value, header, header ? "FFFFFF" : undefined)}</w:p></w:tc>`;
}

function docxTable(headers: string[], rows: ReportCell[][]): string {
  const borders =
    '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="B7C6BC"/><w:left w:val="single" w:sz="4" w:color="B7C6BC"/><w:bottom w:val="single" w:sz="4" w:color="B7C6BC"/><w:right w:val="single" w:sz="4" w:color="B7C6BC"/><w:insideH w:val="single" w:sz="4" w:color="D9E1DC"/><w:insideV w:val="single" w:sz="4" w:color="D9E1DC"/></w:tblBorders>';
  const headerRow = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${headers.map((value) => docxCell(value, true)).join("")}</w:tr>`;
  const bodyRows = rows
    .map((row) => `<w:tr>${row.map((value) => docxCell(value)).join("")}</w:tr>`)
    .join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:bidiVisual/>${borders}</w:tblPr>${headerRow}${bodyRows}</w:tbl>`;
}

export function buildReportDocumentXml(report: ReportDocument): string {
  const generatedAt = new Date(nowIso(report));
  const wide = report.sections.some((section) => section.headers.length > 6);
  const filters = (report.filters ?? []).map((item) => [item.label, item.value]);
  const summary = (report.summary ?? []).map((item) => [item.label, item.value]);
  const body = [
    docxParagraph(report.title, { heading: true, center: true }),
    docxParagraph("مرکز تخصصی قرآن کریم بِرّ الوالدین", { bold: true, center: true }),
    docxParagraph(
      `منبع داده: ${report.source} | تولیدکننده: ${report.generatedBy} | زمان: ${generatedAt.toLocaleString("fa-IR")}`,
      { center: true },
    ),
    ...(filters.length
      ? [
          docxParagraph("فیلترهای اعمال‌شده", { heading: true }),
          docxTable(["فیلتر", "مقدار"], filters),
        ]
      : []),
    ...(summary.length
      ? [docxParagraph("خلاصه گزارش", { heading: true }), docxTable(["شاخص", "مقدار"], summary)]
      : []),
    ...report.sections.flatMap((section) => [
      docxParagraph(`${section.title} (${section.rows.length.toLocaleString("fa-IR")} ردیف)`, {
        heading: true,
      }),
      docxTable(section.headers, section.rows),
    ]),
    `<w:sectPr><w:pgSz w:w="${wide ? 16838 : 11906}" w:h="${wide ? 11906 : 16838}"${wide ? ' w:orient="landscape"' : ""}/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>`,
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
}

export async function buildReportDocxBlob(report: ReportDocument): Promise<Blob> {
  const zip = new JSZip();
  const created = nowIso(report);
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
  );
  zip
    .folder("_rels")
    ?.file(
      ".rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    );
  const word = zip.folder("word");
  word?.file("document.xml", buildReportDocumentXml(report));
  word?.file(
    "styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Vazirmatn" w:hAnsi="Vazirmatn" w:cs="Vazirmatn"/><w:rtl/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`,
  );
  word
    ?.folder("_rels")
    ?.file(
      "document.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    );
  const props = zip.folder("docProps");
  props?.file(
    "core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(report.title)}</dc:title><dc:creator>${xmlEscape(report.generatedBy)}</dc:creator><cp:lastModifiedBy>${xmlEscape(report.generatedBy)}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${xmlEscape(created)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${xmlEscape(created)}</dcterms:modified></cp:coreProperties>`,
  );
  props?.file(
    "app.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>سامانه مدیریت مرکز قرآن</Application></Properties>`,
  );
  return zip.generateAsync({ type: "blob", mimeType: DOCX_MIME, compression: "DEFLATE" });
}

export async function exportReportDocx(report: ReportDocument): Promise<void> {
  const blob = await buildReportDocxBlob(report);
  downloadBlob(blob, `${safeReportFilename(report.filename || report.title)}.docx`);
}

export function exportReport(
  report: ReportDocument,
  type: "excel" | "pdf" | "word",
): void | Promise<void> {
  if (type === "excel") return exportReportXlsx(report);
  if (type === "pdf") return exportReportPrint(report);
  return exportReportDocx(report);
}

export const REPORT_EXPORT_MIME_TYPES = { xlsx: XLSX_MIME, docx: DOCX_MIME } as const;
