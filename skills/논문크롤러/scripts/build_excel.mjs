// 논문 검색 결과 엑셀 생성기
// 사용법: node build_excel.mjs <데이터 파일 경로>
//
// 데이터 파일은 CONFIG / GROUPS 를 export 해야 한다.
// 형식은 assets/papers.template.mjs 참고.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";

const src = process.argv[2];
if (!src) {
  console.error("사용법: node build_excel.mjs <데이터 파일 경로>");
  process.exit(1);
}
const srcAbs = path.resolve(src);
const mod = await import(pathToFileURL(srcAbs).href);
const { CONFIG, GROUPS } = mod;

if (!CONFIG) throw new Error("데이터 파일에 CONFIG export가 없습니다.");
if (!GROUPS || !GROUPS.length) throw new Error("데이터 파일에 GROUPS export가 없거나 비어 있습니다.");
if (!CONFIG.outPath) throw new Error("CONFIG.outPath가 없습니다.");

const NAVY = "FF193651";
const TEAL = "FF16837A";
const GRAY = "FF6B7C8D";
const LINE = "FFC9D1D9";
const SOFT = "FFF3F7F9";
const FONT = CONFIG.fontName ?? "맑은 고딕";
const COLUMNS = ["No", "제목", "저자", "출처", "연도", "유형", "링크"];
const WIDTHS = [6, 52, 22, 26, 8, 14, 40];

const safeSheetName = (name, used) => {
  let s = String(name).replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "시트";
  let out = s;
  let i = 2;
  while (used.has(out)) out = `${s.slice(0, 28)}(${i++})`;
  used.add(out);
  return out;
};

const wb = new ExcelJS.Workbook();
wb.creator = "논문크롤러 스킬";
wb.created = new Date();

// ── 0_요약 시트 ──────────────────────────────────────────
const summary = wb.addWorksheet("0_요약");
summary.views = [{ state: "frozen", ySplit: 3 }];
summary.getCell("A1").value = CONFIG.title ?? "논문 검색 결과";
summary.getCell("A1").font = { name: FONT, size: 16, bold: true, color: { argb: NAVY } };
summary.mergeCells("A1:F1");
if (CONFIG.period) {
  summary.getCell("A2").value = `조사기간: ${CONFIG.period}`;
  summary.getCell("A2").font = { name: FONT, size: 10, color: { argb: GRAY } };
}
const sumHeader = ["시트", "검색어", "출처", "건수", "비고"];
sumHeader.forEach((h, i) => {
  const c = summary.getCell(4, i + 1);
  c.value = h;
  c.font = { name: FONT, bold: true, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  c.border = { bottom: { style: "thin", color: { argb: LINE } } };
});
[10, 22, 14, 8, 40].forEach((w, i) => (summary.getColumn(i + 1).width = w));

const usedNames = new Set(["0_요약"]);
let totalCount = 0;

GROUPS.forEach((group, gi) => {
  const rows = group.papers ?? [];
  for (const [title, , , , , link] of rows) {
    if (!title || !String(title).trim()) throw new Error(`[${group.sheetName}] 제목이 빈 행이 있습니다.`);
    if (!link || !String(link).trim()) throw new Error(`[${group.sheetName}] "${title}" 행에 링크가 없습니다. 링크 없는 논문은 목록에서 빼거나 원문을 다시 찾는다.`);
  }
  totalCount += rows.length;

  const sheetName = safeSheetName(group.sheetName ?? `그룹${gi + 1}`, usedNames);
  const sr = summary.getRow(5 + gi);
  sr.getCell(1).value = sheetName;
  sr.getCell(2).value = group.keyword ?? "-";
  sr.getCell(3).value = group.source ?? "-";
  sr.getCell(4).value = rows.length;
  sr.getCell(5).value = group.note ?? "";
  sr.eachCell((c) => (c.border = { bottom: { style: "hair", color: { argb: LINE } } }));

  const ws = wb.addWorksheet(sheetName);
  ws.views = [{ state: "frozen", ySplit: 1 }];
  COLUMNS.forEach((h, i) => {
    const c = ws.getCell(1, i + 1);
    c.value = h;
    c.font = { name: FONT, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
    c.alignment = { vertical: "middle" };
  });
  ws.columns = WIDTHS.map((w) => ({ width: w }));
  ws.autoFilter = { from: "A1", to: `G${rows.length + 1}` };

  rows.forEach((row, i) => {
    const [title, authors, source, year, type, link] = row;
    const r = ws.getRow(i + 2);
    r.getCell(1).value = i + 1;
    r.getCell(2).value = title;
    r.getCell(3).value = authors ?? "";
    r.getCell(4).value = source ?? "";
    r.getCell(5).value = year ?? "";
    r.getCell(6).value = type ?? "";
    r.getCell(7).value = { text: "원문 보기", hyperlink: link };
    r.getCell(7).font = { name: FONT, color: { argb: TEAL }, underline: true };
    r.eachCell((c) => {
      c.font = c.font ?? { name: FONT };
      if (!c.font.name) c.font.name = FONT;
      c.alignment = { vertical: "top", wrapText: c._column?.number === 2 };
      c.border = { bottom: { style: "hair", color: { argb: LINE } } };
      if (i % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT } };
    });
  });
});

summary.getCell(`D${5 + GROUPS.length}`).value = totalCount;
summary.getCell(`D${5 + GROUPS.length}`).font = { name: FONT, bold: true, color: { argb: NAVY } };
summary.getCell(`A${5 + GROUPS.length}`).value = "합계";
summary.getCell(`A${5 + GROUPS.length}`).font = { name: FONT, bold: true };

await fs.mkdir(path.dirname(path.resolve(path.dirname(srcAbs), CONFIG.outPath)), { recursive: true }).catch(() => {});
const outPath = path.resolve(path.dirname(srcAbs), CONFIG.outPath);
await wb.xlsx.writeFile(outPath);
console.log(`완료: ${outPath} (${GROUPS.length}개 시트, 총 ${totalCount}건)`);
