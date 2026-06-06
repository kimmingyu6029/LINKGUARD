export const ANNUAL_DISCOUNT_RATE = 0.2;

export function getPlanPriceDisplay(plan, billing) {
  const monthlyPrice = Number(plan.monthlyPrice);
  const suffix = plan.priceSuffix || "";

  if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
    return {
      price: plan.price || "무료",
      priceMeta: plan.priceMeta || "",
    };
  }

  if (billing === "yearly") {
    const annualBasePrice = monthlyPrice * 12;
    const annualDiscountedPrice = getPlanChargeAmount(plan, billing);

    return {
      price: `${formatWonAmount(annualDiscountedPrice)}${suffix}`,
      priceMeta: `${formatWonAmount(annualBasePrice)}${suffix}`,
    };
  }

  return {
    price: `${formatWonAmount(monthlyPrice)}${suffix}`,
    priceMeta: plan.monthlyListPrice ? `${formatWonAmount(plan.monthlyListPrice)}${suffix}` : plan.priceMeta || "",
  };
}

export function getPlanChargeAmount(plan, billing) {
  const monthlyPrice = Number(plan.monthlyPrice);

  if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) {
    return 0;
  }

  if (billing === "yearly") {
    return Math.round(monthlyPrice * 12 * (1 - ANNUAL_DISCOUNT_RATE));
  }

  return monthlyPrice;
}

export function getCreditPackChargeAmount(pack) {
  const price = Number(pack?.price);
  return Number.isFinite(price) ? Math.max(0, Math.floor(price)) : 0;
}

export function formatWonAmount(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}원`;
}
