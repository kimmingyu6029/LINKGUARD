import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createPasswordRecord,
  handleAuthCreditPurchase,
  handleAuthSignup,
  handleAuthWallet,
  handleAuthWalletDeposit,
  verifyPassword,
} from "../src/cloudflare/authApi.js";
import { createLocalAuthDb } from "../src/server/localAuthDb.js";

test("auth password records verify the original password only", async () => {
  const passwordRecord = await createPasswordRecord("correct-password");
  const user = {
    password_hash: passwordRecord.hash,
    password_iterations: passwordRecord.iterations,
    password_salt: passwordRecord.salt,
  };

  assert.equal(await verifyPassword("correct-password", user), true);
  assert.equal(await verifyPassword("wrong-password", user), false);
});

test("wallet API derives subscription periods for purchases made before period columns existed", async () => {
  const token = "legacy-session-token";
  const tokenHash = await digestHex(token);
  const purchase = {
    amount: -4900,
    balance_after: 495100,
    bank: "",
    billing: "monthly",
    created_at: "2026-05-26T06:41:56.000Z",
    id: "tx-1",
    note: "Pro 월간 요금제 결제",
    plan: "Pro",
    subscription_expires_at: "",
    subscription_started_at: "",
    type: "plan_purchase",
  };
  const db = createFakeWalletDb({
    purchase,
    tokenHash,
    user: {
      expires_at: "2099-01-01T00:00:00.000Z",
      id: "user-1",
      plan: "Pro",
      plan_billing: "",
      plan_expires_at: "",
      plan_started_at: "",
      session_id: "session-1",
      username: "kim",
      username_lower: "kim",
      wallet_balance: 495100,
    },
  });
  const request = new Request("https://example.test/api/auth/wallet", {
    headers: {
      Cookie: `linkguard_session=${token}`,
    },
    method: "GET",
  });

  const response = await handleAuthWallet(request, { DB: db });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.account.planStartedAt, "2026-05-26T06:41:56.000Z");
  assert.equal(body.account.planExpiresAt, "2026-06-26T06:41:56.000Z");
  assert.equal(body.transactions[0].subscriptionStartedAt, "2026-05-26T06:41:56.000Z");
  assert.equal(body.transactions[0].subscriptionExpiresAt, "2026-06-26T06:41:56.000Z");
});

test("credit pack purchase charges wallet balance and adds analysis credits", async () => {
  const db = createLocalAuthDb(join(await mkdtemp(join(tmpdir(), "linkguard-auth-")), "auth.json"));
  const signupResponse = await handleAuthSignup(
    new Request("https://example.test/api/auth/signup", {
      body: JSON.stringify({ password: "correct-password", username: "credit-user" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    { DB: db },
  );
  const cookie = signupResponse.headers.get("Set-Cookie") || "";

  const depositResponse = await handleAuthWalletDeposit(
    new Request("https://example.test/api/auth/wallet/deposit", {
      body: JSON.stringify({ amount: 10000, bank: "kakao" }),
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      method: "POST",
    }),
    { DB: db },
  );
  assert.equal(depositResponse.status, 200);

  const purchaseResponse = await handleAuthCreditPurchase(
    new Request("https://example.test/api/auth/credits/purchase", {
      body: JSON.stringify({ packId: "thirty" }),
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      method: "POST",
    }),
    { DB: db },
  );
  const body = await purchaseResponse.json();

  assert.equal(purchaseResponse.status, 200);
  assert.equal(body.chargedAmount, 9900);
  assert.equal(body.creditsAdded, 30);
  assert.equal(body.account.analysisCredits, 30);
  assert.equal(body.account.walletBalance, 100);
});

function createFakeWalletDb({ purchase, tokenHash, user }) {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async all() {
              if (sql.includes("FROM wallet_transactions")) {
                return { results: [purchase] };
              }

              return { results: [] };
            },
            async first() {
              if (sql.includes("INNER JOIN users")) {
                return args[0] === tokenHash ? user : null;
              }

              if (sql.includes("type = 'plan_purchase'")) {
                return args[0] === user.id && args[1] === user.plan ? purchase : null;
              }

              return null;
            },
          };
        },
      };
    },
  };
}

async function digestHex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
