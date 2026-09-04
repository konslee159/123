// RISS(riss.kr) 검색 결과를 실제 브라우저(Playwright)로 렌더링해서 긁어온다.
//
// 왜 브라우저를 쓰나: RISS 검색 결과는 페이지 첫 응답에 바로 안 실리고 JS가 실행되면서
// 채워지는 경우가 많다. WebFetch처럼 JS를 실행하지 않는 도구로 받으면 검색어를 바꿔도
// 매번 똑같은 "기본/추천 콘텐츠"만 보이는데, 이게 마치 캐시된 엉뚱한 결과처럼 보인다.
// 헤드리스 브라우저로 열어서 실제로 로딩된 뒤의 DOM을 읽으면 이 문제가 해결된다.
//
// 이 스크립트는 특정 CSS 클래스 이름에 기대지 않는다. RISS 상세보기 링크는
// `DetailView.do?...control_no=...` 형태로 안정적이므로, 페이지 안의 그런 링크를
// 전부 찾아서 각 링크 주변 텍스트에서 제목/저자/출처/연도를 뽑는 방식을 쓴다.
// 클래스명이 바뀌어도 이 방식은 잘 안 깨진다.
//
// **가장 중요한 안전장치**: 검색어가 실제로 결과 페이지에 반영됐는지 확인한다.
// (RISS는 보통 "'질의어' 검색결과 N건" 같은 문구를 보여준다.) 이게 안 보이면
// - 조용히 엉뚱한 결과를 뱉는 대신 - 에러로 멈추고 실제 URL과 페이지 스니펫을 출력한다.
// 이전에 겪은 "검색어를 바꿔도 무관한 결과가 반복됨" 버그가 바로 이걸 놓쳐서 생긴다.
//
// 사용법:
//   node search_riss.mjs --query "자동차 LCA" [--year1 2023] [--year2 2026] [--pages 2] [--out papers.json]
//   node search_riss.mjs --query "자동차 LCA" --dump-html snapshot.html   # 진단용: 렌더링된 HTML 저장
import fs from "node:fs/promises";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const query = opt("query");
if (!query) {
  console.error('사용법: node search_riss.mjs --query "검색어" [--year1 2023] [--year2 2026] [--pages 2] [--out papers.json] [--dump-html 파일.html]');
  process.exit(1);
}
const year1 = opt("year1");
const year2 = opt("year2");
const maxPages = Number(opt("pages", "1"));
const outPath = opt("out");
const dumpHtmlPath = opt("dump-html");

const base = opt("base", "https://www.riss.kr/search/Search.do");
const buildUrl = (page) => {
  const u = new URL(base);
  u.searchParams.set("query", query);
  if (year1) u.searchParams.set("p_year1", year1);
  if (year2) u.searchParams.set("p_year2", year2);
  if (page > 1) u.searchParams.set("pageNumber", String(page));
  return u.toString();
};

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const browser = await chromium
  .launch({ executablePath: (await fs.stat(executablePath).catch(() => null)) ? executablePath : undefined })
  .catch(async (e) => {
    console.error(`Chromium 실행 실패: ${e.message}`);
    console.error("이 환경에 Playwright 브라우저가 없다면: npx playwright install chromium");
    process.exit(1);
  });

const allPapers = [];
const issues = [];

try {
  for (let p = 1; p <= maxPages; p++) {
    const url = buildUrl(p);
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    // JS가 결과를 채울 시간을 준다. 고정 대기 대신, 상세링크가 하나라도 나타나거나
    // 타임아웃될 때까지 기다린다.
    await page
      .waitForSelector('a[href*="DetailView.do"]', { timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(1000);

    const finalUrl = page.url();
    const bodyText = await page.evaluate(() => document.body.innerText);

    if (dumpHtmlPath && p === 1) {
      await fs.writeFile(dumpHtmlPath, await page.content(), "utf8");
      console.error(`진단용 HTML 저장: ${dumpHtmlPath}`);
    }

    // ── 안전장치: 검색어가 실제로 이 페이지에 반영됐는지 확인 ──
    const queryReflected = bodyText.includes(query) || query.split(/\s+/).every((tok) => bodyText.includes(tok));
    if (!queryReflected) {
      console.error(`[경고] "${query}"가 결과 페이지 텍스트에서 확인되지 않습니다.`);
      console.error(`요청 URL: ${url}`);
      console.error(`실제 도착 URL: ${finalUrl}${finalUrl !== url ? "  ← 요청과 다름! 리다이렉트된 것으로 보인다." : ""}`);
      console.error(`페이지 앞부분 텍스트:\n${bodyText.slice(0, 500)}`);
      console.error("이 페이지는 검색 결과가 아닐 가능성이 높다. 이 페이지에서 뽑은 내용은 쓰지 않는다.");
      issues.push(`p${p}: 검색어 미반영, 최종 URL=${finalUrl}`);
      await context.close();
      break; // 신뢰 못 할 페이지 이후로는 진행하지 않는다 (같은 문제가 반복될 뿐이다).
    }

    // ── 상세보기 링크를 기준으로 결과 항목을 뽑는다 ──
    const items = await page.evaluate(() => {
      const anchors = [...document.querySelectorAll('a[href*="DetailView.do"]')];
      const seen = new Set();
      const out = [];
      for (const a of anchors) {
        const href = a.href;
        if (seen.has(href)) continue;
        seen.add(href);
        const title = a.innerText.trim();
        if (!title) continue;
        // 링크를 감싸는 가장 가까운 블록(li/div)에서 주변 텍스트를 모아 저자/출처/연도/유형 후보로 쓴다.
        const block = a.closest("li, div, tr") ?? a.parentElement;
        const blockText = block ? block.innerText.replace(/\s+/g, " ").trim() : "";
        out.push({ title, href, blockText });
      }
      return out;
    });

    for (const it of items) {
      const yearMatch = it.blockText.match(/\b(19|20)\d{2}\b/);
      const typeMatch = it.blockText.match(/학위논문|학술지논문|학술대회논문|단행본|연구보고서/);
      allPapers.push({
        title: it.title,
        link: it.href,
        year: yearMatch ? yearMatch[0] : "",
        type: typeMatch ? typeMatch[0] : "",
        // 저자/출처는 블록 텍스트에서 정확히 분리하기 어려워 원문 그대로 남긴다.
        // (build_excel.mjs용 데이터로 옮길 때 사람이 한 번 훑어보고 정리하는 걸 권장 —
        //  자동 분리가 틀리면 조용히 틀린 저자명이 들어갈 수 있다.)
        rawBlockText: it.blockText,
      });
    }
    await context.close();

    if (items.length === 0) {
      issues.push(`p${p}: 상세링크를 하나도 못 찾음`);
      break;
    }
  }
} finally {
  await browser.close();
}

const result = { query, year1, year2, count: allPapers.length, papers: allPapers, issues };
if (outPath) {
  await fs.writeFile(outPath, JSON.stringify(result, null, 2), "utf8");
  console.error(`저장: ${outPath} (${allPapers.length}건)`);
} else {
  console.log(JSON.stringify(result, null, 2));
}
if (issues.length) {
  console.error(`\n[문제] ${issues.join(" / ")}`);
  process.exit(allPapers.length ? 0 : 1);
}
