import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const rootDir = path.resolve(import.meta.dirname, "..");
const distDir = path.join(rootDir, "dist");
const kitDir = path.join(rootDir, "release-kit");
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8"));
const version = process.env.RELEASE_VERSION?.replace(/^v/i, "") || pkg.version || "0.1.0";

if (!fs.existsSync(path.join(distDir, "index.html"))) {
  console.error("dist/index.html not found. Run `npm run build` first.");
  process.exit(1);
}

const releaseDir = path.join(rootDir, "release");
const stageName = `DeskPal-Chibi-UI-v${version}`;
const stageDir = path.join(releaseDir, stageName);
const zipPath = path.join(releaseDir, `DeskPal-Chibi-UI-v${version}-win.zip`);

fs.rmSync(stageDir, { recursive: true, force: true });
fs.rmSync(zipPath, { force: true });
fs.mkdirSync(path.join(stageDir, "tools"), { recursive: true });

// 1. Copy built web/ output
fs.cpSync(distDir, path.join(stageDir, "web"), { recursive: true });

// 2. Write PowerShell installer with single UTF-8 BOM + CRLF so Windows PowerShell 5.1 reads Chinese cleanly
const ps1Raw = fs
  .readFileSync(path.join(kitDir, "deskpal-skin.ps1"), "utf-8")
  .replace(/^\uFEFF+/, "")
  .replace(/\r?\n/g, "\r\n");
fs.writeFileSync(path.join(stageDir, "tools", "deskpal-skin.ps1"), "\uFEFF" + ps1Raw, "utf-8");

// 3. Copy CRLF .cmd launchers (no BOM) & UTF-8 README.txt
const writeCrlf = (src, dest) => {
  const txt = fs.readFileSync(src, "utf-8").replace(/^\uFEFF+/, "").replace(/\r?\n/g, "\r\n");
  fs.writeFileSync(dest, txt, "utf-8");
};
writeCrlf(path.join(kitDir, "install.cmd"), path.join(stageDir, "一键安装皮肤.cmd"));
writeCrlf(path.join(kitDir, "restore.cmd"), path.join(stageDir, "一键还原原版.cmd"));
writeCrlf(path.join(kitDir, "README.txt"), path.join(stageDir, "使用说明.txt"));

// 4. Zip with UTF-8 filename support on both Windows and Linux
if (process.platform === "win32") {
  execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${stageDir.replace(/'/g, "''")}', '${zipPath.replace(/'/g, "''")}', [System.IO.Compression.CompressionLevel]::Optimal, $true)`,
    ],
    { stdio: "inherit" },
  );
} else {
  execFileSync(
    "python3",
    [
      "-c",
      `import os, sys, zipfile
root, out = sys.argv[1], sys.argv[2]
base = os.path.dirname(root)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    for dp, _, files in os.walk(root):
        for f in sorted(files):
            fp = os.path.join(dp, f)
            zf.write(fp, os.path.relpath(fp, base))`,
      stageDir,
      zipPath,
    ],
    { stdio: "inherit" },
  );
}

fs.rmSync(stageDir, { recursive: true, force: true });
const sizeMb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);
console.log(`Packaged: ${zipPath} (${sizeMb} MB)`);
