import { spawnSync } from "node:child_process";

const PROJECT_NAME = process.env.CLOUDFLARE_PROJECT_NAME || "linkguard-ai-ui";
const PRODUCTION_BRANCH = process.env.CLOUDFLARE_BRANCH || "main";
const PRODUCTION_URL = normalizeSiteUrl(process.env.CLOUDFLARE_SITE_URL || `https://${PROJECT_NAME}.pages.dev`);
const ZERO_COMMIT_HASH = "0000000000000000000000000000000000000000";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

run(npmCommand, ["test"]);
run(npmCommand, ["run", "build"]);
run(npxCommand, ["wrangler", "d1", "migrations", "apply", "DB", "--remote"], {
  input: "y\n",
});

const deployment = run(
  npxCommand,
  [
    "wrangler",
    "pages",
    "deploy",
    "dist",
    "--project-name",
    PROJECT_NAME,
    "--branch",
    PRODUCTION_BRANCH,
    "--commit-dirty=true",
    "--commit-hash",
    ZERO_COMMIT_HASH,
    "--commit-message",
    `manual-cloudflare-pages-deployment-${new Date().toISOString()}`,
  ],
  { capture: true },
);

const deploymentUrl = deployment.output.match(/https:\/\/[^\s]+\.pages\.dev/)?.[0] || "";

run(npmCommand, ["run", "verify:cloudflare"], {
  env: {
    ...process.env,
    CLOUDFLARE_SITE_URL: PRODUCTION_URL,
  },
});

console.log("");
console.log("Cloudflare deployment finished.");
console.log(`Production URL: ${PRODUCTION_URL}`);

if (deploymentUrl) {
  console.log(`Deployment URL: ${deploymentUrl}`);
}

function run(command, args, options = {}) {
  console.log("");
  console.log(`> ${[command, ...args].join(" ")}`);
  const spawnConfig = getSpawnConfig(command, args);

  const result = spawnSync(spawnConfig.command, spawnConfig.args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: options.env || process.env,
    input: options.input,
    shell: false,
    stdio: options.capture ? "pipe" : options.input ? ["pipe", "inherit", "inherit"] : "inherit",
  });

  if (options.capture) {
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
  }

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }

  return {
    output: `${result.stdout || ""}${result.stderr || ""}`,
  };
}

function getSpawnConfig(command, args) {
  if (process.platform !== "win32") {
    return { args, command };
  }

  return {
    args: ["/d", "/s", "/c", [command, ...args].map(quoteWindowsArgument).join(" ")],
    command: "cmd.exe",
  };
}

function quoteWindowsArgument(value) {
  const text = String(value);

  if (/^[a-zA-Z0-9_./:=@+-]+$/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '\\"')}"`;
}

function normalizeSiteUrl(value) {
  return String(value).replace(/\/+$/, "");
}
