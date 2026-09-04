// 논문 검색 결과 데이터 파일 템플릿
// 사용법: 이 파일을 작업 폴더로 복사해서 채운 뒤,
//   node <스킬>/scripts/build_excel.mjs   <이 파일>
//   node <스킬>/scripts/verify_excel.mjs  <이 파일>
// 순서로 돌린다. 자세한 규칙은 references/writing-rules.md 참고.

export const CONFIG = {
  // 결과 엑셀 파일 경로. 상대경로면 이 데이터 파일 기준.
  outPath: "논문검색결과.xlsx",
  // 표지/요약 시트 제목
  title: "LCA 관련 국내 논문 조사",
  // 조사 기간 표기 (요약 시트에만 쓰임, 없으면 생략 가능)
  period: "2024–2026",
  fontName: "맑은 고딕",
};

// GROUPS: 검색어(주제) 하나당 시트 하나.
// 시트 이름은 엑셀 규칙상 31자 이내, \ / ? * [ ] 금지 — build_excel.mjs가 알아서 다듬지만
// 처음부터 짧고 명확하게 쓰는 게 좋다.
export const GROUPS = [
  {
    sheetName: "자동차",           // 엑셀 탭 이름
    keyword: "자동차 LCA",         // 실제로 검색에 쓴 검색어 (요약 시트에 표기됨)
    source: "RISS",                // "RISS" | "KCI" | "RISS+KCI" — 어디서 가져왔는지
    note: "RISS 통합검색, 발행연도 2024~2026 필터",
    // papers: 한 행 = [제목, 저자, 출처(저널/학교), 연도, 유형, 링크]
    // - 제목/링크는 비워두지 않는다. verify_excel.mjs가 이 둘을 필수로 검사한다.
    // - 링크는 상세페이지 URL. RISS는 control_no 기반 상세보기 URL, KCI는 응답의 articleUrl 등을 쓴다.
    //   원문 URL을 못 찾았으면 검색 결과 목록 URL이라도 넣고, 그마저 없으면 행 자체를 넣지 않는다
    //   (링크 없는 행은 검증에서 막힌다 — 사용자가 나중에 클릭해서 확인할 수 있어야 하기 때문).
    // - 연도는 숫자로. 확인 안 되면 문자열 "미상"을 넣어도 되지만 최대한 채운다.
    // - 유형 예시: 학술지논문 / 학위논문 / 학술대회논문 / 연구보고서 / 단행본
    papers: [
      [
        "예시 논문 제목을 여기에",
        "홍길동 · 김철수",
        "OO학회지 12(3)",
        2025,
        "학술지논문",
        "https://www.riss.kr/link/detail/...",
      ],
    ],
  },
];
