import { AlertCircle, LogIn, UserPlus, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useAccount } from "../lib/accountContext.jsx";

export default function AuthDialog() {
  const {
    authDialog,
    authError,
    clearAuthError,
    closeAuthDialog,
    isAuthSubmitting,
    login,
    openAuthDialog,
    pendingPlan,
    signup,
  } = useAccount();
  const usernameId = useId();
  const passwordId = useId();
  const confirmPasswordId = useId();
  const [form, setForm] = useState({
    confirmPassword: "",
    password: "",
    username: "",
  });
  const [formError, setFormError] = useState("");
  const isSignup = authDialog.mode === "signup";

  useEffect(() => {
    if (authDialog.isOpen) {
      setForm({
        confirmPassword: "",
        password: "",
        username: "",
      });
      setFormError("");
      clearAuthError();
    }
  }, [authDialog.isOpen, authDialog.mode, clearAuthError]);

  if (!authDialog.isOpen) {
    return null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");

    if (isSignup && form.password !== form.confirmPassword) {
      setFormError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    try {
      const payload = {
        password: form.password,
        username: form.username,
      };

      if (isSignup) {
        await signup(payload);
      } else {
        await login(payload);
      }
    } catch {
      // The context exposes the server error in authError.
    }
  }

  function updateField(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
    setFormError("");
    clearAuthError();
  }

  function switchMode(nextMode) {
    openAuthDialog(nextMode, {
      message: authDialog.message,
      plan: pendingPlan,
    });
  }

  return (
    <div className="auth-dialog-backdrop" role="presentation">
      <section aria-modal="true" className="auth-dialog" role="dialog">
        <div className="auth-dialog-head">
          <div>
            <span>{isSignup ? "신규 회원" : "회원 로그인"}</span>
            <h2>{isSignup ? "회원가입" : "로그인"}</h2>
          </div>
          <button aria-label="닫기" className="auth-close-button" onClick={closeAuthDialog} type="button">
            <X size={18} />
          </button>
        </div>

        {authDialog.message ? <p className="auth-message">{authDialog.message}</p> : null}

        <div className="auth-mode-toggle" aria-label="인증 모드">
          <button className={!isSignup ? "active" : ""} onClick={() => switchMode("login")} type="button">
            <LogIn size={15} />
            로그인
          </button>
          <button className={isSignup ? "active" : ""} onClick={() => switchMode("signup")} type="button">
            <UserPlus size={15} />
            회원가입
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor={usernameId}>
            <span>아이디</span>
            <input
              autoComplete="username"
              id={usernameId}
              maxLength={32}
              minLength={3}
              onChange={(event) => updateField("username", event.target.value)}
              placeholder="아이디를 입력하세요"
              required
              value={form.username}
            />
          </label>
          <label htmlFor={passwordId}>
            <span>비밀번호</span>
            <input
              autoComplete={isSignup ? "new-password" : "current-password"}
              id={passwordId}
              maxLength={128}
              minLength={8}
              onChange={(event) => updateField("password", event.target.value)}
              placeholder="비밀번호를 입력하세요"
              required
              type="password"
              value={form.password}
            />
          </label>
          {isSignup ? (
            <label htmlFor={confirmPasswordId}>
              <span>비밀번호 확인</span>
              <input
                autoComplete="new-password"
                id={confirmPasswordId}
                maxLength={128}
                minLength={8}
                onChange={(event) => updateField("confirmPassword", event.target.value)}
                placeholder="비밀번호를 다시 입력하세요"
                required
                type="password"
                value={form.confirmPassword}
              />
            </label>
          ) : null}

          {formError || authError ? (
            <p className="auth-error">
              <AlertCircle size={15} />
              <span>{formError || authError}</span>
            </p>
          ) : null}

          <button className="auth-submit-button" disabled={isAuthSubmitting} type="submit">
            {isAuthSubmitting ? "처리 중" : isSignup ? "회원가입" : "로그인"}
          </button>
        </form>
      </section>
    </div>
  );
}
