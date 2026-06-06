import { ArrowRight, BarChart3, Check, ChevronDown, Percent, Sparkles, WalletCards } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import StatusPill from "../components/StatusPill.jsx";
import { analysisCreditPacks, comparisonRows, faqs, pricingPlans, valueProps } from "../data/mockData.js";
import { useAccount } from "../lib/accountContext.jsx";
import { formatWonAmount, getCreditPackChargeAmount, getPlanChargeAmount, getPlanPriceDisplay } from "../lib/pricing.js";

const usageProfiles = [
  {
    id: "light",
    label: "1회",
    helper: "가끔 확인",
    packId: "single",
    barLabel: "낮음",
    bars: [34, 18, 12],
  },
  {
    id: "regular",
    label: "5회",
    helper: "월 1~2번",
    packId: "thirty",
    barLabel: "추천",
    bars: [46, 72, 34],
  },
  {
    id: "heavy",
    label: "10회+",
    helper: "자주 검사",
    packId: "hundred",
    barLabel: "대량",
    bars: [52, 78, 92],
  },
];

export default function PricingPage() {
  const navigate = useNavigate();
  const {
    analysisCredits,
    isLoggedIn,
    plan: currentPlan,
    planPeriodLabel,
    purchaseCreditPack,
    selectPlan,
    walletBalance,
  } = useAccount();
  const [billing, setBilling] = useState("yearly");
  const [openFaq, setOpenFaq] = useState(0);
  const [paymentNotice, setPaymentNotice] = useState("");
  const [selectedUsageId, setSelectedUsageId] = useState("regular");
  const selectedUsage = usageProfiles.find((item) => item.id === selectedUsageId) || usageProfiles[1];
  const recommendedPack = analysisCreditPacks.find((pack) => pack.id === selectedUsage.packId) || analysisCreditPacks[1];

  function scrollToRecommendedPack() {
    document.getElementById(`credit-pack-${recommendedPack.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handlePlanSelect(planName) {
    if (isLoggedIn && currentPlan === planName) {
      navigate("/analysis");
      return;
    }

    setPaymentNotice("");
    const result = await selectPlan(planName, { billing });

    if (result.ok) {
      const periodText = result.subscriptionPeriodLabel ? ` 이용 기간: ${result.subscriptionPeriodLabel}` : "";
      setPaymentNotice(
        `${planName} 요금제가 적용되었고 ${formatWonAmount(result.chargedAmount)}이 내 계좌에서 차감되었습니다.${periodText}`,
      );
      navigate("/analysis");
      return;
    }

    if (result.reason === "login_required") {
      setPaymentNotice("회원가입 또는 로그인 후 내 계좌에서 결제할 수 있습니다.");
      return;
    }

    setPaymentNotice(result.error || "요금제 결제에 실패했습니다.");
  }

  async function handleCreditPackSelect(pack) {
    setPaymentNotice("");
    const result = await purchaseCreditPack(pack.id);

    if (result.ok) {
      setPaymentNotice(
        `${pack.name} ${result.creditsAdded}회가 충전되었습니다. ${formatWonAmount(result.chargedAmount)}이 내 계좌에서 차감되었습니다.`,
      );
      return;
    }

    if (result.reason === "login_required") {
      setPaymentNotice("검사권 구매는 회원가입 또는 로그인 후 이용할 수 있습니다.");
      return;
    }

    setPaymentNotice(result.error || "검사권 구매에 실패했습니다.");
  }

  return (
    <section className="pricing-page page-content is-wide">
      <div className="pricing-hero-row">
        <div className="pricing-hero-copy">
          <h1>
            필요한 만큼 <span>검사권</span>을
            <br className="mobile-break" />
            {" "}선택하세요
          </h1>
          <p>가끔 쓰는 사용자는 횟수제 검사권을, 자주 분석하는 사용자는 월간/연간 구독을 선택할 수 있습니다.</p>
        </div>
        <div className="pricing-control-area">
          <div className="billing-toggle">
            <button className={billing === "monthly" ? "active" : ""} onClick={() => setBilling("monthly")} type="button">
              월간 결제
            </button>
            <button className={billing === "yearly" ? "active" : ""} onClick={() => setBilling("yearly")} type="button">
              연간 결제
            </button>
          </div>
          <StatusPill icon={Percent} tone="teal">
            연간 결제 시 20% 할인
          </StatusPill>
          <Link className="pricing-wallet-chip" to="/wallet">
            <WalletCards size={17} />
            <span>내 계좌 {formatWonAmount(walletBalance)}</span>
          </Link>
          <Link className="pricing-wallet-chip credit-chip" to="/wallet">
            <Check size={17} />
            <span>남은 검사권 {analysisCredits}회</span>
          </Link>
        </div>
        <aside className="usage-recommendation-card" aria-label="사용량 기준 추천 검사권">
          <div className="usage-card-head">
            <span className="usage-card-icon">
              <Sparkles size={22} />
            </span>
            <div>
              <p>나에게 맞는 검사권</p>
              <h2>한 달 사용량으로 바로 고르기</h2>
            </div>
          </div>
          <div className="usage-question">
            <span>한 달에 의심 링크를 몇 개 확인하나요?</span>
            <div className="usage-choice-row" role="group" aria-label="월간 의심 링크 확인 횟수">
              {usageProfiles.map((profile) => (
                <button
                  className={profile.id === selectedUsage.id ? "active" : ""}
                  key={profile.id}
                  onClick={() => setSelectedUsageId(profile.id)}
                  type="button"
                >
                  <strong>{profile.label}</strong>
                  <small>{profile.helper}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="usage-recommendation-result">
            <div>
              <span className="recommendation-kicker">추천</span>
              <strong>{recommendedPack.name}</strong>
              <p>
                {billing === "yearly" ? "연간 결제 시 약 20% 절약" : "필요할 때마다 구매해 부담 없이 사용"}
                <br />
                {recommendedPack.unitLabel}
              </p>
            </div>
            <div className="usage-mini-chart" aria-hidden="true">
              <BarChart3 size={18} />
              <div>
                {selectedUsage.bars.map((height, index) => (
                  <span key={`${selectedUsage.id}-${height}-${index}`} style={{ "--bar-height": `${height}%` }} />
                ))}
              </div>
              <small>{selectedUsage.barLabel}</small>
            </div>
          </div>
          <button className="usage-recommendation-action" onClick={scrollToRecommendedPack} type="button">
            추천 검사권으로 이동
            <ArrowRight size={18} />
          </button>
        </aside>
      </div>

      <section className="credit-pack-section" aria-labelledby="credit-pack-title">
        <div className="credit-pack-head">
          <div>
            <span>횟수제 요금제</span>
            <h2 id="credit-pack-title">의심 링크가 생겼을 때만 결제하는 검사권</h2>
          </div>
          <p>구독 없이 전문가 모드 분석을 필요한 횟수만큼 사용할 수 있습니다.</p>
        </div>

        <div className="credit-pack-grid">
          {analysisCreditPacks.map((pack) => {
            const Icon = pack.icon;
            const chargeAmount = getCreditPackChargeAmount(pack);
            const canAfford = walletBalance >= chargeAmount;

            return (
              <article
                className={`credit-pack-card tone-${pack.tone}${pack.popular ? " is-popular" : ""}`}
                id={`credit-pack-${pack.id}`}
                key={pack.id}
              >
                {pack.popular ? <span className="popular-badge">추천</span> : null}
                <div className="credit-pack-top">
                  <span className="plan-icon">
                    <Icon size={32} />
                  </span>
                  <div>
                    <h3>{pack.name}</h3>
                    <p>{pack.audience}</p>
                  </div>
                </div>
                <div className="credit-pack-price">
                  <strong>{formatWonAmount(pack.price)}</strong>
                  <span>{pack.unitLabel}</span>
                </div>
                <ul className="feature-list">
                  {pack.features.map((feature) => (
                    <li key={feature}>
                      <Check size={17} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <button
                  className={!canAfford && isLoggedIn ? "plan-button needs-balance" : "plan-button"}
                  onClick={() => handleCreditPackSelect(pack)}
                  type="button"
                >
                  {isLoggedIn && !canAfford ? "잔액 충전 필요" : pack.cta}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <div className="plan-grid">
        {pricingPlans.map((plan) => {
          const Icon = plan.icon;
          const isCurrent = isLoggedIn && currentPlan === plan.name;
          const priceDisplay = getPlanPriceDisplay(plan, billing);
          const chargeAmount = getPlanChargeAmount(plan, billing);
          const canAfford = walletBalance >= chargeAmount;

          return (
            <article
              className={`plan-card tone-${plan.tone}${plan.popular ? " is-popular" : ""}${isCurrent ? " is-current" : ""}`}
              key={plan.name}
            >
              {plan.popular ? <span className="popular-badge">인기</span> : null}
              {isCurrent ? <span className="current-plan-badge">사용 중</span> : null}
              <div className="plan-head">
                <span className="plan-icon">
                  <Icon size={35} />
                </span>
                <div>
                  <h2>{plan.name}</h2>
                  <p>{plan.audience}</p>
                </div>
              </div>
              <div className="price-line">
                <strong>{priceDisplay.price}</strong>
                {priceDisplay.priceMeta ? <span>{priceDisplay.priceMeta}</span> : null}
              </div>
              {isCurrent && planPeriodLabel ? <p className="plan-period-line">{planPeriodLabel}</p> : null}
              <ul className="feature-list">
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <Check size={17} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <button
                className={!canAfford && chargeAmount > 0 && isLoggedIn ? "plan-button needs-balance" : "plan-button"}
                onClick={() => handlePlanSelect(plan.name)}
                type="button"
              >
                {isCurrent
                  ? "분석 화면으로 이동"
                  : chargeAmount > 0
                    ? canAfford
                      ? `${formatWonAmount(chargeAmount)} 결제`
                      : "잔액 충전 필요"
                    : plan.cta}
              </button>
            </article>
          );
        })}
      </div>

      {paymentNotice ? (
        <div className="payment-notice">
          <WalletCards size={18} />
          <span>{paymentNotice}</span>
          <Link to="/wallet">내 계좌로 이동</Link>
        </div>
      ) : null}

      <div className="pricing-lower-grid">
        <section className="panel compare-panel">
          <h2>요금제 비교</h2>
          <div className="comparison-wrap">
            <table>
              <thead>
                <tr>
                  <th>기능</th>
                  <th>Free</th>
                  <th>Pro</th>
                  <th>Team</th>
                  <th>Business</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(([feature, free, pro, team, business, Icon]) => (
                  <tr key={feature}>
                    <td>
                      <Icon size={17} />
                      {feature}
                    </td>
                    <td>{free}</td>
                    <td>{pro}</td>
                    <td>{team}</td>
                    <td>{business}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel value-panel">
          <h2>왜 필요한가요?</h2>
          <div className="value-stack">
            {valueProps.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title}>
                  <Icon size={34} />
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.desc}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="panel faq-panel">
          <h2>자주 묻는 질문</h2>
          {faqs.map((faq, index) => (
            <article className={openFaq === index ? "open" : ""} key={faq.q}>
              <button onClick={() => setOpenFaq(openFaq === index ? -1 : index)} type="button">
                <span>{faq.q}</span>
                <ChevronDown size={21} />
              </button>
              <p>{faq.a}</p>
            </article>
          ))}
        </section>
      </div>

      <section className="pricing-cta">
        <div className="mini-shield" aria-hidden="true" />
        <div>
          <h2>내 계좌 잔액으로 바로 결제하세요</h2>
          <p>충전한 금액은 검사권 또는 구독 요금제 결제 시 자동으로 차감됩니다.</p>
        </div>
        <Link to="/wallet">
          내 계좌 충전
          <ArrowRight size={24} />
        </Link>
      </section>
    </section>
  );
}
