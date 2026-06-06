import assert from "node:assert/strict";
import test from "node:test";
import { getCreditPackChargeAmount, getPlanChargeAmount, getPlanPriceDisplay } from "../src/lib/pricing.js";
import { calculateSubscriptionPeriod } from "../src/lib/subscriptionPeriod.js";

test("shows monthly plan prices while monthly billing is selected", () => {
  const result = getPlanPriceDisplay(
    { monthlyListPrice: 6000, monthlyPrice: 4900 },
    "monthly",
  );

  assert.deepEqual(result, {
    price: "4,900원",
    priceMeta: "6,000원",
  });
});

test("calculates annual plan prices from monthly prices with a 20% discount", () => {
  const result = getPlanPriceDisplay({ monthlyPrice: 4900 }, "yearly");

  assert.deepEqual(result, {
    price: "47,040원",
    priceMeta: "58,800원",
  });
});

test("keeps starting-price suffixes for annual business prices", () => {
  const result = getPlanPriceDisplay(
    { monthlyPrice: 49000, priceSuffix: " ~" },
    "yearly",
  );

  assert.deepEqual(result, {
    price: "470,400원 ~",
    priceMeta: "588,000원 ~",
  });
});

test("returns the numeric charge amount used by wallet payments", () => {
  assert.equal(getPlanChargeAmount({ monthlyPrice: 4900 }, "monthly"), 4900);
  assert.equal(getPlanChargeAmount({ monthlyPrice: 4900 }, "yearly"), 47040);
  assert.equal(getPlanChargeAmount({ monthlyPrice: 0 }, "yearly"), 0);
});

test("returns the numeric charge amount for credit packs", () => {
  assert.equal(getCreditPackChargeAmount({ price: 9900 }), 9900);
  assert.equal(getCreditPackChargeAmount({ price: "24900" }), 24900);
  assert.equal(getCreditPackChargeAmount({}), 0);
});

test("formats monthly subscription periods from the purchase timestamp", () => {
  const result = calculateSubscriptionPeriod(new Date(2026, 4, 26, 15, 43, 32), "monthly");

  assert.equal(result.label, "2026-05-26 오후 3시 43분 32초 ~ 2026-06-26 오후 3시 43분 32초");
});

test("formats yearly subscription periods from the purchase timestamp", () => {
  const result = calculateSubscriptionPeriod(new Date(2026, 4, 26, 15, 43, 32), "yearly");

  assert.equal(result.label, "2026-05-26 오후 3시 43분 32초 ~ 2027-05-26 오후 3시 43분 32초");
});
