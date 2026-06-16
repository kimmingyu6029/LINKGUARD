import { analyzeUrl } from "./linkRiskAnalyzer.js";

const STORAGE_KEY = "linkguard:analysis-history";
const STORAGE_EVENT = "linkguard:analysis-history-updated";
const MAX_HISTORY_ITEMS = 100;

export function getAnalysisHistoryStorageKey({ accountId = "" } = {}) {
  const normalizedAccountId = normalizeAccountId(accountId);
  return normalizedAccountId ? `${STORAGE_KEY}:account:${encodeURIComponent(normalizedAccountId)}` : STORAGE_KEY;
}

export function loadAnalysisHistory(options = {}) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(getAnalysisHistoryStorageKey(options)) || "[]");

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeStoredEntry)
      .filter(Boolean)
      .sort((left, right) => right.timestamp - left.timestamp);
  } catch {
    return [];
  }
}

export function saveAnalysisHistoryEntry(analysis, { accountId = "", mode = "normal", requestedUrl = "" } = {}) {
  if (typeof window === "undefined" || !isStorableAnalysis(analysis)) {
    return null;
  }

  const storageKey = getAnalysisHistoryStorageKey({ accountId });
  const entry = createHistoryEntry(analysis, { mode, requestedUrl });
  const previousRows = loadAnalysisHistory({ accountId });
  const nextRows = [
    entry,
    ...previousRows.filter((row) => row.id !== entry.id),
  ].slice(0, MAX_HISTORY_ITEMS);

  window.localStorage.setItem(storageKey, JSON.stringify(nextRows));
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT));

  return entry;
}

export function deleteAnalysisHistoryEntries(entryIds, options = {}) {
  if (typeof window === "undefined") {
    return [];
  }

  const ids = new Set(entryIds);
  const storageKey = getAnalysisHistoryStorageKey(options);
  const nextRows = loadAnalysisHistory(options).filter((row) => !ids.has(row.id));

  window.localStorage.setItem(storageKey, JSON.stringify(nextRows));
  window.dispatchEvent(new CustomEvent(STORAGE_EVENT));

  return nextRows;
}

export function subscribeAnalysisHistory(callback, options = {}) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const storageKey = getAnalysisHistoryStorageKey(options);
  const handleStorage = (event) => {
    if (!event || event.key === storageKey) {
      callback();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(STORAGE_EVENT, callback);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(STORAGE_EVENT, callback);
  };
}

export function openAnalysisHistoryReport(rows) {
  if (typeof window === "undefined" || rows.length === 0) {
    return;
  }

  const reportWindow = window.open("", "_blank");

  if (!reportWindow) {
    downloadAnalysisHistoryReport(rows);
    return;
  }

  writeReportWindow(reportWindow, rows);
}

export function downloadAnalysisHistoryReport(rows) {
  printAnalysisHistoryReport(rows);
}

export function printAnalysisHistoryReport(rows) {
  if (typeof window === "undefined" || rows.length === 0) {
    return;
  }

  const reportWindow = window.open("", "_blank");

  if (!reportWindow) {
    window.print();
    return;
  }

  writeReportWindow(reportWindow, rows, { autoPrint: true });
}

function writeReportWindow(reportWindow, rows, { autoPrint = false } = {}) {
  reportWindow.document.open();
  reportWindow.document.write(buildAnalysisHistoryReportHtml(rows));
  reportWindow.document.close();

  if (autoPrint) {
    reportWindow.setTimeout(() => reportWindow.print(), 250);
  }
}

function createHistoryEntry(analysis, { mode, requestedUrl }) {
  const timestamp = Date.now();
  const url = analysis.displayUrl || requestedUrl.trim();

  return {
    id: normalizeHistoryKey(url),
    date: formatHistoryDate(timestamp),
    displayHost: analysis.displayHost || getDisplayHost(url),
    mode,
    requestedUrl,
    result: analysis.statusLabel,
    score: clamp(Number(analysis.score) || 0, 0, 100),
    sourceLabel: analysis.reputation?.label || "로컬 분석",
    analysisSnapshot: compactAnalysisSnapshot(analysis),
    timestamp,
    tone: analysis.tone || toneFromVerdict(analysis.verdict),
    url,
    verdict: analysis.verdict,
  };
}

function normalizeStoredEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const url = typeof entry.url === "string" ? entry.url.trim() : "";

  if (!url) {
    return null;
  }

  const timestamp = Number(entry.timestamp) || Date.now();
  const score = clamp(Number(entry.score) || 0, 0, 100);
  const verdict = typeof entry.verdict === "string" ? entry.verdict : verdictFromTone(entry.tone);
  const tone = ["blue", "safe", "warn", "danger"].includes(entry.tone)
    ? entry.tone
    : toneFromVerdict(verdict);

  return {
    id: typeof entry.id === "string" && entry.id ? entry.id : normalizeHistoryKey(url),
    date: typeof entry.date === "string" && entry.date ? entry.date : formatHistoryDate(timestamp),
    displayHost: typeof entry.displayHost === "string" && entry.displayHost ? entry.displayHost : getDisplayHost(url),
    mode: entry.mode === "expert" ? "expert" : "normal",
    requestedUrl: typeof entry.requestedUrl === "string" ? entry.requestedUrl : url,
    result: typeof entry.result === "string" && entry.result ? entry.result : resultFromTone(tone),
    score,
    sourceLabel: typeof entry.sourceLabel === "string" && entry.sourceLabel ? entry.sourceLabel : "로컬 분석",
    analysisSnapshot: entry.analysisSnapshot && typeof entry.analysisSnapshot === "object" ? entry.analysisSnapshot : null,
    timestamp,
    tone,
    url,
    verdict,
  };
}

function isStorableAnalysis(analysis) {
  return Boolean(
    analysis &&
      analysis.verdict &&
      analysis.verdict !== "idle" &&
      analysis.verdict !== "invalid" &&
      typeof analysis.displayUrl === "string" &&
      analysis.displayUrl.trim(),
  );
}

function formatHistoryDate(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function normalizeHistoryKey(value) {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.href.toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

function normalizeAccountId(accountId) {
  return typeof accountId === "string" ? accountId.trim() : "";
}

function getDisplayHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function toneFromVerdict(verdict) {
  if (verdict === "malicious") {
    return "danger";
  }

  if (verdict === "suspicious") {
    return "warn";
  }

  return "safe";
}

function verdictFromTone(tone) {
  if (tone === "danger") {
    return "malicious";
  }

  if (tone === "warn") {
    return "suspicious";
  }

  return "safe";
}

function resultFromTone(tone) {
  if (tone === "danger") {
    return "위험";
  }

  if (tone === "warn") {
    return "주의";
  }

  return "안전";
}

export function buildAnalysisHistoryReportHtml(rows) {
  const normalizedRows = rows.map(normalizeStoredEntry).filter(Boolean);
  const reports = normalizedRows.map(buildSecurityReportFromHistoryRow);
  const total = reports.length;
  const dangerCount = reports.filter((report) => report.verdict === "dangerous").length;
  const cautionCount = reports.filter((report) => report.verdict === "caution").length;
  const safeCount = reports.filter((report) => report.verdict === "safe").length;
  const unknownCount = reports.filter((report) => report.verdict === "unknown").length;
  const averageScore = total === 0 ? 0 : Math.round(reports.reduce((sum, report) => sum + report.riskScore, 0) / total);
  const highestRisk = reports.slice().sort((left, right) => right.riskScore - left.riskScore)[0];
  const generatedAt = formatHistoryDate(Date.now());

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>LinkGuard AI 보안 진단 보고서</title>
  <style>
    :root {
      --blue: #155fbd;
      --blue-soft: #eaf2ff;
      --text: #172033;
      --muted: #5c6f8d;
      --border: #d8e0ef;
      --safe: #087a52;
      --warn: #b66b00;
      --danger: #d92d3a;
      --unknown: #667085;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      color: var(--text);
      background: #f5f7fb;
      font-family: "Malgun Gothic", "맑은 고딕", Arial, sans-serif;
      line-height: 1.55;
    }

    .report-page {
      width: 920px;
      margin: 28px auto;
      padding: 34px;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 12px;
    }

    .report-header {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      border-bottom: 3px solid var(--blue);
      padding-bottom: 18px;
      margin-bottom: 24px;
    }

    h1 {
      margin: 0 0 8px;
      color: #10264a;
      font-size: 30px;
    }

    h2 {
      margin: 0 0 12px;
      color: #10264a;
      font-size: 20px;
    }

    h3 {
      margin: 0 0 10px;
      color: #10264a;
      font-size: 16px;
    }

    p {
      margin: 0;
    }

    .meta {
      color: var(--muted);
      font-size: 13px;
    }

    .print-actions {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }

    .print-actions button {
      border: 0;
      border-radius: 8px;
      padding: 10px 14px;
      background: var(--blue);
      color: #fff;
      font-weight: 800;
      cursor: pointer;
    }

    .print-actions button.secondary {
      background: #edf3ff;
      color: #16477f;
    }

    .overview-grid,
    .report-grid,
    .score-grid,
    .fact-grid,
    .content-grid,
    .technical-grid {
      display: grid;
      gap: 12px;
    }

    .overview-grid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
      margin-bottom: 20px;
    }

    .overview-card,
    .section-card,
    .report-card {
      border: 1px solid var(--border);
      border-radius: 10px;
      background: #fff;
    }

    .overview-card {
      padding: 14px;
      background: #f8fbff;
    }

    .overview-card span,
    .field-label {
      display: block;
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
    }

    .overview-card strong {
      display: block;
      margin-top: 4px;
      color: #10264a;
      font-size: 26px;
      line-height: 1;
    }

    .report-card {
      overflow: hidden;
      margin-top: 18px;
      break-inside: avoid;
    }

    .report-summary {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 112px;
      gap: 14px;
      align-items: stretch;
      padding: 18px;
      background: linear-gradient(135deg, #f8fbff, #ffffff);
      border-left: 7px solid var(--tone);
    }

    .report-summary h2 {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 8px;
    }

    .report-summary p {
      color: #34455e;
    }

    .score-box {
      display: grid;
      place-items: center;
      border: 1px solid color-mix(in srgb, var(--tone) 35%, #d8e0ef);
      border-radius: 10px;
      background: color-mix(in srgb, var(--tone) 8%, white);
      color: var(--tone);
      text-align: center;
    }

    .score-box strong {
      display: block;
      font-size: 36px;
      line-height: 1;
    }

    .score-box span {
      color: #4f5f75;
      font-size: 12px;
      font-weight: 800;
    }

    .tone-safe { --tone: var(--safe); }
    .tone-warn { --tone: var(--warn); }
    .tone-danger { --tone: var(--danger); }
    .tone-blue { --tone: var(--unknown); }

    .badge,
    .severity {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 999px;
      color: #fff;
      text-align: center;
      font-size: 11px;
      font-weight: 800;
    }

    .badge-danger { background: #d92d3a; }
    .badge-warn { background: #b66b00; }
    .badge-safe { background: #087a52; }
    .badge-blue { background: #667085; }

    .report-body {
      padding: 18px;
    }

    .report-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .section-card {
      padding: 15px;
      background: #fbfdff;
    }

    .section-card.wide {
      grid-column: 1 / -1;
    }

    .section-card.balanced-wide {
      grid-column: 1 / -1;
    }

    .section-card.balanced-wide .redirect-list,
    .section-card.balanced-wide .signal-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
    }

    .section-card p,
    .section-card li,
    .disclaimer {
      color: #34455e;
      font-size: 13px;
    }

    .score-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .score-item,
    .fact-item,
    .content-item,
    .technical-item,
    .signal-item,
    .reputation-item,
    .redirect-item {
      min-width: 0;
      border: 1px solid #e1e7f2;
      border-radius: 8px;
      padding: 10px;
      background: #fff;
    }

    .score-top {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      color: #10264a;
      font-size: 13px;
      font-weight: 800;
    }

    .score-bar {
      height: 8px;
      margin: 8px 0;
      overflow: hidden;
      border-radius: 999px;
      background: #e7edf6;
    }

    .score-bar span {
      display: block;
      width: var(--width);
      height: 100%;
      background: var(--tone);
    }

    .fact-grid,
    .content-grid,
    .technical-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .field-value {
      display: block;
      margin-top: 4px;
      color: #10264a;
      font-size: 13px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .redirect-list,
    .signal-list,
    .reputation-list,
    .action-list {
      display: grid;
      gap: 9px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .redirect-item strong,
    .signal-item strong,
    .reputation-item strong {
      display: block;
      color: #10264a;
      font-size: 13px;
      overflow-wrap: anywhere;
    }

    .redirect-item span,
    .signal-item p,
    .signal-item small,
    .reputation-item p {
      display: block;
      margin-top: 5px;
      color: #51647e;
      font-size: 12px;
      overflow-wrap: anywhere;
    }

    .severity-high { background: var(--danger); }
    .severity-medium { background: var(--warn); }
    .severity-low { background: var(--safe); }

    details {
      margin-top: 12px;
    }

    summary {
      cursor: pointer;
      color: #16477f;
      font-size: 13px;
      font-weight: 800;
    }

    pre {
      max-height: 280px;
      overflow: auto;
      border: 1px solid #e1e7f2;
      border-radius: 8px;
      padding: 10px;
      background: #f6f8fb;
      color: #26364d;
      font-size: 11px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .notice,
    .disclaimer {
      margin-top: 20px;
      padding: 13px;
      border: 1px solid #f1d29c;
      border-radius: 8px;
      background: #fff7e8;
      color: #60410d;
      font-size: 12px;
    }

    .action-list li {
      padding-left: 18px;
      position: relative;
    }

    .action-list li::before {
      position: absolute;
      left: 0;
      content: "•";
      color: var(--tone);
      font-weight: 900;
    }

    @media print {
      @page {
        margin: 14mm;
        size: A4;
      }
      body { background: #fff; }
      .report-page {
        width: auto;
        margin: 0;
        border: 0;
        padding: 0;
      }
      .print-actions { display: none; }
      .report-card { page-break-inside: avoid; }
      .section-card.balanced-wide .redirect-list,
      .section-card.balanced-wide .signal-list {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main class="report-page">
    <header class="report-header">
      <div>
        <h1>LinkGuard AI 보안 진단 보고서</h1>
        <p class="meta">작성일: ${escapeHtml(generatedAt)} · 분석 기록 ${total.toLocaleString("ko-KR")}건 기준</p>
      </div>
      <div class="print-actions">
        <button onclick="window.print()">PDF 저장 / 인쇄</button>
        <button class="secondary" onclick="window.close()">닫기</button>
      </div>
    </header>

    <section class="overview-grid" aria-label="보고서 전체 요약">
      <div class="overview-card"><span>총 분석 수</span><strong>${total}</strong></div>
      <div class="overview-card"><span>위험</span><strong>${dangerCount}</strong></div>
      <div class="overview-card"><span>주의</span><strong>${cautionCount}</strong></div>
      <div class="overview-card"><span>안전</span><strong>${safeCount}</strong></div>
      <div class="overview-card"><span>평균 위험도</span><strong>${averageScore}</strong></div>
    </section>

    <section class="section-card">
      <h2>전체 판단 요약</h2>
      <p>${escapeHtml(buildPortfolioSummary({ averageScore, cautionCount, dangerCount, highestRisk, safeCount, total, unknownCount }))}</p>
    </section>

    <section>
      ${reports.map(renderSecurityReport).join("")}
    </section>

    <p class="disclaimer">본 보고서는 AI 분석, URL 구조 분석, 외부 평판 조회, 리다이렉트 추적 결과를 종합하여 생성되었습니다. 분석 결과는 참고용이며, 모든 악성 URL을 100% 탐지하거나 모든 정상 URL을 보장하지는 않습니다. 개인정보, 비밀번호, 금융정보 입력 전에는 반드시 공식 도메인을 직접 확인하세요.</p>
  </main>
</body>
</html>`;
}

function renderSecurityReport(report) {
  const scoreItems = [
    ["URL 구조 분석", report.scoreBreakdown.urlHeuristic],
    ["리다이렉트 분석", report.scoreBreakdown.redirect],
    ["외부 평판 조회", report.scoreBreakdown.reputation],
    ["AI/콘텐츠 판단", report.scoreBreakdown.aiContent],
  ];

  return `<article class="report-card tone-${escapeHtml(report.tone)}">
    <section class="report-summary">
      <div>
        <h2>
          <span class="badge badge-${escapeHtml(report.tone)}">${escapeHtml(report.verdictLabel)}</span>
          ${escapeHtml(report.riskType)}
        </h2>
        <p>${escapeHtml(report.summary)}</p>
        <p class="meta">검사 URL: ${escapeHtml(report.targetUrl)} · 검사 시간: ${escapeHtml(report.scannedAt)}</p>
        <p class="meta">최종 도착 URL: ${escapeHtml(report.finalUrl || "확인 불가")}</p>
      </div>
      <div class="score-box">
        <div>
          <strong>${report.riskScore}</strong>
          <span>위험 점수 / 100</span>
        </div>
      </div>
    </section>

    <div class="report-body">
      <div class="report-grid">
        <section class="section-card wide">
          <h3>AI 최종 판단 요약</h3>
          <p>${escapeHtml(report.aiExplanation)}</p>
        </section>

        <section class="section-card">
          <h3>위험 점수 상세 분해</h3>
          <div class="score-grid">
            ${scoreItems.map(([label, item]) => renderScoreItem(label, item)).join("")}
          </div>
        </section>

        <section class="section-card">
          <h3>URL 기본 정보</h3>
          <div class="fact-grid">
            ${renderFact("입력 URL", report.targetUrl)}
            ${renderFact("정규화된 URL", report.normalizedUrl)}
            ${renderFact("단축 URL 확장 결과", report.urlInfo.shortenedExpandedUrl || "해당 없음")}
            ${renderFact("프로토콜", report.urlInfo.protocol || "확인 불가")}
            ${renderFact("도메인", report.urlInfo.domain || "확인 불가")}
            ${renderFact("경로", report.urlInfo.path || "/")}
            ${renderFact("쿼리 파라미터", formatQueryParams(report.urlInfo.queryParams))}
            ${renderFact("단축 URL 여부", report.urlInfo.isShortened ? "예" : "아니오")}
          </div>
        </section>

        <section class="section-card balanced-wide">
          <h3>리다이렉트 추적 결과</h3>
          <ol class="redirect-list">
            ${report.redirects.map(renderRedirectItem).join("")}
          </ol>
          ${report.redirects.some((item) => item.domainChanged) ? '<p class="notice">최종 도착지가 입력 URL과 다른 도메인입니다. 로그인 페이지로 이동한다면 주의가 필요합니다.</p>' : ""}
        </section>

        <section class="section-card balanced-wide">
          <h3>탐지된 위험 신호</h3>
          <ol class="signal-list">
            ${report.riskSignals.map(renderRiskSignal).join("")}
          </ol>
        </section>

        <section class="section-card">
          <h3>외부 평판 조회 결과</h3>
          <div class="reputation-list">
            ${report.reputationResults.map(renderReputationItem).join("")}
          </div>
          <p class="notice">외부 DB에서 탐지되지 않았다고 해서 안전하다고 단정하지 마세요.</p>
        </section>

        <section class="section-card">
          <h3>웹페이지 콘텐츠 분석 결과</h3>
          <div class="content-grid">
            ${renderFact("페이지 제목", report.pageContentAnalysis.title || "제공 없음", "content-item")}
            ${renderFact("로그인 입력창", report.pageContentAnalysis.hasLoginForm ? "감지" : "미감지", "content-item")}
            ${renderFact("이메일 입력창", report.pageContentAnalysis.hasEmailInput ? "감지" : "미감지", "content-item")}
            ${renderFact("비밀번호 입력창", report.pageContentAnalysis.hasPasswordInput ? "감지" : "미감지", "content-item")}
            ${renderFact("결제 정보 유도", report.pageContentAnalysis.asksPaymentInfo ? "가능성 있음" : "미감지", "content-item")}
            ${renderFact("다운로드 유도", report.pageContentAnalysis.triggersDownload ? "감지" : "미감지", "content-item")}
            ${renderFact("외부 스크립트", `${report.pageContentAnalysis.externalScriptCount}개`, "content-item")}
            ${renderFact("브랜드 사칭 가능성", report.pageContentAnalysis.brandImpersonationRisk, "content-item")}
          </div>
        </section>

        <section class="section-card">
          <h3>사용자 행동 가이드</h3>
          <ul class="action-list">
            ${report.recommendedActions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </section>

        <section class="section-card wide">
          <h3>기술 상세 정보</h3>
          <details>
            <summary>기술 정보와 원본 JSON 보기</summary>
            <div class="technical-grid">
              ${renderFact("도메인", report.technicalDetails.domain || "확인 불가", "technical-item")}
              ${renderFact("IP 주소", report.technicalDetails.ip || "제공 없음", "technical-item")}
              ${renderFact("서버 위치", report.technicalDetails.serverLocation || "제공 없음", "technical-item")}
              ${renderFact("HTTP 상태 코드", report.technicalDetails.responseStatus || "확인 불가", "technical-item")}
              ${renderFact("HTTPS 여부", report.technicalDetails.httpsEnabled ? "사용" : "미사용 또는 확인 불가", "technical-item")}
              ${renderFact("인증서 정보", report.technicalDetails.certificateInfo || "제공 없음", "technical-item")}
              ${renderFact("응답 시간", report.technicalDetails.responseTimeMs ? `${report.technicalDetails.responseTimeMs}ms` : "제공 없음", "technical-item")}
              ${renderFact("User-Agent 응답 차이", report.technicalDetails.userAgentVariance || "제공 없음", "technical-item")}
              ${renderFact("분석 실패 항목", report.technicalDetails.failedChecks.length ? report.technicalDetails.failedChecks.join(", ") : "없음", "technical-item")}
            </div>
            <pre>${escapeHtml(JSON.stringify(report.rawAnalysis, null, 2))}</pre>
          </details>
        </section>
      </div>
    </div>
  </article>`;
}

function renderScoreItem(label, item) {
  const percent = item.maxScore ? Math.round((item.score / item.maxScore) * 100) : 0;

  return `<div class="score-item">
    <div class="score-top"><span>${escapeHtml(label)}</span><span>${item.score} / ${item.maxScore}</span></div>
    <div class="score-bar"><span style="--width: ${percent}%"></span></div>
    <p>${escapeHtml(item.description)}</p>
  </div>`;
}

function renderFact(label, value, className = "fact-item") {
  return `<div class="${className}">
    <span class="field-label">${escapeHtml(label)}</span>
    <span class="field-value">${escapeHtml(value)}</span>
  </div>`;
}

function renderRedirectItem(item) {
  return `<li class="redirect-item">
    <strong>${item.step}. ${escapeHtml(item.url)}</strong>
    ${item.targetUrl ? `<span>→ ${escapeHtml(item.targetUrl)}</span>` : ""}
    <span>HTTP ${escapeHtml(item.statusCode || "확인 불가")} · ${item.domainChanged ? "도메인 변경" : "도메인 유지"} · ${escapeHtml(item.explanation)}</span>
  </li>`;
}

function renderRiskSignal(signal) {
  return `<li class="signal-item">
    <span class="severity severity-${escapeHtml(signal.severity)}">${escapeHtml(getSeverityLabel(signal.severity))}</span>
    <strong>${escapeHtml(signal.title)}</strong>
    <p>${escapeHtml(signal.description)}</p>
    <small>${escapeHtml(signal.userImpact)}</small>
  </li>`;
}

function renderReputationItem(item) {
  return `<div class="reputation-item">
    <strong>${escapeHtml(item.source)} · ${escapeHtml(item.status)}</strong>
    <p>${escapeHtml(item.description)}</p>
  </div>`;
}

function buildSecurityReportFromHistoryRow(row) {
  const analysis = row.analysisSnapshot || analyzeUrl(row.url, { mode: row.mode });
  const targetUrl = row.requestedUrl || analysis.input || row.url;
  const normalizedUrl = analysis.normalizedUrl || analysis.displayUrl || row.url;
  const finalUrl = analysis.redirectTrace?.finalUrl || analysis.contentAnalysis?.finalUrl || normalizedUrl;
  const parsedUrl = parseUrl(normalizedUrl || targetUrl);
  const parsedFinalUrl = parseUrl(finalUrl);
  const verdict = mapReportVerdict(row, analysis);
  const tone = verdictToTone(verdict);
  const sortedEvidence = (analysis.evidence || [])
    .slice()
    .sort((left, right) => Number(right.points || 0) - Number(left.points || 0));
  const contentAnalysis = analysis.contentAnalysis || {};
  const componentScores = analysis.componentScores || {};

  return {
    aiExplanation: buildAiExplanation(analysis, row),
    finalUrl,
    normalizedUrl,
    pageContentAnalysis: buildPageContentAnalysis(contentAnalysis),
    rawAnalysis: analysis,
    recommendedActions: buildRecommendedActions(analysis, verdict),
    redirects: buildRedirects(analysis.redirectTrace, normalizedUrl, finalUrl),
    reputationResults: buildReputationResults(analysis.reputation, analysis.communityReport, row),
    riskScore: clamp(Number(analysis.score ?? row.score) || 0, 0, 100),
    riskSignals: buildRiskSignals(analysis, sortedEvidence, verdict),
    riskType: buildRiskType(analysis, sortedEvidence, contentAnalysis, verdict),
    scannedAt: row.date,
    scoreBreakdown: buildScoreBreakdown(componentScores, analysis, contentAnalysis, row),
    summary: buildReportSummary(verdict, sortedEvidence),
    targetUrl,
    technicalDetails: buildTechnicalDetails({ analysis, contentAnalysis, finalUrl, parsedFinalUrl }),
    tone,
    urlInfo: {
      domain: parsedUrl?.hostname || row.displayHost || "",
      isShortened: hasSignalValue(analysis, "shortener", ["사용", "주의", "Yes"]),
      path: parsedUrl?.pathname || "",
      protocol: parsedUrl?.protocol ? parsedUrl.protocol.replace(":", "").toUpperCase() : "",
      queryParams: parsedUrl ? Object.fromEntries(parsedUrl.searchParams.entries()) : {},
      shortenedExpandedUrl: hasSignalValue(analysis, "shortener", ["사용", "주의", "Yes"]) ? finalUrl : "",
    },
    verdict,
    verdictLabel: verdictToKorean(verdict),
  };
}

function buildScoreBreakdown(componentScores, analysis, contentAnalysis, row) {
  const localScore = Number(componentScores.local ?? analysis.score ?? row.score ?? 0);
  const redirectScore = Number(componentScores.redirect ?? scoreRedirectFallback(analysis.redirectTrace));
  const reputationScore = Number(componentScores.reputation ?? scoreReputationFallback(analysis.reputation));
  const contentScore = Number(componentScores.content ?? contentAnalysis.score ?? 0);
  const aiScore = Number(componentScores.ai ?? scoreAiFallback(analysis.aiRisk));

  return {
    aiContent: {
      description: buildAiContentDescription(analysis.aiRisk, contentAnalysis),
      maxScore: 25,
      score: clamp(Math.round(contentScore * 0.18 + aiScore * 0.07), 0, 25),
    },
    redirect: {
      description: buildRedirectDescription(analysis.redirectTrace),
      maxScore: 20,
      score: clamp(Math.round(redirectScore * 0.2), 0, 20),
    },
    reputation: {
      description: buildReputationDescription(analysis.reputation, analysis.communityReport, row),
      maxScore: 25,
      score: clamp(Math.round(reputationScore * 0.25), 0, 25),
    },
    urlHeuristic: {
      description: buildUrlHeuristicDescription(analysis),
      maxScore: 30,
      score: clamp(Math.round(localScore * 0.3), 0, 30),
    },
  };
}

function buildUrlHeuristicDescription(analysis) {
  const reasons = (analysis.evidence || [])
    .filter((item) => !/평판|콘텐츠|신고|AI|Redirect|리다이렉트/i.test(item.label))
    .slice(0, 2)
    .map((item) => item.detail || item.label);

  return reasons.length ? reasons.join(" ") : "URL 구조에서 도메인, 프로토콜, 키워드, 파일 확장자 신호를 평가했습니다.";
}

function buildRedirectDescription(redirectTrace) {
  if (!redirectTrace) {
    return "저장된 기록에 리다이렉트 상세 정보가 없습니다.";
  }

  if (redirectTrace.hopCount > 0) {
    return `입력 URL이 ${redirectTrace.hopCount}회 이동한 뒤 ${redirectTrace.finalHost || "최종 주소"}에 도착했습니다.`;
  }

  return redirectTrace.status === "complete"
    ? "자동 이동 없이 최종 주소가 확인되었습니다."
    : redirectTrace.detail || "리다이렉트 추적이 제한적으로 완료되었습니다.";
}

function buildReputationDescription(reputation, communityReport, row) {
  const communityText = communityReport?.hasReports ? " 자체 신고 DB에 사용자 신고 이력이 있습니다." : "";

  if (!reputation) {
    return `${row.sourceLabel || "저장된 분석"} 기준으로 표시합니다. 외부 DB 미탐지는 안전 보장이 아닙니다.${communityText}`;
  }

  if (reputation.status === "match") {
    return `${reputation.provider || "평판 DB"}에서 위험 기록이 확인되었습니다.${communityText}`;
  }

  if (reputation.status === "suspicious") {
    return `${reputation.provider || "평판 DB"}에서 의심 분류가 확인되었습니다.${communityText}`;
  }

  return `${reputation.provider || "평판 DB"}에서 현재 탐지 기록은 없지만, 이 결과만으로 안전을 보장하지는 않습니다.${communityText}`;
}

function buildAiContentDescription(aiRisk, contentAnalysis) {
  if (contentAnalysis?.status === "complete" && contentAnalysis.detail) {
    return `${contentAnalysis.detail}${aiRisk?.recommendedAction ? ` AI 권장: ${aiRisk.recommendedAction}` : ""}`;
  }

  return aiRisk?.recommendedAction || "웹페이지 콘텐츠 또는 AI 보조 판단에서 확인된 신호를 종합합니다.";
}

function buildPageContentAnalysis(contentAnalysis) {
  const sensitivePrompts = contentAnalysis?.sensitivePrompts || [];
  const downloadLinks = contentAnalysis?.downloadLinks || [];
  const brandKeywords = contentAnalysis?.brandKeywords || [];

  return {
    asksPaymentInfo: sensitivePrompts.some((item) => /card|payment|billing|account|카드|결제|계좌/i.test(item)),
    brandImpersonationRisk: contentAnalysis?.brandDomainMismatch
      ? `${brandKeywords.join(", ") || "브랜드"} 관련 문구가 공식 도메인과 일치하지 않습니다.`
      : brandKeywords.length
        ? `${brandKeywords.join(", ")} 관련 문구가 감지되었습니다.`
        : "뚜렷한 브랜드 사칭 신호가 제공되지 않았습니다.",
    externalScriptCount: Number(contentAnalysis?.externalScriptCount || 0),
    hasEmailInput: sensitivePrompts.some((item) => /email|account|개인정보/i.test(item)),
    hasLoginForm: Boolean(contentAnalysis?.hasLoginForm),
    hasPasswordInput: Boolean(contentAnalysis?.hasPasswordInput),
    title: contentAnalysis?.title || "",
    triggersDownload: downloadLinks.length > 0,
  };
}

function buildRedirects(redirectTrace, normalizedUrl, finalUrl) {
  const hops = redirectTrace?.hops || [];

  if (hops.length === 0) {
    return [
      {
        domainChanged: false,
        explanation:
          redirectTrace?.status === "complete"
            ? "추가 리다이렉트 없이 분석되었습니다."
            : redirectTrace?.detail || "저장된 기록에 리다이렉트 경로 정보가 없습니다.",
        statusCode: redirectTrace?.status === "complete" ? 200 : 0,
        step: 1,
        url: finalUrl || normalizedUrl,
      },
    ];
  }

  return hops.map((hop, index) => ({
    domainChanged: domainOf(hop.sourceHost) !== domainOf(hop.targetHost),
    explanation:
      domainOf(hop.sourceHost) !== domainOf(hop.targetHost)
        ? "이 단계에서 도메인이 변경되었습니다."
        : "같은 등록 도메인 안에서 이동했습니다.",
    statusCode: Number(hop.statusCode || 0),
    step: index + 1,
    targetUrl: hop.targetUrl,
    url: hop.sourceUrl,
  }));
}

function buildRiskSignals(analysis, sortedEvidence, verdict) {
  const contentSignals = buildContentRiskSignals(analysis.contentAnalysis);
  const evidenceSignals = sortedEvidence.slice(0, 8).map((item) => ({
    description: item.detail || item.label,
    severity: getSeverity(Number(item.points || 0), verdict),
    title: item.label || "위험 신호",
    userImpact: buildUserImpact(item.label, item.detail),
  }));
  const signals = mergeRiskSignals([...contentSignals, ...evidenceSignals]).slice(0, 10);

  if (signals.length > 0) {
    return signals;
  }

  return [
    {
      description: "현재 완료된 검사에서 두드러진 위험 신호는 낮습니다.",
      severity: "low",
      title: "주요 위험 신호 낮음",
      userImpact: "그래도 로그인, 결제, 개인정보 입력 전에는 최종 도메인을 다시 확인하세요.",
    },
  ];
}

function buildContentRiskSignals(contentAnalysis) {
  if (!contentAnalysis || contentAnalysis.status !== "complete") {
    return [];
  }

  return [
    contentAnalysis.hasPasswordInput
      ? {
          description: "웹페이지에 비밀번호 입력창이 감지되었습니다.",
          severity: "high",
          title: "비밀번호 입력창 감지",
          userImpact: "계정 탈취나 인증정보 유출로 이어질 수 있습니다.",
        }
      : null,
    contentAnalysis.hasLoginForm
      ? {
          description: "웹페이지가 로그인 또는 계정 인증을 요구하는 구조입니다.",
          severity: "medium",
          title: "로그인 입력창 감지",
          userImpact: "공식 도메인이 아니라면 계정 정보 탈취 위험이 있습니다.",
        }
      : null,
    contentAnalysis.brandDomainMismatch
      ? {
          description: "브랜드 관련 문구가 보이지만 최종 도메인이 공식 도메인과 일치하지 않습니다.",
          severity: "high",
          title: "브랜드/도메인 불일치",
          userImpact: "정상 서비스처럼 보이는 피싱 페이지일 수 있습니다.",
        }
      : null,
  ].filter(Boolean);
}

function buildReputationResults(reputation, communityReport, row) {
  const results = [];

  if (reputation) {
    results.push({
      description:
        reputation.detail ||
        (reputation.status === "clean"
          ? "외부 보안 DB에서 현재 탐지된 기록은 없습니다. 하지만 미탐지는 안전 보장이 아닙니다."
          : "외부 평판 조회 결과를 확인했습니다."),
      source: reputation.provider || "외부 평판 DB",
      status: reputation.label || reputation.status || "확인됨",
    });
  } else {
    results.push({
      description: `${row.sourceLabel || "저장된 분석"} 결과를 기준으로 표시합니다. 상세 평판 응답은 저장된 기록에 없습니다.`,
      source: "외부 평판 DB",
      status: row.sourceLabel || "저장된 요약",
    });
  }

  if (communityReport) {
    results.push({
      description: communityReport.hasReports
        ? `사용자 신고 ${Number(communityReport.reportCount || 0).toLocaleString("ko-KR")}건이 있습니다. 신고만으로 악성 확정은 아니며 관리자 검토 상태를 함께 봐야 합니다.`
        : "자체 신고 DB에서 현재 신고 이력은 확인되지 않았습니다.",
      source: "자체 신고 DB",
      status: communityReport.status || "none",
    });
  }

  return results;
}

function buildTechnicalDetails({ analysis, contentAnalysis, finalUrl, parsedFinalUrl }) {
  const failedChecks = [];

  if (analysis.redirectTrace && analysis.redirectTrace.status !== "complete") {
    failedChecks.push(`리다이렉트 추적: ${analysis.redirectTrace.detail || analysis.redirectTrace.status}`);
  }

  if (contentAnalysis?.status && contentAnalysis.status !== "complete") {
    failedChecks.push(`콘텐츠 분석: ${contentAnalysis.detail || contentAnalysis.status}`);
  }

  if (analysis.reputation?.status && ["error", "submitted", "not_found"].includes(analysis.reputation.status)) {
    failedChecks.push(`평판 조회: ${analysis.reputation.detail || analysis.reputation.status}`);
  }

  return {
    certificateInfo: parsedFinalUrl?.protocol === "https:" ? "브라우저/원격 서버 기준 HTTPS 사용" : "HTTPS 미사용 또는 확인 불가",
    domain: parsedFinalUrl?.hostname || analysis.displayHost || "",
    failedChecks,
    finalUrl,
    httpsEnabled: parsedFinalUrl?.protocol === "https:",
    ip: analysis.ip || "",
    responseStatus: Number(contentAnalysis?.httpStatus || getLastRedirectStatus(analysis.redirectTrace) || 0),
    responseTimeMs: Number(analysis.responseTimeMs || 0),
    serverLocation: analysis.serverLocation || "",
    userAgentVariance: analysis.userAgentVariance || "제공된 분석 결과 없음",
  };
}

function buildAiExplanation(analysis, row) {
  const aiRisk = analysis.aiRisk;
  const reasonText = aiRisk?.riskReasons?.length ? ` AI 위험 판단 근거: ${aiRisk.riskReasons.join(" ")}` : "";
  const actionText = aiRisk?.recommendedAction ? ` 권장 행동: ${aiRisk.recommendedAction}` : "";

  return `${analysis.explanation || `${row.displayHost}에 대한 저장된 분석 결과입니다.`}${reasonText}${actionText}`;
}

function buildRecommendedActions(analysis, verdict) {
  const actions = Array.isArray(analysis.recommendations) ? analysis.recommendations.filter(Boolean) : [];
  const postIncidentActions = [
    "이미 비밀번호를 입력했다면 즉시 변경하고 같은 비밀번호를 쓰는 다른 사이트도 바꾸세요.",
    "카드나 계좌 정보를 입력했다면 금융기관에 문의하고 거래 내역을 확인하세요.",
    "의심 URL을 신고하고 기기 보안 검사를 진행하세요.",
  ];

  if (verdict === "dangerous") {
    return [...actions, ...postIncidentActions].slice(0, 7);
  }

  if (verdict === "caution") {
    return [
      ...actions,
      "가능하면 링크를 직접 열지 말고 공식 앱이나 검색을 통해 접속하세요.",
      "로그인, 결제, 인증번호 입력을 요구하면 중단하세요.",
    ].slice(0, 6);
  }

  return [
    ...actions,
    "개인정보, 비밀번호, 카드번호 입력 전에는 공식 도메인인지 다시 확인하세요.",
  ].slice(0, 5);
}

function buildReportSummary(verdict, sortedEvidence) {
  if (verdict === "dangerous") {
    return "접속 또는 개인정보 입력을 피하는 것이 좋습니다.";
  }

  if (verdict === "caution") {
    return "일부 의심 요소가 발견되었습니다.";
  }

  if (verdict === "unknown") {
    return "일부 분석이 실패하여 결과 신뢰도가 낮습니다.";
  }

  const hasNoEvidence = sortedEvidence.length === 0 || Number(sortedEvidence[0]?.points || 0) === 0;
  return hasNoEvidence ? "현재 확인된 위험 신호는 낮습니다." : "낮은 수준의 확인 필요 신호가 있습니다.";
}

function buildRiskType(analysis, sortedEvidence, contentAnalysis, verdict) {
  const evidenceText = sortedEvidence.map((item) => `${item.label} ${item.detail}`).join(" ");

  if (verdict === "unknown") {
    return "분석 불가";
  }

  if (/평판|위협 일치|malicious/i.test(evidenceText)) {
    return "외부 평판 위험";
  }

  if (/다운로드|파일|apk|exe|malware/i.test(evidenceText)) {
    return "악성코드 의심";
  }

  if (/단축|Redirect|리다이렉트|이동/i.test(evidenceText)) {
    return "단축 URL 또는 리다이렉트 의심";
  }

  if (contentAnalysis?.hasPasswordInput || /로그인|인증|브랜드|피싱|사칭|password/i.test(evidenceText)) {
    return "피싱 의심";
  }

  return analysis.tone === "safe" ? "정상 가능성 높음" : "추가 확인 필요";
}

function buildPortfolioSummary({ averageScore, cautionCount, dangerCount, highestRisk, safeCount, total, unknownCount }) {
  if (total === 0) {
    return "선택된 분석 기록이 없습니다.";
  }

  if (dangerCount > 0) {
    return `선택한 기록 중 위험 판정 ${dangerCount}건이 포함되어 있습니다. 가장 높은 위험도 URL은 ${highestRisk.targetUrl} (${highestRisk.riskScore}/100)입니다. 위험 URL에는 접속하지 말고, 이미 정보를 입력했다면 비밀번호 변경과 2단계 인증 설정을 진행하세요.`;
  }

  if (cautionCount > 0) {
    return `선택한 기록 중 주의 판정 ${cautionCount}건이 포함되어 있습니다. 평균 위험도는 ${averageScore}/100이며, 공식 앱이나 직접 입력한 공식 도메인으로 확인하는 것이 좋습니다.`;
  }

  if (unknownCount > 0) {
    return `선택한 기록 중 분석 불가 ${unknownCount}건이 포함되어 있습니다. 결과 신뢰도가 낮을 수 있으므로 개인정보 입력 전 추가 확인이 필요합니다.`;
  }

  return `선택한 ${safeCount}건은 현재 확인된 위험 신호가 낮습니다. 다만 이 결과가 안전을 보장하지는 않으므로 로그인, 결제, 개인정보 입력 전에는 공식 도메인을 다시 확인하세요.`;
}

function compactAnalysisSnapshot(analysis) {
  return {
    aiRisk: analysis.aiRisk || null,
    caption: analysis.caption || "",
    communityReport: analysis.communityReport || null,
    componentScores: analysis.componentScores || null,
    confidence: analysis.confidence || "",
    confidenceLabel: analysis.confidenceLabel || "",
    contentAnalysis: analysis.contentAnalysis || null,
    displayHost: analysis.displayHost || "",
    displayUrl: analysis.displayUrl || "",
    evidence: (analysis.evidence || []).slice(0, 20),
    explanation: analysis.explanation || "",
    finalWeightedScore: analysis.finalWeightedScore || null,
    input: analysis.input || "",
    normalizedUrl: analysis.normalizedUrl || analysis.displayUrl || "",
    recommendations: (analysis.recommendations || []).slice(0, 8),
    redirectTrace: analysis.redirectTrace || null,
    registrableDomain: analysis.registrableDomain || "",
    reputation: analysis.reputation || null,
    score: clamp(Number(analysis.score) || 0, 0, 100),
    scoreLabel: analysis.scoreLabel || "",
    signals: (analysis.signals || []).slice(0, 20),
    statusLabel: analysis.statusLabel || "",
    synthesisReasons: (analysis.synthesisReasons || []).slice(0, 8),
    tone: analysis.tone || "",
    verdict: analysis.verdict || "",
    verdictLabel: analysis.verdictLabel || "",
  };
}

function mapReportVerdict(row, analysis) {
  if (["invalid", "blocked", "idle"].includes(analysis.verdict)) {
    return "unknown";
  }

  if (row.tone === "danger" || analysis.tone === "danger" || analysis.verdict === "malicious") {
    return "dangerous";
  }

  if (row.tone === "warn" || analysis.tone === "warn" || analysis.verdict === "suspicious") {
    return "caution";
  }

  return "safe";
}

function verdictToTone(verdict) {
  return {
    caution: "warn",
    dangerous: "danger",
    safe: "safe",
    unknown: "blue",
  }[verdict] || "blue";
}

function verdictToKorean(verdict) {
  return {
    caution: "주의",
    dangerous: "위험",
    safe: "안전",
    unknown: "분석 불가",
  }[verdict] || "분석 불가";
}

function getSeverity(points, verdict) {
  if (points >= 60 || verdict === "dangerous") {
    return "high";
  }

  if (points >= 20 || verdict === "caution") {
    return "medium";
  }

  return "low";
}

function getSeverityLabel(severity) {
  return {
    high: "높음",
    low: "낮음",
    medium: "중간",
  }[severity] || severity;
}

function buildUserImpact(label = "", detail = "") {
  const text = `${label} ${detail}`;

  if (/비밀번호|로그인|인증|계정|password/i.test(text)) {
    return "계정 탈취나 인증정보 유출로 이어질 수 있습니다.";
  }

  if (/카드|결제|계좌|payment|billing/i.test(text)) {
    return "금전 피해나 금융정보 노출로 이어질 수 있습니다.";
  }

  if (/다운로드|파일|apk|exe|malware/i.test(text)) {
    return "기기 감염이나 악성 앱 설치로 이어질 수 있습니다.";
  }

  if (/리다이렉트|Redirect|단축|short/i.test(text)) {
    return "사용자가 의도하지 않은 최종 사이트로 이동할 수 있습니다.";
  }

  return "주소를 신뢰하기 전에 공식 채널 확인이 필요합니다.";
}

function mergeRiskSignals(signals) {
  const seen = new Set();
  const merged = [];

  for (const signal of signals) {
    const key = `${signal.title}:${signal.description}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(signal);
  }

  return merged;
}

function hasSignalValue(analysis, key, values) {
  return (analysis.signals || []).some((signal) => {
    if (signal.key !== key) {
      return false;
    }

    return values.some((value) => String(signal.value || "").includes(value));
  });
}

function scoreRedirectFallback(redirectTrace) {
  if (!redirectTrace) {
    return 0;
  }

  if (redirectTrace.status !== "complete") {
    return 35;
  }

  return Math.min(100, Number(redirectTrace.hopCount || 0) * 20);
}

function scoreReputationFallback(reputation) {
  if (!reputation) {
    return 20;
  }

  if (reputation.status === "match") {
    return 100;
  }

  if (reputation.status === "suspicious") {
    return 70;
  }

  return 0;
}

function scoreAiFallback(aiRisk) {
  if (!aiRisk || ["safe", "skipped", "error"].includes(aiRisk.status)) {
    return 0;
  }

  return aiRisk.status === "malicious" ? 90 : 60;
}

function getLastRedirectStatus(redirectTrace) {
  const hops = redirectTrace?.hops || [];
  return hops.at(-1)?.statusCode || 0;
}

function domainOf(hostname) {
  const labels = String(hostname || "").toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  return labels.length <= 2 ? labels.join(".") : labels.slice(-2).join(".");
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function formatQueryParams(queryParams) {
  const entries = Object.entries(queryParams || {});
  return entries.length ? entries.map(([key, value]) => `${key}=${value}`).join(", ") : "없음";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
