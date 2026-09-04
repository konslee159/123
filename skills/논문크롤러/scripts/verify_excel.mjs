// build_excel.mjs로 만든 엑셀을 검증한다.
// 사람이 놓치기 쉬운 것만 본다: 빈 제목/링크, 이상한 링크 형식, 연도 형식, 중복 논문, 시트 이름 충돌.
// 사용법: node verify_excel.mjs <데이터 파일 경로>
import path from "node:path";
import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";

const src = process.argv[2];
if (!src) {
  console.error("사용법: node verify_excel.mjs <데이터 파일 경로>");
  process.exit(1);
}
const srcAbs = path.resolve(src);
const mod = await import(pathToFileURL(srcAbs).href);
const { CONFIG, GROUPS } = mod;

const problems = [];
const warn = (msg) => problems.push({ level: "경고", msg });
const fail = (msg) => problems.push({ level: "오류", msg });

// ── 데이터 파일 자체 검증 ──────────────────────────────────
const seenTitles = new Map(); // title -> [sheetName,...]
const seenSheetNames = new Set();

for (const group of GROUPS) {
  const sheetName = group.sheetName ?? "(이름 없음)";
  if (seenSheetNames.has(sheetName)) fail(`시트 이름 "${sheetName}"이 중복됩니다.`);
  seenSheetNames.add(sheetName);
  if (sheetName.length > 31) fail(`시트 이름 "${sheetName}"이 31자를 넘습니다 (엑셀 제한).`);

  (group.papers ?? []).forEach(([title, authors, source, year, type, link], i) => {
    const where = `[${sheetName} #${i + 1}]`;
    if (!title?.trim()) fail(`${where} 제목이 비었습니다.`);
    if (!link?.trim()) {
      fail(`${where} "${title}" 링크가 없습니다.`);
    } else if (!/^https?:\/\//.test(link.trim())) {
      warn(`${where} "${title}" 링크가 http(s)로 시작하지 않습니다: ${link}`);
    }
    if (year !== undefined && year !== "미상") {
      const y = Number(year);
      if (!Number.isInteger(y) || y < 1900 || y > 2100) {
        warn(`${where} "${title}" 연도 값이 이상합니다: ${JSON.stringify(year)} (숫자 4자리 또는 "미상" 권장)`);
      }
    }
    if (!authors?.trim()) warn(`${where} "${title}" 저자가 비었습니다.`);
    if (!source?.trim()) warn(`${where} "${title}" 출처가 비었습니다.`);
    if (!type?.trim()) warn(`${where} "${title}" 유형이 비었습니다.`);

    if (title) {
      const key = title.trim();
      if (!seenTitles.has(key)) seenTitles.set(key, []);
      seenTitles.get(key).push(sheetName);
    }
  });
}

for (const [title, sheets] of seenTitles) {
  if (sheets.length > 1) warn(`"${title}" 이(가) 여러 시트에 중복 등록됨: ${sheets.join(", ")} — RISS/KCI 양쪽에서 같은 논문이 잡혔을 수 있다. 의도한 게 아니면 하나만 남긴다.`);
}

// ── 실제로 만들어진 엑셀 파일과 건수 대조 ──────────────────
const outPath = path.resolve(path.dirname(srcAbs), CONFIG?.outPath ?? "");
try {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(outPath);
  for (const group of GROUPS) {
    const ws = wb.worksheets.find((w) => w.name.startsWith(group.sheetName.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28)));
    const expected = (group.papers ?? []).length;
    const actual = ws ? ws.rowCount - 1 : -1;
    if (!ws) fail(`엑셀에 "${group.sheetName}" 시트가 없습니다. build_excel.mjs를 먼저 실행했는지 확인.`);
    else if (actual !== expected) fail(`"${group.sheetName}" 시트 행 수(${actual})가 데이터 파일(${expected})과 다릅니다.`);
  }
} catch (e) {
  fail(`엑셀 파일을 열 수 없습니다 (${outPath}): ${e.message} — build_excel.mjs를 먼저 실행한다.`);
}

// ── 결과 출력 ───────────────────────────────────────────
const errors = problems.filter((p) => p.level === "오류");
const warnings = problems.filter((p) => p.level === "경고");
for (const p of problems) console.log(`[${p.level}] ${p.msg}`);
console.log(`\n총 ${GROUPS.reduce((s, g) => s + (g.papers?.length ?? 0), 0)}건 · 오류 ${errors.length}건 · 경고 ${warnings.length}건`);
if (errors.length) {
  console.error("\n오류를 고치고 다시 실행한다.");
  process.exit(1);
}
