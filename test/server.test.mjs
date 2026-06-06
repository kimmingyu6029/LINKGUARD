import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildOpenPhishFeed,
  isOpenPhishFeedMatch,
  isPathInsideDirectory,
  normalizeUrlForMatch,
  parseKisaSecurityCases,
} from "../server.mjs";

test("matches OpenPhish feed entries using normalized URLs, not cache keys", () => {
  const feed = buildOpenPhishFeed(`
https://EXAMPLE.test/login/
https://evil.test/pay#fragment
`);

  assert.equal(normalizeUrlForMatch("https://EXAMPLE.test/login/"), "https://example.test/login");
  assert.equal(isOpenPhishFeedMatch(feed, "https://example.test/login"), true);
  assert.equal(isOpenPhishFeedMatch(feed, "https://evil.test/pay"), true);
  assert.equal(feed.normalizedUrls.has("openphish:https://example.test/login"), false);
});

test("keeps static asset paths inside the dist directory", () => {
  const distDir = resolve("C:/tmp/linkguard/dist");

  assert.equal(isPathInsideDirectory(distDir, resolve(distDir, "index.html")), true);
  assert.equal(isPathInsideDirectory(distDir, resolve(distDir, "assets/index.js")), true);
  assert.equal(isPathInsideDirectory(distDir, resolve(distDir, "../server.mjs")), false);
  assert.equal(isPathInsideDirectory(distDir, resolve(distDir, "../dist-other/index.html")), false);
});

test("parses KISA RSS security cases and keeps relevant alerts", () => {
  const cases = parseKisaSecurityCases(`
<rss><channel>
  <item>
    <title><![CDATA[여행 예약 플랫폼 해킹으로 인한 스미싱 주의 권고]]></title>
    <link>https://www.boho.or.kr/notice/1</link>
    <pubDate>2026-05-12</pubDate>
  </item>
  <item>
    <title><![CDATA[일반 행사 안내]]></title>
    <link>https://www.boho.or.kr/notice/2</link>
    <pubDate>2026-05-13</pubDate>
  </item>
</channel></rss>`);

  assert.equal(cases.length, 1);
  assert.equal(cases[0].text, "여행 예약 플랫폼 해킹으로 인한 스미싱 주의 권고");
  assert.equal(cases[0].date, "2026.05.12");
  assert.equal(cases[0].sourceUrl, "https://www.boho.or.kr/notice/1");
});
