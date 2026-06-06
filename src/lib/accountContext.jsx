import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { formatSubscriptionPeriod } from "./subscriptionPeriod.js";

const STORAGE_KEY = "linkguard-account";
const PAID_PLANS = new Set(["Pro", "Team", "Business"]);
const PLAN_NAMES = ["Free", "Pro", "Team", "Business"];
const DEFAULT_ACCOUNT = {
  id: "",
  analysisCredits: 0,
  isDeveloper: false,
  isLoggedIn: false,
  plan: "Free",
  planBilling: "",
  planExpiresAt: "",
  planPeriodLabel: "",
  planStartedAt: "",
  username: "",
  walletBalance: 0,
};

const AccountContext = createContext(null);

export function AccountProvider({ children }) {
  const [account, setAccount] = useState(readStoredAccount);
  const [isAccountLoading, setIsAccountLoading] = useState(true);
  const [authDialog, setAuthDialog] = useState({
    isOpen: false,
    message: "",
    mode: "login",
  });
  const [pendingPlan, setPendingPlan] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [isWalletLoading, setIsWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState("");

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
  }, [account]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadSession() {
      try {
        const payload = await requestAuthJson("/api/auth/session", {
          signal: controller.signal,
        });
        setAccount(normalizeServerAccount(payload.account));
      } catch {
        setAccount(DEFAULT_ACCOUNT);
      } finally {
        if (!controller.signal.aborted) {
          setIsAccountLoading(false);
        }
      }
    }

    loadSession();

    return () => controller.abort();
  }, []);

  const openAuthDialog = useCallback((mode = "login", options = {}) => {
    if (options.plan) {
      setPendingPlan(normalizePlan(options.plan));
    }

    setAuthError("");
    setAuthDialog({
      isOpen: true,
      message: options.message || "",
      mode: mode === "signup" ? "signup" : "login",
    });
  }, []);

  const closeAuthDialog = useCallback(() => {
    setAuthDialog((current) => ({
      ...current,
      isOpen: false,
    }));
    setAuthError("");
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError("");
  }, []);

  const login = useCallback(
    async ({ password, username }) => {
      setIsAuthSubmitting(true);
      setAuthError("");

      try {
        const payload = await requestAuthJson("/api/auth/login", {
          body: JSON.stringify({ password, username }),
          method: "POST",
        });
        const nextAccount = normalizeServerAccount(payload.account);
        setAccount(nextAccount);
        setPendingPlan("");
        closeAuthDialog();
        return nextAccount;
      } catch (error) {
        setAuthError(error.message);
        throw error;
      } finally {
        setIsAuthSubmitting(false);
      }
    },
    [closeAuthDialog],
  );

  const signup = useCallback(
    async ({ password, username }) => {
      setIsAuthSubmitting(true);
      setAuthError("");

      try {
        const payload = await requestAuthJson("/api/auth/signup", {
          body: JSON.stringify({ password, username }),
          method: "POST",
        });
        const nextAccount = normalizeServerAccount(payload.account);
        setAccount(nextAccount);
        setPendingPlan("");
        closeAuthDialog();
        return nextAccount;
      } catch (error) {
        setAuthError(error.message);
        throw error;
      } finally {
        setIsAuthSubmitting(false);
      }
    },
    [closeAuthDialog],
  );

  const logout = useCallback(async () => {
    setAuthError("");

    try {
      await requestAuthJson("/api/auth/logout", {
        method: "POST",
      });
    } catch {
      // Local state still needs to be cleared if the session is already gone.
    }

    setPendingPlan("");
    setWalletTransactions([]);
    setAccount(DEFAULT_ACCOUNT);
  }, []);

  const selectPlan = useCallback(
    async (plan, options = {}) => {
      const normalizedPlan = normalizePlan(plan);

      if (!account.isLoggedIn) {
        setPendingPlan(normalizedPlan);
        openAuthDialog("signup", {
          message: `${normalizedPlan} 요금제를 계정에 저장하려면 회원가입 또는 로그인이 필요합니다.`,
          plan: normalizedPlan,
        });
        return { ok: false, reason: "login_required" };
      }

      try {
        const payload = await requestAuthJson("/api/auth/plan", {
          body: JSON.stringify({ billing: options.billing || "monthly", plan: normalizedPlan }),
          method: "POST",
        });
        const nextAccount = normalizeServerAccount(payload.account);
        setAccount(nextAccount);
        return {
          account: nextAccount,
          chargedAmount: Number(payload.chargedAmount || 0),
          ok: true,
          subscriptionPeriodLabel: nextAccount.planPeriodLabel,
        };
      } catch (error) {
        if (error.payload?.account) {
          setAccount(normalizeServerAccount(error.payload.account));
        }

        return {
          error: error.message,
          ok: false,
          reason: "payment_failed",
          requiredAmount: Number(error.payload?.requiredAmount || 0),
        };
      }
    },
    [account.isLoggedIn, openAuthDialog],
  );

  const loadWallet = useCallback(async () => {
    if (!account.isLoggedIn) {
      setWalletTransactions([]);
      return [];
    }

    setIsWalletLoading(true);
    setWalletError("");

    try {
      const payload = await requestAuthJson("/api/auth/wallet");
      setAccount(normalizeServerAccount(payload.account));
      setWalletTransactions(normalizeTransactions(payload.transactions));
      return payload.transactions || [];
    } catch (error) {
      setWalletError(error.message);
      return [];
    } finally {
      setIsWalletLoading(false);
    }
  }, [account.isLoggedIn]);

  const depositWallet = useCallback(async ({ amount, bank }) => {
    setIsWalletLoading(true);
    setWalletError("");

    try {
      const payload = await requestAuthJson("/api/auth/wallet/deposit", {
        body: JSON.stringify({ amount, bank }),
        method: "POST",
      });
      const nextAccount = normalizeServerAccount(payload.account);
      setAccount(nextAccount);
      setWalletTransactions(normalizeTransactions(payload.transactions));
      return {
        account: nextAccount,
        ok: true,
        transaction: payload.transaction,
      };
    } catch (error) {
      setWalletError(error.message);
      return {
        error: error.message,
        ok: false,
      };
    } finally {
      setIsWalletLoading(false);
    }
  }, []);

  const purchaseCreditPack = useCallback(
    async (packId) => {
      if (!account.isLoggedIn) {
        openAuthDialog("signup", {
          message: "검사권을 구매하려면 회원가입 또는 로그인이 필요합니다.",
        });
        return { ok: false, reason: "login_required" };
      }

      try {
        const payload = await requestAuthJson("/api/auth/credits/purchase", {
          body: JSON.stringify({ packId }),
          method: "POST",
        });
        const nextAccount = normalizeServerAccount(payload.account);
        setAccount(nextAccount);
        return {
          account: nextAccount,
          chargedAmount: Number(payload.chargedAmount || 0),
          creditsAdded: Number(payload.creditsAdded || 0),
          ok: true,
        };
      } catch (error) {
        if (error.payload?.account) {
          setAccount(normalizeServerAccount(error.payload.account));
        }

        return {
          error: error.message,
          ok: false,
          reason: "payment_failed",
          requiredAmount: Number(error.payload?.requiredAmount || 0),
        };
      }
    },
    [account.isLoggedIn, openAuthDialog],
  );

  const useAnalysisCredit = useCallback(async ({ url } = {}) => {
    if (!account.isLoggedIn || canUseExpertMode(account.plan)) {
      return { ok: true, skipped: true };
    }

    try {
      const payload = await requestAuthJson("/api/auth/credits/use", {
        body: JSON.stringify({ url: url || "" }),
        method: "POST",
      });
      const nextAccount = normalizeServerAccount(payload.account);
      setAccount(nextAccount);
      return {
        account: nextAccount,
        ok: true,
        remainingCredits: Number(payload.remainingCredits || nextAccount.analysisCredits || 0),
      };
    } catch (error) {
      if (error.payload?.account) {
        setAccount(normalizeServerAccount(error.payload.account));
      }

      return {
        error: error.message,
        ok: false,
      };
    }
  }, [account.isLoggedIn, account.plan]);

  const value = useMemo(
    () => ({
      ...account,
      authDialog,
      authError,
      canUseExpert: account.isLoggedIn && (canUseExpertMode(account.plan) || account.analysisCredits > 0),
      clearAuthError,
      closeAuthDialog,
      depositWallet,
      isAccountLoading,
      isAuthSubmitting,
      isWalletLoading,
      loadWallet,
      login,
      logout,
      openAuthDialog,
      pendingPlan,
      purchaseCreditPack,
      selectPlan,
      signup,
      useAnalysisCredit,
      walletError,
      walletTransactions,
    }),
    [
      account,
      authDialog,
      authError,
      clearAuthError,
      closeAuthDialog,
      depositWallet,
      isAccountLoading,
      isAuthSubmitting,
      isWalletLoading,
      loadWallet,
      login,
      logout,
      openAuthDialog,
      pendingPlan,
      purchaseCreditPack,
      selectPlan,
      signup,
      useAnalysisCredit,
      walletError,
      walletTransactions,
    ],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const account = useContext(AccountContext);
  if (!account) {
    throw new Error("useAccount must be used inside AccountProvider");
  }

  return account;
}

export function canUseExpertMode(plan) {
  return PAID_PLANS.has(plan);
}

async function requestAuthJson(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const error = new Error(payload.error || `인증 요청에 실패했습니다. (${response.status})`);
    error.payload = payload;
    throw error;
  }

  return payload;
}

function readStoredAccount() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object") {
      return DEFAULT_ACCOUNT;
    }

    return normalizeServerAccount(parsed);
  } catch {
    return DEFAULT_ACCOUNT;
  }
}

function normalizeServerAccount(account) {
  if (!account || typeof account !== "object" || !account.isLoggedIn) {
    return DEFAULT_ACCOUNT;
  }

  const planStartedAt = typeof account.planStartedAt === "string" ? account.planStartedAt : "";
  const planExpiresAt = typeof account.planExpiresAt === "string" ? account.planExpiresAt : "";
  const plan = normalizePlan(account.plan);

  return {
    id: typeof account.id === "string" ? account.id : "",
    analysisCredits: normalizeCredits(account.analysisCredits ?? account.analysis_credits),
    isDeveloper: account.isDeveloper === true,
    isLoggedIn: true,
    plan,
    planBilling: normalizeBilling(account.planBilling),
    planExpiresAt,
    planPeriodLabel: plan === "Free" ? "" : formatSubscriptionPeriod(planStartedAt, planExpiresAt),
    planStartedAt,
    username: typeof account.username === "string" ? account.username : "",
    walletBalance: normalizeBalance(account.walletBalance),
  };
}

function normalizePlan(plan) {
  return PLAN_NAMES.includes(plan) ? plan : "Free";
}

function normalizeBilling(billing) {
  return billing === "monthly" || billing === "yearly" ? billing : "";
}

function normalizeBalance(value) {
  const balance = Number(value || 0);
  return Number.isFinite(balance) ? Math.max(0, Math.floor(balance)) : 0;
}

function normalizeCredits(value) {
  const credits = Number(value || 0);
  return Number.isFinite(credits) ? Math.max(0, Math.floor(credits)) : 0;
}

function normalizeTransactions(transactions) {
  return Array.isArray(transactions) ? transactions : [];
}
