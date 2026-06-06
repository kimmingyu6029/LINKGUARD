import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Clock3,
  Clipboard,
  Database,
  ExternalLink,
  FileSearch,
  Info,
  Link2,
  ListChecks,
  Lock,
  Maximize2,
  Network,
  RefreshCw,
  Route,
  ShieldAlert,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import ScoreRing from "../components/ScoreRing.jsx";
import SectionHeader from "../components/SectionHeader.jsx";
import StatusPill from "../components/StatusPill.jsx";
import { canUseExpertMode, useAccount } from "../lib/accountContext.jsx";
import { saveAnalysisHistoryEntry } from "../lib/analysisHistory.js";
import { requestUrlAnalysis } from "../lib/linkRiskApi.js";
import { analyzeUrl } from "../lib/linkRiskAnalyzer.js";

const signalIcons = {
  aiRisk: BadgeCheck,
  content: FileSearch,
  domain: Network,
  https: Lock,
  keywords: AlertTriangle,
  phishing: BadgeCheck,
  payload: Siren,
  community: Siren,
  reputation: Database,
  redirect: Route,
  redirectTrace: Route,
  shortener: Route,
  structure: Link2,
};

export default function AnalysisPage() {
  const location = useLocation();
  const { analysisCredits, canUseExpert, isLoggedIn, openAuthDialog, plan, useAnalysisCredit } = useAccount();
  const consumedCreditKeysRef = useRef(new Set());
  const initialUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("url") || "";
  }, [location.search]);
  const [url, setUrl] = useState(initialUrl);
  const [mode, setMode] = useState("normal");
  const localAnalysis = useMemo(() => analyzeUrl(url, { mode }), [mode, url]);
  const requestKey = useMemo(() => `${url.trim()}::${mode}`, [mode, url]);
  const [remoteResult, setRemoteResult] = useState({ analysis: null, key: "" });
  const [isCheckingReputation, setIsCheckingReputation] = useState(false);
  const [apiError, setApiError] = useState("");
  const [expandedScreenshot, setExpandedScreenshot] = useState(null);
  const analysis = remoteResult.key === requestKey && remoteResult.analysis ? remoteResult.analysis : localAnalysis;
  const RecommendationIcon = analysis.tone === "safe" ? ShieldCheck : ShieldAlert;
  const showExpertPanel = mode === "expert" && canUseExpert;
  const hasUnlimitedExpertAccess = canUseExpertMode(plan);
  const sortedEvidence = useMemo(
    () => analysis.evidence.slice().sort((left, right) => right.points - left.points),
    [analysis.evidence],
  );
  const reputationStats = getReputationStats(analysis.reputation);
  const reputationEngines = analysis.reputation?.engines || [];
  const reputationEngineNarratives = useMemo(
    () => buildEngineNarratives(reputationEngines, analysis.displayHost),
    [analysis.displayHost, reputationEngines],
  );
  const redirectTrace = analysis.redirectTrace;
  const contentAnalysis = analysis.contentAnalysis;
  const communityReport = analysis.communityReport;
  const componentScores = analysis.componentScores;
  const screenshot = analysis.screenshot;
  const dangerSignalCount = analysis.signals.filter((signal) => signal.tone === "danger" || signal.tone === "warn").length;
  const reputationTone = isCheckingReputation
    ? "blue"
    : analysis.reputation?.tone || (apiError ? "warn" : "blue");
  const reputationLabel = isCheckingReputation
    ? "평판 DB 확인 중"
    : analysis.reputation?.label || (apiError ? "평판 DB 연결 실패" : "로컬 분석");
  const reportUrl = url.trim() || initialUrl.trim();

  useEffect(() => {
    setUrl(initialUrl);
  }, [initialUrl]);

  useEffect(() => {
    setExpandedScreenshot(null);
  }, [screenshot?.screenshotUrl]);

  useEffect(() => {
    if (mode === "expert" && !canUseExpert) {
      setMode("normal");
    }
  }, [canUseExpert, mode]);

  useEffect(() => {
    const trimmedUrl = url.trim();

    setApiError("");
    setRemoteResult({ analysis: null, key: "" });

    if (!trimmedUrl) {
      setIsCheckingReputation(false);
      return undefined;
    }

    const controller = new AbortController();
    const currentKey = `${trimmedUrl}::${mode}`;
    const timer = window.setTimeout(async () => {
      setIsCheckingReputation(true);

      try {
        const nextAnalysis = await requestUrlAnalysis({
          mode,
          signal: controller.signal,
          url: trimmedUrl,
        });
        setRemoteResult({ analysis: nextAnalysis, key: currentKey });
        saveAnalysisHistoryEntry(nextAnalysis, { mode, requestedUrl: trimmedUrl });

        if (mode === "expert" && !hasUnlimitedExpertAccess && analysisCredits > 0 && !consumedCreditKeysRef.current.has(currentKey)) {
          consumedCreditKeysRef.current.add(currentKey);
          const creditResult = await useAnalysisCredit({ url: trimmedUrl });

          if (!creditResult.ok) {
            setApiError(creditResult.error || "검사권 차감에 실패했습니다.");
          }
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          setApiError(error.message);
          saveAnalysisHistoryEntry(analyzeUrl(trimmedUrl, { mode }), { mode, requestedUrl: trimmedUrl });
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsCheckingReputation(false);
        }
      }
    }, 280);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [analysisCredits, hasUnlimitedExpertAccess, mode, url, useAnalysisCredit]);

  function handleExpertModeClick() {
    if (canUseExpert) {
      setMode("expert");
    }
  }

  return (
    <section className="analysis-page page-content">
      <SectionHeader eyebrow="URL 분석하기" title="분석 결과" />

      <div className="analysis-toolbar">
        <label>
          <span>분석 URL</span>
          <input
            aria-label="분석 URL"
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com"
            value={url}
          />
          <Clipboard size={16} />
        </label>
        <div className="mode-toggle" aria-label="분석 모드">
          <button
            className={mode === "normal" ? "active" : ""}
            onClick={() => setMode("normal")}
            type="button"
          >
            일반인 모드
          </button>
          <button
            aria-disabled={!canUseExpert}
            className={`${mode === "expert" ? "active" : ""}${!canUseExpert ? " locked" : ""}`}
            onClick={handleExpertModeClick}
            type="button"
          >
            {!canUseExpert ? <Lock size={14} /> : null}
            전문가 모드
          </button>
        </div>
      </div>

      <VerdictSummaryBar
        analysis={analysis}
        isCheckingReputation={isCheckingReputation}
        reputationLabel={reputationLabel}
        redirectTrace={redirectTrace}
      />

      <div className={`analysis-layout${showExpertPanel || !canUseExpert ? " has-expert" : ""}`}>
        <article className={`panel risk-panel tone-${analysis.tone}`} aria-live="polite">
          <h2>위험도</h2>
          <ScoreRing caption={analysis.caption} label={analysis.scoreLabel} score={analysis.score} tone={analysis.tone} />
          <StatusPill tone={analysis.tone}>{analysis.statusLabel}</StatusPill>
          <p className="risk-target">{analysis.displayHost}</p>
          <p className="confidence-line">신뢰도: {analysis.confidenceLabel || "분석 중"}</p>
        </article>

        <article className="panel ai-explain">
          <div className="panel-title-row">
            <h2>AI 분석 설명</h2>
            <span className={`api-status tone-${reputationTone}`}>
              {isCheckingReputation ? <RefreshCw className="is-spinning" size={14} /> : <Database size={14} />}
              <span>{reputationLabel}</span>
            </span>
          </div>
          <p>{analysis.explanation}</p>
          {apiError ? (
            <p className={`reputation-detail tone-${reputationTone}`}>
              분석 서버에 연결하지 못해 로컬 규칙 기반 분석만 표시합니다.
            </p>
          ) : null}
        </article>

        <aside className={`panel recommendation-panel tone-${analysis.tone}`}>
          <h2>추천 대응 방법</h2>
          <ul>
            {analysis.recommendations.map((item) => (
              <li key={item}>
                <RecommendationIcon size={17} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          {reportUrl ? (
            <Link className="report-cta-card" to={`/report?url=${encodeURIComponent(reportUrl)}`}>
              <span>
                <Siren size={17} />
                의심 URL이면 신고 DB에 추가하세요
              </span>
              <strong>
                이 URL 신고하기
                <ArrowRight size={15} />
              </strong>
            </Link>
          ) : null}
        </aside>

        <article className="panel evidence-panel">
          <div className="panel-title-row">
            <h2>판정 근거</h2>
            <span className={`api-status tone-${analysis.tone}`}>{analysis.statusLabel}</span>
          </div>
          <EvidenceSummary evidence={sortedEvidence} reasons={analysis.synthesisReasons || []} />
        </article>

        <article className="panel technical-detail-panel">
          <div className="panel-title-row">
            <h2>세부 검사 결과</h2>
            <span>리다이렉트, 콘텐츠, 신고 DB, 외부 평판</span>
          </div>
          <div className="technical-detail-grid">
            {redirectTrace ? <RedirectChain trace={redirectTrace} /> : null}
            {contentAnalysis ? <ContentAnalysisReport contentAnalysis={contentAnalysis} /> : null}
            {communityReport ? <CommunityReport report={communityReport} /> : null}
            {analysis.reputation ? <ReputationReport reputation={analysis.reputation} tone={reputationTone} /> : null}
          </div>
        </article>

        <ScreenshotCaptureReport
          isLoading={isCheckingReputation && Boolean(url.trim()) && !screenshot}
          onExpand={setExpandedScreenshot}
          screenshot={screenshot}
        />

        <article className="panel signal-panel">
          <h2>분석 요인</h2>
          <div className="signal-grid">
            {analysis.signals.map((signal) => {
              const Icon = signalIcons[signal.key] || AlertTriangle;
              return (
                <div className={`signal-item tone-${signal.tone}`} key={signal.label}>
                  <Icon size={24} />
                  <span>{signal.label}</span>
                  <strong>{signal.value}</strong>
                </div>
              );
            })}
          </div>
        </article>

        {!canUseExpert ? (
          <article className="panel expert-gate">
            <div>
              <Lock size={22} />
              <h2>전문가 모드 잠김</h2>
            </div>
            <p>
              {isLoggedIn
                ? `${plan} 요금제에서는 일반인 모드만 사용할 수 있습니다.`
                : "로그인 후 Pro, Team, Business 요금제에서 전문가 모드를 사용할 수 있습니다."}
            </p>
            {isLoggedIn ? (
              <Link to="/pricing">요금제 보기</Link>
            ) : (
              <button onClick={() => openAuthDialog("login")} type="button">
                로그인
              </button>
            )}
          </article>
        ) : null}

        {showExpertPanel ? (
          <article className="panel expert-panel">
            <div className="panel-title-row">
              <h2>전문가 분석</h2>
              <span className={`api-status tone-${analysis.tone}`}>{plan} 권한</span>
            </div>

            <div className="expert-summary">
              <div>
                <span>최종 점수</span>
                <strong>{analysis.score}/100</strong>
              </div>
              <div>
                <span>신뢰도</span>
                <strong>{analysis.confidenceLabel || "-"}</strong>
              </div>
              <div>
                <span>평판 엔진</span>
                <strong>{analysis.reputation?.provider || "로컬 규칙"}</strong>
              </div>
              <div>
                <span>경고 신호</span>
                <strong>
                  {dangerSignalCount}/{analysis.signals.length}
                </strong>
              </div>
              <div>
                <span>판정</span>
                <strong>{analysis.statusLabel}</strong>
              </div>
            </div>

            {componentScores ? <RawScoreGrid scores={componentScores} finalScore={analysis.finalWeightedScore} /> : null}

            {reputationStats ? (
              <div className="vt-breakdown" aria-label="VirusTotal 엔진 통계">
                <span>악성 {reputationStats.malicious}</span>
                <span>의심 {reputationStats.suspicious}</span>
                <span>무해 {reputationStats.harmless}</span>
                <span>미탐지 {reputationStats.undetected}</span>
              </div>
            ) : null}

            {reputationEngines.length > 0 ? (
              <>
                <div className="expert-engine-table" aria-label="탐지 엔진별 세부 결과">
                  <div className="expert-engine-head">
                    <span>엔진</span>
                    <span>분류</span>
                    <span>결과 라벨</span>
                  </div>
                  {reputationEngines.slice(0, 6).map((engine) => (
                    <div key={`${engine.engineName}-${engine.category}-${engine.result || "none"}`}>
                      <strong>{engine.engineName}</strong>
                      <span className={`engine-category tone-${engine.category === "malicious" ? "danger" : "warn"}`}>
                        {getCategoryLabel(engine.category)}
                      </span>
                      <span>{engine.result || "세부 라벨 미제공"}</span>
                    </div>
                  ))}
                </div>
                <EngineNarrativeList narratives={reputationEngineNarratives} />
              </>
            ) : null}

            <div className="expert-columns">
              <section>
                <h3>점수 근거</h3>
                <ol className="expert-evidence-list">
                  {sortedEvidence.length > 0 ? (
                    sortedEvidence.map((item) => (
                      <li key={`${item.label}-${item.detail}`}>
                        <strong>{item.points}점</strong>
                        <span>{item.label}</span>
                        <p>{item.detail}</p>
                      </li>
                    ))
                  ) : (
                    <li>
                      <strong>0점</strong>
                      <span>구조 위험 없음</span>
                      <p>로컬 규칙에서 추가 감점 근거가 발견되지 않았습니다.</p>
                    </li>
                  )}
                </ol>
              </section>

              <section>
                <h3>신호 매트릭스</h3>
                <div className="expert-signal-list">
                  {analysis.signals.map((signal) => (
                    <div className={`tone-${signal.tone}`} key={signal.label}>
                      <span>{signal.label}</span>
                      <strong>{signal.value}</strong>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3>조사 작업</h3>
                <ul className="expert-action-list">
                  <li>최종 도메인과 공식 도메인 소유자를 비교</li>
                  <li>리디렉션, 다운로드, 로그인 입력 폼 여부 확인</li>
                  <li>평판 DB 결과가 의심이면 개인정보 입력 차단</li>
                </ul>
              </section>
            </div>
          </article>
        ) : null}
      </div>

      <div className="analysis-bottom-link">
        <Link to="/education">
          왜 위험한지 더 알아보기
          <ExternalLink size={15} />
        </Link>
      </div>

      {expandedScreenshot ? (
        <div className="screenshot-modal" role="dialog" aria-modal="true" aria-label="분석 대상 화면 캡처 확대 보기">
          <button className="screenshot-modal-backdrop" onClick={() => setExpandedScreenshot(null)} type="button" />
          <div className="screenshot-modal-content">
            <div className="panel-title-row">
              <h2>분석 대상 화면 캡처</h2>
              <button onClick={() => setExpandedScreenshot(null)} type="button">
                닫기
              </button>
            </div>
            <img alt="격리 환경에서 캡처된 분석 대상 웹사이트 화면" src={expandedScreenshot.screenshotUrl} />
            <p>이미지는 격리 환경에서 캡처된 정적 이미지이며 실제 페이지 링크가 아닙니다.</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ScreenshotCaptureReport({ isLoading, onExpand, screenshot }) {
  if (isLoading) {
    return (
      <article className="panel screenshot-panel is-loading">
        <div className="panel-title-row">
          <h2>분석 대상 화면 캡처</h2>
          <span className="api-status tone-blue">
            <RefreshCw className="is-spinning" size={14} />
            <span>캡처 중</span>
          </span>
        </div>
        <div className="screenshot-placeholder">
          <FileSearch size={22} />
          <p>웹페이지 화면을 안전한 환경에서 캡처하는 중...</p>
        </div>
      </article>
    );
  }

  if (!screenshot) {
    return (
      <article className="panel screenshot-panel">
        <div className="panel-title-row">
          <h2>분석 대상 화면 캡처</h2>
          <span className="api-status tone-blue">대기</span>
        </div>
        <div className="screenshot-placeholder">
          <FileSearch size={22} />
          <p>분석 가능한 HTTP(S) URL을 입력하면 격리 브라우저에서 화면을 캡처합니다.</p>
        </div>
      </article>
    );
  }

  if (!screenshot.success) {
    return (
      <article className="panel screenshot-panel tone-warn">
        <div className="panel-title-row">
          <h2>분석 대상 화면 캡처</h2>
          <span className="api-status tone-warn">캡처 실패</span>
        </div>
        <div className="screenshot-warning">
          <AlertTriangle size={20} />
          <div>
            <strong>스크린샷 캡처 실패</strong>
            <p>{screenshot.error || "스크린샷 캡처 실패 또는 보안상 차단된 URL입니다."}</p>
          </div>
        </div>
        <ScreenshotMetadata screenshot={screenshot} />
      </article>
    );
  }

  return (
    <article className="panel screenshot-panel">
      <div className="panel-title-row">
        <h2>분석 대상 화면 캡처</h2>
        <span className="api-status tone-safe">캡처 성공</span>
      </div>
      <button className="screenshot-preview" onClick={() => onExpand(screenshot)} type="button">
        <img alt="격리 환경에서 캡처된 분석 대상 웹사이트 화면" src={screenshot.screenshotUrl} />
        <span>
          <Maximize2 size={16} />
          확대 보기
        </span>
      </button>
      <p className="screenshot-static-note">
        <Info size={15} />
        <span>이미지는 격리 환경에서 캡처된 정적 이미지이며 실제 페이지 링크가 아닙니다.</span>
      </p>
      <ScreenshotMetadata screenshot={screenshot} />
    </article>
  );
}

function ScreenshotMetadata({ screenshot }) {
  const metadata = [
    ["캡처 시간", formatScreenshotDate(screenshot.capturedAt)],
    ["입력 URL", screenshot.inputUrl || "-"],
    ["최종 접속 URL", screenshot.finalUrl || "-"],
    ["리다이렉트 여부", screenshot.redirected ? "예" : "아니오"],
    ["상태", screenshot.success ? "성공" : "실패"],
  ];

  return (
    <dl className="screenshot-meta-grid">
      {metadata.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function VerdictSummaryBar({ analysis, isCheckingReputation, redirectTrace, reputationLabel }) {
  const actionLabel = getPrimaryActionLabel(analysis.tone);
  const redirectLabel = getRedirectSummary(redirectTrace);

  return (
    <section className={`verdict-summary tone-${analysis.tone}`} aria-label="분석 결과 요약">
      <div className="verdict-summary-main">
        <StatusPill tone={analysis.tone}>{analysis.statusLabel}</StatusPill>
        <div>
          <strong>{actionLabel}</strong>
          <span>{analysis.displayHost}</span>
        </div>
      </div>
      <div className="verdict-summary-grid">
        <div>
          <span>위험도 점수</span>
          <strong>{analysis.score}/100</strong>
        </div>
        <div>
          <span>신뢰도</span>
          <strong>{analysis.confidenceLabel || "분석 중"}</strong>
        </div>
        <div>
          <span>평판 결과</span>
          <strong>{isCheckingReputation ? "확인 중" : reputationLabel}</strong>
        </div>
        <div>
          <span>리다이렉트</span>
          <strong>{redirectLabel}</strong>
        </div>
      </div>
    </section>
  );
}

function EvidenceSummary({ evidence, reasons }) {
  const topEvidence = evidence.slice(0, 4);

  if (reasons.length === 0 && topEvidence.length === 0) {
    return (
      <div className="evidence-empty">
        <ShieldCheck size={18} />
        <span>아직 표시할 위험 근거가 없습니다. URL을 입력하면 분석 근거가 정리됩니다.</span>
      </div>
    );
  }

  return (
    <section className="analysis-subreport" aria-label="주요 근거">
      {reasons.length > 0 ? (
        <>
          <div className="subsection-title">
            <ListChecks size={16} />
            <h3>요약 근거</h3>
          </div>
          <ol className="compact-report-list">
            {reasons.slice(0, 4).map((reason, index) => (
              <li key={`${reason}-${index}`}>{reason}</li>
            ))}
          </ol>
        </>
      ) : null}
      {topEvidence.length > 0 ? (
        <div className="evidence-score-list">
          {topEvidence.map((item) => (
            <div key={`${item.label}-${item.detail}`}>
              <strong>{Number(item.points || 0)}점</strong>
              <span>{item.label}</span>
              <p>{item.detail}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function RedirectChain({ trace }) {
  const hops = trace.hops || [];
  const finalHost = trace.finalHost || getUrlHost(trace.finalUrl) || "확인 불가";
  const summary = getRedirectUserSummary(trace, hops, finalHost);

  return (
    <section className="analysis-subreport" aria-label="리다이렉트 경로">
      <div className="subsection-title">
        <Route size={16} />
        <h3>리다이렉트 경로</h3>
      </div>
      <div className="redirect-chain">
        <div className="redirect-summary-card">
          <span>이 링크가 이동한 곳</span>
          <strong>{finalHost}</strong>
          <p>{summary}</p>
          {trace.finalUrl ? (
            <details>
              <summary>전체 최종 URL 보기</summary>
              <code>{trace.finalUrl}</code>
            </details>
          ) : null}
        </div>
        {hops.length > 0 ? (
          <ol>
            {hops.map((hop, index) => (
              <li key={`${hop.sourceUrl}-${hop.targetUrl}-${index}`}>
                <span>{index + 1}</span>
                <strong>
                  {hop.sourceHost}에서 {hop.targetHost}로 이동
                </strong>
                <small>{getRedirectStatusMeaning(hop.statusCode)}</small>
              </li>
            ))}
          </ol>
        ) : (
          <p>{trace.status === "complete" ? "추가 이동 없이 분석되었습니다." : trace.detail || "경로 분석 정보가 제한적입니다."}</p>
        )}
      </div>
    </section>
  );
}

function getRedirectUserSummary(trace, hops, finalHost) {
  if (!trace) {
    return "아직 이동 경로를 확인하지 않았습니다.";
  }

  if (hops.length === 0) {
    return trace.status === "complete"
      ? "사용자가 입력한 주소에서 다른 사이트로 자동 이동하지 않았습니다."
      : trace.detail || "이동 경로 분석 정보가 제한적입니다.";
  }

  const uniqueHosts = [...new Set(hops.flatMap((hop) => [hop.sourceHost, hop.targetHost]).filter(Boolean))];
  const crossSiteText =
    uniqueHosts.length > 1
      ? `중간에 ${uniqueHosts.length.toLocaleString("ko-KR")}개 도메인이 관여했습니다.`
      : "같은 도메인 안에서 이동했습니다.";

  return `입력한 링크는 ${hops.length.toLocaleString("ko-KR")}번 자동 이동한 뒤 ${finalHost}에 도착했습니다. ${crossSiteText} 로그인 화면이나 결제 화면으로 이동한다면 주소창의 최종 도메인이 공식 사이트인지 확인하세요.`;
}

function getRedirectStatusMeaning(statusCode) {
  const status = Number(statusCode || 0);

  if (status === 301) {
    return "301 영구 이동: 사이트가 사용자를 새 주소로 보내도록 설정했습니다.";
  }

  if (status === 302) {
    return "302 임시 이동: 사이트가 사용자를 다음 주소로 자동 이동시켰습니다.";
  }

  if (status >= 300 && status < 400) {
    return `${status} 이동 응답: 브라우저가 다른 주소로 이어서 접속합니다.`;
  }

  return "자동 이동 응답";
}

function getUrlHost(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function ContentAnalysisReport({ contentAnalysis }) {
  return (
    <section className="analysis-subreport" aria-label="웹페이지 콘텐츠 분석">
      <div className="subsection-title">
        <FileSearch size={16} />
        <h3>웹페이지 콘텐츠</h3>
      </div>
      <div className="content-fact-grid">
        <div>
          <span>상태</span>
          <strong>{getContentStatusLabel(contentAnalysis.status)}</strong>
        </div>
        <div>
          <span>로그인 폼</span>
          <strong>{contentAnalysis.hasLoginForm ? "감지" : "없음"}</strong>
        </div>
        <div>
          <span>비밀번호 입력창</span>
          <strong>{contentAnalysis.hasPasswordInput ? "감지" : "없음"}</strong>
        </div>
        <div>
          <span>외부 스크립트</span>
          <strong>{contentAnalysis.externalScriptCount || 0}</strong>
        </div>
      </div>
      {contentAnalysis.title ? <p className="content-title">{contentAnalysis.title}</p> : null}
      {contentAnalysis.suspiciousJsPatterns?.length > 0 ? (
        <p className="content-tags">JS: {contentAnalysis.suspiciousJsPatterns.join(", ")}</p>
      ) : null}
      {contentAnalysis.downloadLinks?.length > 0 ? (
        <p className="content-tags">다운로드: {contentAnalysis.downloadLinks.slice(0, 3).join(", ")}</p>
      ) : null}
    </section>
  );
}

function CommunityReport({ report }) {
  const hasReports = Boolean(report.hasReports);
  const statusLabel = getCommunityStatusLabel(report.status);
  const typeLabel = getReportTypeLabel(report.primaryReportType);

  return (
    <section className={`community-report tone-${getCommunityTone(report.status, hasReports)}`} aria-label="사용자 신고 이력">
      <div className="reputation-report-head">
        <div className="reputation-report-icon">
          <Siren size={20} />
        </div>
        <div>
          <span>자체 신고 DB</span>
          <strong>{hasReports ? "사용자 신고 이력 있음" : "사용자 신고 이력 없음"}</strong>
          <p>
            신고 데이터는 허위 신고 가능성을 고려해 community_score로 별도 계산되며, 최종 위험도에는 약 10%만
            반영됩니다.
          </p>
        </div>
      </div>

      <div className="community-fact-grid">
        <div>
          <span>신고 횟수</span>
          <strong>{Number(report.reportCount || 0).toLocaleString("ko-KR")}건</strong>
        </div>
        <div>
          <span>최근 신고일</span>
          <strong>{formatCommunityDate(report.lastReportedAt)}</strong>
        </div>
        <div>
          <span>주요 신고 유형</span>
          <strong>{hasReports ? typeLabel : "-"}</strong>
        </div>
        <div>
          <span>관리자 검토 상태</span>
          <strong>{statusLabel}</strong>
        </div>
        <div>
          <span>고유 신고자</span>
          <strong>{Number(report.uniqueReporters || 0).toLocaleString("ko-KR")}명</strong>
        </div>
        <div>
          <span>community_score</span>
          <strong>{Math.round(Number(report.score || 0))}/100</strong>
        </div>
      </div>
    </section>
  );
}

function RawScoreGrid({ finalScore, scores }) {
  const items = [
    ["로컬", scores.local],
    ["리다이렉트", scores.redirect],
    ["평판", scores.reputation],
    ["콘텐츠", scores.content],
    ["신고", scores.community],
    ["AI", scores.ai],
    ["최종", finalScore],
  ];

  return (
    <div className="raw-score-grid" aria-label="원시 점수">
      {items.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{Math.round(Number(value || 0))}</strong>
        </div>
      ))}
    </div>
  );
}

function ReputationReport({ reputation, tone }) {
  const stats = getReputationStats(reputation);
  const engines = reputation.engines || [];
  const matchItems = engines.length === 0 ? reputation.matches || [] : [];
  const insights = reputation.insights || [];
  const detectionCount = getDetectionTotal(stats, engines, reputation);
  const total = stats?.total || reputation.matches?.length || 0;
  const statItems = stats
    ? [
        { key: "malicious", label: "악성", tone: "danger", value: stats.malicious },
        { key: "suspicious", label: "의심", tone: "warn", value: stats.suspicious },
        { key: "harmless", label: "무해", tone: "safe", value: stats.harmless },
        { key: "undetected", label: "미탐지", tone: "blue", value: stats.undetected },
      ]
    : [];

  return (
    <section className={`reputation-report tone-${tone}`} aria-label="평판 분석 근거">
      <div className="reputation-report-head">
        <div className="reputation-report-icon">
          <Database size={20} />
        </div>
        <div>
          <span>{reputation.provider || "평판 DB"}</span>
          <strong>{reputation.label || "평판 분석 결과"}</strong>
          <p>{reputation.detail}</p>
        </div>
      </div>

      {stats ? (
        <>
          <div className="reputation-stat-grid">
            {statItems.map((item) => (
              <div className={`tone-${item.tone}`} key={item.key}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
          <div className="reputation-distribution" aria-label="엔진 판정 분포">
            {statItems.map((item) => (
              <span
                className={`tone-${item.tone}`}
                key={item.key}
                style={{ "--share": `${getStatShare(item.value, stats.total)}%` }}
              />
            ))}
          </div>
        </>
      ) : null}

      <div className="reputation-meta-grid">
        <div>
          <Activity size={16} />
          <span>탐지 비율</span>
          <strong>{total ? `${detectionCount}/${total}` : detectionCount > 0 ? `${detectionCount}건` : "없음"}</strong>
        </div>
        <div>
          <Clock3 size={16} />
          <span>분석 시각</span>
          <strong>{reputation.scanDate ? formatScanAge(reputation.ageDays) : "시각 없음"}</strong>
        </div>
        <div>
          <FileSearch size={16} />
          <span>근거 범위</span>
          <strong>{engines.length > 0 ? `${engines.length}개 엔진 라벨` : "요약 통계"}</strong>
        </div>
      </div>

      {engines.length > 0 ? (
        <div className="engine-evidence">
          <div className="subsection-title">
            <FileSearch size={16} />
            <h3>의심 판정 근거</h3>
          </div>
          <ul>
            {engines.slice(0, 4).map((engine) => (
              <li key={`${engine.engineName}-${engine.category}-${engine.result || "none"}`}>
                <span className={`engine-category tone-${engine.category === "malicious" ? "danger" : "warn"}`}>
                  {getCategoryLabel(engine.category)}
                </span>
                <div>
                  <strong>{engine.engineName}</strong>
                  <p>{buildEngineExplanation(engine)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : matchItems.length > 0 ? (
        <div className="engine-evidence">
          <div className="subsection-title">
            <FileSearch size={16} />
            <h3>피드 일치 근거</h3>
          </div>
          <ul>
            {matchItems.slice(0, 4).map((match, index) => (
              <li key={`${match.url || match.source || "match"}-${index}`}>
                <span className="engine-category tone-danger">일치</span>
                <div>
                  <strong>{match.source ? "평판 피드" : "일치 항목"}</strong>
                  <p>{match.url || match.source || "외부 평판 DB와 일치했습니다."}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="engine-evidence is-empty">
          <div className="subsection-title">
            <FileSearch size={16} />
            <h3>탐지 엔진</h3>
          </div>
          <p>악성 또는 의심으로 분류한 엔진의 세부 라벨이 없습니다.</p>
        </div>
      )}

      {insights.length > 0 ? (
        <div className="reputation-insights">
          <div className="subsection-title">
            <ListChecks size={16} />
            <h3>해석 포인트</h3>
          </div>
          <ul>
            {insights.map((insight) => (
              <li key={insight}>{insight}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="reputation-scope-note">
        <Info size={15} />
        <span>{getReputationScopeNote(reputation.provider)}</span>
      </p>
    </section>
  );
}

function EngineNarrativeList({ narratives }) {
  if (narratives.length === 0) {
    return null;
  }

  return (
    <section className="expert-engine-narratives" aria-label="엔진별 판정 해석">
      <div className="subsection-title">
        <Info size={16} />
        <h3>엔진별 판정 해석</h3>
      </div>
      <p className="engine-narrative-note">
        VirusTotal은 각 보안 엔진의 내부 탐지 규칙 전문을 공개하지 않습니다. 대신 공개된 엔진명, 분류, 결과
        라벨을 기준으로 아래처럼 해석할 수 있습니다.
      </p>
      <div>
        {narratives.map((item) => (
          <article className={`engine-narrative tone-${item.tone}`} key={`${item.engineName}-${item.resultLabel}`}>
            <strong>{item.engineName}</strong>
            <p>{item.copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function getReputationStats(reputation) {
  return reputation?.stats || reputation?.matches?.find((item) => typeof item === "object" && "malicious" in item) || null;
}

function getCommunityTone(status, hasReports) {
  if (status === "confirmed_malicious") {
    return "danger";
  }

  return hasReports ? "warn" : "safe";
}

function getCommunityStatusLabel(status) {
  return {
    confirmed_malicious: "악성 확인",
    confirmed_suspicious: "의심 확인",
    expired: "만료",
    none: "이력 없음",
    pending: "검토 대기",
    rejected: "반려",
    under_review: "검토 중",
  }[status] || "검토 대기";
}

function getReportTypeLabel(type) {
  return {
    account_takeover: "계정 탈취",
    fake_shop: "가짜 쇼핑몰",
    investment_scam: "투자 사기 / 리딩방",
    malicious_app: "악성 앱 설치 유도",
    malware_download: "악성코드 다운로드",
    other: "기타",
    personal_info: "개인정보 입력 유도",
    phishing: "피싱",
    smishing: "스미싱",
  }[type] || "기타";
}

function formatCommunityDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("ko-KR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatScreenshotDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ko-KR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    year: "numeric",
  });
}

function getDetectionTotal(stats, engines, reputation) {
  if (stats) {
    return Number(stats.malicious || 0) + Number(stats.suspicious || 0);
  }

  return reputation?.matches?.length || engines.length;
}

function getStatShare(value, total) {
  if (!total || !value) {
    return 0;
  }

  return Math.round((Number(value) / Number(total)) * 1000) / 10;
}

function getCategoryLabel(category) {
  if (category === "malicious") {
    return "악성";
  }

  if (category === "suspicious") {
    return "의심";
  }

  return "확인 필요";
}

function buildEngineNarratives(engines, host) {
  return engines.slice(0, 6).map((engine) => ({
    copy: buildEngineNarrative(engine, host),
    engineName: engine.engineName,
    resultLabel: engine.result || engine.category,
    tone: engine.category === "malicious" ? "danger" : "warn",
  }));
}

function buildEngineNarrative(engine, host) {
  const engineName = engine.engineName || "보안 엔진";
  const categoryLabel = getCategoryLabel(engine.category);
  const resultLabel = engine.result || "세부 라벨 미제공";
  const target = host && host !== "URL을 입력하세요" ? `${host} URL` : "이 URL";
  const meaning = getEngineResultMeaning(resultLabel, engine.category);

  return `${engineName}는 ${target}을(를) ${categoryLabel}으로 분류했고, 결과 라벨을 "${resultLabel}"로 제공했습니다. ${meaning} 따라서 이 판정은 단순히 점수가 높다는 뜻이 아니라, 해당 엔진이 보유한 평판 데이터나 탐지 모델에서 피싱 또는 악성 URL 패턴과 일치한다고 본 것입니다.`;
}

function buildEngineExplanation(engine) {
  const resultLabel = engine.result || "";
  const categoryLabel = getCategoryLabel(engine.category);
  const meaning = getEngineResultMeaning(resultLabel, engine.category);
  const labelText = resultLabel ? `"${resultLabel}" 라벨` : `${categoryLabel} 분류`;

  return `${labelText}을 근거로 ${categoryLabel} 판정을 냈습니다. ${meaning}`;
}

function getEngineResultMeaning(resultLabel, category) {
  const normalized = String(resultLabel || "").toLowerCase();

  if (normalized.includes("phish")) {
    return "phishing 라벨은 사용자를 가짜 로그인, 결제, 인증, 개인정보 입력 화면으로 유도해 계정이나 민감 정보를 빼내는 유형으로 보았다는 의미입니다.";
  }

  if (normalized.includes("malware")) {
    return "malware 라벨은 파일 다운로드, 스크립트 실행, 악성코드 배포 같은 감염 행위와 연결될 수 있다고 본다는 의미입니다.";
  }

  if (normalized.includes("scam") || normalized.includes("fraud")) {
    return "scam 또는 fraud 라벨은 금전 피해, 허위 이벤트, 가짜 서비스 안내처럼 사용자를 속이는 사기성 페이지로 보았다는 의미입니다.";
  }

  if (normalized.includes("malicious") || category === "malicious") {
    return "malicious 분류는 해당 엔진이 이 주소를 알려진 악성 인프라, 차단 목록, 또는 강한 위험 패턴과 연결된 URL로 보았다는 의미입니다.";
  }

  if (category === "suspicious") {
    return "suspicious 분류는 악성으로 단정할 정도는 아니지만 URL 구조나 평판 신호가 정상 사이트와 다르다고 본다는 의미입니다.";
  }

  return "엔진이 세부 원문 근거를 공개하지 않았기 때문에, 현재 확인 가능한 직접 근거는 엔진명, 분류, 결과 라벨입니다.";
}

function getContentStatusLabel(status) {
  return {
    blocked: "차단",
    complete: "완료",
    error: "제한",
    non_html: "HTML 아님",
    redirect: "추가 이동",
    skipped: "건너뜀",
  }[status] || "확인 중";
}

function formatScanAge(ageDays) {
  if (typeof ageDays !== "number") {
    return "최근 리포트";
  }

  if (ageDays === 0) {
    return "오늘";
  }

  return `${ageDays.toLocaleString("ko-KR")}일 전`;
}

function getReputationScopeNote(provider) {
  if (provider === "VirusTotal") {
    return "VirusTotal API는 엔진별 판정과 결과 라벨을 제공하지만, 각 보안 엔진의 내부 분석 근거까지 공개하지는 않습니다.";
  }

  return "평판 DB 결과는 외부 피드의 일치 여부를 기준으로 표시되며, 실제 접근 전 공식 채널 확인이 필요합니다.";
}

function getPrimaryActionLabel(tone) {
  if (tone === "danger") {
    return "클릭하지 말고 공식 채널에서 확인하세요";
  }

  if (tone === "warn") {
    return "개인정보 입력 전 한 번 더 검증하세요";
  }

  if (tone === "safe") {
    return "큰 위험 신호는 낮지만 주소창을 확인하세요";
  }

  return "URL을 입력하면 위험도를 요약합니다";
}

function getRedirectSummary(trace) {
  if (!trace) {
    return "확인 전";
  }

  if (trace.hopCount > 0) {
    return `${trace.hopCount}회 이동`;
  }

  if (trace.status === "complete") {
    return "추가 이동 없음";
  }

  return "제한적 확인";
}
