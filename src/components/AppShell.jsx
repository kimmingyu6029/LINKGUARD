import { Bot, Crown, LogOut, UserRound, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { navigationItems } from "../data/navigation.js";
import { useAccount } from "../lib/accountContext.jsx";
import { formatWonAmount } from "../lib/pricing.js";
import AuthDialog from "./AuthDialog.jsx";
import Logo from "./Logo.jsx";

const AVATAR_MODE_STORAGE_KEY = "linkguard-avatar-mode";

export default function AppShell({ children }) {
  const { isDeveloper, isLoggedIn, logout, openAuthDialog, plan, username, walletBalance } = useAccount();
  const [isAvatarModeEnabled, setIsAvatarModeEnabled] = useState(readStoredAvatarMode);

  useEffect(() => {
    const nextMode = isAvatarModeEnabled ? "on" : "off";

    document.documentElement.dataset.linkguardAvatarMode = nextMode;
    window.localStorage.setItem(AVATAR_MODE_STORAGE_KEY, nextMode);
    window.dispatchEvent(
      new CustomEvent("linkguard-avatar-mode-change", {
        detail: { enabled: isAvatarModeEnabled },
      }),
    );
  }, [isAvatarModeEnabled]);

  return (
    <div className="app-shell">
      <div className="page-frame">
        <header className="topbar">
          <div className="topbar-inner">
            <div className="brand-area">
              <Logo />
              <button
                aria-pressed={isAvatarModeEnabled}
                className={`avatar-mode-toggle${isAvatarModeEnabled ? " is-on" : ""}`}
                onClick={() => setIsAvatarModeEnabled((current) => !current)}
                title="URL 감시 도우미 아바타 모드"
                type="button"
              >
                <Bot size={16} />
                <span>아바타</span>
                <strong>{isAvatarModeEnabled ? "ON" : "OFF"}</strong>
              </button>
            </div>
            <nav className="main-nav" aria-label="주요 메뉴">
              {navigationItems
                .filter((item) => !item.developerOnly || isDeveloper)
                .map((item) => (
                  <NavLink
                    className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}
                    end={item.path === "/"}
                    key={item.path}
                    to={item.path}
                  >
                    {item.label}
                  </NavLink>
                ))}
            </nav>
            <div className="account-actions">
              {isLoggedIn ? (
                <>
                  <Link className="plan-chip" to="/pricing">
                    <Crown size={15} />
                    <span>{plan}</span>
                  </Link>
                  <span className="account-name">{username}</span>
                  <Link className="wallet-chip" to="/wallet">
                    <WalletCards size={15} />
                    <span>{formatWonAmount(walletBalance)}</span>
                  </Link>
                  <button className="login-button" onClick={logout} type="button">
                    <LogOut size={16} />
                    <span>로그아웃</span>
                  </button>
                </>
              ) : (
                <button className="login-button" onClick={() => openAuthDialog("login")} type="button">
                  <UserRound size={16} />
                  <span>로그인</span>
                </button>
              )}
            </div>
          </div>
        </header>
        <main>{children}</main>
        <footer className="site-foot">
          LinkGuard AI는 AI 기반으로 링크의 위험성을 분석하며 참고 정보를 제공합니다.
          최종 판단과 책임은 사용자에게 있습니다.
        </footer>
      </div>
      <AuthDialog />
    </div>
  );
}

function readStoredAvatarMode() {
  try {
    return window.localStorage.getItem(AVATAR_MODE_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}
