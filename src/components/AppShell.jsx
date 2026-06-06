import { Crown, LogOut, UserRound, WalletCards } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { navigationItems } from "../data/navigation.js";
import { useAccount } from "../lib/accountContext.jsx";
import { formatWonAmount } from "../lib/pricing.js";
import AuthDialog from "./AuthDialog.jsx";
import Logo from "./Logo.jsx";

export default function AppShell({ children }) {
  const { isDeveloper, isLoggedIn, logout, openAuthDialog, plan, username, walletBalance } = useAccount();

  return (
    <div className="app-shell">
      <div className="page-frame">
        <header className="topbar">
          <div className="topbar-inner">
            <Logo />
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
