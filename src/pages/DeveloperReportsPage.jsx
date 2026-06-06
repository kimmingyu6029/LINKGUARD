import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileImage,
  RotateCcw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import SectionHeader from "../components/SectionHeader.jsx";
import { useAccount } from "../lib/accountContext.jsx";
import { requestAdminReports, updateAdminReportStatus } from "../lib/linkRiskApi.js";

const ACTIONS = [
  { action: "complete", icon: CheckCircle2, label: "분석 완료", tone: "danger" },
  { action: "hold", icon: Clock3, label: "보류", tone: "warn" },
  { action: "revert", icon: RotateCcw, label: "되돌리기", tone: "safe" },
];

export default function DeveloperReportsPage() {
  const { isAccountLoading, isDeveloper, isLoggedIn, openAuthDialog } = useAccount();
  const [reporters, setReporters] = useState([]);
  const [selectedReporterKey, setSelectedReporterKey] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const selectedReporter = useMemo(
    () => reporters.find((reporter) => reporter.reporterKey === selectedReporterKey) || reporters[0] || null,
    [reporters, selectedReporterKey],
  );

  useEffect(() => {
    if (!selectedReporterKey && reporters.length > 0) {
      setSelectedReporterKey(reporters[0].reporterKey);
    }
  }, [reporters, selectedReporterKey]);

  useEffect(() => {
    if (!isDeveloper) {
      return undefined;
    }

    const controller = new AbortController();
    loadReports(controller.signal);
    return () => controller.abort();
  }, [isDeveloper]);

  async function loadReports(signal) {
    setIsLoading(true);
    setError("");

    try {
      const payload = await requestAdminReports({ signal });
      setReporters(Array.isArray(payload.reporters) ? payload.reporters : []);
    } catch (nextError) {
      if (nextError.name !== "AbortError") {
        setError(nextError.message);
      }
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }

  async function handleStatusUpdate(report, action) {
    setUpdatingId(`${report.reportedUrlId}:${action}`);
    setError("");

    try {
      const payload = await updateAdminReportStatus({
        action,
        reportedUrlId: report.reportedUrlId,
      });
      setReporters((current) =>
        current.map((reporter) => ({
          ...reporter,
          reports: reporter.reports.map((item) =>
            item.reportedUrlId === report.reportedUrlId
              ? {
                  ...item,
                  confidenceScore: payload.communityReport?.confidenceScore ?? item.confidenceScore,
                  status: payload.communityReport?.status || item.status,
                  updatedAt: payload.communityReport?.lastReportedAt || item.updatedAt,
                }
              : item,
          ),
        })),
      );
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setUpdatingId("");
    }
  }

  if (isAccountLoading) {
    return (
      <section className="developer-reports-page page-content">
        <SectionHeader eyebrow="개발자 전용" title="신고 내역" />
        <div className="panel developer-empty">계정 정보를 확인하는 중입니다.</div>
      </section>
    );
  }

  if (!isLoggedIn) {
    return (
      <section className="developer-reports-page page-content">
        <SectionHeader eyebrow="개발자 전용" title="신고 내역" />
        <div className="panel developer-empty">
          <ShieldCheck size={24} />
          <p>개발자 계정으로 로그인하면 신고 내역을 확인할 수 있습니다.</p>
          <button onClick={() => openAuthDialog("login")} type="button">
            로그인
          </button>
        </div>
      </section>
    );
  }

  if (!isDeveloper) {
    return (
      <section className="developer-reports-page page-content">
        <SectionHeader eyebrow="개발자 전용" title="신고 내역" />
        <div className="panel developer-empty">
          <AlertTriangle size={24} />
          <p>일반 사용자 계정에서는 신고 내역 칸을 사용할 수 없습니다.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="developer-reports-page page-content is-wide">
      <SectionHeader eyebrow="개발자 전용" title="사용자 신고 내역" />

      <div className="developer-report-layout">
        <aside className="panel reporter-list-panel">
          <div className="panel-title-row">
            <h2>신고자 아이디</h2>
            <span className="api-status tone-blue">{isLoading ? "불러오는 중" : `${reporters.length}명`}</span>
          </div>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="reporter-list">
            {reporters.length > 0 ? (
              reporters.map((reporter) => (
                <button
                  className={reporter.reporterKey === selectedReporter?.reporterKey ? "is-selected" : ""}
                  key={reporter.reporterKey}
                  onClick={() => setSelectedReporterKey(reporter.reporterKey)}
                  type="button"
                >
                  <UserRound size={17} />
                  <span>{reporter.reporterLabel}</span>
                  <small>{reporter.reportCount}건</small>
                </button>
              ))
            ) : (
              <p className="developer-empty-copy">아직 접수된 신고가 없습니다.</p>
            )}
          </div>
        </aside>

        <article className="panel reporter-detail-panel">
          {selectedReporter ? (
            <>
              <div className="panel-title-row">
                <div>
                  <h2>{selectedReporter.reporterLabel}</h2>
                  <p className="developer-subtitle">최근 신고 {formatReportDate(selectedReporter.latestReportAt)}</p>
                </div>
                <span className="api-status tone-blue">{selectedReporter.reports.length}건</span>
              </div>

              <div className="developer-report-cards">
                {selectedReporter.reports.map((report) => (
                  <ReportReviewCard
                    key={report.eventId}
                    onStatusUpdate={handleStatusUpdate}
                    report={report}
                    updatingId={updatingId}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="developer-empty-copy">왼쪽에서 신고자 아이디를 선택해 주세요.</div>
          )}
        </article>
      </div>
    </section>
  );
}

function ReportReviewCard({ onStatusUpdate, report, updatingId }) {
  return (
    <section className={`developer-report-card tone-${getStatusTone(report.status)}`}>
      <div className="developer-report-head">
        <div>
          <span>{getReportTypeLabel(report.reportType)}</span>
          <strong>{report.originalUrl || report.normalizedUrl}</strong>
          <p>{report.domain}</p>
        </div>
        <span className={`review-status tone-${getStatusTone(report.status)}`}>{getStatusLabel(report.status)}</span>
      </div>

      <div className="developer-report-fields">
        <div>
          <span>URL</span>
          <a href={report.normalizedUrl} rel="noreferrer" target="_blank">
            {report.normalizedUrl}
            <ExternalLink size={14} />
          </a>
        </div>
        <div>
          <span>피해 유형</span>
          <strong>{getReportTypeLabel(report.reportType)}</strong>
        </div>
        <div>
          <span>신고일</span>
          <strong>{formatReportDate(report.createdAt)}</strong>
        </div>
        <div>
          <span>피해 내용 설명</span>
          <p>{report.description}</p>
        </div>
      </div>

      <div className="evidence-preview">
        <div className="subsection-title">
          <FileImage size={16} />
          <h3>스크린샷 첨부 사진</h3>
        </div>
        {report.evidenceImageUrl ? (
          <a href={report.evidenceImageUrl} rel="noreferrer" target="_blank">
            <img alt="신고 첨부 스크린샷" src={report.evidenceImageUrl} />
          </a>
        ) : (
          <p>첨부된 스크린샷이 없습니다.</p>
        )}
      </div>

      <div className="review-action-row">
        {ACTIONS.map((item) => {
          const Icon = item.icon;
          const isUpdating = updatingId === `${report.reportedUrlId}:${item.action}`;

          return (
            <button
              className={`tone-${item.tone}`}
              disabled={Boolean(updatingId)}
              key={item.action}
              onClick={() => onStatusUpdate(report, item.action)}
              type="button"
            >
              <Icon size={16} />
              <span>{isUpdating ? "저장 중" : item.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
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

function getStatusLabel(status) {
  return {
    confirmed_malicious: "분석 완료",
    confirmed_suspicious: "의심 확인",
    expired: "만료",
    pending: "접수",
    rejected: "되돌림",
    under_review: "보류",
  }[status] || "접수";
}

function getStatusTone(status) {
  if (status === "confirmed_malicious") {
    return "danger";
  }

  if (status === "rejected") {
    return "safe";
  }

  return "warn";
}

function formatReportDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("ko-KR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
