// KCI(한국학술지인용색인) Open API로 논문을 검색한다.
// data.go.kr에서 "한국연구재단_KCI 논문정보서비스"를 활용신청하면 받는 서비스키(serviceKey)가 필요하다.
// 발급 방법은 references/kci-api-guide.md 참고.
//
// 사용법:
//   node search_kci.mjs --key <서비스키> --query "배터리 LCA" [--rows 50] [--page 1] [--dump]
//
// --dump 를 붙이면 파싱하지 않고 원본 XML을 그대로 출력한다.
// data.go.kr API는 활용신청한 데이터셋마다 응답 태그 이름이 조금씩 다르다.
// 이 스크립트는 흔한 태그 이름 후보들을 넓게 잡아서 매핑을 "시도"할 뿐이니,
// 처음 한 번은 --dump로 실제 태그 이름을 직접 확인하고 아래 FIELD_CANDIDATES를 맞춰 쓰는 걸 권한다.
// (신청 승인 후 마이페이지에서 내려받는 "활용가이드" 문서에 정확한 스펙이 있다.)

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const has = (name) => args.includes(`--${name}`);

const key = opt("key", process.env.KCI_API_KEY);
const query = opt("query");
const rows = opt("rows", "100");
const page = opt("page", "1");
const base = opt(
  "base",
  process.env.KCI_API_BASE ?? "http://apis.data.go.kr/B552540/KCIOpenApi/artiInfo/openApiD217List"
);

if (!key) {
  console.error("--key 가 없습니다 (또는 환경변수 KCI_API_KEY). references/kci-api-guide.md 에서 발급 방법을 확인한다.");
  process.exit(1);
}
if (!query) {
  console.error("--query 가 없습니다. 예: --query \"배터리 LCA\"");
  process.exit(1);
}

const url = new URL(base);
url.searchParams.set("serviceKey", key);
url.searchParams.set("title", query); // 데이터셋에 따라 title 대신 다른 파라미터명일 수 있다 — 아래 참고
url.searchParams.set("numOfRows", rows);
url.searchParams.set("pageNo", page);

const res = await fetch(url).catch((e) => {
  console.error(`요청 실패: ${e.message}`);
  console.error("이 환경에서 apis.data.go.kr로 나가는 네트워크가 막혀 있을 수 있다. 사용자의 실제 실행 환경에서 다시 시도한다.");
  process.exit(1);
});
const text = await res.text();

if (!res.ok) {
  console.error(`HTTP ${res.status}\n${text.slice(0, 2000)}`);
  process.exit(1);
}

if (has("dump")) {
  console.log(text);
  process.exit(0);
}

// ── 아주 단순한 XML 파서 (의존성 추가 없이, 흔한 flat <item> 구조만 처리) ──
const resultCode = text.match(/<resultCode>([^<]*)<\/resultCode>/)?.[1];
const resultMsg = text.match(/<resultMsg>([^<]*)<\/resultMsg>/)?.[1];
if (resultCode && resultCode !== "00" && resultCode !== "0") {
  console.error(`API 오류 응답: [${resultCode}] ${resultMsg ?? "(메시지 없음)"}`);
  console.error("서비스키가 아직 승인 대기중이거나(발급 직후 최대 1~2시간 소요), 파라미터명이 이 데이터셋과 다를 수 있다.");
  console.error("--dump로 원본을 보고 references/kci-api-guide.md와 대조한다.");
  process.exit(1);
}

const items = [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
if (!items.length) {
  console.error("결과 항목(<item>)을 찾지 못했습니다. --dump로 원본 응답을 확인한다.");
  console.log(text.slice(0, 3000));
  process.exit(1);
}

// 태그 이름 후보 — 실제 스펙 확인 후 필요하면 이 목록에 추가한다.
const FIELD_CANDIDATES = {
  title: ["artiTitle", "title", "articleTitle", "koreanTitle"],
  authors: ["author", "authorName", "authors", "artiAuthor"],
  source: ["journalName", "pubName", "sourceTitle", "journal"],
  year: ["pubYear", "yearInfo", "year", "pubDate"],
  link: ["articleUrl", "artiUrl", "link", "doiUrl", "url"],
};
const pick = (block, candidates) => {
  for (const tag of candidates) {
    const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
    if (m && m[1].trim()) return m[1].trim().replace(/<!\[CDATA\[|\]\]>/g, "");
  }
  return "";
};

const papers = items.map((block) => ({
  title: pick(block, FIELD_CANDIDATES.title),
  authors: pick(block, FIELD_CANDIDATES.authors),
  source: pick(block, FIELD_CANDIDATES.source),
  year: pick(block, FIELD_CANDIDATES.year),
  link: pick(block, FIELD_CANDIDATES.link),
}));

const missing = papers.filter((p) => !p.title || !p.link).length;
console.log(JSON.stringify(papers, null, 2));
console.error(`\n총 ${papers.length}건 파싱. 제목/링크가 빈 항목 ${missing}건 (있다면 --dump로 실제 태그명을 확인해 FIELD_CANDIDATES를 보정한다).`);
