import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { handleAuthLogin, handleAuthSignup } from "../src/cloudflare/authApi.js";
import { createLocalAuthDb } from "../src/server/localAuthDb.js";

test("local auth db persists signed-up accounts across server restarts", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "linkguard-auth-"));
  const dbPath = join(tempDir, "auth.json");

  try {
    const signupResponse = await handleAuthSignup(
      new Request("http://127.0.0.1/api/auth/signup", {
        body: JSON.stringify({
          password: "kimmingyu6029*",
          username: "kimmingyu6029",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
      { DB: createLocalAuthDb(dbPath) },
    );
    assert.equal(signupResponse.status, 201);

    const loginResponse = await handleAuthLogin(
      new Request("http://127.0.0.1/api/auth/login", {
        body: JSON.stringify({
          password: "kimmingyu6029*",
          username: "kimmingyu6029",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
      { DB: createLocalAuthDb(dbPath) },
    );
    const loginBody = await loginResponse.json();

    assert.equal(loginResponse.status, 200);
    assert.equal(loginBody.account.username, "kimmingyu6029");
    assert.equal(loginBody.account.isDeveloper, true);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});
