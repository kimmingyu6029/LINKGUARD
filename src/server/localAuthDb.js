import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEFAULT_DATA = {
  sessions: [],
  users: [],
  wallet_transactions: [],
};

export function createLocalAuthDb(filePath) {
  const absolutePath = resolve(filePath);
  let dataPromise = null;

  async function loadData() {
    if (!dataPromise) {
      dataPromise = readFile(absolutePath, "utf8")
        .then((text) => normalizeData(JSON.parse(text)))
        .catch((error) => {
          if (error.code === "ENOENT") {
            return structuredClone(DEFAULT_DATA);
          }

          throw error;
        });
    }

    return dataPromise;
  }

  async function saveData(data) {
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  return {
    __readData: loadData,
    prepare(sql) {
      return {
        all: () => executeAll({ args: [], loadData, sql }),
        bind(...args) {
          return {
            all: () => executeAll({ args, loadData, sql }),
            first: () => executeFirst({ args, loadData, sql }),
            run: () => executeRun({ args, loadData, saveData, sql }),
          };
        },
        first: () => executeFirst({ args: [], loadData, sql }),
        run: () => executeRun({ args: [], loadData, saveData, sql }),
      };
    },
  };
}

async function executeFirst({ args, loadData, sql }) {
  const data = await loadData();
  const normalizedSql = normalizeSql(sql);

  if (normalizedSql.includes("from users") && normalizedSql.includes("where username_lower = ?")) {
    return data.users.find((user) => user.username_lower === args[0]) || null;
  }

  if (normalizedSql.includes("from users") && normalizedSql.includes("where id = ?")) {
    return data.users.find((user) => user.id === args[0]) || null;
  }

  if (normalizedSql.includes("inner join users") && normalizedSql.includes("sessions.token_hash = ?")) {
    const [tokenHash, now] = args;
    const session = data.sessions.find((item) => item.token_hash === tokenHash && item.expires_at > now);
    const user = session ? data.users.find((item) => item.id === session.user_id) : null;

    return user && session
      ? {
          ...user,
          expires_at: session.expires_at,
          session_id: session.id,
        }
      : null;
  }

  if (normalizedSql.includes("select user_id from sessions") && normalizedSql.includes("token_hash = ?")) {
    const [tokenHash, now] = args;
    const session = data.sessions.find((item) => item.token_hash === tokenHash && item.expires_at > now);
    return session ? { user_id: session.user_id } : null;
  }

  if (normalizedSql.includes("from wallet_transactions") && normalizedSql.includes("type = 'plan_purchase'")) {
    const [userId, plan] = args;
    return (
      data.wallet_transactions
        .filter((item) => item.user_id === userId && item.type === "plan_purchase" && item.plan === plan)
        .sort(descByCreatedAt)[0] || null
    );
  }

  return null;
}

async function executeAll({ args, loadData, sql }) {
  const data = await loadData();
  const normalizedSql = normalizeSql(sql);

  if (normalizedSql.includes("from wallet_transactions") && normalizedSql.includes("where user_id = ?")) {
    const [userId] = args;
    return {
      results: data.wallet_transactions
        .filter((item) => item.user_id === userId)
        .sort(descByCreatedAt)
        .slice(0, 10),
    };
  }

  return { results: [] };
}

async function executeRun({ args, loadData, saveData, sql }) {
  const data = await loadData();
  const normalizedSql = normalizeSql(sql);
  let changes = 0;

  if (normalizedSql.startsWith("insert into users")) {
    const [
      id,
      username,
      usernameLower,
      passwordHash,
      passwordSalt,
      passwordIterations,
      plan,
      analysisCredits,
      walletBalance,
      createdAt,
      updatedAt,
    ] = args;
    data.users.push({
      created_at: createdAt,
      id,
      password_hash: passwordHash,
      password_iterations: passwordIterations,
      password_salt: passwordSalt,
      plan,
      analysis_credits: Number(analysisCredits || 0),
      plan_billing: "",
      plan_expires_at: "",
      plan_started_at: "",
      updated_at: updatedAt,
      username,
      username_lower: usernameLower,
      wallet_balance: Number(walletBalance || 0),
    });
    changes = 1;
  } else if (normalizedSql.startsWith("delete from sessions where expires_at <= ?")) {
    const [now] = args;
    const before = data.sessions.length;
    data.sessions = data.sessions.filter((session) => session.expires_at > now);
    changes = before - data.sessions.length;
  } else if (normalizedSql.startsWith("delete from sessions where token_hash = ?")) {
    const [tokenHash] = args;
    const before = data.sessions.length;
    data.sessions = data.sessions.filter((session) => session.token_hash !== tokenHash);
    changes = before - data.sessions.length;
  } else if (normalizedSql.startsWith("insert into sessions")) {
    const [id, userId, tokenHash, createdAt, expiresAt] = args;
    data.sessions.push({
      created_at: createdAt,
      expires_at: expiresAt,
      id,
      token_hash: tokenHash,
      user_id: userId,
    });
    changes = 1;
  } else if (normalizedSql.startsWith("update users set plan = ?") && normalizedSql.includes("wallet_balance = wallet_balance - ?")) {
    const [plan, billing, startedAt, expiresAt, chargeAmount, updatedAt, userId, requiredAmount] = args;
    const user = data.users.find((item) => item.id === userId && Number(item.wallet_balance || 0) >= Number(requiredAmount || 0));

    if (user) {
      user.plan = plan;
      user.plan_billing = billing;
      user.plan_started_at = startedAt;
      user.plan_expires_at = expiresAt;
      user.wallet_balance = Number(user.wallet_balance || 0) - Number(chargeAmount || 0);
      user.updated_at = updatedAt;
      changes = 1;
    }
  } else if (normalizedSql.startsWith("update users set plan = ?")) {
    const [plan, updatedAt, userId] = args;
    const user = data.users.find((item) => item.id === userId);

    if (user) {
      user.plan = plan;
      user.plan_billing = "";
      user.plan_started_at = "";
      user.plan_expires_at = "";
      user.updated_at = updatedAt;
      changes = 1;
    }
  } else if (normalizedSql.startsWith("update users set wallet_balance = wallet_balance + ?")) {
    const [amount, updatedAt, userId] = args;
    const user = data.users.find((item) => item.id === userId);

    if (user) {
      user.wallet_balance = Number(user.wallet_balance || 0) + Number(amount || 0);
      user.updated_at = updatedAt;
      changes = 1;
    }
  } else if (normalizedSql.startsWith("update users set wallet_balance = wallet_balance - ?") && normalizedSql.includes("analysis_credits = analysis_credits + ?")) {
    const [chargeAmount, credits, updatedAt, userId, requiredAmount] = args;
    const user = data.users.find((item) => item.id === userId && Number(item.wallet_balance || 0) >= Number(requiredAmount || 0));

    if (user) {
      user.wallet_balance = Number(user.wallet_balance || 0) - Number(chargeAmount || 0);
      user.analysis_credits = Number(user.analysis_credits || 0) + Number(credits || 0);
      user.updated_at = updatedAt;
      changes = 1;
    }
  } else if (normalizedSql.startsWith("update users set analysis_credits = analysis_credits - 1")) {
    const [updatedAt, userId] = args;
    const user = data.users.find((item) => item.id === userId && Number(item.analysis_credits || 0) > 0);

    if (user) {
      user.analysis_credits = Number(user.analysis_credits || 0) - 1;
      user.updated_at = updatedAt;
      changes = 1;
    }
  } else if (normalizedSql.startsWith("insert into wallet_transactions")) {
    const [
      id,
      userId,
      type,
      bank,
      plan,
      billing,
      subscriptionStartedAt,
      subscriptionExpiresAt,
      amount,
      balanceAfter,
      note,
      createdAt,
    ] = args;
    data.wallet_transactions.push({
      amount: Number(amount || 0),
      balance_after: Number(balanceAfter || 0),
      bank,
      billing,
      created_at: createdAt,
      id,
      note,
      plan,
      subscription_expires_at: subscriptionExpiresAt,
      subscription_started_at: subscriptionStartedAt,
      type,
      user_id: userId,
    });
    changes = 1;
  }

  if (changes > 0 || normalizedSql.startsWith("delete from sessions")) {
    await saveData(data);
  }

  return { meta: { changes } };
}

function normalizeData(value) {
  return {
    sessions: Array.isArray(value?.sessions) ? value.sessions : [],
    users: Array.isArray(value?.users)
      ? value.users.map((user) => ({
          ...user,
          analysis_credits: Number(user.analysis_credits || 0),
        }))
      : [],
    wallet_transactions: Array.isArray(value?.wallet_transactions) ? value.wallet_transactions : [],
  };
}

function normalizeSql(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function descByCreatedAt(left, right) {
  return String(right.created_at || "").localeCompare(String(left.created_at || ""));
}
