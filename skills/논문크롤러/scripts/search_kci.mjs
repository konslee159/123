// KCI(한국학술지인용색인) Open API로 논문을 검색한다.
// data.go.kr에서 "한국연구재단_KCI 논문정보서비스"를 활용신청하면 받는 서비스키(serviceKey)가 필요하다.
// 발급 방법은 references/kci-api-guide.md 참고.
//
// 사용법:
//   node search_kci.mjs --key <서비스키> --query "배터리 LCA" [--rows 50] [--page 1] [--dump]
//     [--base <요청 URL>] [--auth-param serviceKey|key] [--query-param title]
//
// --dump 를 붙이면 파싱하지 않고 원본 XML을 그대로 출력한다.
// KCI 데이터는 두 경로로 받을 수 있고 요청 형식이 다르다 — 사용자가 어느 쪽에서 키를
// 받았는지에 맞춰 --base/--auth-param/--query-param을 조정한다. 정확한 값은 활용신청
// 승인 후 받는 "활용가이드" 문서에 있다 (data.go.kr 마이페이지, 또는 kci.go.kr 신청 시
// 함께 내려받는 PDF/HWP). 그 문서의 예시 URL에 있는 키(흔히 00000001 같은 값)는
// 진짜 키가 아니라 예시이니 그대로 쓰지 않는다.
//   - data.go.kr 경유: 기본값 그대로 (serviceKey / title)
//   - KCI 자체 포털(open.kci.go.kr 등): --base로 그쪽 요청 URL을 주고, 문서에 적힌
//     파라미터 이름이 다르면 --auth-param/--query-param으로 맞춘다.
// 응답 태그 이름도 데이터셋마다 다르므로, 처음 한 번은 --dump로 실제 태그 이름을 확인하고
// 필요하면 아래 FIELD_CANDIDATES에 추가한다.

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
// 활용가이드 PDF 등 공식 문서에 예시로 박혀 있는 더미 키를 실제 키로 착각해서 쓰는 실수가
// 흔하다. 발급받은 진짜 키는 보통 수십 자의 영문/숫자 조합이다.
if (/^0+$/.test(key) || key.length < 20) {
  console.error(`[경고] --key 값("${key}")이 문서의 예시 키(예: 00000001)처럼 보입니다.`);
  console.error("실제 발급받은 서비스키(보통 20자 이상 영숫자)가 맞는지 data.go.kr/kci.go.kr 마이페이지에서 다시 확인한다.");
}
if (!query) {
  console.error("--query 가 없습니다. 예: --query \"배터리 LCA\"");
  process.exit(1);
}

// data.go.kr 경유 데이터셋은 보통 serviceKey/title, KCI 자체 포털(open.kci.go.kr)은
// key/title 등 이름이 다를 수 있다. 활용가이드 문서를 보고 다르면 이 두 옵션으로 맞춘다.
const authParam = opt("auth-param", "serviceKey");
const queryParam = opt("query-param", "title");

const url = new URL(base);
url.searchParams.set(authParam, key);
url.searchParams.set(queryParam, query);
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
