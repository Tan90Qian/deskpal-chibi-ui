import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const syncDir = path.join(rootDir, ".sync-tmp");

function readTruncated(filePath, maxChars) {
  if (!fs.existsSync(filePath)) return "";
  const txt = fs.readFileSync(filePath, "utf-8");
  if (txt.length <= maxChars) return txt;
  return txt.slice(0, maxChars) + `\n... (truncated, total ${txt.length} chars)`;
}

function setGitHubOutput(entries) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  const lines = Object.entries(entries).map(([k, v]) => `${k}=${String(v ?? "")}`);
  fs.appendFileSync(outputPath, lines.join("\n") + "\n", "utf-8");
}

async function main() {
  const apiKey = process.env.JULES_API_KEY || "";
  const repo = process.env.GITHUB_REPOSITORY || "";
  const branch = process.env.SYNC_BRANCH || "main";

  if (!apiKey) {
    console.log("[dispatch-jules] JULES_API_KEY is not configured.");
    setGitHubOutput({ jules_dispatched: "false", jules_url: "", jules_error: "JULES_API_KEY not set" });
    return;
  }
  if (!repo) {
    throw new Error("GITHUB_REPOSITORY is required");
  }

  const report = readTruncated(path.join(syncDir, "sync-report.md"), 4000);
  const buildLog = readTruncated(path.join(syncDir, "build.log"), 4000);
  const diffSnippet = readTruncated(path.join(syncDir, "upstream.diff"), 12000);

  const prompt = [
    `Upstream DeskPal (HuLuShiLei/DeskPal) updated its web frontend, and automated 3-way merge onto branch "${branch}" encountered merge conflicts or TypeScript/build errors.`,
    ``,
    `Your task:`,
    `1. Resolve all git merge conflict markers in src/ and adapt any protocol / type / component changes from upstream DeskPal.`,
    `2. STRICTLY PRESERVE the dual-theme mobile-game chibi skin design:`,
    `   - Keep src/chibi-skin.css, src/chibi.ts, src/chibi-pack.generated.json, and src/components/{HomeStage,LivingChibi,MiniSprite,ChibiPicker}.tsx intact unless protocol field names in bridge.ts changed and require small adapter updates.`,
    `   - Keep Light Mode (warm cafe diorama) and Dark Mode (starry anime lobby) layouts, titlebar theme toggle, and floating bottom dock working.`,
    `3. Run \`npm ci && npm run build\` (which runs \`tsc --noEmit && vite build\`) and ensure it exits with code 0 and zero TypeScript errors.`,
    `4. Open a Pull Request targeting \`main\` with a clear summary of how you adapted the upstream changes.`,
    ``,
    `--- Sync Report ---`,
    report || "(no report)",
    ``,
    `--- Build / TypeScript Log ---`,
    buildLog || "(no build log)",
    ``,
    `--- Upstream Web Diff (excerpt) ---`,
    diffSnippet || "(no diff)",
  ].join("\n");

  const payload = {
    prompt,
    sourceContext: {
      source: `sources/github/${repo}`,
      githubRepoContext: {
        startingBranch: branch,
      },
    },
    requirePlanApproval: false,
    automationMode: "AUTO_CREATE_PR",
  };

  const resp = await fetch("https://jules.googleapis.com/v1alpha/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  if (!resp.ok) {
    console.error(`[dispatch-jules] Jules API error (HTTP ${resp.status}): ${text}`);
    setGitHubOutput({
      jules_dispatched: "false",
      jules_url: "",
      jules_error: `HTTP ${resp.status}: ${text.slice(0, 300)}`,
    });
    return;
  }

  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    // keep empty
  }

  const sessionName = data.name || "";
  const sessionId = sessionName.split("/").pop() || data.id || "";
  const julesUrl = data.url || (sessionId ? `https://jules.google.com/session/${sessionId}` : "https://jules.google.com");

  console.log(`[dispatch-jules] Dispatched Jules session: ${sessionName || "(ok)"} -> ${julesUrl}`);
  setGitHubOutput({
    jules_dispatched: "true",
    jules_url: julesUrl,
    jules_session: sessionName,
    jules_error: "",
  });
}

main().catch((err) => {
  console.error("[dispatch-jules] Unexpected error:", err);
  setGitHubOutput({ jules_dispatched: "false", jules_url: "", jules_error: String(err.message || err) });
});
