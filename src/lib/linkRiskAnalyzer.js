const SHORTENER_DOMAINS = new Set([
  "bit.ly",
  "bitly.ws",
  "buff.ly",
  "cutt.ly",
  "goo.gl",
  "han.gl",
  "is.gd",
  "lrl.kr",
  "me2.do",
  "naver.me",
  "ow.ly",
  "rebrand.ly",
  "s.id",
  "shorturl.at",
  "t.co",
  "tinyurl.com",
  "url.kr",
  "vo.la",
]);

const SUSPICIOUS_TLDS = new Set([
  "buzz",
  "click",
  "cyou",
  "icu",
  "info",
  "link",
  "live",
  "monster",
  "mov",
  "online",
  "rest",
  "shop",
  "site",
  "support",
  "top",
  "work",
  "xyz",
  "zip",
]);

const MULTI_PART_SUFFIXES = [
  "ac.kr",
  "co.jp",
  "co.kr",
  "co.uk",
  "com.au",
  "go.kr",
  "ne.kr",
  "or.kr",
  "org.uk",
  "pe.kr",
  "re.kr",
];

const OFFICIAL_BRANDS = [
  {
    name: "네이버",
    tokens: ["naver", "네이버"],
    domains: ["naver.com", "naver.me"],
  },
  {
    name: "카카오",
    tokens: ["kakao", "daum", "카카오"],
    domains: ["kakao.com", "daum.net"],
  },
  {
    name: "쿠팡",
    tokens: ["coupang", "쿠팡"],
    domains: ["coupang.com"],
  },
  {
    name: "우체국",
    tokens: ["koreapost", "epost", "postoffice", "우체국"],
    domains: ["epost.go.kr", "koreapost.go.kr"],
  },
  {
    name: "정부기관",
    tokens: ["gov", "hometax", "customs", "정부", "국세청", "관세청"],
    domains: ["customs.go.kr", "gov.kr", "hometax.go.kr"],
  },
  {
    name: "KB국민은행",
    tokens: ["kbstar", "kb-bank", "kbcard", "국민은행"],
    domains: ["kbcard.com", "kbfg.com", "kbstar.com"],
  },
  {
    name: "신한은행",
    tokens: ["shinhan", "신한"],
    domains: ["shinhan.com", "shinhanbank.com"],
  },
  {
    name: "우리은행",
    tokens: ["woori", "우리은행"],
    domains: ["wooribank.com"],
  },
  {
    name: "하나은행",
    tokens: ["hana", "kebhana", "하나은행"],
    domains: ["hanabank.com", "kebhana.com"],
  },
  {
    name: "토스",
    tokens: ["toss", "토스"],
    domains: ["toss.im", "tossbank.com"],
  },
  {
    name: "PayPal",
    tokens: ["paypal"],
    domains: ["paypal.com"],
  },
  {
    name: "Google",
    tokens: ["google", "gmail"],
    domains: ["gmail.com", "google.com"],
  },
  {
    name: "OpenAI",
    tokens: ["openai", "chatgpt"],
    domains: ["chatgpt.com", "openai.com"],
  },
  {
    name: "Apple",
    tokens: ["apple", "icloud"],
    domains: ["apple.com", "icloud.com"],
  },
  {
    name: "Microsoft",
    tokens: ["microsoft", "office365", "outlook"],
    domains: ["live.com", "microsoft.com", "office.com", "outlook.com"],
  },
  {
    name: "Instagram",
    tokens: ["instagram", "insta"],
    domains: ["instagram.com"],
  },
  {
    name: "가천대학교",
    tokens: ["gachon", "가천"],
    domains: ["gachon.ac.kr"],
  },
];

const PHISHING_KEYWORDS = [
  "account",
  "auth",
  "bank",
  "bonus",
  "cert",
  "claim",
  "confirm",
  "coupon",
  "delivery",
  "event",
  "free",
  "gift",
  "invoice",
  "login",
  "notice",
  "parcel",
  "password",
  "payment",
  "prize",
  "refund",
  "secure",
  "security",
  "track",
  "update",
  "verify",
  "win",
  "결제",
  "과태료",
  "배송",
  "본인인증",
  "인증",
  "지원금",
  "청첩장",
  "초대장",
  "쿠폰",
  "택배",
  "환급",
];

const LURE_TERMS = [
  "bank",
  "delivery",
  "gov",
  "korea",
  "notice",
  "parcel",
  "post",
  "secure",
  "support",
  "tax",
  "track",
];

const SOCIAL_PLATFORM_LURES = [
  {
    name: "Instagram",
    aliases: ["ig", "instagram", "insta"],
    contextSegments: ["account", "auth", "login", "open", "profile", "reel", "share", "story", "verify"],
    officialDomains: ["instagram.com"],
  },
];

const RISKY_FILE_EXTENSIONS = [".apk", ".bat", ".cmd", ".exe", ".js", ".scr", ".vbs", ".zip"];
const MAX_URL_LENGTH = 2048;

const SAFE_RECOMMENDATIONS = [
  "도메인이 예상한 공식 주소인지 한 번 더 확인하세요.",
  "개인정보 입력 전 브라우저 주소창을 다시 확인하세요.",
  "의심스러운 첨부 파일이나 설치 파일은 내려받지 마세요.",
];

const WARN_RECOMMENDATIONS = [
  "바로 클릭하지 말고 공식 앱이나 홈페이지에서 직접 확인하세요.",
  "로그인, 결제, 본인인증을 요구하면 입력을 중단하세요.",
  "보낸 사람과 링크 도메인이 일치하는지 비교하세요.",
];

const DANGER_RECOMMENDATIONS = [
  "링크를 열지 말고 메시지나 메일을 삭제하세요.",
  "개인정보, 인증번호, 카드정보를 절대 입력하지 마세요.",
  "이미 입력했다면 비밀번호 변경과 카드사/기관 신고를 진행하세요.",
  "공식 앱이나 검색으로 찾은 홈페이지에서만 확인하세요.",
];

export function analyzeUrl(rawUrl, { mode = "normal" } = {}) {
  const input = rawUrl.trim();

  if (!input) {
    return buildIdleResult();
  }

  if (input.length > MAX_URL_LENGTH) {
    return buildInvalidResult(input, "URL is too long to analyze safely.");
  }

  if (/\s/.test(input)) {
    return buildInvalidResult(input, "URL 안에 공백이 포함되어 있습니다.");
  }

  const normalizedInput = normalizeUrlInput(input);
  const parsed = tryParseUrl(normalizedInput);

  if (!parsed) {
    return buildInvalidResult(input, "주소 형식이 올바르지 않습니다.");
  }

  const protocol = parsed.protocol.replace(":", "");
  const hostname = parsed.hostname.toLowerCase();
  const hostWithoutPrefix = hostname.replace(/^www\./, "");
  const registrableDomain = getRegistrableDomain(hostWithoutPrefix);
  const compactHost = hostWithoutPrefix.replace(/[^a-z0-9가-힣]/g, "");
  const searchableText = safeDecode(`${hostname}${parsed.pathname}${parsed.search}`).toLowerCase();
  const impersonationText = safeDecode(`${hostname}${parsed.pathname}`).toLowerCase();
  const pathSegments = parsed.pathname
    .split("/")
    .map((segment) => safeDecode(segment).toLowerCase())
    .filter(Boolean);
  const evidence = [];
  const flags = {
    officialDomain: false,
    brandImpersonation: false,
    hasAtSign: input.includes("@"),
    hasExternalRedirect: false,
    hasRiskyFile: RISKY_FILE_EXTENSIONS.some((extension) =>
      parsed.pathname.toLowerCase().endsWith(extension),
    ),
    hasOpaquePathToken: hasOpaquePathToken(pathSegments),
    hasShortener: SHORTENER_DOMAINS.has(registrableDomain),
    hasSuspiciousTld: SUSPICIOUS_TLDS.has(hostWithoutPrefix.split(".").at(-1)),
    hasIpAddress: isIpAddress(hostname),
    hasPunycode: hostname.includes("xn--"),
    hasSocialPlatformLure: false,
    hasWeakProtocol: protocol !== "https",
    phishingKeywords: [],
  };

  let score = 0;
  const addRisk = (points, label, detail) => {
    score += points;
    evidence.push({ points, label, detail });
  };

  if (!["http", "https"].includes(protocol)) {
    return buildBlockedSchemeResult(input, protocol);
  }

  const safetyCheck = validateUrlSafety(parsed);
  if (!safetyCheck.safe) {
    return buildBlockedSafetyResult(input, parsed, safetyCheck.reason);
  }

  const matchedOfficialBrand = OFFICIAL_BRANDS.find((brand) =>
    brand.domains.some((domain) => isSameOrSubdomain(hostWithoutPrefix, domain)),
  );
  flags.officialDomain = Boolean(matchedOfficialBrand);

  if (flags.hasWeakProtocol) {
    addRisk(16, "HTTPS 미사용", "암호화되지 않은 HTTP 주소입니다.");
  }

  if (flags.hasAtSign) {
    addRisk(24, "주소 위장 문자", "@ 앞쪽을 정상 주소처럼 보이게 만들 수 있습니다.");
  }

  if (flags.hasIpAddress) {
    addRisk(22, "IP 주소 직접 사용", "공식 서비스보다 추적이 어려운 주소 형태입니다.");
  }

  if (flags.hasPunycode) {
    addRisk(20, "국제화 도메인 위장", "정상 문자처럼 보이는 유사 문자를 썼을 수 있습니다.");
  }

  if (flags.hasSuspiciousTld) {
    addRisk(14, "주의 TLD", `.${hostWithoutPrefix.split(".").at(-1)} 도메인은 피싱에 자주 악용됩니다.`);
  }

  if (flags.hasShortener) {
    addRisk(30, "단축 URL", "최종 목적지를 열기 전에는 확인하기 어렵습니다.");
  }

  if (flags.hasRiskyFile) {
    addRisk(28, "위험 파일 확장자", "실행 파일이나 압축 파일 다운로드로 이어질 수 있습니다.");
  }

  const externalRedirectHost = findExternalRedirectHost(parsed, registrableDomain);

  if (externalRedirectHost) {
    flags.hasExternalRedirect = true;
    addRisk(32, "외부 리디렉션 대상", `${externalRedirectHost}로 이동시키는 파라미터가 있어 최종 목적지 확인이 필요합니다.`);
  }

  const socialPlatformLure = findSocialPlatformLure({
    hostname: hostWithoutPrefix,
    pathSegments,
  });

  if (socialPlatformLure) {
    flags.hasSocialPlatformLure = true;
    addRisk(
      50,
      "소셜 플랫폼 사칭 경로",
      `공식 ${socialPlatformLure.name} 도메인이 아닌데 ${socialPlatformLure.aliasPath} 경로와 공유/로그인 유도 패턴이 보입니다.`,
    );
  }

  const labels = hostWithoutPrefix.split(".");
  const subdomainCount = Math.max(0, labels.length - getRegistrableDomain(hostWithoutPrefix).split(".").length);
  const hyphenCount = (registrableDomain.match(/-/g) || []).length;
  const digitCount = (registrableDomain.match(/\d/g) || []).length;

  if (subdomainCount >= 3) {
    addRisk(8, "과도한 하위 도메인", "주소가 길게 중첩되어 실제 소유 도메인을 숨길 수 있습니다.");
  }

  if (hyphenCount >= 2) {
    addRisk(12, "부자연스러운 도메인 구조", "하이픈을 여러 번 사용해 공식 주소처럼 보이게 합니다.");
  }

  if (digitCount >= 3) {
    addRisk(7, "숫자가 많은 도메인", "자동 생성되었거나 일회성 도메인일 가능성이 있습니다.");
  }

  if (!flags.officialDomain) {
    const urlLength = normalizedInput.length;
    if (urlLength > 160) {
      addRisk(12, "매우 긴 URL", "추적 파라미터나 숨긴 목적지가 많을 수 있습니다.");
    } else if (urlLength > 100) {
      addRisk(6, "긴 URL", "주소가 복잡해 실제 목적지를 확인하기 어렵습니다.");
    }

    const encodedTokens = normalizedInput.match(/%[0-9a-f]{2}/gi) || [];
    if (encodedTokens.length >= 4) {
      addRisk(8, "인코딩 문자 다수", "주소 일부를 사람이 읽기 어렵게 숨겼습니다.");
    }

    const queryParamCount = Array.from(parsed.searchParams.keys()).length;
    if (queryParamCount >= 6) {
      addRisk(6, "많은 추적 파라미터", "사용자 추적이나 리디렉션에 쓰일 수 있습니다.");
    }
  }

  if (!flags.officialDomain && flags.hasOpaquePathToken) {
    addRisk(12, "일회성 공유 코드", "긴 숫자 ID나 무작위 코드가 경로에 포함되어 추적 또는 피싱 랜딩에 쓰일 수 있습니다.");
  }

  flags.phishingKeywords = PHISHING_KEYWORDS.filter((keyword) =>
    searchableText.includes(keyword.toLowerCase()),
  );

  if (flags.phishingKeywords.length >= 4) {
    addRisk(34, "피싱 유도 키워드", `${flags.phishingKeywords.slice(0, 4).join(", ")} 등이 발견되었습니다.`);
  } else if (flags.phishingKeywords.length >= 2) {
    addRisk(26, "피싱 유도 키워드", `${flags.phishingKeywords.join(", ")} 패턴이 보입니다.`);
  } else if (flags.phishingKeywords.length === 1) {
    addRisk(9, "주의 키워드", `${flags.phishingKeywords[0]} 패턴이 보입니다.`);
  }

  const lureTermCount = LURE_TERMS.filter((term) => compactHost.includes(term)).length;
  if (!flags.officialDomain && lureTermCount >= 2) {
    addRisk(22, "기관/배송 사칭 조합", "공식 주소가 아닌데 기관, 배송, 보안성 단어를 함께 씁니다.");
  }

  const impersonatedBrands = OFFICIAL_BRANDS.filter((brand) => {
    if (brand.domains.some((domain) => isSameOrSubdomain(hostWithoutPrefix, domain))) {
      return false;
    }

    return brand.tokens.some((token) => {
      const normalizedToken = token.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
      return normalizedToken && (compactHost.includes(normalizedToken) || impersonationText.includes(normalizedToken));
    });
  });

  if (impersonatedBrands.length > 0) {
    flags.brandImpersonation = true;
    addRisk(
      36,
      "브랜드 사칭 가능성",
      `${impersonatedBrands
        .slice(0, 2)
        .map((brand) => brand.name)
        .join(", ")} 이름이 공식 도메인이 아닌 곳에서 발견되었습니다.`,
    );
  }

  if (flags.officialDomain && !flags.hasWeakProtocol && score < 30) {
    score = Math.max(0, score - 12);
  }

  score = clamp(Math.round(score), 0, 100);

  return buildAnalysisResult({
    evidence,
    flags,
    hostname: hostWithoutPrefix,
    input,
    matchedOfficialBrand,
    mode,
    parsed,
    registrableDomain,
    safetyCheck,
    score,
  });
}

function buildAnalysisResult({
  evidence,
  flags,
  hostname,
  input,
  matchedOfficialBrand,
  mode,
  parsed,
  registrableDomain,
  safetyCheck,
  score,
}) {
  const tone = score >= 60 ? "danger" : score >= 30 ? "warn" : "safe";
  const statusLabel = tone === "danger" ? "위험" : tone === "warn" ? "주의" : "안전";
  const scoreLabel =
    tone === "danger" ? "악성 의심 링크" : tone === "warn" ? "주의가 필요한 링크" : "위험 신호 낮음";
  const caption =
    tone === "danger"
      ? "차단 권장"
      : tone === "warn"
        ? "추가 확인 권장"
        : "기본 검사 통과";
  const topEvidence = evidence
    .slice()
    .sort((left, right) => right.points - left.points)
    .slice(0, 3);

  const explanation = buildExplanation({
    hostname,
    matchedOfficialBrand,
    mode,
    score,
    statusLabel,
    tone,
    topEvidence,
  });

  return {
    caption,
    displayHost: hostname,
    displayUrl: parsed.href,
    evidence,
    explanation,
    input,
    normalizedUrl: parsed.href,
    recommendations:
      tone === "danger" ? DANGER_RECOMMENDATIONS : tone === "warn" ? WARN_RECOMMENDATIONS : SAFE_RECOMMENDATIONS,
    score,
    scoreLabel,
    signals: buildSignals({ evidence, flags, score, tone }),
    statusLabel,
    tone,
    verdict: tone === "danger" ? "malicious" : tone === "warn" ? "suspicious" : "safe",
    safetyCheck: safetyCheck || { reason: "", safe: true },
    registrableDomain,
  };
}

function buildExplanation({ hostname, matchedOfficialBrand, mode, score, statusLabel, tone, topEvidence }) {
  if (tone === "safe") {
    const brandText = matchedOfficialBrand ? `${matchedOfficialBrand.name} 공식 도메인으로 확인되며, ` : "";
    return `${hostname}는 ${brandText}현재 규칙 기반 검사에서 큰 위험 신호가 낮습니다. 그래도 개인정보 입력 전에는 주소창의 도메인을 다시 확인하세요.`;
  }

  const reasonText =
    topEvidence.length > 0
      ? topEvidence.map((item) => item.label).join(", ")
      : "여러 URL 구조 신호";

  if (mode === "expert") {
    return `${hostname}는 위험 점수 ${score}/100으로 ${statusLabel} 판정입니다. 주요 근거는 ${reasonText}이며, 아래 상세 신호를 기준으로 클릭 전 차단 또는 수동 검증이 필요합니다.`;
  }

  return `${hostname}에서 ${reasonText} 신호가 발견되었습니다. 링크를 바로 열지 말고 공식 앱이나 직접 검색한 홈페이지에서 같은 내용을 확인하세요.`;
}

function buildIdleResult() {
  return {
    caption: "입력 대기",
    displayHost: "URL을 입력하세요",
    displayUrl: "",
    evidence: [],
    explanation: "분석할 외부 링크를 입력하면 위험 신호를 즉시 확인합니다.",
    recommendations: SAFE_RECOMMENDATIONS,
    score: 0,
    scoreLabel: "분석 대기",
    signals: buildNeutralSignals("대기"),
    statusLabel: "대기",
    tone: "blue",
    verdict: "idle",
  };
}

function buildInvalidResult(input, reason) {
  return {
    caption: "형식 확인 필요",
    displayHost: input,
    displayUrl: input,
    evidence: [{ points: 0, label: "URL 형식 오류", detail: reason }],
    explanation: `${reason} http:// 또는 https://로 시작하는 외부 링크인지 확인하세요.`,
    recommendations: WARN_RECOMMENDATIONS,
    score: 0,
    scoreLabel: "분석 불가",
    signals: buildNeutralSignals("확인 필요", "warn"),
    statusLabel: "확인 필요",
    tone: "warn",
    verdict: "invalid",
  };
}

function buildBlockedSchemeResult(input, protocol) {
  return {
    caption: "차단 권장",
    displayHost: input,
    displayUrl: input,
    evidence: [{ points: 100, label: "비웹 프로토콜", detail: `${protocol}: 링크는 웹 URL이 아닙니다.` }],
    explanation: `${protocol}: 형태의 링크는 웹페이지가 아니라 앱 실행이나 스크립트 실행으로 이어질 수 있어 위험합니다. 열지 않는 편이 안전합니다.`,
    recommendations: DANGER_RECOMMENDATIONS,
    score: 100,
    scoreLabel: "악성 의심 링크",
    signals: buildNeutralSignals("위험", "danger"),
    statusLabel: "위험",
    tone: "danger",
    verdict: "malicious",
  };
}

function buildBlockedSafetyResult(input, parsed, reason) {
  const displayHost = parsed?.hostname || input;

  return {
    caption: "Blocked",
    displayHost,
    displayUrl: parsed?.href || input,
    evidence: [{ points: 100, label: "SSRF safety block", detail: reason }],
    explanation:
      "This URL was blocked before network access because it points to a local, private, or otherwise unsafe destination.",
    recommendations: DANGER_RECOMMENDATIONS,
    score: 100,
    scoreLabel: "Analysis blocked",
    signals: [
      { key: "structure", label: "URL safety", tone: "danger", value: "Blocked" },
      { key: "domain", label: "Domain safety", tone: "danger", value: "Unsafe" },
      {
        key: "https",
        label: "HTTPS",
        tone: parsed?.protocol === "https:" ? "safe" : "warn",
        value: parsed?.protocol === "https:" ? "Used" : "Not used",
      },
      { key: "shortener", label: "Shortener", tone: "blue", value: "Not checked" },
      { key: "keywords", label: "Keywords", tone: "blue", value: "Not checked" },
      { key: "payload", label: "Payload", tone: "blue", value: "Not checked" },
      { key: "redirect", label: "Redirect", tone: "blue", value: "Not checked" },
      { key: "phishing", label: "Phishing lure", tone: "blue", value: "Not checked" },
    ],
    statusLabel: "Blocked",
    tone: "danger",
    verdict: "blocked",
    normalizedUrl: parsed?.href || input,
    safetyCheck: { reason, safe: false },
  };
}

function buildNeutralSignals(value, tone = "blue") {
  return [
    { key: "structure", label: "URL 구조", tone, value },
    { key: "domain", label: "도메인 신뢰도", tone, value },
    { key: "https", label: "HTTPS 여부", tone, value },
    { key: "shortener", label: "단축 URL", tone, value },
    { key: "keywords", label: "사칭 키워드", tone, value },
    { key: "payload", label: "위험 파일", tone, value },
    { key: "redirect", label: "리디렉션 가능성", tone, value },
    { key: "phishing", label: "피싱 유도 가능성", tone, value },
  ];
}

function buildSignals({ evidence, flags, score, tone }) {
  const hasEvidence = (label) => evidence.some((item) => item.label === label);
  const structureDanger =
    flags.hasAtSign ||
    flags.hasIpAddress ||
    flags.hasPunycode ||
    flags.hasSocialPlatformLure ||
    hasEvidence("부자연스러운 도메인 구조") ||
    hasEvidence("과도한 하위 도메인");
  const redirectRisk =
    flags.hasShortener ||
    flags.hasAtSign ||
    flags.hasExternalRedirect ||
    flags.hasOpaquePathToken ||
    hasEvidence("인코딩 문자 다수");
  const keywordTone = flags.phishingKeywords.length >= 2 ? "danger" : flags.phishingKeywords.length === 1 ? "warn" : "safe";

  return [
    {
      key: "structure",
      label: "URL 구조",
      tone: structureDanger ? "danger" : score >= 30 ? "warn" : "safe",
      value: structureDanger ? "위험" : score >= 30 ? "주의" : "정상",
    },
    {
      key: "domain",
      label: "도메인 신뢰도",
      tone:
        flags.brandImpersonation || flags.hasSocialPlatformLure || flags.hasSuspiciousTld
          ? "danger"
          : flags.officialDomain
            ? "safe"
            : tone,
      value:
        flags.brandImpersonation || flags.hasSocialPlatformLure
          ? "낮음"
          : flags.officialDomain
            ? "공식"
            : tone === "safe"
              ? "양호"
              : "주의",
    },
    {
      key: "https",
      label: "HTTPS 여부",
      tone: flags.hasWeakProtocol ? "danger" : "safe",
      value: flags.hasWeakProtocol ? "없음" : "사용",
    },
    {
      key: "shortener",
      label: "단축 URL",
      tone: flags.hasShortener ? "warn" : "safe",
      value: flags.hasShortener ? "사용" : "없음",
    },
    {
      key: "keywords",
      label: "사칭 키워드",
      tone: keywordTone,
      value: flags.phishingKeywords.length > 0 ? "발견" : "없음",
    },
    {
      key: "payload",
      label: "위험 파일",
      tone: flags.hasRiskyFile ? "danger" : "safe",
      value: flags.hasRiskyFile ? "발견" : "없음",
    },
    {
      key: "redirect",
      label: "리디렉션 가능성",
      tone: redirectRisk ? "warn" : "safe",
      value: redirectRisk ? "주의" : "낮음",
    },
    {
      key: "phishing",
      label: "피싱 유도 가능성",
      tone,
      value: score >= 60 ? "높음" : score >= 30 ? "주의" : "낮음",
    },
  ];
}

function normalizeUrlInput(input) {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(input) || /^[a-z][a-z\d+.-]*:/i.test(input)) {
    return input;
  }

  return `https://${input}`;
}

function tryParseUrl(input) {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function findExternalRedirectHost(parsedUrl, currentRegistrableDomain) {
  const redirectParamNames = new Set([
    "continue",
    "dest",
    "destination",
    "next",
    "redirect",
    "redirect_uri",
    "return",
    "returnurl",
    "target",
    "to",
    "url",
  ]);

  for (const [rawKey, rawValue] of parsedUrl.searchParams.entries()) {
    const key = rawKey.toLowerCase();
    if (!redirectParamNames.has(key) && !key.endsWith("url")) {
      continue;
    }

    const value = safeDecode(rawValue).trim();
    const redirectUrl = parseRedirectValue(value);

    if (!redirectUrl) {
      continue;
    }

    const redirectHost = redirectUrl.hostname.toLowerCase().replace(/^www\./, "");
    const redirectRegistrableDomain = getRegistrableDomain(redirectHost);

    if (redirectRegistrableDomain !== currentRegistrableDomain) {
      return redirectHost;
    }
  }

  return "";
}

function parseRedirectValue(value) {
  try {
    if (/^https?:\/\//i.test(value)) {
      return new URL(value);
    }

    if (/^\/\//.test(value)) {
      return new URL(`https:${value}`);
    }
  } catch {
    return null;
  }

  return null;
}

function findSocialPlatformLure({ hostname, pathSegments }) {
  for (const platform of SOCIAL_PLATFORM_LURES) {
    if (platform.officialDomains.some((domain) => isSameOrSubdomain(hostname, domain))) {
      continue;
    }

    for (const [index, segment] of pathSegments.entries()) {
      if (!platform.aliases.includes(segment)) {
        continue;
      }

      const previousSegment = pathSegments[index - 1] || "";
      const nextSegment = pathSegments[index + 1] || "";
      const hasContext =
        platform.contextSegments.includes(previousSegment) ||
        platform.contextSegments.includes(nextSegment) ||
        pathSegments.slice(index + 1).some(isOpaquePathSegment);

      if (!hasContext) {
        continue;
      }

      return {
        ...platform,
        aliasPath: `/${[previousSegment, segment, nextSegment].filter(Boolean).join("/")}/`,
      };
    }
  }

  return null;
}

function hasOpaquePathToken(pathSegments) {
  return pathSegments.filter(isOpaquePathSegment).length >= 1;
}

function isOpaquePathSegment(segment) {
  return /^\d{10,}$/.test(segment) || /^(?=.*[a-z])(?=.*\d)[a-z\d_-]{10,}$/i.test(segment);
}

function getRegistrableDomain(hostname) {
  const labels = hostname.split(".").filter(Boolean);

  if (labels.length <= 2) {
    return hostname;
  }

  const suffix = MULTI_PART_SUFFIXES.find((item) => hostname.endsWith(`.${item}`));
  if (suffix) {
    return labels.slice(-(suffix.split(".").length + 1)).join(".");
  }

  return labels.slice(-2).join(".");
}

function isSameOrSubdomain(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isIpAddress(hostname) {
  const normalized = hostname.replace(/^\[/, "").replace(/\]$/, "");
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(normalized) || normalized.includes(":");
}

function validateUrlSafety(parsedUrl) {
  if (!parsedUrl || !["http:", "https:"].includes(parsedUrl.protocol)) {
    return { reason: "Only HTTP and HTTPS URLs can be analyzed.", safe: false };
  }

  const host = parsedUrl.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");

  if (!host || host === "localhost" || host.endsWith(".localhost")) {
    return { reason: "Localhost URLs are blocked to prevent SSRF.", safe: false };
  }

  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) {
    return { reason: "Private or link-local IPv6 addresses are blocked to prevent SSRF.", safe: false };
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) {
    return { reason: "", safe: true };
  }

  const octets = ipv4Match.slice(1).map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) {
    return { reason: "Invalid IP address syntax.", safe: false };
  }

  const [first, second] = octets;
  const blocked =
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);

  return blocked
    ? { reason: "Private, loopback, or link-local IP addresses are blocked to prevent SSRF.", safe: false }
    : { reason: "", safe: true };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
