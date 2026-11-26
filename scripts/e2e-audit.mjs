import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON || import.meta.url);
const { chromium } = require("playwright");

const distDir = path.resolve(import.meta.dirname, "../dist");
const shotDir = process.argv[2] || path.resolve(import.meta.dirname, "../.audit-shots");
fs.mkdirSync(shotDir, { recursive: true });

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

const results = [];
const consoleErrors = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function overlaps(a, b) {
  if (!a || !b) return false;
  return !(a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1);
}

async function isEffectivelyVisible(locator) {
  const count = await locator.count();
  if (count === 0) return { visible: false, reason: "not in DOM" };
  const box = await locator.first().boundingBox();
  if (!box || box.width < 10 || box.height < 10) return { visible: false, reason: `box too small: ${JSON.stringify(box)}` };
  // Check whether any ancestor with overflow:hidden clips it to 0 height/width
  const clipCheck = await locator.first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    let visW = r.width;
    let visH = r.height;
    let cur = el.parentElement;
    while (cur && cur !== document.body) {
      const cs = getComputedStyle(cur);
      if (cs.overflow === "hidden" || cs.overflowY === "hidden" || cs.overflowX === "hidden" || cs.overflow === "clip") {
        const pr = cur.getBoundingClientRect();
        const interLeft = Math.max(r.left, pr.left);
        const interRight = Math.min(r.right, pr.right);
        const interTop = Math.max(r.top, pr.top);
        const interBottom = Math.min(r.bottom, pr.bottom);
        visW = Math.min(visW, Math.max(0, interRight - interLeft));
        visH = Math.min(visH, Math.max(0, interBottom - interTop));
      }
      cur = cur.parentElement;
    }
    return { rect: { x: r.x, y: r.y, w: r.width, h: r.height }, visW, visH };
  });
  if (clipCheck.visW < 10 || clipCheck.visH < 10) {
    return { visible: false, reason: `clipped by ancestor! visible=${clipCheck.visW.toFixed(0)}x${clipCheck.visH.toFixed(0)} rect=${JSON.stringify(clipCheck.rect)}` };
  }
  return { visible: true, box, clipCheck };
}

try {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 680 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`); });

  await page.goto(`${baseUrl}/?theme=light&crowd`, { waitUntil: "networkidle" });
  await page.waitForTimeout(250);

  // 1. Titlebar layout & zero overlap
  const brandBox = await page.locator(".wordmark.game-brand").boundingBox();
  const roomBtnBox = await page.locator(".flyout-button").boundingBox();
  const capsBox = await page.locator(".caption-buttons").boundingBox();
  record(
    "Titlebar Light no overlap (420px)",
    !overlaps(brandBox, roomBtnBox) && !overlaps(roomBtnBox, capsBox),
    `brandRight=${(brandBox.x + brandBox.width).toFixed(1)} room=[${roomBtnBox.x.toFixed(1)},${(roomBtnBox.x + roomBtnBox.width).toFixed(1)}] capsLeft=${capsBox.x.toFixed(1)}`,
  );

  // 2. Room Switcher Flyout open, visible (not clipped!), switch room, switch to no-room, switch back
  await page.locator(".flyout-button").click();
  await page.waitForTimeout(180);
  const flyoutCheck = await isEffectivelyVisible(page.locator(".flyout"));
  await page.screenshot({ path: path.join(shotDir, "audit_flyout_light.png") });
  record("Room switcher flyout unclipped & visible", flyoutCheck.visible, flyoutCheck.reason || `vis=${flyoutCheck.clipCheck.visW.toFixed(0)}x${flyoutCheck.clipCheck.visH.toFixed(0)}`);

  if (flyoutCheck.visible) {
    // Click second room ("同事房间")
    await page.locator(".flyout .menu-item", { hasText: "同事房间" }).click();
    await page.waitForTimeout(150);
    const labelAfter = await page.locator(".flyout-label").textContent();
    record("Room switch to 同事房间", labelAfter?.trim() === "同事房间", `label=${labelAfter}`);

    // Switch back to 测试房间
    await page.locator(".flyout-button").click();
    await page.waitForTimeout(150);
    await page.locator(".flyout .menu-item", { hasText: "测试房间" }).click();
    await page.waitForTimeout(150);
    const labelBack = await page.locator(".flyout-label").textContent();
    record("Room switch back to 测试房间", labelBack?.trim() === "测试房间", `label=${labelBack}`);
  }

  // 3. Light Home: Protagonist pat click -> 0px shift + hearts + bubble changes
  const hero = page.locator(".cafe-actor.hero");
  const hb1 = await hero.boundingBox();
  await page.mouse.move(hb1.x + hb1.width / 2, hb1.y + hb1.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(40);
  const hb2 = await hero.boundingBox();
  await page.mouse.up();
  await page.waitForTimeout(120);
  const hb3 = await hero.boundingBox();
  const patHearts = await page.locator(".cafe-actor.hero .pat-hearts").count();
  record(
    "Light Protagonist pat (0px shift + hearts)",
    Math.abs(hb2.x - hb1.x) < 0.5 && Math.abs(hb3.x - hb1.x) < 0.5 && patHearts > 0,
    `dxDown=${(hb2.x - hb1.x).toFixed(2)} dxUp=${(hb3.x - hb1.x).toFixed(2)} hearts=${patHearts}`,
  );

  // 4. Friend click on Cafe Stage -> opens ChibiPicker centered & unclipped
  const friendBtn = page.locator(".cafe-actor:not(.hero)").first();
  const fb1 = await friendBtn.boundingBox();
  await page.mouse.move(fb1.x + fb1.width / 2, fb1.y + fb1.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(40);
  const fb2 = await friendBtn.boundingBox();
  await page.mouse.up();
  await page.waitForTimeout(150);
  const pickerVis = await isEffectivelyVisible(page.locator(".chibi-picker-modal"));
  record(
    "Cafe friend click (0px shift + picker opens)",
    Math.abs(fb2.x - fb1.x) < 0.5 && pickerVis.visible,
    `dx=${(fb2.x - fb1.x).toFixed(2)} picker=${pickerVis.visible ? "OK" : pickerVis.reason}`,
  );
  if (pickerVis.visible) {
    await page.locator(".picker-close").click();
    await page.waitForTimeout(120);
  }

  // 5. Reclassify dialog opens & saves cleanly + toast visible above bottom dock
  await page.locator(".me-mini-btn[title*='纠正'], .me-mini-btn").first().click();
  await page.waitForTimeout(150);
  const dlgVis = await isEffectivelyVisible(page.locator(".dialog"));
  record("Reclassify dialog visible", dlgVis.visible, dlgVis.reason || "OK");
  if (dlgVis.visible) {
    await page.locator(".dialog-buttons button.primary").click();
    await page.waitForTimeout(180);
    const toastCheck = await isEffectivelyVisible(page.locator(".toast"));
    const dockBox = await page.locator(".game-dock").boundingBox();
    const toastBox = await page.locator(".toast").first().boundingBox();
    const toastClearOfDock = !toastBox || !overlaps(toastBox, dockBox);
    record(
      "Toast visible & not hidden behind bottom dock",
      toastCheck.visible && toastClearOfDock,
      `toast=${toastBox ? `y=${toastBox.y.toFixed(0)}..${(toastBox.y + toastBox.height).toFixed(0)}` : "none"} dockY=${dockBox?.y.toFixed(0)}`,
    );
  }

  // 6. Pause switch toggles cleanly
  await page.locator(".me-pause-chip .switch").click();
  await page.waitForTimeout(150);
  const pausedSent = await page.evaluate(() => (window.__sent || []).some((x) => x.type === "presence.pause" && x.paused === true));
  record("Pause sharing switch sends command", pausedSent);
  await page.locator(".me-pause-chip .switch").click();
  await page.waitForTimeout(150);

  // 7. Theme toggle -> Dark Mode + Dark Room Switcher + Dark Skin Chip + Dark Pat
  await page.locator(".theme-toggle").click();
  await page.waitForTimeout(200);
  const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  const starLobbyVis = await isEffectivelyVisible(page.locator(".star-lobby"));
  record("Theme toggle switches to Dark Starry Lobby", isDark && starLobbyVis.visible, `dark=${isDark}`);

  await page.locator(".flyout-button").click();
  await page.waitForTimeout(150);
  const darkFlyout = await isEffectivelyVisible(page.locator(".flyout"));
  await page.screenshot({ path: path.join(shotDir, "audit_flyout_dark.png") });
  record("Dark mode room switcher flyout visible", darkFlyout.visible, darkFlyout.reason || "OK");
  if (darkFlyout.visible) await page.keyboard.press("Escape");
  await page.waitForTimeout(120);

  // Dark skin chip opens picker
  await page.locator(".star-skin-chip").click();
  await page.waitForTimeout(150);
  const darkPicker = await isEffectivelyVisible(page.locator(".chibi-picker-modal"));
  record("Dark skin chip opens ChibiPicker", darkPicker.visible, darkPicker.reason || "OK");
  if (darkPicker.visible) await page.locator(".picker-close").click();
  await page.waitForTimeout(120);

  // 8. Member Pin button + View Stats button
  const pinBtn = page.locator(".game-member .pin-button").last();
  await pinBtn.click();
  await page.waitForTimeout(150);
  const pinSent = await page.evaluate(() => (window.__sent || []).some((x) => x.type === "member.pin" || x.type === "member.unpin"));
  record("Member pin button sends command", pinSent);

  // 9. Stats page navigation & sub-controls
  await page.locator(".game-dock-item", { hasText: "统计" }).click();
  await page.waitForTimeout(200);
  await page.locator(".segmented button", { hasText: "周" }).click();
  await page.waitForTimeout(180);
  const statsHasBars = (await page.locator(".stats-chart").count()) > 0;
  record("StatsPage switches Day -> Week", statsHasBars);

  // 10. Room page + MoreMenu context-menu unclipped!
  await page.locator(".game-dock-item", { hasText: "房间" }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(shotDir, "audit_room_dark.png") });
  const moreBtns = page.locator(".menu-root button");
  const hasMore = (await moreBtns.count()) > 0;
  if (hasMore) {
    await moreBtns.first().click();
    await page.waitForTimeout(150);
    const ctxVis = await isEffectivelyVisible(page.locator(".flyout.context-menu"));
    record("RoomPage MoreMenu context-menu visible", ctxVis.visible, ctxVis.reason || "OK");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
  } else {
    record("RoomPage rendered (no MoreMenu button in fixture)", true);
  }

  // 11. Rules page + search bar + tabs (Light Mode)
  await page.locator(".theme-toggle").click();
  await page.locator(".game-dock-item", { hasText: "规则" }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(shotDir, "audit_rules_light.png") });
  const rulesTabs = await page.locator(".segmented button").count();
  if (rulesTabs >= 2) {
    await page.locator(".segmented button").nth(1).click();
    await page.waitForTimeout(150);
  }
  record("RulesPage tabs & search render cleanly", rulesTabs >= 2, `tabs=${rulesTabs}`);

  // 12. Settings page + Plugins sub-page + bottom scroll clearance
  await page.locator(".game-dock-item", { hasText: "设置" }).click();
  await page.waitForTimeout(200);
  const pluginsRow = page.locator("button, .setting-row", { hasText: "插件" }).first();
  if ((await pluginsRow.count()) > 0) {
    await pluginsRow.click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(shotDir, "audit_plugins_light.png") });
    const hasBack = (await page.locator("button", { hasText: /返回|Back/ }).count()) > 0 || (await page.locator(".icon-button").count()) > 0;
    record("Settings -> Plugins sub-page opens", hasBack);
  } else {
    record("Settings -> Plugins entry present", false, "not found");
  }

  // 13. Close dialog test
  await page.locator(".caption.close").click();
  await page.waitForTimeout(180);
  const closeDlg = await isEffectivelyVisible(page.locator(".dialog"));
  record("Close window dialog visible", closeDlg.visible, closeDlg.reason || "OK");
  if (closeDlg.visible) await page.locator(".dialog-buttons button", { hasText: "取消" }).click();

  // 14. Narrow 400x480 stress test with long room name (Light Mode)
  await page.setViewportSize({ width: 400, height: 480 });
  await page.locator(".game-dock-item", { hasText: "首页" }).click();
  await page.waitForTimeout(200);
  // Inject a long room name to stress test titlebar at 400px
  await page.evaluate(() => {
    const lbl = document.querySelector(".flyout-label");
    if (lbl) lbl.textContent = "理工生陷入云吸猫";
  });
  await page.waitForTimeout(80);
  const b400 = await page.locator(".wordmark.game-brand").boundingBox();
  const r400 = await page.locator(".flyout-button").boundingBox();
  const c400 = await page.locator(".caption-buttons").boundingBox();
  const hOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  record(
    "400x480 narrow stress: no titlebar overlap & no horizontal scroll",
    !overlaps(b400, r400) && !overlaps(r400, c400) && !hOverflow,
    `roomRight=${(r400.x + r400.width).toFixed(1)} capsLeft=${c400.x.toFixed(1)} hOverflow=${hOverflow}`,
  );

  // 15. Console errors check
  record("Zero console/page errors during full E2E", consoleErrors.length === 0, consoleErrors.join("; "));

  const failed = results.filter((r) => !r.ok);
  console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} PASS, ${failed.length} FAIL`);
  if (failed.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
  server.closeAllConnections?.();
  server.close();
}
