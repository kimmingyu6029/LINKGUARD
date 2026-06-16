import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileImage,
  Info,
  Link2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import SectionHeader from "../components/SectionHeader.jsx";
import { useAccount } from "../lib/accountContext.jsx";
import { requestMyReports, submitUrlReport } from "../lib/linkRiskApi.js";

const REPORT_TYPES = [
  { label: "피싱", value: "phishing" },
  { label: "스미싱", value: "smishing" },
  { label: "가짜 쇼핑몰", value: "fake_shop" },
  { label: "계정 탈취", value: "account_takeover" },
  { label: "악성 앱 설치 유도", value: "malicious_app" },
  { label: "악성코드 다운로드", value: "malware_download" },
  { label: "투자 사기 / 리딩방", value: "investment_scam" },
  { label: "개인정보 입력 유도", value: "personal_info" },
  { label: "기타", value: "other" },
];

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const BLOCKED_EXTENSIONS = /\.(apk|exe|html|js|svg|zip)$/i;
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";

export default function ReportPage() {
  const location = useLocation();
  const { isAccountLoading, isLoggedIn, openAuthDialog } = useAccount();
  const initialReportUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("url") || "";
  }, [location.search]);
  const [form, setForm] = useState({
    description: "",
    privacyConfirmed: false,
    reportType: "phishing",
    url: initialReportUrl,
  });
  const [evidenceImage, setEvidenceImage] = useState(null);
  const [fileError, setFileError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [myReports, setMyReports] = useState([]);
  const [myReportsError, setMyReportsError] = useState("");
  const [isMyReportsLoading, setIsMyReportsLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef(null);
  const canSubmit = useMemo(
    () => form.url.trim() && form.description.trim() && form.reportType && form.privacyConfirmed && !fileError,
    [fileError, form],
  );

  useEffect(() => {
    setForm((current) => ({
      ...current,
      url: initialReportUrl,
    }));
  }, [initialReportUrl]);

  useEffect(() => {
    if (isAccountLoading) {
      return undefined;
    }

    if (!isLoggedIn) {
      setMyReports([]);
      setMyReportsError("");
      setIsMyReportsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    loadMyReports(controller.signal);
    return () => controller.abort();
  }, [isAccountLoading, isLoggedIn]);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !turnstileRef.current) {
      return undefined;
    }

    let widgetId = "";
    const scriptId = "cloudflare-turnstile-script";

    function renderTurnstile() {
      if (!window.turnstile || !turnstileRef.current || turnstileRef.current.dataset.rendered) {
        return;
      }

      widgetId = window.turnstile.render(turnstileRef.current, {
        callback: (token) => setTurnstileToken(token),
        "expired-callback": () => setTurnstileToken(""),
        sitekey: TURNSTILE_SITE_KEY,
        theme: "dark",
      });
      turnstileRef.current.dataset.rendered = "true";
    }

    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.async = true;
      script.defer = true;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.addEventListener("load", renderTurnstile);
      document.head.append(script);
    } else {
      renderTurnstile();
    }

    return () => {
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
    };
  }, []);

  function updateField(name, value) {
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
    setResult(null);
    setSubmitError("");
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0] || null;
    setEvidenceImage(null);
    setFileError("");

    if (!file) {
      return;
    }

    if (BLOCKED_EXTENSIONS.test(file.name) || !ALLOWED_IMAGE_TYPES.has(file.type)) {
      setFileError("스크린샷은 jpg, png, webp만 첨부할 수 있습니다.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFileError("스크린샷은 5MB 이하로 첨부해 주세요.");
      return;
    }

    setEvidenceImage(file);
  }

  async function loadMyReports(signal) {
    setIsMyReportsLoading(true);
    setMyReportsError("");

    try {
      const payload = await requestMyReports({ signal });
      setMyReports(Array.isArray(payload.reports) ? payload.reports : []);
    } catch (error) {
      if (error.name !== "AbortError") {
        setMyReportsError(error.message);
      }
    } finally {
      if (!signal?.aborted) {
        setIsMyReportsLoading(false);
      }
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canSubmit || isSubmitting) {
      return;
    }

    const controller = new AbortController();
    setIsSubmitting(true);
    setSubmitError("");
    setResult(null);

    try {
      const payload = await submitUrlReport({
        description: form.description,
        evidenceImage,
        privacyConfirmed: form.privacyConfirmed,
        reportType: form.reportType,
        signal: controller.signal,
        turnstileToken,
        url: form.url,
      });
      setResult(payload);
      setForm((current) => ({
        ...current,
        description: "",
        privacyConfirmed: false,
      }));
      setEvidenceImage(null);
      setTurnstileToken("");
      if (window.turnstile) {
        window.turnstile.reset();
      }
      if (isLoggedIn) {
        loadMyReports();
      }
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="report-page page-content">
      <SectionHeader eyebrow="사용자 신고 DB" title="악성 URL 신고하기" />

      <div className="report-layout">
        <form className="panel report-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>신고할 URL</span>
            <div className="input-with-icon">
              <Link2 size={17} />
              <input
                autoComplete="off"
                onChange={(event) => updateField("url", event.target.value)}
                placeholder="https://example.com"
                value={form.url}
              />
            </div>
          </label>

          <label className="form-field">
            <span>피해 유형</span>
            <select onChange={(event) => updateField("reportType", event.target.value)} value={form.reportType}>
              {REPORT_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>피해 내용 설명</span>
            <textarea
              maxLength={1200}
              onChange={(event) => updateField("description", event.target.value)}
              placeholder="개인정보, 계정, 카드번호, 인증번호 등 민감한 정보는 절대 입력하지 마세요."
              rows={7}
              value={form.description}
            />
          </label>

          <label className="file-picker">
            <FileImage size={18} />
            <span>{evidenceImage ? evidenceImage.name : "스크린샷 첨부 선택"}</span>
            <small>jpg, png, webp만 허용</small>
            <input accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} type="file" />
          </label>
          {fileError ? <p className="form-error">{fileError}</p> : null}

          <label className="privacy-check">
            <input
              checked={form.privacyConfirmed}
              onChange={(event) => updateField("privacyConfirmed", event.target.checked)}
              type="checkbox"
            />
            <span>신고 내용에 이름, 전화번호, 주민번호, 계정, 카드번호, 인증번호 등 개인정보를 입력하지 않겠습니다.</span>
          </label>

          {TURNSTILE_SITE_KEY ? (
            <div className="turnstile-box" ref={turnstileRef} />
          ) : (
            <p className="turnstile-note">운영 환경에서는 Cloudflare Turnstile 키를 설정해 자동 신고를 차단합니다.</p>
          )}

          {submitError ? <p className="form-error">{submitError}</p> : null}
          {result ? <ReportSuccess result={result} url={form.url} /> : null}

          <button className="report-submit" disabled={!canSubmit || isSubmitting} type="submit">
            <UploadCloud size={18} />
            <span>{isSubmitting ? "저장 중" : "신고 저장"}</span>
          </button>
        </form>

        <aside className="panel report-policy">
          <div className="report-policy-head">
            <ShieldAlert size={24} />
            <h2>신고 데이터 반영 원칙</h2>
          </div>
          <ul>
            <li>사용자 신고만으로는 즉시 MALICIOUS로 확정하지 않습니다.</li>
            <li>신고 이력은 community_score로 계산되어 최종 위험도에 약 10%만 반영됩니다.</li>
            <li>관리자 검토 후 confirmed_malicious가 된 URL은 강하게 반영됩니다.</li>
            <li>같은 IP의 반복 신고와 동일 URL 중복 신고는 제한됩니다.</li>
            <li>신고자 IP는 원본 저장 없이 해시 처리됩니다.</li>
          </ul>
          <div className="report-warning">
            <AlertTriangle size={18} />
            <p>관리자 검토 전에는 신고된 URL을 악성 확정으로 표시하지 않고, “사용자 신고 이력 있음”으로만 안내합니다.</p>
          </div>
          <div className="report-info">
            <Info size={18} />
            <p>분석 리포트에서는 신고 횟수, 최근 신고일, 주요 신고 유형, 관리자 검토 상태가 함께 표시됩니다.</p>
          </div>
        </aside>

        <MyReportsPanel
          error={myReportsError}
          isLoading={isMyReportsLoading}
          isLoggedIn={isLoggedIn}
          onLogin={() => openAuthDialog("login")}
          onRefresh={() => loadMyReports()}
          reports={myReports}
        />
      </div>
    </section>
  );
}

function MyReportsPanel({ error, isLoading, isLoggedIn, onLogin, onRefresh, reports }) {
  return (
    <section className="panel my-reports-panel">
      <div className="panel-title-row">
        <div>
          <h2>내 신고 내역</h2>
          <p className="my-reports-subtitle">제출한 URL과 작성한 신고 내용을 다시 확인할 수 있습니다.</p>
        </div>
        <button disabled={!isLoggedIn || isLoading} onClick={onRefresh} type="button">
          <RefreshCw className={isLoading ? "is-spinning" : ""} size={15} />
          <span>새로고침</span>
        </button>
      </div>

      {!isLoggedIn ? (
        <div className="my-reports-empty">
          <ShieldCheck size={22} />
          <p>로그인하면 계정으로 제출한 신고 내역을 확인할 수 있습니다.</p>
          <button onClick={onLogin} type="button">
            로그인
          </button>
        </div>
      ) : null}

      {isLoggedIn && error ? <p className="form-error">{error}</p> : null}

      {isLoggedIn && reports.length === 0 && !isLoading ? (
        <div className="my-reports-empty">
          <Clock3 size={22} />
          <p>아직 제출한 신고가 없습니다.</p>
        </div>
      ) : null}

      {isLoggedIn && reports.length > 0 ? (
        <div className="my-report-list">
          {reports.map((report) => (
            <MyReportCard key={report.eventId} report={report} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function MyReportCard({ report }) {
  const url = report.originalUrl || report.normalizedUrl;

  return (
    <article className={`my-report-card tone-${getStatusTone(report.status)}`}>
      <div className="my-report-head">
        <div>
          <span>{getReportTypeLabel(report.reportType)}</span>
          <strong>{url}</strong>
          <small>{formatReportDate(report.createdAt)}</small>
        </div>
        <span className={`review-status tone-${getStatusTone(report.status)}`}>{getStatusLabel(report.status)}</span>
      </div>

      <dl className="my-report-fields">
        <div>
          <dt>신고 URL</dt>
          <dd>
            <a href={report.normalizedUrl} rel="noreferrer" target="_blank">
              {report.normalizedUrl}
              <ExternalLink size={14} />
            </a>
          </dd>
        </div>
        <div>
          <dt>내가 작성한 내용</dt>
          <dd>{report.description}</dd>
        </div>
        <div>
          <dt>누적 신고</dt>
          <dd>
            {Number(report.reportCount || 0).toLocaleString("ko-KR")}건 · 신고자{" "}
            {Number(report.uniqueReporters || 0).toLocaleString("ko-KR")}명
          </dd>
        </div>
      </dl>

      {report.evidenceImageUrl ? (
        <a className="my-report-evidence" href={report.evidenceImageUrl} rel="noreferrer" target="_blank">
          <img alt="내 신고 첨부 이미지" src={report.evidenceImageUrl} />
        </a>
      ) : null}
    </article>
  );
}

function ReportSuccess({ result, url }) {
  const reportCount = result.communityReport?.reportCount || 1;

  return (
    <div className="report-success">
      <CheckCircle2 size={18} />
      <div>
        <strong>신고가 저장되었습니다.</strong>
        <p>현재 사용자 신고 이력은 {Number(reportCount).toLocaleString("ko-KR")}건입니다.</p>
        <Link to={`/analysis?url=${encodeURIComponent(url)}`}>이 URL 분석 리포트 보기</Link>
      </div>
    </div>
  );
}

function getReportTypeLabel(type) {
  return REPORT_TYPES.find((item) => item.value === type)?.label || "기타";
}

function getStatusLabel(status) {
  return {
    confirmed_malicious: "악성 확인",
    confirmed_suspicious: "의심 확인",
    expired: "만료",
    pending: "접수됨",
    rejected: "반려",
    under_review: "검토 중",
  }[status] || "접수됨";
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
