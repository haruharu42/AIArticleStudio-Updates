import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
  failures.push(message);
}

function readText(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  if (!fs.existsSync(fullPath)) {
    fail(`missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function httpsUrl(name, value, { allowPath = true } = {}) {
  if (!value) {
    fail(`${name} is required`);
    return null;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") fail(`${name} must use HTTPS`);
    if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
      fail(`${name} must not point to localhost`);
    }
    if (!allowPath && parsed.pathname !== "/") {
      fail(`${name} must be an origin without a path`);
    }
    return parsed;
  } catch {
    fail(`${name} is not a valid URL`);
    return null;
  }
}

const nodeVersion = process.versions.node.split(".").map(Number);
if (nodeVersion[0] < 22 || (nodeVersion[0] === 22 && nodeVersion[1] < 13)) {
  fail(`Node.js 22.13.0+ is required; current=${process.versions.node}`);
}

const productionOrigin = (process.env.AAS_PWA_PRODUCTION_ORIGIN ?? "").trim();
const supabaseUrl = (process.env.NEXT_PUBLIC_AAS_SUPABASE_URL ?? "").trim();
const publishableKey = (
  process.env.NEXT_PUBLIC_AAS_SUPABASE_PUBLISHABLE_KEY ?? ""
).trim();
const termsUrl = (process.env.NEXT_PUBLIC_AAS_TERMS_URL ?? "").trim();
const privacyUrl = (process.env.NEXT_PUBLIC_AAS_PRIVACY_URL ?? "").trim();
const aiTermsUrl = (process.env.NEXT_PUBLIC_AAS_AI_TERMS_URL ?? "").trim();

httpsUrl("AAS_PWA_PRODUCTION_ORIGIN", productionOrigin, { allowPath: false });
httpsUrl("NEXT_PUBLIC_AAS_SUPABASE_URL", supabaseUrl);
httpsUrl("NEXT_PUBLIC_AAS_TERMS_URL", termsUrl);
httpsUrl("NEXT_PUBLIC_AAS_PRIVACY_URL", privacyUrl);
httpsUrl("NEXT_PUBLIC_AAS_AI_TERMS_URL", aiTermsUrl);

if (!publishableKey) {
  fail("NEXT_PUBLIC_AAS_SUPABASE_PUBLISHABLE_KEY is required");
} else if (/^sb_secret_/i.test(publishableKey) || /service[_-]?role/i.test(publishableKey)) {
  fail("Supabase secret/service-role material must never be exposed to the PWA");
}

const requiredFiles = [
  "public/manifest.webmanifest",
  "public/sw.js",
  "public/offline.html",
  "public/icon-192.png",
  "public/icon-512.png",
  "worker/index.ts",
  "wrangler.jsonc",
];
for (const relativePath of requiredFiles) {
  if (!fs.existsSync(path.join(ROOT, relativePath))) {
    fail(`missing required production asset: ${relativePath}`);
  }
}

const manifestText = readText("public/manifest.webmanifest");
if (manifestText) {
  try {
    const manifest = JSON.parse(manifestText);
    if (manifest.start_url !== "/") fail("manifest start_url must be /");
    if (manifest.scope !== "/") fail("manifest scope must be /");
    if (manifest.display !== "standalone") fail("manifest display must be standalone");
    const sizes = new Set((manifest.icons ?? []).map((item) => item.sizes));
    if (!sizes.has("192x192")) fail("manifest must include a 192x192 icon");
    if (!sizes.has("512x512")) fail("manifest must include a 512x512 icon");
  } catch {
    fail("manifest.webmanifest must be valid JSON");
  }
}

const wranglerText = readText("wrangler.jsonc");
if (wranglerText) {
  try {
    const wrangler = JSON.parse(wranglerText);
    if (wrangler.name !== "ai-article-studio-pwa") {
      fail("wrangler worker name must be ai-article-studio-pwa");
    }
    if (wrangler.main !== "./worker/index.ts") {
      fail("wrangler main must point to ./worker/index.ts");
    }
    if (!(wrangler.compatibility_flags ?? []).includes("nodejs_compat")) {
      fail("wrangler must enable nodejs_compat");
    }
    if (wrangler.assets?.binding !== "ASSETS") fail("wrangler ASSETS binding is required");
    if (wrangler.images?.binding !== "IMAGES") fail("wrangler IMAGES binding is required");
    if ("account_id" in wrangler) {
      fail("wrangler.jsonc must not hardcode a Cloudflare account_id");
    }
  } catch {
    fail("wrangler.jsonc must remain strict JSON-compatible JSONC");
  }
}

const layoutText = readText("app/layout.tsx");
if (layoutText.includes('"codex-preview"')) {
  fail("production layout must not advertise codex-preview metadata");
}
if (!layoutText.includes('"aas-phase": "17"')) {
  fail("production layout must declare aas-phase 17");
}
if (!layoutText.includes("index: false") || !layoutText.includes("follow: false")) {
  fail("invite-only production PWA must remain noindex/nofollow");
}

const serviceWorkerText = readText("public/sw.js");
if (serviceWorkerText.includes("aas-pwa-phase8-v1")) {
  fail("service worker cache name still references phase8");
}
if (!serviceWorkerText.includes("/auth/callback")) {
  fail("service worker must bypass auth callback requests");
}

const callbackText = readText("app/auth/callback/page.tsx");
if (!callbackText.includes("exchangeCodeForSession")) {
  fail("PKCE callback exchange is missing");
}

if (failures.length) {
  console.error("PWA PRODUCTION PREFLIGHT: FAILED");
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log("PWA PRODUCTION PREFLIGHT: PASS");
console.log(`Node.js ${process.versions.node}`);
console.log("HTTPS production origin: configured");
console.log("Supabase browser configuration: configured without printing values");
console.log("Legal links: configured");
console.log("PWA manifest/service worker/icons: verified");
console.log("Cloudflare Workers config: verified");
console.log("Invite-only robots policy: verified");
