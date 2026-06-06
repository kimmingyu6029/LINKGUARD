export async function requestUrlAnalysis({ mode, signal, url }) {
  const response = await fetch("/api/analyze-url", {
    body: JSON.stringify({ mode, url }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `분석 서버 응답 오류: ${response.status}`);
  }

  return response.json();
}

export async function submitUrlReport({ description, evidenceImage, privacyConfirmed, reportType, signal, turnstileToken, url }) {
  const formData = new FormData();
  formData.set("url", url);
  formData.set("reportType", reportType);
  formData.set("description", description);
  formData.set("privacyConfirmed", privacyConfirmed ? "true" : "false");

  if (turnstileToken) {
    formData.set("turnstileToken", turnstileToken);
  }

  if (evidenceImage) {
    formData.set("evidenceImage", evidenceImage);
  }

  const response = await fetch("/api/report-url", {
    body: formData,
    method: "POST",
    signal,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.error || `신고 저장 실패: ${response.status}`);
  }

  return payload;
}

export async function requestAdminReports({ signal } = {}) {
  const response = await fetch("/api/admin/reports", {
    credentials: "same-origin",
    method: "GET",
    signal,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.error || `신고 내역 조회 실패: ${response.status}`);
  }

  return payload;
}

export async function updateAdminReportStatus({ action, reportedUrlId, signal }) {
  const response = await fetch("/api/admin/reports", {
    body: JSON.stringify({ action, reportedUrlId }),
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.error || `신고 상태 변경 실패: ${response.status}`);
  }

  return payload;
}
