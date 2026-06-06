import { basename } from "node:path";
import { randomUUID } from "node:crypto";
import { createScreenshotStorage } from "./screenshotStorage.js";
import { validatePublicHttpUrl } from "./urlSafety.js";

const DEFAULT_CAPTURE_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_CONCURRENT_CAPTURES = 2;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_RATE_LIMIT_MAX = 10;

const captureLimiter = createSemaphore(readPositiveInt(process.env.SCREENSHOT_MAX_CONCURRENT, DEFAULT_MAX_CONCURRENT_CAPTURES));

export async function captureWebsiteScreenshot({
  device = "desktop",
  fullPage = false,
  publicPath = "/screenshots",
  screenshotDir,
  timeoutMs = readPositiveInt(process.env.SCREENSHOT_TIMEOUT_MS, DEFAULT_CAPTURE_TIMEOUT_MS),
  url,
} = {}) {
  const safety = await validatePublicHttpUrl(url);
  const inputUrl = typeof url === "string" ? url.trim() : "";
  const capturedAtDate = new Date();
  const capturedAt = formatLocalIso(capturedAtDate);

  if (!safety.safe) {
    return buildFailure({
      capturedAt,
      error: "스크린샷 캡처 실패 또는 보안상 차단된 URL입니다.",
      inputUrl,
      reason: safety.reason,
    });
  }

  const release = await captureLimiter.acquire();
  try {
    const storage = createScreenshotStorage({ publicPath, screenshotDir });
    await storage.cleanup();

    const { chromium, devices } = await import("playwright");
    const browser = await chromium.launch({
      headless: true,
      timeout: Math.max(timeoutMs, 30_000),
      args: buildBrowserArgs(),
    });

    try {
      const viewportProfile = device === "mobile" ? devices["iPhone 13"] : { viewport: { height: 900, width: 1440 } };
      const context = await browser.newContext({
        ...viewportProfile,
        acceptDownloads: false,
        bypassCSP: false,
        ignoreHTTPSErrors: false,
        javaScriptEnabled: true,
        permissions: [],
        serviceWorkers: "block",
        userAgent:
          device === "mobile"
            ? viewportProfile.userAgent
            : "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) LinkGuardScreenshot/1.0 Safari/537.36",
      });

      try {
        const page = await context.newPage();
        const requestSafetyCache = new Map();

        page.setDefaultNavigationTimeout(timeoutMs);
        page.setDefaultTimeout(timeoutMs);
        page.on("dialog", (dialog) => dialog.dismiss().catch(() => undefined));
        page.on("download", (download) => download.cancel().catch(() => undefined));
        await installRequestGuards(page, requestSafetyCache);

        const response = await page.goto(safety.normalizedUrl, {
          timeout: timeoutMs,
          waitUntil: "domcontentloaded",
        });

        if (response?.headers()?.["content-disposition"]?.toLowerCase().includes("attachment")) {
          throw new Error("Navigation attempted to return a downloadable attachment.");
        }

        await page.waitForLoadState("networkidle", { timeout: Math.min(3000, timeoutMs) }).catch(() => undefined);

        const fileName = `screenshot-${Date.now()}-${randomUUID()}.png`;
        const screenshotBytes = await page.screenshot({
          animations: "disabled",
          fullPage: Boolean(fullPage),
          type: "png",
        });
        const storedScreenshot = await storage.save({
          bytes: screenshotBytes,
          fileName,
        });

        const finalUrl = page.url();
        return {
          capturedAt,
          device: device === "mobile" ? "mobile" : "desktop",
          finalUrl,
          fullPage: Boolean(fullPage),
          inputUrl,
          redirected: finalUrl !== safety.normalizedUrl,
          ...storedScreenshot,
          success: true,
        };
      } finally {
        await context.close().catch(() => undefined);
      }
    } finally {
      await browser.close().catch(() => undefined);
    }
  } catch (error) {
    return buildFailure({
      capturedAt,
      error: "스크린샷 캡처 실패 또는 보안상 차단된 URL입니다.",
      inputUrl,
      reason: error.message,
    });
  } finally {
    release();
  }
}

export function createFixedWindowRateLimiter({
  max = DEFAULT_RATE_LIMIT_MAX,
  windowMs = DEFAULT_RATE_LIMIT_WINDOW_MS,
} = {}) {
  const buckets = new Map();

  return {
    check(key) {
      const now = Date.now();
      const normalizedKey = key || "anonymous";
      const bucket = buckets.get(normalizedKey);

      if (!bucket || bucket.resetAt <= now) {
        buckets.set(normalizedKey, { count: 1, resetAt: now + windowMs });
        pruneRateLimitBuckets(buckets, now);
        return { allowed: true, remaining: Math.max(0, max - 1), retryAfterMs: 0 };
      }

      if (bucket.count >= max) {
        return { allowed: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
      }

      bucket.count += 1;
      return { allowed: true, remaining: Math.max(0, max - bucket.count), retryAfterMs: bucket.resetAt - now };
    },
  };
}

export function isSafeScreenshotFileName(fileName) {
  return /^screenshot-[a-z0-9-]+\.png$/i.test(basename(fileName || ""));
}

async function installRequestGuards(page, cache) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const requestUrl = request.url();
    const resourceType = request.resourceType();

    if (resourceType === "media" || resourceType === "font") {
      await route.abort();
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(requestUrl);
    } catch {
      await route.abort();
      return;
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      await route.abort();
      return;
    }

    const cacheKey = `${parsedUrl.protocol}//${parsedUrl.hostname.toLowerCase()}`;
    let safe = cache.get(cacheKey);
    if (safe === undefined) {
      const validation = await validatePublicHttpUrl(parsedUrl.href);
      safe = validation.safe;
      cache.set(cacheKey, safe);
    }

    if (!safe) {
      await route.abort();
      return;
    }

    await route.continue();
  });
}

function buildFailure({ capturedAt, error, inputUrl, reason }) {
  return {
    capturedAt,
    error,
    inputUrl,
    reason,
    success: false,
  };
}

function buildBrowserArgs() {
  const args = ["--disable-dev-shm-usage", "--disable-gpu", "--disable-extensions", "--no-first-run"];

  if (process.env.PLAYWRIGHT_DISABLE_SANDBOX === "true") {
    args.push("--no-sandbox");
  }

  return args;
}

function createSemaphore(maxConcurrent) {
  let active = 0;
  const queue = [];

  return {
    acquire() {
      return new Promise((resolve) => {
        const enter = () => {
          active += 1;
          resolve(() => {
            active = Math.max(0, active - 1);
            queue.shift()?.();
          });
        };

        if (active < maxConcurrent) {
          enter();
        } else {
          queue.push(enter);
        }
      });
    },
  };
}

function pruneRateLimitBuckets(buckets, now) {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatLocalIso(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absMinutes / 60)).padStart(2, "0");
  const offsetRemainderMinutes = String(absMinutes % 60).padStart(2, "0");
  const localDate = new Date(date.getTime() + offsetMinutes * 60 * 1000);

  return `${localDate.toISOString().slice(0, 19)}${sign}${offsetHours}:${offsetRemainderMinutes}`;
}
