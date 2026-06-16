export function composeUrlVerdict({ aiRisk = null, analysis, communityReport = null, contentResult = null, reputation }) {
  let result = attachReputation(analysis, reputation);

  if (["blocked", "idle", "invalid"].includes(result.verdict)) {
    return result;
  }

  if (communityReport) {
    result = attachCommunityReport(result, communityReport);
  }

  if (contentResult) {
    result = attachContentAnalysis(result, contentResult);
  }

  if (aiRisk) {
    result = attachAiRiskSignal(result, aiRisk);
  }

  return synthesizeFinalVerdict(result);
}

function attachReputation(analysis, reputation) {
  const result = structuredClone(analysis);
  reputation = normalizeReputationForVerdict(reputation);
  result.mode = analysis.mode;
  result.reputation = reputation;
  result.signals = [
    {
      key: "reputation",
      label: `${reputation.provider || "평판 DB"} 평판`,
      tone: reputation.tone,
      value: reputation.status === "match" ? "위협" : reputation.status === "clean" ? "미탐지" : "검토 필요",
    },
    ...result.signals,
  ];

  if (reputation.status !== "match") {
    if (reputation.status === "suspicious") {
      const isLowSeverity = reputation.severity === "low";
      const suspicionScore = isLowSeverity ? 40 : 60;
      const engineSummary = reputation.engines?.length
        ? ` 주요 근거: ${reputation.engines
            .slice(0, 2)
            .map((engine) => `${engine.engineName}${engine.result ? ` (${engine.result})` : ""}`)
            .join(", ")}.`
        : "";
      result.caption = isLowSeverity ? "낮은 평판 신호" : "의심 평판";
      result.evidence = [
        {
          detail: reputation.detail,
          label: `${reputation.provider || "평판 DB"} 의심 결과`,
          points: suspicionScore,
        },
        ...result.evidence,
      ];
      result.explanation = isLowSeverity
        ? `${result.displayHost}은(는) ${reputation.provider || "평판 DB"}에서 낮은 비율의 탐지만 확인되었습니다.${engineSummary} 확정 악성으로 보기는 어렵지만, 개인정보 입력 전에는 공식 채널과 최신 결과를 함께 확인하세요.`
        : `${result.displayHost}은(는) ${reputation.provider || "평판 DB"}에서 의심 URL로 표시되었습니다.${engineSummary} 공식 채널로 확인하기 전까지 개인정보 입력이나 파일 다운로드를 피하세요.`;
      result.recommendations = isLowSeverity
        ? [
            "주소창의 도메인이 예상한 공식 주소인지 다시 확인하세요.",
            "로그인, 결제, 개인정보 입력 전에는 공식 앱이나 직접 입력한 주소를 사용하세요.",
            "평판 결과가 오래됐거나 단일 엔진 탐지라면 잠시 후 다시 검사해 최신 결과를 확인하세요.",
          ]
        : [
            "계정 정보, 인증번호, 결제 정보를 입력하기 전에 멈추세요.",
            "공식 주소를 직접 입력해 사이트를 여세요.",
            "이미 정보를 입력했다면 비밀번호를 바꾸고 계정 활동을 확인하세요.",
          ];
      result.score = Math.max(result.score, suspicionScore);
      result.scoreLabel = isLowSeverity ? "낮은 평판 신호" : "의심 평판 일치";
      result.statusLabel = isLowSeverity ? "낮은 위험" : "검토 필요";
      result.tone = "warn";
      result.verdict = "suspicious";
    }

    return result;
  }

  const detail = reputation.detail || `${reputation.provider || "평판 DB"}에서 이 URL을 위험한 주소로 확인했습니다.`;
  const engineSummary = reputation.engines?.length
    ? ` 주요 근거: ${reputation.engines
        .slice(0, 2)
        .map((engine) => `${engine.engineName}${engine.result ? ` (${engine.result})` : ""}`)
        .join(", ")}.`
    : "";
  result.caption = "평판 일치";
  result.evidence = [
    {
      detail,
      label: `${reputation.provider || "평판 DB"} 위협 일치`,
      points: 100,
    },
    ...result.evidence,
  ];
  result.explanation = `${result.displayHost}은(는) ${reputation.provider || "평판 DB"}에서 위험한 URL로 확인되었습니다.${engineSummary} URL 구조 점수가 낮아 보여도 링크를 열지 않는 것이 안전합니다.`;
  result.recommendations = [
    "링크를 열지 말고 메시지를 삭제하거나 차단하세요.",
    "이미 열었다면 비밀번호를 변경하고 의심스러운 계정 활동을 확인하세요.",
    "계정, 카드, 인증 정보를 입력했다면 관련 기관에 신고하세요.",
    "브라우저에 공식 주소를 직접 입력해서만 접속하세요.",
  ];
  result.score = 100;
  result.scoreLabel = "확인된 평판 위협";
  result.statusLabel = "위협";
  result.tone = "danger";
  result.verdict = "malicious";

  return result;
}

function normalizeReputationForVerdict(reputation) {
  if (!isWeakVirusTotalMatch(reputation)) {
    return reputation;
  }

  const stats = readReputationStats(reputation);
  const totalLabel = stats.total || "여러";
  const ageText =
    Number.isFinite(Number(reputation.ageDays)) && Number(reputation.ageDays) >= 180
      ? ` 마지막 분석이 ${Number(reputation.ageDays).toLocaleString("ko-KR")}일 전이라 최신성이 낮습니다.`
      : "";

  return {
    ...reputation,
    detail: `VirusTotal에서 ${totalLabel}개 엔진 중 ${stats.malicious}개만 악성으로 분류했고 의심 엔진은 ${stats.suspicious}개였습니다. 단일 엔진 또는 낮은 비율의 탐지는 확정 악성이 아니라 주의 신호로만 반영합니다.${ageText}`,
    label: "VirusTotal 단일 엔진 탐지",
    severity: "low",
    status: "suspicious",
    tone: "warn",
  };
}

function isWeakVirusTotalMatch(reputation) {
  if (reputation?.provider !== "VirusTotal" || reputation.status !== "match") {
    return false;
  }

  const stats = readReputationStats(reputation);
  const malicious = Number(stats.malicious || 0);
  const suspicious = Number(stats.suspicious || 0);
  const total = Number(stats.total || 0);
  const flagged = malicious + suspicious;
  const maliciousRatio = total > 0 ? malicious / total : malicious > 0 ? 1 : 0;

  return malicious > 0 && malicious <= 1 && flagged <= 2 && total >= 20 && maliciousRatio < 0.05;
}

function readReputationStats(reputation) {
  const stats = reputation?.stats || reputation?.matches?.find((item) => typeof item === "object" && "malicious" in item) || {};

  return {
    harmless: Number(stats.harmless || 0),
    malicious: Number(stats.malicious || 0),
    suspicious: Number(stats.suspicious || 0),
    timeout: Number(stats.timeout || 0),
    total: Number(stats.total || 0),
    undetected: Number(stats.undetected || 0),
  };
}

function attachCommunityReport(analysis, communityReport) {
  const result = structuredClone(analysis);
  const hasReports = Boolean(communityReport?.hasReports);
  const score = scoreCommunityReport(communityReport);
  const status = communityReport?.status || "none";
  const isActiveReport = hasReports && !["rejected", "expired"].includes(status);
  const tone = status === "confirmed_malicious" ? "danger" : isActiveReport ? "warn" : "safe";

  result.communityReport = {
    ...communityReport,
    score,
  };
  result.signals = [
    {
      key: "community",
      label: "사용자 신고",
      tone,
      value: isActiveReport
        ? `${Number(communityReport.reportCount || 0).toLocaleString("ko-KR")}건`
        : status === "rejected"
          ? "반려됨"
          : "없음",
    },
    ...result.signals,
  ];

  if (isActiveReport) {
    result.evidence = [
      {
        detail:
          status === "confirmed_malicious"
            ? "관리자 검토에서 악성 URL로 확인된 자체 신고 이력이 있습니다."
            : "사용자 신고 이력이 있어 community_report_score로 위험도에 제한적으로 반영했습니다.",
        label: "사용자 신고 이력",
        points: status === "confirmed_malicious" ? 95 : Math.max(15, score),
      },
      ...result.evidence,
    ];
  }

  return result;
}

function attachContentAnalysis(analysis, contentResult) {
  const result = structuredClone(analysis);
  result.contentAnalysis = contentResult;
  result.signals = [
    {
      key: "content",
      label: "웹페이지 콘텐츠",
      tone:
        contentResult.status === "complete"
          ? contentResult.score >= 61
            ? "danger"
            : contentResult.score >= 41
              ? "warn"
              : "safe"
          : "warn",
      value:
        contentResult.status === "complete"
          ? contentResult.hasPasswordInput
            ? "비밀번호 폼"
            : contentResult.hasLoginForm
              ? "로그인 폼"
              : contentResult.score > 0
                ? "위험 신호"
                : "확인 완료"
          : "분석 제한",
    },
    ...result.signals,
  ];

  if (contentResult.evidence?.length) {
    result.evidence = [
      ...contentResult.evidence.map((item) => ({
        detail: item.detail,
        label: item.label,
        points: item.points,
      })),
      ...result.evidence,
    ];
  } else if (false && contentResult.status !== "complete") {
    result.evidence = [
      {
        detail: contentResult.detail || "웹페이지 콘텐츠를 완전히 분석하지 못했습니다.",
        label: "콘텐츠 분석 제한",
        points: 20,
      },
      ...result.evidence,
    ];
  }

  return result;
}

function attachAiRiskSignal(analysis, aiRisk) {
  const result = structuredClone(analysis);
  result.aiRisk = aiRisk;
  result.signals = [
    {
      key: "aiRisk",
      label: "AI 위험 판단",
      tone: aiRisk.tone,
      value: aiRisk.status === "malicious" ? "위협" : aiRisk.status === "safe" ? "낮은 위험" : "검토 필요",
    },
    ...result.signals,
  ];

  if (["malicious", "suspicious"].includes(aiRisk.status)) {
    result.evidence = [buildAiRiskEvidence(aiRisk, aiRisk.status === "malicious" ? 90 : 65), ...result.evidence];
  }

  return result;
}

function synthesizeFinalVerdict(analysis) {
  const result = structuredClone(analysis);
  const componentScores = buildComponentScores(result);
  const forcedReasons = [];
  let weightedScore =
    componentScores.local * 0.2 +
    componentScores.redirect * 0.1 +
    componentScores.reputation * 0.25 +
    componentScores.content * 0.25 +
    componentScores.community * 0.1 +
    componentScores.ai * 0.1;

  if (result.reputation?.status === "match") {
    weightedScore = Math.max(weightedScore, 100);
    forcedReasons.push("외부 평판 데이터에서 알려진 악성 URL로 확인되었습니다.");
  }

  if (result.communityReport?.status === "confirmed_malicious") {
    weightedScore = Math.max(weightedScore, 85);
    forcedReasons.push("관리자 검토에서 악성으로 확인된 사용자 신고 DB 이력이 있습니다.");
  } else if (result.communityReport?.status === "confirmed_suspicious") {
    weightedScore = Math.max(weightedScore, 58);
    forcedReasons.push("관리자 검토에서 의심 URL로 확인된 사용자 신고 DB 이력이 있습니다.");
  }

  if (result.contentAnalysis?.hasPasswordInput && result.contentAnalysis?.brandDomainMismatch) {
    weightedScore = Math.max(weightedScore, 75);
    forcedReasons.push("브랜드 도메인이 일치하지 않는 페이지에서 비밀번호 입력창이 발견되었습니다.");
  }

  if (hasShortenerSignal(result) && result.contentAnalysis?.hasLoginForm) {
    weightedScore = Math.max(weightedScore, 65);
    forcedReasons.push("단축 URL이 로그인 페이지로 연결됩니다.");
  }

  if (hasExecutableDownload(result.contentAnalysis) && hasSuspiciousDomainSignal(result)) {
    weightedScore = Math.max(weightedScore, 75);
    forcedReasons.push("의심스러운 도메인에서 실행 파일 다운로드를 유도합니다.");
  }

  if (hasHttpsDowngrade(result.redirectTrace)) {
    weightedScore = Math.min(100, weightedScore + 20);
    forcedReasons.push("리다이렉트 과정에서 HTTPS가 HTTP로 낮아졌습니다.");
  }

  if (componentScores.local >= 80 && weightedScore < 61) {
    weightedScore = Math.max(weightedScore, 61);
    forcedReasons.push("외부 확인이 충분하지 않아도 URL 자체에서 강한 위험 신호가 발견되었습니다.");
  } else if (componentScores.local >= 60 && weightedScore < 41) {
    weightedScore = Math.max(weightedScore, 41);
    forcedReasons.push("URL 구조에서 검토가 필요한 위험 신호가 발견되었습니다.");
  }

  const finalScore = Math.round(clampNumber(weightedScore, 0, 100));
  const verdictLabel = scoreToVerdictLabel(finalScore);
  const confidence = buildConfidence(result);
  const synthesisReasons = [
    ...forcedReasons,
    ...result.evidence
      .slice()
      .sort((left, right) => Number(right.points || 0) - Number(left.points || 0))
      .slice(0, 5)
      .map((item) => translateAnalysisReason(item.detail || item.label))
      .filter(Boolean),
  ].slice(0, 6);

  result.componentScores = componentScores;
  result.finalWeightedScore = finalScore;
  result.verdictLabel = verdictLabel;
  result.verdictLabelKo = verdictLabelToKorean(verdictLabel);
  result.confidence = confidence.level;
  result.confidenceLabel = confidence.label;
  result.confidenceReasons = confidence.reasons;
  result.synthesisReasons = synthesisReasons;
  result.score = finalScore;
  result.statusLabel = verdictLabelToKorean(verdictLabel);
  result.scoreLabel = `${verdictLabelToKorean(verdictLabel)} (${finalScore}/100)`;
  result.tone = verdictLabelToTone(verdictLabel);
  result.verdict = verdictLabelToLegacyVerdict(verdictLabel);
  result.caption = confidence.level === "low" ? "분석 제한" : "최종 판정";
  result.explanation = buildFinalExplanation(result, synthesisReasons);
  result.recommendations = buildFinalRecommendations(verdictLabel, confidence.level);

  return result;
}

function buildComponentScores(result) {
  return {
    ai: scoreAiRisk(result.aiRisk),
    community: scoreCommunityReport(result.communityReport),
    content: scoreContent(result.contentAnalysis),
    local: clampNumber(Number(result.score || 0), 0, 100),
    redirect: scoreRedirect(result.redirectTrace),
    reputation: scoreReputation(result.reputation),
  };
}

function scoreCommunityReport(communityReport) {
  if (!communityReport?.hasReports || ["rejected", "expired", "none"].includes(communityReport.status)) {
    return 0;
  }

  if (communityReport.status === "confirmed_malicious") {
    return 100;
  }

  if (communityReport.status === "confirmed_suspicious") {
    return 78;
  }

  return clampNumber(Number(communityReport.score || communityReport.confidenceScore || 0), 0, 72);
}

function scoreReputation(reputation) {
  if (!reputation) {
    return 20;
  }

  if (reputation.status === "match") {
    return 100;
  }

  if (reputation.status === "suspicious") {
    if (reputation.severity === "low") {
      return 55;
    }

    return 70;
  }

  if (["error", "not_found", "submitted"].includes(reputation.status)) {
    return 25;
  }

  return 0;
}

function scoreRedirect(redirectTrace) {
  if (!redirectTrace || redirectTrace.status === "skipped" || redirectTrace.status === "not_checked") {
    return 0;
  }

  let score = 0;
  const hops = redirectTrace.hops || [];
  const uniqueDomains = new Set(hops.flatMap((hop) => [domainOf(hop.sourceHost), domainOf(hop.targetHost)].filter(Boolean)));

  if (redirectTrace.status !== "complete") {
    score += 25;
  }

  if (redirectTrace.hopCount >= 3) {
    score += 25;
  } else if (redirectTrace.hopCount > 0) {
    score += 10;
  }

  if (uniqueDomains.size >= 3) {
    score += 25;
  }

  if (hasHttpsDowngrade(redirectTrace)) {
    score += 35;
  }

  return clampNumber(score, 0, 100);
}

function scoreContent(contentAnalysis) {
  if (!contentAnalysis) {
    return 0;
  }

  if (contentAnalysis.status === "blocked") {
    return 100;
  }

  if (contentAnalysis.status !== "complete") {
    return 0;
  }

  return clampNumber(Number(contentAnalysis.score || 0), 0, 100);
}

function scoreAiRisk(aiRisk) {
  if (!aiRisk || ["skipped", "error"].includes(aiRisk.status)) {
    return 0;
  }

  if (aiRisk.status === "malicious") {
    return Math.round(90 * clampNumber(Number(aiRisk.confidence || 0), 0, 1));
  }

  if (aiRisk.status === "suspicious" || aiRisk.status === "unknown") {
    return Math.round(65 * Math.max(0.5, clampNumber(Number(aiRisk.confidence || 0), 0, 1)));
  }

  return 0;
}

function buildConfidence(result) {
  const reasons = [];
  let score = 0;

  if (result.reputation && !["skipped", "error", "not_found"].includes(result.reputation.status)) {
    score += 25;
    reasons.push("외부 평판 데이터를 확인했습니다.");
  }

  if (result.communityReport?.hasReports) {
    score += 5;
    reasons.push("자체 사용자 신고 DB 이력을 확인했습니다.");
  }

  if (result.redirectTrace?.status === "complete") {
    score += 20;
    reasons.push("리다이렉트 추적이 완료되었습니다.");
  }

  if (result.contentAnalysis?.status === "complete") {
    score += 30;
    reasons.push("웹페이지 콘텐츠 분석이 완료되었습니다.");
  }

  if (result.evidence?.length > 0) {
    score += 15;
    reasons.push("위험 근거를 추출했습니다.");
  }

  if (result.aiRisk && !["skipped", "error"].includes(result.aiRisk.status)) {
    score += 10;
    reasons.push("AI 보조 해석을 사용할 수 있습니다.");
  }

  if (score >= 70 && result.contentAnalysis?.status === "complete") {
    return { label: "높음", level: "high", reasons };
  }

  if (score >= 40) {
    return { label: "중간", level: "medium", reasons };
  }

  return { label: "낮음", level: "low", reasons: reasons.length ? reasons : ["Only limited URL-level analysis was available."] };
}

function translateAnalysisReason(reason) {
  const text = String(reason || "");

  if (!text) {
    return "";
  }

  const brandMismatch = text.match(/^The page references (.+) outside the official domain\.$/);
  if (brandMismatch) {
    return `페이지에 ${brandMismatch[1]} 관련 문구가 있지만 공식 도메인과 일치하지 않습니다.`;
  }

  const suspiciousJs = text.match(/^Detected (.+)\.$/);
  if (suspiciousJs) {
    return `의심스러운 JavaScript 패턴이 발견되었습니다: ${suspiciousJs[1]}.`;
  }

  const sensitivePrompt = text.match(/^The page asks for (.+)\.$/);
  if (sensitivePrompt) {
    return `페이지가 민감 정보 입력을 요구합니다: ${sensitivePrompt[1]}.`;
  }

  const dictionary = new Map([
    ["The page contains a password input field.", "페이지에 비밀번호 입력창이 있습니다."],
    ["The page appears to ask the visitor to sign in.", "페이지가 사용자에게 로그인을 요구하는 것으로 보입니다."],
    ["A form submits data to a different registrable domain.", "입력 폼이 현재 사이트와 다른 도메인으로 전송됩니다."],
    ["The page links to an executable or installable file.", "실행 파일 또는 설치 파일 다운로드 링크가 있습니다."],
    ["The page contains downloadable file links.", "페이지에 다운로드 링크가 포함되어 있습니다."],
    ["The page loads many external scripts.", "페이지가 많은 외부 스크립트를 불러옵니다."],
    ["Content analysis found page-level risk signals.", "웹페이지 콘텐츠에서 위험 신호가 발견되었습니다."],
    ["Content analysis completed without major page-level risk signals.", "웹페이지 콘텐츠 분석에서 큰 위험 신호는 발견되지 않았습니다."],
    ["Webpage content could not be fully analyzed.", "웹페이지 콘텐츠를 완전히 분석하지 못했습니다."],
    ["Content analysis was limited because the response did not look like an HTML webpage.", "응답이 HTML 웹페이지로 보이지 않아 콘텐츠 분석이 제한되었습니다."],
    ["Content analysis stopped because the final URL returned another redirect.", "최종 URL에서 추가 리다이렉트가 발생해 콘텐츠 분석을 중단했습니다."],
    ["Redirect tracing completed without following another URL.", "추가 이동 없이 리다이렉트 추적이 완료되었습니다."],
    ["Login lure on an unofficial host.", "공식 도메인이 아닌 곳에서 로그인 유도 신호가 발견되었습니다."],
    ["The host combines login and security lures on an unofficial domain.", "공식 도메인이 아닌 곳에서 로그인과 보안 관련 유도 문구가 함께 발견되었습니다."],
  ]);

  return dictionary.get(text) || text;
}

function buildFinalExplanation(result, reasons) {
  const host = result.redirectTrace?.finalHost || result.displayHost || "이 URL";
  const summary =
    result.verdictLabel === "MALICIOUS" || result.verdictLabel === "HIGH_RISK"
      ? `${host}에서 URL 구조, 외부 평판, 리다이렉트 또는 웹페이지 콘텐츠와 관련된 높은 위험 신호가 여러 개 확인되었습니다.`
      : result.verdictLabel === "SUSPICIOUS"
        ? `${host}에서 하나 이상의 위험 신호가 발견되어 주의가 필요합니다.`
        : result.verdictLabel === "LOW_RISK"
          ? `${host}에서 일부 낮은 수준의 위험 신호가 확인되었습니다. 평판 정보가 없거나 콘텐츠 분석이 제한된 경우에는 추가 확인이 필요할 수 있습니다.`
          : `${host}은(는) 완료된 검사에서 주요 위험 신호가 확인되지 않았습니다.`;
  const reasonText = reasons.length ? ` 주요 근거: ${reasons.slice(0, 3).map(translateAnalysisReason).join(" ")}` : "";
  const confidenceText =
    result.confidence === "low" ? " 분석 신뢰도가 낮으므로 이 결과를 안전하다는 증거로 단정하면 안 됩니다." : "";

  return `${summary}${reasonText}${confidenceText}`;
}

function buildFinalRecommendations(verdictLabel, confidenceLevel) {
  if (verdictLabel === "MALICIOUS" || verdictLabel === "HIGH_RISK") {
    return [
      "개인정보, 비밀번호, 인증번호, 결제 정보를 입력하지 마세요.",
      "메시지를 삭제하거나 브라우저에 공식 사이트 주소를 직접 입력해 확인하세요.",
      "이미 정보를 입력했다면 비밀번호를 변경하고 2단계 인증을 설정하세요.",
      "해당 서비스나 보안 담당자에게 링크를 신고하세요.",
    ];
  }

  if (verdictLabel === "SUSPICIOUS" || confidenceLevel === "low") {
    return [
      "링크를 열기 전에 멈추고 공식 채널에서 도메인을 확인하세요.",
      "이 페이지에서 파일을 다운로드하거나 앱을 설치하지 마세요.",
      "사이트가 확인될 때까지 계정 정보나 결제 정보를 입력하지 마세요.",
    ];
  }

  return [
    "개인정보를 입력하기 전에 주소창을 다시 확인하세요.",
    "로그인과 결제는 공식 앱이나 직접 입력한 공식 도메인에서 진행하세요.",
    "알려진 위협이 없어도 갑자기 받은 메시지 링크는 조심해서 다루세요.",
  ];
}

function scoreToVerdictLabel(score) {
  if (score >= 81) {
    return "MALICIOUS";
  }

  if (score >= 61) {
    return "HIGH_RISK";
  }

  if (score >= 41) {
    return "SUSPICIOUS";
  }

  if (score >= 21) {
    return "LOW_RISK";
  }

  return "SAFE";
}

function verdictLabelToKorean(label) {
  return {
    HIGH_RISK: "높은 위험",
    LOW_RISK: "낮은 위험",
    MALICIOUS: "악성",
    SAFE: "안전",
    SUSPICIOUS: "의심",
  }[label] || "의심";
}

function verdictLabelToTone(label) {
  if (label === "MALICIOUS" || label === "HIGH_RISK") {
    return "danger";
  }

  if (label === "SUSPICIOUS" || label === "LOW_RISK") {
    return "warn";
  }

  return "safe";
}

function verdictLabelToLegacyVerdict(label) {
  if (label === "MALICIOUS" || label === "HIGH_RISK") {
    return "malicious";
  }

  if (label === "SUSPICIOUS" || label === "LOW_RISK") {
    return "suspicious";
  }

  return "safe";
}

function hasShortenerSignal(result) {
  return (result.signals || []).some(
    (signal) => {
      if (signal.key !== "shortener") {
        return false;
      }

      const value = String(signal.value || "").trim().toLowerCase();
      return signal.tone !== "safe" && !["", "none", "no", "not used"].includes(value);
    },
  );
}

function hasSuspiciousDomainSignal(result) {
  return (result.signals || []).some(
    (signal) => signal.key === "domain" && ["danger", "warn"].includes(signal.tone),
  );
}

function hasExecutableDownload(contentAnalysis) {
  return (contentAnalysis?.downloadLinks || []).some((link) => /\.(apk|exe|msi|bat|cmd|scr|vbs|js|zip)(?:[?#]|$)/i.test(link));
}

function hasHttpsDowngrade(redirectTrace) {
  return (redirectTrace?.hops || []).some(
    (hop) => String(hop.sourceUrl || "").startsWith("https://") && String(hop.targetUrl || "").startsWith("http://"),
  );
}

function domainOf(hostname) {
  const labels = String(hostname || "").toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);
  return labels.length <= 2 ? labels.join(".") : labels.slice(-2).join(".");
}

function applyAiRiskJudgment(analysis, aiRisk) {
  const result = structuredClone(analysis);
  result.aiRisk = aiRisk;
  result.signals = [
    {
      key: "aiRisk",
      label: "AI 위험 판단",
      tone: aiRisk.tone,
      value: aiRisk.status === "malicious" ? "위협" : aiRisk.status === "safe" ? "낮은 위험" : "검토 필요",
    },
    ...result.signals,
  ];

  if (aiRisk.status === "malicious" && aiRisk.confidence >= 0.7) {
    result.caption = "AI 위험 판단";
    result.evidence = [buildAiRiskEvidence(aiRisk, 90), ...result.evidence];
    result.explanation = buildAiRiskExplanation(result, aiRisk);
    result.recommendations = buildAiRiskRecommendations(aiRisk, [
      "공식 채널로 확인하기 전까지 링크를 열지 마세요.",
      "계정 정보, 결제 정보, 인증번호를 입력하지 마세요.",
      "의심스러운 링크를 관련 보안팀이나 고객센터에 신고하세요.",
    ]);
    result.score = Math.max(result.score, 90);
    result.scoreLabel = "AI 높은 위험 URL";
    result.statusLabel = "위협";
    result.tone = "danger";
    result.verdict = "malicious";
  } else if (aiRisk.status === "suspicious" && aiRisk.confidence >= 0.65 && result.verdict !== "malicious") {
    result.caption = "AI 검토 권장";
    result.evidence = [buildAiRiskEvidence(aiRisk, 65), ...result.evidence];
    result.explanation = buildAiRiskExplanation(result, aiRisk);
    result.recommendations = buildAiRiskRecommendations(aiRisk, [
      "링크를 열기 전에 멈추고 공식 출처에서 도메인을 확인하세요.",
      "사이트가 확인될 때까지 다운로드와 정보 입력을 피하세요.",
      "받은 링크 대신 공식 주소를 직접 입력해 접속하세요.",
    ]);
    result.score = Math.max(result.score, 65);
    result.scoreLabel = "AI 의심 URL";
    result.statusLabel = "검토 필요";
    result.tone = "warn";
    result.verdict = "suspicious";
  }

  return result;
}

function buildAiRiskEvidence(aiRisk, points) {
  const reasonText = aiRisk.riskReasons.length > 0 ? aiRisk.riskReasons.join(" ") : aiRisk.recommendedAction;
  return {
    detail: reasonText || "AI 위험 판단기가 이 URL에 대해 추가 주의를 권장했습니다.",
    label: "AI 위험 판단",
    points,
  };
}

function buildAiRiskExplanation(result, aiRisk) {
  const reasons = aiRisk.riskReasons.length > 0 ? ` 주요 근거: ${aiRisk.riskReasons.slice(0, 3).map(translateAnalysisReason).join(" ")}` : "";
  const confidence = Math.round(aiRisk.confidence * 100);
  return `${result.displayHost}은(는) AI 위험 판단에서 ${confidence}% 신뢰도로 ${aiRisk.verdict}로 분류되었습니다.${reasons} ${aiRisk.recommendedAction || "수동 확인을 권장합니다."}`;
}

function buildAiRiskRecommendations(aiRisk, fallbackRecommendations) {
  return [aiRisk.recommendedAction, ...fallbackRecommendations].filter(Boolean).slice(0, 4);
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
