export function calculateSubscriptionPeriod(purchasedAt, billing = "monthly") {
  const startedAt = toValidDate(purchasedAt);

  if (!startedAt) {
    return null;
  }

  const expiresAt = addCalendarMonths(startedAt, billing === "yearly" ? 12 : 1);

  return {
    expiresAt: expiresAt.toISOString(),
    label: formatSubscriptionPeriod(startedAt, expiresAt),
    startedAt: startedAt.toISOString(),
  };
}

export function calculateSubscriptionExpiresAt(purchasedAt, billing = "monthly") {
  return calculateSubscriptionPeriod(purchasedAt, billing)?.expiresAt || "";
}

export function formatSubscriptionPeriod(startedAt, expiresAt) {
  const startedAtText = formatKoreanDateTime(startedAt);
  const expiresAtText = formatKoreanDateTime(expiresAt);

  if (!startedAtText || !expiresAtText) {
    return "";
  }

  return `${startedAtText} ~ ${expiresAtText}`;
}

export function formatKoreanDateTime(value) {
  const date = toValidDate(value);

  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hours = date.getHours();
  const period = hours < 12 ? "오전" : "오후";
  const displayHours = hours % 12 || 12;
  const minutes = pad2(date.getMinutes());
  const seconds = pad2(date.getSeconds());

  return `${year}-${month}-${day} ${period} ${displayHours}시 ${minutes}분 ${seconds}초`;
}

function addCalendarMonths(date, months) {
  const result = new Date(date.getTime());
  const originalDay = result.getDate();

  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  result.setDate(Math.min(originalDay, getDaysInMonth(result.getFullYear(), result.getMonth())));

  return result;
}

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toValidDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value || "");

  return Number.isNaN(date.getTime()) ? null : date;
}
