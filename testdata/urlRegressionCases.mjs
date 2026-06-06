export const benignUrlCases = [
  {
    id: "official-naver-home",
    reason: "Official brand root domains should not be falsely flagged.",
    url: "https://www.naver.com/",
  },
  {
    id: "official-google-signin",
    reason: "Official account login paths may contain auth keywords but should remain benign.",
    url: "https://accounts.google.com/signin/v2/identifier",
  },
  {
    id: "official-coupang-category",
    reason: "Ordinary official commerce paths should remain benign.",
    url: "https://www.coupang.com/np/categories/194176",
  },
  {
    id: "official-koreapost-home",
    reason: "Official public-service domains should remain benign.",
    url: "https://www.koreapost.go.kr/",
  },
  {
    id: "official-gachon-home",
    reason: "Known official university domains should remain benign.",
    url: "https://www.gachon.ac.kr/",
  },
  {
    id: "plain-security-blog",
    reason: "Educational content with security/login words should not become a malicious verdict.",
    url: "https://blog.example.com/articles/security-login-guide",
  },
  {
    id: "ordinary-signin-guide",
    reason: "Ordinary words containing platform-like fragments should not trigger platform lure logic.",
    url: "https://example.com/blog/sign-in-guide",
  },
];

export const riskyUrlCases = [
  {
    id: "paypal-impersonation",
    minimumVerdict: "malicious",
    reason: "Brand impersonation with auth/password keywords and suspicious TLD must be caught.",
    url: "https://paypal-login-secure.xyz/auth?verify=account&password=update",
  },
  {
    id: "http-bank-lure",
    minimumVerdict: "malicious",
    reason: "HTTP bank/login lure with multiple phishing keywords must be caught.",
    url: "http://secure-bank-login.xyz/auth?verify=account&password=update",
  },
  {
    id: "koreapost-delivery-lure",
    minimumVerdict: "malicious",
    reason: "Postal delivery lure on a suspicious domain must be caught.",
    url: "https://koreapost-delivery-track.click/parcel?invoice=123456&verify=account",
  },
  {
    id: "instagram-path-lure",
    minimumVerdict: "malicious",
    reason: "Unofficial social platform path with opaque share token must be caught.",
    url: "https://kkclip.com/open/ig/3824104089672233806/DUR8miZCDNO",
  },
  {
    id: "direct-ip-login",
    minimumVerdict: "suspicious",
    reason: "Direct IP login/update links should require review.",
    url: "https://198.51.100.22/login/update",
  },
  {
    id: "shortened-url",
    minimumVerdict: "suspicious",
    reason: "Shortened URLs hide the destination and should require review.",
    url: "https://bit.ly/abc123",
  },
  {
    id: "encoded-external-redirect",
    minimumVerdict: "malicious",
    reason: "Encoded external redirect with auth keywords should be caught.",
    url: "https://secure-bank-login.example.test/auth?next=https%3A%2F%2Fevil.test%2Fpay",
  },
  {
    id: "risky-apk-download",
    minimumVerdict: "suspicious",
    reason: "APK downloads from generic domains should require review.",
    url: "https://example.com/download/update.apk",
  },
  {
    id: "official-domain-external-redirect",
    minimumVerdict: "suspicious",
    reason: "External redirect parameters on official domains should still require review.",
    url: "https://www.coupang.com/?redirect=https%3A%2F%2Fexample-phish.test%2Flogin",
  },
  {
    id: "microsoft-subdomain-impersonation",
    minimumVerdict: "malicious",
    reason: "Brand-as-subdomain impersonation with auth keywords must be caught.",
    url: "https://login.microsoft.com.example.test/secure/auth",
  },
];
