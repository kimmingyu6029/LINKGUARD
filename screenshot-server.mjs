import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  captureWebsiteScreenshot,
  createFixedWindowRateLimiter,
  isSafeScreenshotFileName,
} from "./src/server/screenshotService.js";

const ROOT_DIR = fileURLToPath(new URL(".", import.meta.url));
const SCREENSHOT_DIR = resolve(ROOT_DIR, "screenshots");
const SCREENSHOT_PUBLIC_PATH = "/screenshots";

loadLocalEnv();

const HOST = process.env.HOST || "0.0.0.0";
const REQUESTED_PORT = Number(process.env.PORT || 10001);
const PORT_WAS_EXPLICIT = Boolean(process.env.PORT);
const SCREENSHOT_SERVICE_TOKEN = process.env.SCREENSHOT_SERVICE_TOKEN || "";
const screenshotRateLimiter = createFixedWindowRateLimiter({
  max: readPositiveInt(process.env.SCREENSHOT_RATE_LIMIT_MAX, 10),
  windowMs: readPositiveInt(process.env.SCREENSHOT_RATE_LIMIT_WINDOW_MS, 60_000),
});

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || `${HOST}:${REQUESTED_PORT}`}`);

    if (requestUrl.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        runtime: "screenshot-service",
        storageDriver: process.env.SCREENSHOT_STORAGE_DRIVER || "local",
      });
      return;
    }

    if (!isAuthorized(request)) {
      sendJson(response, 401, { error: "Unauthorized", success: false });
      return;
    }

    if (requestUrl.pathname === "/api/screenshot") {
      await handleScreenshot(request, response);
      return;
    }

    if (requestUrl.pathname.startsWith(`${SCREENSHOT_PUBLIC_PATH}/`)) {
      await serveScreenshotAsset(request, response, requestUrl);
      return;
    }

    sendText(response, 404, "Not found");
  } catch (error) {
    console.error(error);
    sendJson(response, error.statusCode || 500, { error: error.message || "Internal server error", success: false });
  }
});

if (isDirectRun()) {
  await startServer();
}

async function startServer() {
  const selectedPort = await resolvePort(REQUESTED_PORT);

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${selectedPort} is already in use. Set PORT to another value or stop the existing server.`);
    } else {
      console.error(error);
    }
    process.exit(1);
  });

  server.listen(selectedPort, HOST, () => {
    console.log(`LinkGuard screenshot service running at http://${HOST}:${selectedPort}/`);
  });
}

async function handleScreenshot(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed", success: false });
    return;
  }

  const rateLimit = screenshotRateLimiter.check(getClientRateLimitKey(request));
  if (!rateLimit.allowed) {
    sendJson(response, 429, {
      error: "스크린샷 캡처 요청이 많아 잠시 후 다시 시도해주세요.",
      retryAfterMs: rateLimit.retryAfterMs,
      success: false,
    });
    return;
  }

  const body = await readJsonBody(request);
  const result = await captureWebsiteScreenshot({
    device: body.device === "mobile" ? "mobile" : "desktop",
    fullPage: Boolean(body.fullPage),
    publicPath: SCREENSHOT_PUBLIC_PATH,
    screenshotDir: SCREENSHOT_DIR,
    url: typeof body.url === "string" ? body.url : "",
  });

  sendJson(response, result.success ? 200 : 400, sanitizeScreenshotResult(result));
}

async function serveScreenshotAsset(request, response, requestUrl) {
  if (!["GET", "HEAD"].includes(request.method || "GET")) {
    sendText(response, 405, "Method not allowed");
    return;
  }

  const fileName = decodeURIComponent(requestUrl.pathname.slice(`${SCREENSHOT_PUBLIC_PATH}/`.length));
  if (!isSafeScreenshotFileName(fileName)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  const filePath = resolve(SCREENSHOT_DIR, fileName);
  if (!isPathInsideDirectory(SCREENSHOT_DIR, filePath) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    sendText(response, 404, "Not found");
    return;
  }

  response.writeHead(200, {
    "Cache-Control": "private, max-age=86400",
    "Content-Disposition": `inline; filename="${fileName}"`,
    "Content-Type": "image/png",
    "X-Content-Type-Options": "nosniff",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}

function sanitizeScreenshotResult(result) {
  if (!result?.success) {
    return {
      error: result?.error || "스크린샷 캡처 실패 또는 보안상 차단된 URL입니다.",
      inputUrl: result?.inputUrl || "",
      success: false,
    };
  }

  return {
    capturedAt: result.capturedAt,
    device: result.device,
    finalUrl: result.finalUrl,
    fullPage: Boolean(result.fullPage),
    inputUrl: result.inputUrl,
    redirected: Boolean(result.redirected),
    screenshotKey: result.screenshotKey || "",
    screenshotUrl: result.screenshotUrl,
    storageDriver: result.storageDriver || "local",
    success: true,
  };
}

function isAuthorized(request) {
  if (!SCREENSHOT_SERVICE_TOKEN) {
    return true;
  }

  return request.headers.authorization === `Bearer ${SCREENSHOT_SERVICE_TOKEN}`;
}

async function readJsonBody(request, { maxBytes = 16 * 1024 } = {}) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("Invalid JSON");
    error.statusCode = 400;
    throw error;
  }
}

async function resolvePort(startPort) {
  if (PORT_WAS_EXPLICIT) {
    const isAvailable = await isPortAvailable(startPort);

    if (!isAvailable) {
      console.error(`Port ${startPort} is already in use. Set PORT to another value or stop the existing server.`);
      process.exit(1);
    }

    return startPort;
  }

  for (let port = startPort; port < startPort + 20; port += 1) {
    if (await isPortAvailable(port)) {
      if (port !== startPort) {
        console.warn(`Port ${startPort} is already in use. Using ${port} instead.`);
      }
      return port;
    }
  }

  console.error(`No available port found from ${startPort} to ${startPort + 19}.`);
  process.exit(1);
}

function isPortAvailable(port) {
  return new Promise((resolveAvailable) => {
    const probe = createNetServer()
      .once("error", () => resolveAvailable(false))
      .once("listening", () => {
        probe.close(() => resolveAvailable(true));
      })
      .listen(port, HOST);
  });
}

function getClientRateLimitKey(request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (Array.isArray(forwardedFor)) {
    return forwardedFor[0].split(",")[0].trim();
  }

  return String(forwardedFor || request.socket?.remoteAddress || "local").split(",")[0].trim();
}

function isPathInsideDirectory(rootDir, targetPath) {
  const relativePath = relative(resolve(rootDir), resolve(targetPath));
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(text);
}

function loadLocalEnv() {
  for (const fileName of [".env", ".env.local"]) {
    const filePath = join(ROOT_DIR, fileName);

    if (!existsSync(filePath)) {
      continue;
    }

    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isDirectRun() {
  return Boolean(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url));
}
