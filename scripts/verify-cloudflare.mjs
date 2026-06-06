const DEFAULT_SITE_URL = "https://linkguard-ai-ui.pages.dev";
const SITE_URL = normalizeSiteUrl(process.env.CLOUDFLARE_SITE_URL || DEFAULT_SITE_URL);

const checks = [
  {
    name: "site shell",
    run: async () => {
      const response = await fetch(SITE_URL);
      const contentType = response.headers.get("content-type") || "";

      assert(response.ok, `expected 2xx, got ${response.status}`);
      assert(contentType.includes("text/html"), `expected HTML, got ${contentType || "no content-type"}`);

      return `${response.status} ${contentType}`;
    },
  },
  {
    name: "GET /api/health",
    run: async () => {
      const data = await fetchJson(`${SITE_URL}/api/health`);

      assert(data.ok === true, "expected ok=true");
      assert(data.runtime === "cloudflare-pages-functions", `unexpected runtime: ${data.runtime}`);

      return `runtime=${data.runtime}, virustotal=${data.virusTotalConfigured}`;
    },
  },
  {
    name: "GET /api/auth/session",
    run: async () => {
      const data = await fetchJson(`${SITE_URL}/api/auth/session`);

      assert(data.account?.isLoggedIn === false, "expected anonymous session");

      return `loggedIn=${data.account.isLoggedIn}, plan=${data.account.plan}`;
    },
  },
  {
    name: "POST /api/auth/login mismatch",
    run: async () => {
      const response = await fetch(`${SITE_URL}/api/auth/login`, {
        body: JSON.stringify({
          password: "wrong-password",
          username: `missing-user-${Date.now()}`,
        }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const data = await response.json();

      assert(response.status === 401, `expected 401, got ${response.status}`);
      assert(typeof data.error === "string" && data.error.length > 0, "expected login error");

      return `status=${response.status}`;
    },
  },
  {
    name: "POST /api/analyze-url invalid URL",
    run: async () => {
      const data = await postJson(`${SITE_URL}/api/analyze-url`, {
        mode: "normal",
        url: "not a url with space",
      });

      assert(data.verdict === "invalid", `expected invalid verdict, got ${data.verdict}`);
      assert(data.reputation?.status === "skipped", `expected skipped reputation, got ${data.reputation?.status}`);

      return `verdict=${data.verdict}, reputation=${data.reputation.status}`;
    },
  },
  {
    name: "POST /api/analyze-url safe URL",
    run: async () => {
      const data = await postJson(`${SITE_URL}/api/analyze-url`, {
        mode: "normal",
        url: "https://example.com",
      });

      assert(data.verdict === "safe", `expected safe verdict, got ${data.verdict}`);
      assert(data.reputation?.provider, "expected reputation provider");

      return `verdict=${data.verdict}, provider=${data.reputation.provider}, status=${data.reputation.status}`;
    },
  },
  {
    name: "GET /api/security-cases",
    run: async () => {
      const data = await fetchJson(`${SITE_URL}/api/security-cases`);

      assert(Array.isArray(data.cases), "expected cases array");
      assert(data.cases.length > 0, "expected at least one security case");

      return `cases=${data.cases.length}, source=${data.sourceLabel}`;
    },
  },
];

console.log(`Verifying Cloudflare deployment: ${SITE_URL}`);

for (const check of checks) {
  try {
    const detail = await check.run();
    console.log(`OK ${check.name}: ${detail}`);
  } catch (error) {
    console.error(`FAIL ${check.name}: ${error.message}`);
    process.exitCode = 1;
    break;
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("Cloudflare verification passed.");

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  return parseJsonResponse(response);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return parseJsonResponse(response);
}

async function parseJsonResponse(response) {
  const text = await response.text();

  assert(response.ok, `expected 2xx, got ${response.status}: ${text.slice(0, 180)}`);

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`expected JSON response, got: ${text.slice(0, 180)}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeSiteUrl(value) {
  return String(value || DEFAULT_SITE_URL).replace(/\/+$/, "");
}
