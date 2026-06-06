# Cloudflare deployment

This project can run on Cloudflare Pages with Pages Functions. Cloudflare serves the Vite build from `dist`, and the API routes under `/api/*` run as serverless Functions at the edge.

Member accounts, website wallet balances, and visual-only wallet transactions are stored in Cloudflare D1 through the `DB` binding. Passwords are stored as PBKDF2 hashes, and login state is kept with an HttpOnly session cookie.

## Local check

```powershell
npm.cmd run build
npm.cmd run dev:cloudflare
```

Then open the local URL printed by Wrangler and check:

- `/api/health`
- `/api/analyze-url`
- `/api/security-cases`

## Verify production

```powershell
npm.cmd run verify:cloudflare
```

This checks the public site shell and the production API routes:

- `GET /api/health`
- `GET /api/auth/session`
- `POST /api/auth/login`
- `GET /api/auth/wallet`
- `POST /api/auth/wallet/deposit`
- `POST /api/auth/plan`
- `POST /api/analyze-url`
- `GET /api/security-cases`

## Deploy after edits

```powershell
npm.cmd run deploy:cloudflare
```

Use this command after changing source files. It runs tests, builds `dist`, uploads the new build to Cloudflare Pages, and verifies the production API after deployment.

It also applies D1 migrations to the remote `DB` binding before deploying:

```powershell
npm.cmd run db:migrate:remote
```

The default Cloudflare Pages project name is `linkguard-ai-ui`. Change `name` in `wrangler.toml` and set `CLOUDFLARE_PROJECT_NAME` if you want a different Cloudflare project.

Optional overrides:

```powershell
$env:CLOUDFLARE_PROJECT_NAME="linkguard-ai-ui"
$env:CLOUDFLARE_BRANCH="main"
$env:CLOUDFLARE_SITE_URL="https://linkguard-ai-ui.pages.dev"
```

Then run:

```powershell
npm.cmd run deploy:cloudflare
```

## Secrets

Do not commit real secrets. Add reputation provider keys in Cloudflare as Pages environment variables:

```powershell
npx.cmd wrangler pages secret put VIRUSTOTAL_API_KEY --project-name linkguard-ai-ui
npx.cmd wrangler pages secret put GOOGLE_SAFE_BROWSING_API_KEY --project-name linkguard-ai-ui
```

Optional environment variables:

- `OPENPHISH_FEED_URL`
- `KISA_SECURITY_RSS_URL`
- `GOOGLE_SAFE_BROWSING_API_BASE_URL`
- `VIRUSTOTAL_SUBMIT_UNKNOWN`

Cloudflare Pages Functions are serverless. There is no always-running Node process to keep alive; the API is available continuously through Cloudflare and runs on demand when requests arrive.
