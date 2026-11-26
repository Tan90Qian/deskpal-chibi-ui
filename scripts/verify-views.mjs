import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON || import.meta.url);
const { chromium } = require("playwright");

const distDir = path.resolve(import.meta.dirname, "../dist");
const outDir = process.argv[2] || path.resolve(import.meta.dirname, "../.verify-shots");
fs.mkdirSync(outDir, { recursive: true });

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer((req, res) => {
  const raw = decodeURIComponent((req.url || "/").split("?")[0]);
  const rel = raw === "/" ? "index.html" : raw.replace(/^\/+/, "");
  const filePath = path.join(distDir, rel);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }
  res.writeHead(200, { "Content-Type": mime[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});

const errors = [];

async function settle(page) {
  await page.waitForTimeout(250);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) =>
        img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; }),
      ),
    );
  });
}

try {
  // 1. Light Home + Picker + Stats + Live Theme Toggle -> Dark Home
  const ctx = await browser.newContext({ viewport: { width: 420, height: 680 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto(`${baseUrl}/?theme=light&crowd`, { waitUntil: "networkidle" });
  await settle(page);
  await page.screenshot({ path: path.join(outDir, "real_home_light.png") });

  // Open Chibi Picker by clicking "换角色"
  await page.locator(".cafe-pick-btn").click();
  await settle(page);
  await page.screenshot({ path: path.join(outDir, "real_picker_light.png") });
  // Pick Claude Saint skin
  await page.locator(".picker-card", { hasText: "圣女 Claude" }).click();
  await settle(page);

  // Switch to Dark Mode via one-click Titlebar Theme Toggle!
  await page.locator(".theme-toggle").click();
  await settle(page);
  await page.screenshot({ path: path.join(outDir, "real_home_dark.png") });

  // Switch to Stats tab in Dark Mode
  await page.locator(".game-dock-item", { hasText: "统计" }).click();
  await settle(page);
  await page.screenshot({ path: path.join(outDir, "real_stats_dark.png") });

  // Switch to Settings tab in Light Mode
  await page.locator(".theme-toggle").click();
  await page.locator(".game-dock-item", { hasText: "设置" }).click();
  await settle(page);
  await page.screenshot({ path: path.join(outDir, "real_settings_light.png") });

  // 2. Login page
  await page.goto(`${baseUrl}/?page=login&theme=light`, { waitUntil: "networkidle" });
  await settle(page);
  await page.screenshot({ path: path.join(outDir, "real_login_light.png") });
  await page.close();

  // 3. Pinned Card (280x84) Light & Dark
  const cardCtx = await browser.newContext({ viewport: { width: 280, height: 84 }, deviceScaleFactor: 2 });
  const cardPage = await cardCtx.newPage();
  cardPage.on("pageerror", (e) => errors.push(`card pageerror: ${e.message}`));
  await cardPage.goto(`${baseUrl}/?page=card&theme=light`, { waitUntil: "networkidle" });
  await settle(cardPage);
  await cardPage.screenshot({ path: path.join(outDir, "real_card_light.png") });

  await cardPage.goto(`${baseUrl}/?page=card&theme=dark`, { waitUntil: "networkidle" });
  await settle(cardPage);
  await cardPage.screenshot({ path: path.join(outDir, "real_card_dark.png") });
  await cardPage.close();

  console.log("ALL_VIEWS_CAPTURED", { outDir, errorCount: errors.length });
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  server.closeAllConnections?.();
  server.close();
}
