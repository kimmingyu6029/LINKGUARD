import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { handleAuthLogin, handleAuthSignup } from "../src/cloudflare/authApi.js";
import { getCommunityReportForUrls, handleAdminReports, handleReportUrl } from "../src/cloudflare/communityReports.js";
import { createLocalAuthDb } from "../src/server/localAuthDb.js";
import { createLocalCommunityDb } from "../src/server/localCommunityDb.js";

test("local community db stores URL reports and returns them for analysis lookup", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "linkguard-community-"));
  const authDb = createLocalAuthDb(join(tempDir, "auth.json"));
  const communityDb = createLocalCommunityDb(join(tempDir, "community.json"), authDb);

  try {
    const form = new FormData();
    form.set("url", "https://driveandlisten.herokuapp.com/");
    form.set("reportType", "phishing");
    form.set("description", "테스트 신고");
    form.set("privacyConfirmed", "true");

    const response = await handleReportUrl(
      new Request("http://127.0.0.1/api/report-url", {
        body: form,
        method: "POST",
      }),
      { DB: communityDb },
    );
    const body = await response.json();
    const report = await getCommunityReportForUrls(["https://driveandlisten.herokuapp.com/"], { DB: communityDb });

    assert.equal(response.status, 201);
    assert.equal(body.communityReport.hasReports, true);
    assert.equal(report.hasReports, true);
    assert.equal(report.reportCount, 1);
    assert.equal(report.primaryReportType, "phishing");
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test("local admin reports show reports submitted by a logged-in user", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "linkguard-community-admin-"));
  const authDb = createLocalAuthDb(join(tempDir, "auth.json"));
  const communityDb = createLocalCommunityDb(join(tempDir, "community.json"), authDb);

  try {
    const userSession = await signupAndLogin({
      db: authDb,
      password: "password-4056",
      username: "kimmingyu4056",
    });
    const developerSession = await signupAndLogin({
      db: authDb,
      password: "kimmingyu6029*",
      username: "kimmingyu6029",
    });
    const form = new FormData();
    form.set("url", "https://paperplanes.world/");
    form.set("reportType", "phishing");
    form.set("description", "로그인 사용자의 신고");
    form.set("privacyConfirmed", "true");

    const reportResponse = await handleReportUrl(
      new Request("http://127.0.0.1/api/report-url", {
        body: form,
        headers: {
          Cookie: userSession.cookie,
        },
        method: "POST",
      }),
      { DB: communityDb },
    );
    const adminResponse = await handleAdminReports(
      new Request("http://127.0.0.1/api/admin/reports", {
        headers: {
          Cookie: developerSession.cookie,
        },
        method: "GET",
      }),
      { DB: communityDb },
    );
    const adminBody = await adminResponse.json();

    assert.equal(reportResponse.status, 201);
    assert.equal(adminResponse.status, 200);
    assert.equal(adminBody.reporters.length, 1);
    assert.equal(adminBody.reporters[0].reporterLabel, "kimmingyu4056");
    assert.equal(adminBody.reporters[0].reports[0].normalizedUrl, "https://paperplanes.world");
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

test("local admin reports include inline screenshot evidence when no bucket is configured", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "linkguard-community-evidence-"));
  const authDb = createLocalAuthDb(join(tempDir, "auth.json"));
  const communityDb = createLocalCommunityDb(join(tempDir, "community.json"), authDb);

  try {
    const userSession = await signupAndLogin({
      db: authDb,
      password: "password-4056",
      username: "kimmingyu4056",
    });
    const developerSession = await signupAndLogin({
      db: authDb,
      password: "kimmingyu6029*",
      username: "kimmingyu6029",
    });
    const form = new FormData();
    form.set("url", "https://screenshot-report.example.com/");
    form.set("reportType", "phishing");
    form.set("description", "스크린샷 포함 신고");
    form.set("privacyConfirmed", "true");
    form.set("evidenceImage", new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), "shot.png");

    const reportResponse = await handleReportUrl(
      new Request("http://127.0.0.1/api/report-url", {
        body: form,
        headers: {
          Cookie: userSession.cookie,
        },
        method: "POST",
      }),
      { DB: communityDb, REPORT_EVIDENCE_INLINE: "true" },
    );
    const adminResponse = await handleAdminReports(
      new Request("http://127.0.0.1/api/admin/reports", {
        headers: {
          Cookie: developerSession.cookie,
        },
        method: "GET",
      }),
      { DB: communityDb },
    );
    const adminBody = await adminResponse.json();
    const report = adminBody.reporters[0].reports[0];

    assert.equal(reportResponse.status, 201);
    assert.equal(adminResponse.status, 200);
    assert.match(report.evidenceImageUrl, /^data:image\/png;base64,/);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});

async function signupAndLogin({ db, password, username }) {
  await handleAuthSignup(
    new Request("http://127.0.0.1/api/auth/signup", {
      body: JSON.stringify({ password, username }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
    { DB: db },
  );
  const loginResponse = await handleAuthLogin(
    new Request("http://127.0.0.1/api/auth/login", {
      body: JSON.stringify({ password, username }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
    { DB: db },
  );

  return {
    cookie: loginResponse.headers.get("Set-Cookie")?.split(";")[0] || "",
  };
}
