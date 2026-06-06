import { ArrowRight, ChevronRight, Database, ExternalLink, Info, Route, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import HeroVisual from "../components/HeroVisual.jsx";
import StatusPill from "../components/StatusPill.jsx";
import {
  phishingTypes,
  quickActions,
  recentCases,
  recentCaseSource,
  safeChecklist,
} from "../data/mockData.js";

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [securityCases, setSecurityCases] = useState(recentCases);
  const [securityCaseSource, setSecurityCaseSource] = useState(recentCaseSource);
  const [selectedCaseKey, setSelectedCaseKey] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/security-cases", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`security cases failed: ${response.status}`);
        }

        return response.json();
      })
      .then((payload) => {
        if (Array.isArray(payload.cases) && payload.cases.length > 0) {
          const mergedCases = dedupeSecurityCases([
            ...payload.cases,
            ...recentCases,
          ]);

          setSecurityCases(mergedCases.slice(0, 3));
          setSecurityCaseSource({
            label: payload.sourceLabel || recentCaseSource.label,
            pageUrl: payload.sourcePageUrl || recentCaseSource.pageUrl,
            rssUrl: payload.sourceUrl || recentCaseSource.rssUrl,
            updatedAt: payload.updatedAt
              ? new Date(payload.updatedAt).toLocaleDateString("ko-KR")
              : recentCaseSource.updatedAt,
          });
        }
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setSecurityCases(recentCases);
          setSecurityCaseSource(recentCaseSource);
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (securityCases.length === 0) {
      setSelectedCaseKey("");
      return;
    }

    setSelectedCaseKey((currentKey) => {
      if (securityCases.some((item) => getSecurityCaseKey(item) === currentKey)) {
        return currentKey;
      }

      return "";
    });
  }, [securityCases]);

  const selectedCase = securityCases.find((item) => getSecurityCaseKey(item) === selectedCaseKey) || null;
  const selectedCaseDetail = selectedCase ? getSecurityCaseDetail(selectedCase) : null;

  function handleSubmit(event) {
    event.preventDefault();
    const query = url.trim() ? `?url=${encodeURIComponent(url.trim())}` : "";
    navigate(`/analysis${query}`);
  }

  return (
    <section className="landing-page page-content">
      <div className="landing-hero">
        <div className="hero-copy">
          <h1>
            의심스러운 링크,
            <br />
            누르기 전에 <span>먼저 확인하세요</span>
          </h1>
          <p>
            AI가 악성 URL 여부를 분석하고, 왜 위험한지 쉽게 설명해드립니다.
          </p>
          <div className="hero-action-panel">
            <form className="analysis-form" onSubmit={handleSubmit}>
              <input
                aria-label="분석할 URL"
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example-link.com"
                type="url"
                value={url}
              />
              <button type="submit">
                분석하기
                <ArrowRight size={18} />
              </button>
            </form>
            <div className="hero-trust-row" aria-label="검사 범위">
              <span>
                <ShieldCheck size={15} />
                AI 위험 판단
              </span>
              <span>
                <Route size={15} />
                리다이렉트 추적
              </span>
              <span>
                <Database size={15} />
                평판·신고 DB 확인
              </span>
            </div>
            <div className="quick-action-row" aria-label="빠른 이동">
              {quickActions.map((item) => {
                const Icon = item.icon;
                return (
                  <Link className="quick-action" key={item.label} to={item.to}>
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
        <HeroVisual />
      </div>

      <div className="landing-grid">
        <article className="panel latest-panel">
          <div className="panel-title-row">
            <h2>최근 피싱 사례</h2>
            <a href={securityCaseSource.pageUrl || securityCaseSource.rssUrl}>
              {securityCaseSource.label}
              <ExternalLink size={14} />
            </a>
          </div>
          <ul className="case-list">
            {securityCases.map((item) => {
              const itemKey = getSecurityCaseKey(item);
              const isSelected = itemKey === selectedCaseKey;

              return (
                <li className={isSelected ? "is-selected" : ""} key={itemKey}>
                  <button
                    aria-expanded={isSelected}
                    onClick={() => setSelectedCaseKey(itemKey)}
                    type="button"
                  >
                    <span className="danger-marker">
                      <ShieldCheck size={13} />
                    </span>
                    <p>{normalizeCaseTitle(item.text)}</p>
                    <time>{item.date}</time>
                  </button>
                </li>
              );
            })}
          </ul>
          {selectedCaseDetail ? (
            <section className="case-detail" aria-live="polite">
              <div>
                <strong>{normalizeCaseTitle(selectedCase.text)}</strong>
                <span>{selectedCase.source || "KISA 보호나라"} · {selectedCase.date}</span>
              </div>
              <p>{selectedCaseDetail.summary}</p>
              <p>{selectedCaseDetail.impact}</p>
              <ul>
                {selectedCaseDetail.actions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
              <a href={selectedCase.sourceUrl || securityCaseSource.pageUrl || securityCaseSource.rssUrl}>
                원문 보기
                <ExternalLink size={13} />
              </a>
            </section>
          ) : null}
          <p className="source-note">업데이트 기준 {securityCaseSource.updatedAt}</p>
        </article>

        <article className="panel checklist-panel">
          <div className="panel-title-row">
            <h2>안전한 링크 확인 방법</h2>
            <Link to="/education">
              더보기
              <ChevronRight size={14} />
            </Link>
          </div>
          <ul className="safe-list">
            {safeChecklist.map((item) => (
              <li key={item}>
                <ShieldCheck size={16} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="panel type-panel">
          <div className="panel-title-row">
            <h2>한국형 스미싱 유형</h2>
            <Link to="/education">
              더보기
              <ChevronRight size={14} />
            </Link>
          </div>
          <div className="type-grid">
            {phishingTypes.map((item) => {
              const Icon = item.icon;
              return (
                <StatusPill icon={Icon} key={item.label} tone="blue">
                  {item.label}
                </StatusPill>
              );
            })}
          </div>
        </article>
      </div>

      <div className="home-footnote">
        <Info size={13} />
        분석 결과는 참고용이며, 개인정보 입력 전 공식 채널에서 다시 확인하세요.
      </div>
    </section>
  );
}

function dedupeSecurityCases(cases) {
  const seen = new Set();
  const dedupedCases = [];

  for (const item of cases) {
    const key = normalizeCaseTitle(item.text);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    dedupedCases.push(item);
  }

  return dedupedCases;
}

function getSecurityCaseKey(item) {
  return normalizeCaseTitle(item.text);
}

function normalizeCaseTitle(title) {
  return String(title || "")
    .replace(/[“”"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSecurityCaseDetail(item) {
  if (item.summary && item.impact && Array.isArray(item.actions)) {
    return {
      actions: item.actions,
      impact: item.impact,
      summary: item.summary,
    };
  }

  const title = normalizeCaseTitle(item.text);

  if (/여행|예약/.test(title)) {
    return {
      actions: ["예약 내역은 공식 앱이나 홈페이지에서 직접 확인", "문자 링크에서 로그인·결제정보 입력 중단", "이미 입력했다면 비밀번호 변경과 카드사 확인"],
      impact: "예약 정보나 결제 정보 입력을 요구하는 가짜 페이지로 이어질 수 있습니다.",
      summary: "여행 예약 플랫폼 해킹 이슈를 미끼로 예약 확인, 환불, 보상 안내처럼 보이는 문자를 보내는 유형입니다.",
    };
  }

  if (/유류비|주유|중동/.test(title)) {
    return {
      actions: ["지원금 안내는 정부·지자체 공식 채널에서 직접 확인", "인증번호와 계좌 비밀번호 입력 금지", "의심 문자는 118 상담이나 보호나라에서 확인"],
      impact: "지원금 신청 페이지처럼 보이게 만든 뒤 개인정보와 계좌 정보를 요구할 수 있습니다.",
      summary: "중동 사태와 유류비 부담을 악용해 주유 지원금, 환급, 보조금 신청처럼 꾸민 문자로 사용자를 속이는 유형입니다.",
    };
  }

  return {
    actions: ["공지 원문에서 영향 대상 확인", "링크·첨부파일 접근 전 공식 채널 검증", "의심 정황이 있으면 118 또는 보안 담당자에게 문의"],
    impact: "개인정보 유출, 악성 앱 설치, 계정 탈취 등으로 이어질 수 있습니다.",
    summary: "KISA 보호나라 보안공지에서 확인된 최신 보안 주의 항목입니다.",
  };
}
