import assert from "node:assert/strict";
import test from "node:test";
import { createFixedWindowRateLimiter } from "../src/server/screenshotService.js";
import { isBlockedIpAddress, validatePublicHttpUrl } from "../src/server/urlSafety.js";

test("validates screenshot target schemes before network access", async () => {
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];

  assert.equal((await validatePublicHttpUrl("", { lookup })).safe, false);
  assert.equal((await validatePublicHttpUrl("file:///etc/passwd", { lookup })).safe, false);
  assert.equal((await validatePublicHttpUrl("javascript:alert(1)", { lookup })).safe, false);
  assert.equal((await validatePublicHttpUrl("https://example.com/login", { lookup })).safe, true);
});

test("blocks private and internal addresses returned by DNS", async () => {
  const privateLookup = async () => [{ address: "10.1.2.3", family: 4 }];
  const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

  assert.equal((await validatePublicHttpUrl("http://127.0.0.1/admin", { lookup: publicLookup })).safe, false);
  assert.equal((await validatePublicHttpUrl("http://localhost/admin", { lookup: publicLookup })).safe, false);
  assert.equal((await validatePublicHttpUrl("https://safe.example", { lookup: privateLookup })).safe, false);
});

test("classifies SSRF-sensitive IPv4 and IPv6 ranges", () => {
  assert.equal(isBlockedIpAddress("0.0.0.0"), true);
  assert.equal(isBlockedIpAddress("10.0.0.7"), true);
  assert.equal(isBlockedIpAddress("172.16.4.2"), true);
  assert.equal(isBlockedIpAddress("192.168.1.4"), true);
  assert.equal(isBlockedIpAddress("169.254.10.20"), true);
  assert.equal(isBlockedIpAddress("::1"), true);
  assert.equal(isBlockedIpAddress("fc00::1"), true);
  assert.equal(isBlockedIpAddress("fe80::1"), true);
  assert.equal(isBlockedIpAddress("::ffff:127.0.0.1"), true);
  assert.equal(isBlockedIpAddress("8.8.8.8"), false);
  assert.equal(isBlockedIpAddress("2606:4700:4700::1111"), false);
});

test("limits screenshot requests with a fixed window bucket", () => {
  const limiter = createFixedWindowRateLimiter({ max: 2, windowMs: 1000 });

  assert.equal(limiter.check("client-a").allowed, true);
  assert.equal(limiter.check("client-a").allowed, true);
  assert.equal(limiter.check("client-a").allowed, false);
  assert.equal(limiter.check("client-b").allowed, true);
});
