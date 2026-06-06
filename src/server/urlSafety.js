import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export const MAX_SCREENSHOT_URL_LENGTH = 2048;

const DEFAULT_LOOKUP_OPTIONS = {
  all: true,
  verbatim: true,
};

export async function validatePublicHttpUrl(rawUrl, { lookup = dnsLookup, maxLength = MAX_SCREENSHOT_URL_LENGTH } = {}) {
  const inputUrl = typeof rawUrl === "string" ? rawUrl.trim() : "";

  if (!inputUrl) {
    return buildUnsafe("URL is required.", inputUrl);
  }

  if (inputUrl.length > maxLength) {
    return buildUnsafe("URL is too long.", inputUrl);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(inputUrl);
  } catch {
    return buildUnsafe("Invalid URL format.", inputUrl);
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return buildUnsafe("Only http:// and https:// URLs are allowed.", inputUrl);
  }

  const hostname = parsedUrl.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    return buildUnsafe("Localhost URLs are blocked.", parsedUrl.href);
  }

  if (isBlockedIpAddress(hostname)) {
    return buildUnsafe("Private, loopback, link-local, or internal IP addresses are blocked.", parsedUrl.href);
  }

  let records;
  try {
    records = await lookup(hostname, DEFAULT_LOOKUP_OPTIONS);
  } catch (error) {
    return buildUnsafe(`DNS resolution failed: ${error.message}`, parsedUrl.href);
  }

  const addresses = normalizeLookupRecords(records);
  if (addresses.length === 0) {
    return buildUnsafe("DNS resolution returned no usable addresses.", parsedUrl.href);
  }

  const blockedAddress = addresses.find((address) => isBlockedIpAddress(address));
  if (blockedAddress) {
    return buildUnsafe(`Resolved address ${blockedAddress} is private or internal.`, parsedUrl.href, addresses);
  }

  return {
    addresses,
    hostname,
    normalizedUrl: parsedUrl.href,
    parsedUrl,
    reason: "",
    safe: true,
  };
}

export function isBlockedIpAddress(value) {
  const normalized = normalizeIpLiteral(value);
  const family = isIP(normalized);

  if (family === 4) {
    return isBlockedIpv4(normalized);
  }

  if (family === 6) {
    const mappedIpv4 = getIpv4FromMappedIpv6(normalized);
    if (mappedIpv4) {
      return isBlockedIpv4(mappedIpv4);
    }

    return isBlockedIpv6(normalized);
  }

  return false;
}

function buildUnsafe(reason, inputUrl, addresses = []) {
  return {
    addresses,
    hostname: "",
    normalizedUrl: inputUrl,
    parsedUrl: null,
    reason,
    safe: false,
  };
}

function normalizeLookupRecords(records) {
  if (!Array.isArray(records)) {
    return [];
  }

  return records.map((record) => (typeof record === "string" ? record : record?.address)).filter(Boolean);
}

function normalizeIpLiteral(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "");
}

function isBlockedIpv4(address) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return true;
  }

  const [first, second] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 0 && octets[2] === 2) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && octets[2] === 100) ||
    (first === 203 && second === 0 && octets[2] === 113) ||
    (first >= 224 && first <= 239) ||
    first >= 240
  );
}

function isBlockedIpv6(address) {
  const parts = ipv6ToParts(address);
  if (!parts) {
    return true;
  }

  const [first, second] = parts;
  const mappedIpv4 =
    parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff
      ? `${parts[6] >> 8}.${parts[6] & 255}.${parts[7] >> 8}.${parts[7] & 255}`
      : "";
  if (mappedIpv4) {
    return isBlockedIpv4(mappedIpv4);
  }

  return (
    parts.every((part) => part === 0) ||
    (parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1) ||
    (first >= 0xfc00 && first <= 0xfdff) ||
    (first >= 0xfe80 && first <= 0xfebf) ||
    (first >= 0xff00 && first <= 0xffff) ||
    (first === 0x2001 && second === 0x0db8)
  );
}

function ipv6ToParts(address) {
  const normalized = address.toLowerCase();
  const [head = "", tail = ""] = normalized.split("::");
  const hasCompression = normalized.includes("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];

  if (normalized.split("::").length > 2) {
    return null;
  }

  const missingParts = hasCompression ? 8 - headParts.length - tailParts.length : 0;
  const parts = hasCompression ? [...headParts, ...Array(missingParts).fill("0"), ...tailParts] : headParts;

  if (parts.length !== 8 || missingParts < 0) {
    return null;
  }

  const parsedParts = [];
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) {
      return null;
    }
    parsedParts.push(Number.parseInt(part, 16));
  }

  return parsedParts;
}

function getIpv4FromMappedIpv6(address) {
  const lower = address.toLowerCase();
  if (!lower.startsWith("::ffff:")) {
    return "";
  }

  const candidate = lower.slice("::ffff:".length);
  return isIP(candidate) === 4 ? candidate : "";
}
