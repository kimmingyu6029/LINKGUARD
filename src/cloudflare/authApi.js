import { calculateSubscriptionExpiresAt } from "../lib/subscriptionPeriod.js";

const AUTH_COOKIE = "linkguard_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const REQUEST_LIMIT_BYTES = 16 * 1024;
const PASSWORD_ITERATIONS = 100_000;
const PASSWORD_HASH_ALGORITHM = "PBKDF2-SHA256";
const USERNAME_PATTERN = /^[\p{L}\p{N}._-]+$/u;
const PLANS = new Set(["Free", "Pro", "Team", "Business"]);
const DEVELOPER_USERNAMES = new Set(["kimmingyu6029"]);
const PLAN_PRICES = {
  Business: 49_000,
  Free: 0,
  Pro: 4_900,
  Team: 19_900,
};
const CREDIT_PACKS = {
  single: {
    credits: 1,
    name: "1회 검사권",
    price: 900,
  },
  thirty: {
    credits: 30,
    name: "30회 검사권",
    price: 9_900,
  },
  hundred: {
    credits: 100,
    name: "100회 검사권",
    price: 24_900,
  },
};
const BANK_LABELS = {
  kakao: "카카오뱅크",
  other: "타사 은행",
  toss: "토스뱅크",
};
const ANNUAL_DISCOUNT_RATE = 0.2;

export async function handleAuthSession(request, env = {}) {
  const session = await readSession(request, env);

  if (!session) {
    return sendJson(200, {
      account: anonymousAccount(),
    });
  }

  const db = getAuthDb(env);

  return sendJson(200, {
    account: await serializeAccountWithFallbackPeriod(db, session.user),
  });
}

export async function handleAuthSignup(request, env = {}) {
  if (request.method !== "POST") {
    return sendJson(405, { error: "Method not allowed" });
  }

  const db = getAuthDb(env);
  const body = await readJsonBody(request);
  const username = normalizeUsername(body.username);
  const password = typeof body.password === "string" ? body.password : "";
  const validationError = validateCredentials(username, password);

  if (validationError) {
    return sendJson(400, { error: validationError });
  }

  const usernameLower = username.toLocaleLowerCase("ko-KR");
  const existingUser = await findUserByUsername(db, usernameLower);

  if (existingUser) {
    return sendJson(409, { error: "이미 사용 중인 아이디입니다." });
  }

  const now = new Date().toISOString();
  const passwordRecord = await createPasswordRecord(password);
  const user = {
    id: crypto.randomUUID(),
    passwordHash: passwordRecord.hash,
    passwordIterations: passwordRecord.iterations,
    passwordSalt: passwordRecord.salt,
    plan: "Free",
    analysis_credits: 0,
    username,
    usernameLower,
    wallet_balance: 0,
  };

  await db
    .prepare(
      `INSERT INTO users (
        id,
        username,
        username_lower,
        password_hash,
        password_salt,
        password_iterations,
        plan,
        analysis_credits,
        wallet_balance,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      user.id,
      user.username,
      user.usernameLower,
      user.passwordHash,
      user.passwordSalt,
      user.passwordIterations,
      user.plan,
      user.analysis_credits,
      user.wallet_balance,
      now,
      now,
    )
    .run();

  const { cookie, account } = await createSessionResponse({
    db,
    request,
    user,
  });

  return sendJson(201, { account }, { "Set-Cookie": cookie });
}

export async function handleAuthLogin(request, env = {}) {
  if (request.method !== "POST") {
    return sendJson(405, { error: "Method not allowed" });
  }

  const db = getAuthDb(env);
  const body = await readJsonBody(request);
  const username = normalizeUsername(body.username);
  const password = typeof body.password === "string" ? body.password : "";
  const usernameLower = username.toLocaleLowerCase("ko-KR");
  const user = usernameLower ? await findUserByUsername(db, usernameLower) : null;
  const isValid = user ? await verifyPassword(password, user) : false;

  if (!isValid) {
    return sendJson(401, { error: "아이디 또는 비밀번호가 일치하지 않습니다." });
  }

  const { cookie, account } = await createSessionResponse({
    db,
    request,
    user,
  });

  return sendJson(200, { account }, { "Set-Cookie": cookie });
}

export async function handleAuthLogout(request, env = {}) {
  if (request.method !== "POST") {
    return sendJson(405, { error: "Method not allowed" });
  }

  const db = getAuthDb(env);
  const token = readCookie(request, AUTH_COOKIE);

  if (token) {
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await digestHex(token)).run();
  }

  return sendJson(
    200,
    {
      account: anonymousAccount(),
    },
    { "Set-Cookie": expireSessionCookie(request) },
  );
}

export async function handleAuthPlan(request, env = {}) {
  if (request.method !== "POST") {
    return sendJson(405, { error: "Method not allowed" });
  }

  const db = getAuthDb(env);
  const session = await readSession(request, env);

  if (!session) {
    return sendJson(401, { error: "로그인이 필요합니다." });
  }

  const body = await readJsonBody(request);
  const plan = normalizePlan(body.plan);
  const billing = normalizeBilling(body.billing);

  if (!plan) {
    return sendJson(400, { error: "유효한 요금제를 선택해 주세요." });
  }

  const purchasedAt = new Date();
  const now = purchasedAt.toISOString();
  const chargeAmount = getPlanChargeAmount(plan, billing);
  const subscriptionExpiresAt = chargeAmount > 0 ? calculateSubscriptionExpiresAt(purchasedAt, billing) : "";

  if (chargeAmount > 0) {
    const updateResult = await db
      .prepare(
        `UPDATE users
        SET plan = ?,
            plan_billing = ?,
            plan_started_at = ?,
            plan_expires_at = ?,
            wallet_balance = wallet_balance - ?,
            updated_at = ?
        WHERE id = ? AND wallet_balance >= ?`,
      )
      .bind(plan, billing, now, subscriptionExpiresAt, chargeAmount, now, session.user.id, chargeAmount)
      .run();

    if (!hasChangedRows(updateResult)) {
      const currentUser = await findUserById(db, session.user.id);
      return sendJson(402, {
        account: currentUser
          ? await serializeAccountWithFallbackPeriod(db, currentUser)
          : await serializeAccountWithFallbackPeriod(db, session.user),
        error: `잔액이 부족합니다. 내 계좌에서 ${formatWon(chargeAmount)} 이상 충전해 주세요.`,
        requiredAmount: chargeAmount,
      });
    }

    const updatedUser = await findUserById(db, session.user.id);
    await insertWalletTransaction(db, {
      amount: -chargeAmount,
      balanceAfter: normalizeBalance(updatedUser.wallet_balance),
      billing,
      note: `${plan} ${billing === "yearly" ? "연간" : "월간"} 요금제 결제`,
      plan,
      subscriptionExpiresAt,
      subscriptionStartedAt: now,
      type: "plan_purchase",
      userId: session.user.id,
    });

    return sendJson(200, {
      account: serializeAccount(updatedUser),
      chargedAmount: chargeAmount,
    });
  }

  await db
    .prepare(
      "UPDATE users SET plan = ?, plan_billing = NULL, plan_started_at = NULL, plan_expires_at = NULL, updated_at = ? WHERE id = ?",
    )
    .bind(plan, now, session.user.id)
    .run();
  const updatedUser = await findUserById(db, session.user.id);

  return sendJson(200, {
    account: serializeAccount(updatedUser),
    chargedAmount: 0,
  });
}

export async function handleAuthWallet(request, env = {}) {
  if (request.method !== "GET") {
    return sendJson(405, { error: "Method not allowed" });
  }

  const db = getAuthDb(env);
  const session = await readSession(request, env);

  if (!session) {
    return sendJson(401, { error: "로그인이 필요합니다." });
  }

  return sendJson(200, {
    account: await serializeAccountWithFallbackPeriod(db, session.user),
    transactions: await listWalletTransactions(db, session.user.id),
  });
}

export async function handleAuthCreditPurchase(request, env = {}) {
  if (request.method !== "POST") {
    return sendJson(405, { error: "Method not allowed" });
  }

  const db = getAuthDb(env);
  const session = await readSession(request, env);

  if (!session) {
    return sendJson(401, { error: "로그인이 필요합니다." });
  }

  const body = await readJsonBody(request);
  const pack = CREDIT_PACKS[String(body.packId || "")];

  if (!pack) {
    return sendJson(400, { error: "구매할 검사권 상품을 선택해 주세요." });
  }

  const now = new Date().toISOString();
  const updateResult = await db
    .prepare(
      `UPDATE users
      SET wallet_balance = wallet_balance - ?,
          analysis_credits = analysis_credits + ?,
          updated_at = ?
      WHERE id = ? AND wallet_balance >= ?`,
    )
    .bind(pack.price, pack.credits, now, session.user.id, pack.price)
    .run();

  if (!hasChangedRows(updateResult)) {
    const currentUser = await findUserById(db, session.user.id);
    return sendJson(402, {
      account: currentUser
        ? await serializeAccountWithFallbackPeriod(db, currentUser)
        : await serializeAccountWithFallbackPeriod(db, session.user),
      error: `잔액이 부족합니다. 내 계좌에서 ${formatWon(pack.price)} 이상 충전해 주세요.`,
      requiredAmount: pack.price,
    });
  }

  const updatedUser = await findUserById(db, session.user.id);
  await insertWalletTransaction(db, {
    amount: -pack.price,
    balanceAfter: normalizeBalance(updatedUser.wallet_balance),
    note: `${pack.name} 구매 (${pack.credits}회)`,
    plan: "credits",
    type: "credit_purchase",
    userId: session.user.id,
  });

  return sendJson(200, {
    account: serializeAccount(updatedUser),
    chargedAmount: pack.price,
    creditsAdded: pack.credits,
  });
}

export async function handleAuthCreditUse(request, env = {}) {
  if (request.method !== "POST") {
    return sendJson(405, { error: "Method not allowed" });
  }

  const db = getAuthDb(env);
  const session = await readSession(request, env);

  if (!session) {
    return sendJson(401, { error: "로그인이 필요합니다." });
  }

  if (normalizePlan(session.user.plan) && normalizePlan(session.user.plan) !== "Free") {
    return sendJson(200, {
      account: await serializeAccountWithFallbackPeriod(db, session.user),
      remainingCredits: normalizeCredits(session.user.analysis_credits),
      skipped: true,
    });
  }

  const now = new Date().toISOString();
  const updateResult = await db
    .prepare("UPDATE users SET analysis_credits = analysis_credits - 1, updated_at = ? WHERE id = ? AND analysis_credits > 0")
    .bind(now, session.user.id)
    .run();

  if (!hasChangedRows(updateResult)) {
    const currentUser = await findUserById(db, session.user.id);
    return sendJson(402, {
      account: currentUser
        ? await serializeAccountWithFallbackPeriod(db, currentUser)
        : await serializeAccountWithFallbackPeriod(db, session.user),
      error: "남은 검사권이 없습니다. 검사권을 구매하거나 구독 요금제를 선택해 주세요.",
    });
  }

  const updatedUser = await findUserById(db, session.user.id);

  return sendJson(200, {
    account: serializeAccount(updatedUser),
    remainingCredits: normalizeCredits(updatedUser.analysis_credits),
  });
}

export async function handleAuthWalletDeposit(request, env = {}) {
  if (request.method !== "POST") {
    return sendJson(405, { error: "Method not allowed" });
  }

  const db = getAuthDb(env);
  const session = await readSession(request, env);

  if (!session) {
    return sendJson(401, { error: "로그인이 필요합니다." });
  }

  const body = await readJsonBody(request);
  const bank = normalizeBank(body.bank);
  const amount = normalizeAmount(body.amount);

  if (!bank) {
    return sendJson(400, { error: "충전 은행을 선택해 주세요." });
  }

  if (!amount) {
    return sendJson(400, { error: "충전 금액은 1,000원 이상 1,000,000원 이하로 입력해 주세요." });
  }

  const now = new Date().toISOString();

  await db
    .prepare("UPDATE users SET wallet_balance = wallet_balance + ?, updated_at = ? WHERE id = ?")
    .bind(amount, now, session.user.id)
    .run();

  const updatedUser = await findUserById(db, session.user.id);
  const transaction = await insertWalletTransaction(db, {
    amount,
    balanceAfter: normalizeBalance(updatedUser.wallet_balance),
    bank,
    note: `${BANK_LABELS[bank]} 시각용 충전`,
    type: "deposit",
    userId: session.user.id,
  });

  return sendJson(200, {
    account: serializeAccount(updatedUser),
    transaction,
    transactions: await listWalletTransactions(db, session.user.id),
  });
}

export function authErrorResponse(error) {
  return sendJson(error.statusCode || 500, {
    error: error.message || "Internal server error",
  });
}

export async function createPasswordRecord(password) {
  const saltBytes = randomBytes(16);
  const hashBytes = await derivePasswordHash(password, saltBytes, PASSWORD_ITERATIONS);

  return {
    algorithm: PASSWORD_HASH_ALGORITHM,
    hash: encodeBase64Url(hashBytes),
    iterations: PASSWORD_ITERATIONS,
    salt: encodeBase64Url(saltBytes),
  };
}

export async function verifyPassword(password, user) {
  if (!password || !user?.password_hash || !user?.password_salt) {
    return false;
  }

  const iterations = Number(user.password_iterations || PASSWORD_ITERATIONS);
  const saltBytes = decodeBase64Url(user.password_salt);
  const expectedHash = decodeBase64Url(user.password_hash);
  const actualHash = await derivePasswordHash(password, saltBytes, iterations);

  return constantTimeEqual(actualHash, expectedHash);
}

async function readSession(request, env = {}) {
  const db = getAuthDb(env);
  const token = readCookie(request, AUTH_COOKIE);

  if (!token) {
    return null;
  }

  const tokenHash = await digestHex(token);
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      `SELECT
        users.id,
        users.username,
        users.username_lower,
        users.plan,
        users.plan_billing,
        users.plan_started_at,
        users.plan_expires_at,
        users.analysis_credits,
        users.wallet_balance,
        sessions.id AS session_id,
        sessions.expires_at
      FROM sessions
      INNER JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
      LIMIT 1`,
    )
    .bind(tokenHash, now)
    .first();

  if (!row) {
    return null;
  }

  return {
    sessionId: row.session_id,
    user: row,
  };
}

async function createSessionResponse({ db, request, user }) {
  const now = new Date();
  const token = encodeBase64Url(randomBytes(32));
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();

  await db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now.toISOString()).run();
  await db
    .prepare("INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), user.id, await digestHex(token), now.toISOString(), expiresAt)
    .run();

  const account = await serializeAccountWithFallbackPeriod(db, user);
  const cookie = createSessionCookie(request, token);

  return { account, cookie };
}

async function findUserByUsername(db, usernameLower) {
  return db
    .prepare(
      `SELECT
        id,
        username,
        username_lower,
        password_hash,
        password_salt,
        password_iterations,
        plan,
        plan_billing,
        plan_started_at,
        plan_expires_at,
        analysis_credits,
        wallet_balance
      FROM users
      WHERE username_lower = ?
      LIMIT 1`,
    )
    .bind(usernameLower)
    .first();
}

async function findUserById(db, userId) {
  return db
    .prepare(
      `SELECT
        id,
        username,
        username_lower,
        plan,
        plan_billing,
        plan_started_at,
        plan_expires_at,
        analysis_credits,
        wallet_balance
      FROM users
      WHERE id = ?
      LIMIT 1`,
    )
    .bind(userId)
    .first();
}

async function insertWalletTransaction(db, transaction) {
  const row = {
    amount: Number(transaction.amount || 0),
    balanceAfter: normalizeBalance(transaction.balanceAfter),
    bank: transaction.bank || "",
    billing: transaction.billing || "",
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    note: transaction.note || "",
    plan: transaction.plan || "",
    subscriptionExpiresAt: transaction.subscriptionExpiresAt || "",
    subscriptionStartedAt: transaction.subscriptionStartedAt || "",
    type: transaction.type,
    userId: transaction.userId,
  };

  await db
    .prepare(
      `INSERT INTO wallet_transactions (
        id,
        user_id,
        type,
        bank,
        plan,
        billing,
        subscription_started_at,
        subscription_expires_at,
        amount,
        balance_after,
        note,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.userId,
      row.type,
      row.bank,
      row.plan,
      row.billing,
      row.subscriptionStartedAt,
      row.subscriptionExpiresAt,
      row.amount,
      row.balanceAfter,
      row.note,
      row.createdAt,
    )
    .run();

  return serializeTransaction(row);
}

async function listWalletTransactions(db, userId) {
  const result = await db
    .prepare(
      `SELECT
        id,
        type,
        bank,
        plan,
        billing,
        subscription_started_at,
        subscription_expires_at,
        amount,
        balance_after,
        note,
        created_at
      FROM wallet_transactions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 10`,
    )
    .bind(userId)
    .all();

  return (result.results || []).map((row) =>
    serializeTransaction({
      amount: row.amount,
      balanceAfter: row.balance_after,
      bank: row.bank,
      billing: row.billing,
      createdAt: row.created_at,
      id: row.id,
      note: row.note,
      plan: row.plan,
      subscriptionExpiresAt: row.subscription_expires_at,
      subscriptionStartedAt: row.subscription_started_at,
      type: row.type,
    }),
  );
}

async function findLatestPlanPurchase(db, userId, plan) {
  return db
    .prepare(
      `SELECT
        plan,
        billing,
        subscription_started_at,
        subscription_expires_at,
        created_at
      FROM wallet_transactions
      WHERE user_id = ? AND type = 'plan_purchase' AND plan = ?
      ORDER BY created_at DESC
      LIMIT 1`,
    )
    .bind(userId, plan)
    .first();
}

async function derivePasswordHash(password, saltBytes, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      hash: "SHA-256",
      iterations,
      name: "PBKDF2",
      salt: saltBytes,
    },
    keyMaterial,
    256,
  );

  return new Uint8Array(bits);
}

async function digestHex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function serializeAccount(user) {
  return {
    id: user.id,
    analysisCredits: normalizeCredits(user.analysis_credits),
    isDeveloper: isDeveloperAccount(user),
    isLoggedIn: true,
    plan: normalizePlan(user.plan) || "Free",
    planBilling: user.plan_billing || "",
    planExpiresAt: user.plan_expires_at || "",
    planStartedAt: user.plan_started_at || "",
    username: user.username,
    walletBalance: normalizeBalance(user.wallet_balance),
  };
}

function isDeveloperAccount(user) {
  return DEVELOPER_USERNAMES.has(String(user?.username_lower || user?.username || "").toLocaleLowerCase("ko-KR"));
}

async function serializeAccountWithFallbackPeriod(db, user) {
  if (!user || normalizePlan(user.plan) === "Free" || (user.plan_started_at && user.plan_expires_at)) {
    return serializeAccount(user);
  }

  const latestPurchase = await findLatestPlanPurchase(db, user.id, user.plan);

  if (!latestPurchase?.created_at) {
    return serializeAccount(user);
  }

  const planStartedAt = latestPurchase.subscription_started_at || latestPurchase.created_at;

  return serializeAccount({
    ...user,
    plan_billing: user.plan_billing || latestPurchase.billing || "monthly",
    plan_expires_at:
      user.plan_expires_at ||
      latestPurchase.subscription_expires_at ||
      calculateSubscriptionExpiresAt(planStartedAt, latestPurchase.billing),
    plan_started_at: user.plan_started_at || planStartedAt,
  });
}

function serializeTransaction(transaction) {
  const subscriptionStartedAt =
    transaction.type === "plan_purchase" ? transaction.subscriptionStartedAt || transaction.createdAt || "" : "";
  const subscriptionExpiresAt =
    transaction.type === "plan_purchase"
      ? transaction.subscriptionExpiresAt || calculateSubscriptionExpiresAt(subscriptionStartedAt, transaction.billing)
      : "";

  return {
    amount: Number(transaction.amount || 0),
    balanceAfter: Number(transaction.balanceAfter || 0),
    bank: transaction.bank || "",
    billing: transaction.billing || "",
    createdAt: transaction.createdAt || "",
    id: transaction.id,
    note: transaction.note || "",
    plan: transaction.plan || "",
    subscriptionExpiresAt,
    subscriptionStartedAt,
    type: transaction.type,
  };
}

function anonymousAccount() {
  return {
    isLoggedIn: false,
    plan: "Free",
    analysisCredits: 0,
    planBilling: "",
    planExpiresAt: "",
    planStartedAt: "",
    walletBalance: 0,
  };
}

function validateCredentials(username, password) {
  if (username.length < 3 || username.length > 32) {
    return "아이디는 3~32자로 입력해 주세요.";
  }

  if (!USERNAME_PATTERN.test(username)) {
    return "아이디는 문자, 숫자, 점, 밑줄, 하이픈만 사용할 수 있습니다.";
  }

  if (password.length < 8 || password.length > 128) {
    return "비밀번호는 8~128자로 입력해 주세요.";
  }

  return "";
}

function normalizeUsername(value) {
  return String(value || "").trim();
}

function normalizePlan(value) {
  return PLANS.has(value) ? value : "";
}

function normalizeBilling(value) {
  return value === "yearly" ? "yearly" : "monthly";
}

function normalizeBank(value) {
  return Object.prototype.hasOwnProperty.call(BANK_LABELS, value) ? value : "";
}

function normalizeAmount(value) {
  const amount = Math.floor(Number(value));

  if (!Number.isFinite(amount) || amount < 1000 || amount > 1_000_000) {
    return 0;
  }

  return amount;
}

function normalizeBalance(value) {
  const balance = Number(value || 0);
  return Number.isFinite(balance) ? Math.max(0, Math.floor(balance)) : 0;
}

function normalizeCredits(value) {
  const credits = Number(value || 0);
  return Number.isFinite(credits) ? Math.max(0, Math.floor(credits)) : 0;
}

function getPlanChargeAmount(plan, billing) {
  const monthlyPrice = PLAN_PRICES[plan] || 0;

  if (monthlyPrice <= 0) {
    return 0;
  }

  if (billing === "yearly") {
    return Math.round(monthlyPrice * 12 * (1 - ANNUAL_DISCOUNT_RATE));
  }

  return monthlyPrice;
}

function hasChangedRows(result) {
  return Number(result?.meta?.changes || 0) > 0;
}

function formatWon(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}

async function readJsonBody(request) {
  const body = await request.text();

  if (new TextEncoder().encode(body).byteLength > REQUEST_LIMIT_BYTES) {
    const error = new Error("Request body too large");
    error.statusCode = 413;
    throw error;
  }

  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    const error = new Error("Invalid JSON");
    error.statusCode = 400;
    throw error;
  }
}

function getAuthDb(env = {}) {
  if (!env.DB) {
    const error = new Error("회원 데이터베이스가 연결되어 있지 않습니다.");
    error.statusCode = 503;
    throw error;
  }

  return env.DB;
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";

  for (const cookie of header.split(";")) {
    const [rawKey, ...rawValue] = cookie.trim().split("=");
    if (rawKey === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return "";
}

function createSessionCookie(request, token) {
  return [
    `${AUTH_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    shouldUseSecureCookie(request) ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function expireSessionCookie(request) {
  return [
    `${AUTH_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    shouldUseSecureCookie(request) ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function shouldUseSecureCookie(request) {
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return true;
  }
}

function sendJson(statusCode, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
    status: statusCode,
  });
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function encodeBase64Url(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }

  return diff === 0;
}
