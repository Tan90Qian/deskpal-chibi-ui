import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const distDir = path.resolve(import.meta.dirname, "../dist");
const args = process.argv.slice(2);
const restore = args.includes("--restore");
const targetArg = args.find((a) => !a.startsWith("--"));

function detectDeskPalDir() {
  if (targetArg) return path.resolve(targetArg);

  // 1. Check running DeskPal.exe process path on Windows
  if (process.platform === "win32") {
    try {
      const out = execFileSync(
        "powershell",
        ["-NoProfile", "-Command", "(Get-Process DeskPal -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Path)"],
        { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim();
      if (out && fs.existsSync(out)) return path.dirname(out);
    } catch {
      // ignore
    }
  }

  // 2. Check common installation locations
  const candidates = [
    "E:/DeskPal/current",
    "D:/DeskPal/current",
    "F:/DeskPal/current",
    "C:/DeskPal/current",
    path.join(process.env.LOCALAPPDATA || "", "Programs", "DeskPal", "current"),
    path.join(process.env.LOCALAPPDATA || "", "DeskPal", "current"),
  ];
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, "web"))) return path.resolve(dir);
  }
  return candidates[candidates.length - 2];
}

const deskpalDir = detectDeskPalDir();
const webDir = path.basename(deskpalDir).toLowerCase() === "web" ? deskpalDir : path.join(deskpalDir, "web");
const backupDir = path.join(path.dirname(webDir), "web.official.bak");

if (restore) {
  if (!fs.existsSync(backupDir)) {
    console.error(`No backup found at: ${backupDir}`);
    process.exit(1);
  }
  fs.rmSync(webDir, { recursive: true, force: true });
  fs.cpSync(backupDir, webDir, { recursive: true });
  console.log(`Restored official DeskPal UI -> ${webDir}`);
  process.exit(0);
}

if (!fs.existsSync(path.join(distDir, "index.html"))) {
  console.error("dist/index.html not found. Run `npm run build` first.");
  process.exit(1);
}
if (!fs.existsSync(webDir)) {
  console.error(`Target DeskPal web directory not found: ${webDir}`);
  console.error("Pass your DeskPal install path explicitly, e.g.:");
  console.error('  node scripts/apply-to-deskpal.mjs "E:\\DeskPal\\current"');
  process.exit(1);
}

if (!fs.existsSync(backupDir)) {
  fs.cpSync(webDir, backupDir, { recursive: true });
  console.log(`Backed up official web/ -> ${backupDir}`);
}

fs.rmSync(webDir, { recursive: true, force: true });
fs.cpSync(distDir, webDir, { recursive: true });
console.log(`Applied DeskPal Chibi UI -> ${webDir}`);
console.log("Restart DeskPal (or close and reopen its panel) to see the new dual-theme skin.");
console.log("To revert anytime: npm run restore:deskpal");
