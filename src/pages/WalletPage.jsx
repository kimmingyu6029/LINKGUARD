import { ArrowDownToLine, Building2, CreditCard, Landmark, Lock, ReceiptText, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SectionHeader from "../components/SectionHeader.jsx";
import { useAccount } from "../lib/accountContext.jsx";
import { formatWonAmount } from "../lib/pricing.js";
import { calculateSubscriptionExpiresAt, formatSubscriptionPeriod } from "../lib/subscriptionPeriod.js";

const BANK_OPTIONS = [
  {
    accent: "yellow",
    code: "kakao",
    desc: "카카오뱅크 계좌를 선택해 지갑 잔액을 충전합니다.",
    icon: CreditCard,
    name: "카카오뱅크",
  },
  {
    accent: "blue",
    code: "toss",
    desc: "토스뱅크 간편 충전으로 결제 잔액을 더합니다.",
    icon: WalletCards,
    name: "토스뱅크",
  },
  {
    accent: "teal",
    code: "other",
    desc: "국민, 신한, 우리 등 다른 은행 계좌를 선택합니다.",
    icon: Landmark,
    name: "타사 은행",
  },
];

const QUICK_AMOUNTS = [10_000, 50_000, 100_000, 500_000];

export default function WalletPage() {
  const {
    analysisCredits,
    depositWallet,
    isLoggedIn,
    isWalletLoading,
    loadWallet,
    openAuthDialog,
    plan,
    planPeriodLabel,
    username,
    walletBalance,
    walletError,
    walletTransactions,
  } = useAccount();
  const [selectedBank, setSelectedBank] = useState("kakao");
  const [amount, setAmount] = useState(50_000);
  const [notice, setNotice] = useState("");
  const selectedBankInfo = useMemo(
    () => BANK_OPTIONS.find((bank) => bank.code === selectedBank) || BANK_OPTIONS[0],
    [selectedBank],
  );

  useEffect(() => {
    if (isLoggedIn) {
      loadWallet();
    }
  }, [isLoggedIn, loadWallet]);

  async function handleDeposit(event) {
    event.preventDefault();
    setNotice("");

    const result = await depositWallet({
      amount,
      bank: selectedBank,
    });

    if (result.ok) {
      setNotice(`${selectedBankInfo.name}에서 ${formatWonAmount(amount)} 충전이 완료되었습니다.`);
    }
  }

  if (!isLoggedIn) {
    return (
      <section className="wallet-page page-content">
        <SectionHeader eyebrow="나의 계좌" title="웹사이트 지갑" />
        <article className="panel wallet-login-panel">
          <Lock size={30} />
          <div>
            <h2>로그인 후 지갑을 사용할 수 있습니다</h2>
            <p>회원가입 또는 로그인을 하면 웹사이트 잔액을 충전하고 요금제 결제에 사용할 수 있습니다.</p>
          </div>
          <div>
            <button onClick={() => openAuthDialog("login")} type="button">
              로그인
            </button>
            <button onClick={() => openAuthDialog("signup")} type="button">
              회원가입
            </button>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="wallet-page page-content">
      <SectionHeader eyebrow="나의 계좌" title="웹사이트 지갑" />

      <div className="wallet-layout">
        <article className="panel wallet-balance-panel">
          <div className="wallet-balance-head">
            <div>
              <span>{username}</span>
              <h2>{formatWonAmount(walletBalance)}</h2>
              <p>남은 검사권: {analysisCredits}회</p>
              <p>현재 요금제: {plan}</p>
              {planPeriodLabel ? <p className="wallet-plan-period">이용 기간: {planPeriodLabel}</p> : null}
            </div>
            <WalletCards size={46} />
          </div>
          <div className="wallet-balance-note">
            충전한 잔액은 요금제 결제 시 자동으로 차감되며, 최근 내역에서 충전과 결제 기록을 확인할 수 있습니다.
          </div>
          <Link className="wallet-plan-link" to="/pricing">
            요금제 결제하러 가기
          </Link>
        </article>

        <form className="panel wallet-deposit-panel" onSubmit={handleDeposit}>
          <div className="panel-title-row">
            <h2>충전하기</h2>
            <span className="wallet-demo-badge">즉시 반영</span>
          </div>

          <div className="bank-grid">
            {BANK_OPTIONS.map((bank) => {
              const Icon = bank.icon;
              return (
                <button
                  className={`bank-option accent-${bank.accent}${selectedBank === bank.code ? " active" : ""}`}
                  key={bank.code}
                  onClick={() => setSelectedBank(bank.code)}
                  type="button"
                >
                  <Icon size={24} />
                  <strong>{bank.name}</strong>
                  <span>{bank.desc}</span>
                </button>
              );
            })}
          </div>

          <label className="wallet-amount-field">
            <span>충전 금액</span>
            <input
              max={1_000_000}
              min={1000}
              onChange={(event) => setAmount(Number(event.target.value))}
              step={1000}
              type="number"
              value={amount}
            />
          </label>

          <div className="quick-amount-row">
            {QUICK_AMOUNTS.map((quickAmount) => (
              <button key={quickAmount} onClick={() => setAmount(quickAmount)} type="button">
                {formatWonAmount(quickAmount)}
              </button>
            ))}
          </div>

          {notice || walletError ? <p className={walletError ? "wallet-error" : "wallet-notice"}>{walletError || notice}</p> : null}

          <button className="wallet-submit-button" disabled={isWalletLoading} type="submit">
            <ArrowDownToLine size={18} />
            {isWalletLoading ? "처리 중" : `${selectedBankInfo.name}에서 충전`}
          </button>
        </form>

        <article className="panel wallet-flow-panel">
          <h2>결제 흐름</h2>
          <ol>
            <li>
              <Building2 size={18} />
              <span>은행을 선택하고 충전 금액을 입력합니다.</span>
            </li>
            <li>
              <WalletCards size={18} />
              <span>웹사이트 지갑 잔액이 늘어납니다.</span>
            </li>
            <li>
              <ReceiptText size={18} />
              <span>요금제에서 Pro, Team, Business를 누르면 잔액이 차감됩니다.</span>
            </li>
          </ol>
        </article>

        <article className="panel wallet-history-panel">
          <div className="panel-title-row">
            <h2>최근 내역</h2>
            <ReceiptText size={18} />
          </div>
          {walletTransactions.length > 0 ? (
            <ul>
              {walletTransactions.map((transaction) => {
                const subscriptionPeriodLabel = getTransactionSubscriptionPeriodLabel(transaction);

                return (
                  <li key={transaction.id}>
                    <div>
                      <strong>{transaction.note}</strong>
                      <span>{formatTransactionDate(transaction.createdAt)}</span>
                      {subscriptionPeriodLabel ? <span className="wallet-transaction-period">{subscriptionPeriodLabel}</span> : null}
                    </div>
                    <div className={transaction.amount >= 0 ? "is-positive" : "is-negative"}>
                      {transaction.amount >= 0 ? "+" : "-"}
                      {formatWonAmount(Math.abs(transaction.amount))}
                      <small>잔액 {formatWonAmount(transaction.balanceAfter)}</small>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="wallet-empty">아직 충전 또는 결제 내역이 없습니다.</p>
          )}
        </article>
      </div>
    </section>
  );
}

function formatTransactionDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("ko-KR");
}

function getTransactionSubscriptionPeriodLabel(transaction) {
  if (transaction.type !== "plan_purchase") {
    return "";
  }

  const startedAt = transaction.subscriptionStartedAt || transaction.createdAt;
  const expiresAt = transaction.subscriptionExpiresAt || calculateSubscriptionExpiresAt(startedAt, transaction.billing);

  return formatSubscriptionPeriod(startedAt, expiresAt);
}
