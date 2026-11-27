import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const rootDir = path.resolve(import.meta.dirname, "..");
const syncConfigPath = path.join(rootDir, ".upstream-sync.json");
const outDir = path.join(rootDir, ".sync-tmp");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function git(args, cwd, allowFail = false) {
  const res = spawnSync("git", args, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.status !== 0 && !allowFail) {
    throw new Error(`git ${args.join(" ")} failed (${res.status}): ${res.stderr || res.stdout}`);
  }
  return res;
}

function gitBuffer(args, cwd) {
  const res = spawnSync("git", args, {
    cwd,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.status !== 0) return null;
  return res.stdout;
}

function setGitHubOutput(entries) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  const lines = [];
  for (const [key, val] of Object.entries(entries)) {
    const str = String(val ?? "");
    if (str.includes("\n")) {
      const delim = `EOF_${key}_${Date.now()}`;
      lines.push(`${key}<<${delim}\n${str}\n${delim}`);
    } else {
      lines.push(`${key}=${str}`);
    }
  }
  fs.appendFileSync(outputPath, lines.join("\n") + "\n", "utf-8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const checkOnly = Boolean(args["check-only"]);
  const force = Boolean(args.force);
  const targetRev = args["target-rev"] || "";
  const localUpstreamDir = args["upstream-dir"] || "";

  if (!fs.existsSync(syncConfigPath)) {
    throw new Error(`Missing ${syncConfigPath}`);
  }
  const syncCfg = JSON.parse(fs.readFileSync(syncConfigPath, "utf-8"));
  const upstreamWebPath = syncCfg.upstreamWebPath || "src/DeskPal.Client/web";
  const upstreamSrcPrefix = `${upstreamWebPath}/src/`;
  const oldWebCommit = syncCfg.upstreamWebCommit;

  fs.mkdirSync(outDir, { recursive: true });

  let upstreamDir = localUpstreamDir;
  let tempCloneDir = "";
  if (!upstreamDir) {
    tempCloneDir = fs.mkdtempSync(path.join(os.tmpdir(), "deskpal-upstream-"));
    upstreamDir = tempCloneDir;
    const repoUrl = `https://github.com/${syncCfg.upstreamRepo}.git`;
    console.log(`[sync-upstream] Cloning ${repoUrl} (${syncCfg.upstreamBranch})...`);
    execFileSync(
      "git",
      ["clone", "--no-checkout", "--branch", syncCfg.upstreamBranch || "main", repoUrl, upstreamDir],
      { stdio: "inherit" },
    );
  }

  try {
    const headRef = targetRev || "HEAD";
    const newRepoCommit = git(["rev-parse", headRef], upstreamDir).stdout.trim();
    const newWebCommit = git(
      ["log", "-n", "1", "--format=%H", headRef, "--", upstreamWebPath],
      upstreamDir,
    ).stdout.trim();

    const tagRes = git(["describe", "--tags", "--abbrev=0", newRepoCommit], upstreamDir, true);
    const newTag = tagRes.status === 0 ? tagRes.stdout.trim() : syncCfg.upstreamTag || "";
    const compatibleVersion = newTag ? newTag.replace(/^v/i, "") : syncCfg.compatibleDeskPalVersion;

    const hasChanges = force || (Boolean(newWebCommit) && newWebCommit !== oldWebCommit);
    console.log(
      `[sync-upstream] oldWeb=${oldWebCommit.slice(0, 8)} newWeb=${newWebCommit.slice(0, 8)} tag=${newTag || "(none)"} hasChanges=${hasChanges}`,
    );

    if (!hasChanges) {
      const result = {
        hasChanges: false,
        oldWebCommit,
        newWebCommit,
        newRepoCommit,
        newTag,
        compatibleVersion,
        commits: [],
        mergedFiles: [],
        conflicts: [],
        packageJsonChanged: false,
      };
      fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2), "utf-8");
      setGitHubOutput({
        has_changes: "false",
        new_web_commit: newWebCommit,
        new_tag: newTag,
        compatible_version: compatibleVersion,
        conflict_count: "0",
      });
      return;
    }

    // Collect commit log & full diff for upstreamWebPath
    const logRange = `${oldWebCommit}..${newWebCommit}`;
    const commitsRaw = git(
      ["log", "--pretty=format:%h %s (%ad)", "--date=short", logRange, "--", upstreamWebPath],
      upstreamDir,
      true,
    ).stdout.trim();
    const commits = commitsRaw ? commitsRaw.split(/\r?\n/) : [];

    const fullDiff = git(["diff", oldWebCommit, newWebCommit, "--", upstreamWebPath], upstreamDir, true).stdout;
    fs.writeFileSync(path.join(outDir, "upstream.diff"), fullDiff, "utf-8");

    // Inspect changed files under upstreamWebPath
    const nameStatusRaw = git(
      ["diff", "--name-status", "--no-renames", oldWebCommit, newWebCommit, "--", upstreamWebPath],
      upstreamDir,
    ).stdout.trim();
    const changedEntries = nameStatusRaw
      ? nameStatusRaw.split(/\r?\n/).map((line) => {
          const [status, ...rest] = line.split("\t");
          return { status: status.trim(), file: rest.join("\t").trim() };
        })
      : [];

    const packageJsonChanged = changedEntries.some(
      (e) => e.file === `${upstreamWebPath}/package.json` || e.file === `${upstreamWebPath}/index.html`,
    );

    const mergedFiles = [];
    const conflicts = [];
    const skippedNonSrc = [];

    if (!checkOnly) {
      const mergeScratch = fs.mkdtempSync(path.join(os.tmpdir(), "deskpal-merge-"));
      try {
        for (const entry of changedEntries) {
          if (!entry.file.startsWith(upstreamSrcPrefix)) {
            skippedNonSrc.push(`${entry.status} ${entry.file}`);
            continue;
          }
          const relSrc = entry.file.slice(upstreamSrcPrefix.length);
          const localFile = path.join(rootDir, "src", ...relSrc.split("/"));
          const baseBuf = gitBuffer(["show", `${oldWebCommit}:${entry.file}`], upstreamDir);
          const theirsBuf = gitBuffer(["show", `${newWebCommit}:${entry.file}`], upstreamDir);
          const localExists = fs.existsSync(localFile);
          const oursBuf = localExists ? fs.readFileSync(localFile) : null;

          if (entry.status === "A") {
            fs.mkdirSync(path.dirname(localFile), { recursive: true });
            if (!localExists) {
              fs.writeFileSync(localFile, theirsBuf);
              mergedFiles.push(`A src/${relSrc}`);
            } else if (oursBuf.equals(theirsBuf)) {
              mergedFiles.push(`= src/${relSrc}`);
            } else {
              // Both added differently -> 3-way merge with empty base
              const pOurs = path.join(mergeScratch, "ours");
              const pBase = path.join(mergeScratch, "base");
              const pTheirs = path.join(mergeScratch, "theirs");
              fs.writeFileSync(pOurs, oursBuf);
              fs.writeFileSync(pBase, "");
              fs.writeFileSync(pTheirs, theirsBuf);
              const m = git(["merge-file", "-L", "chibi-ui", "-L", "base", "-L", "upstream-deskpal", pOurs, pBase, pTheirs], mergeScratch, true);
              fs.writeFileSync(localFile, fs.readFileSync(pOurs));
              if (m.status === 0) mergedFiles.push(`M src/${relSrc}`);
              else conflicts.push(`src/${relSrc} (both added)`);
            }
          } else if (entry.status === "D") {
            if (!localExists) {
              mergedFiles.push(`D src/${relSrc}`);
            } else if (baseBuf && oursBuf.equals(baseBuf)) {
              fs.rmSync(localFile, { force: true });
              mergedFiles.push(`D src/${relSrc}`);
            } else {
              conflicts.push(`src/${relSrc} (deleted upstream, modified locally)`);
            }
          } else {
            // Modified (M / T)
            fs.mkdirSync(path.dirname(localFile), { recursive: true });
            if (!localExists || (baseBuf && oursBuf.equals(baseBuf))) {
              // Untouched upstream file -> clean fast-forward
              fs.writeFileSync(localFile, theirsBuf);
              mergedFiles.push(`FF src/${relSrc}`);
            } else if (oursBuf.equals(theirsBuf)) {
              mergedFiles.push(`= src/${relSrc}`);
            } else {
              const pOurs = path.join(mergeScratch, "ours");
              const pBase = path.join(mergeScratch, "base");
              const pTheirs = path.join(mergeScratch, "theirs");
              fs.writeFileSync(pOurs, oursBuf);
              fs.writeFileSync(pBase, baseBuf || Buffer.alloc(0));
              fs.writeFileSync(pTheirs, theirsBuf);
              const m = git(["merge-file", "-L", "chibi-ui", "-L", "base", "-L", "upstream-deskpal", pOurs, pBase, pTheirs], mergeScratch, true);
              fs.writeFileSync(localFile, fs.readFileSync(pOurs));
              if (m.status === 0) {
                mergedFiles.push(`3W src/${relSrc}`);
              } else {
                conflicts.push(`src/${relSrc}`);
              }
            }
          }
        }

        // Update .upstream-sync.json
        const nextSkinRev = newTag && newTag !== syncCfg.upstreamTag ? 1 : (syncCfg.skinRevision || 1) + 1;
        const nextCfg = {
          ...syncCfg,
          upstreamCommit: newRepoCommit,
          upstreamWebCommit: newWebCommit,
          upstreamTag: newTag || syncCfg.upstreamTag,
          compatibleDeskPalVersion: compatibleVersion,
          skinRevision: nextSkinRev,
        };
        fs.writeFileSync(syncConfigPath, JSON.stringify(nextCfg, null, 2) + "\n", "utf-8");
      } finally {
        fs.rmSync(mergeScratch, { recursive: true, force: true });
      }
    }

    const reportLines = [
      `## DeskPal 上游前端变更摘要`,
      ``,
      `- **上游仓库**：\`${syncCfg.upstreamRepo}\``,
      `- **版本变化**：\`${syncCfg.upstreamTag || oldWebCommit.slice(0, 8)}\` → \`${newTag || newWebCommit.slice(0, 8)}\``,
      `- **Web Commit**：\`${oldWebCommit.slice(0, 8)}\` → \`${newWebCommit.slice(0, 8)}\``,
      `- **合并结果**：自动合并 ${mergedFiles.length} 个文件，冲突 ${conflicts.length} 个文件`,
      ``,
      `### 上游提交记录`,
      ...(commits.length ? commits.map((c) => `- ${c}`) : ["- (无新增提交记录)"]),
      ``,
    ];

    if (mergedFiles.length) {
      reportLines.push(`### 已自动同步文件`, ...mergedFiles.map((f) => `- \`${f}\``), ``);
    }
    if (conflicts.length) {
      reportLines.push(`### 冲突文件（需适配）`, ...conflicts.map((f) => `- \`${f}\``), ``);
    }
    if (skippedNonSrc.length) {
      reportLines.push(
        `### 非 \`src/\` 变动（请留意依赖或构建配置）`,
        ...skippedNonSrc.map((f) => `- \`${f}\``),
        ``,
      );
    }

    const reportMd = reportLines.join("\n");
    fs.writeFileSync(path.join(outDir, "sync-report.md"), reportMd, "utf-8");

    const shortSha = newWebCommit.slice(0, 7);
    const branchName = `sync/upstream-${(newTag || shortSha).replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const result = {
      hasChanges: true,
      oldWebCommit,
      newWebCommit,
      newRepoCommit,
      newTag,
      compatibleVersion,
      branchName,
      commits,
      mergedFiles,
      conflicts,
      skippedNonSrc,
      packageJsonChanged,
    };
    fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(result, null, 2), "utf-8");

    setGitHubOutput({
      has_changes: "true",
      old_web_commit: oldWebCommit,
      new_web_commit: newWebCommit,
      new_tag: newTag || shortSha,
      compatible_version: compatibleVersion,
      branch_name: branchName,
      conflict_count: String(conflicts.length),
      merged_count: String(mergedFiles.length),
      conflicts_list: conflicts.join(", "),
      package_json_changed: String(packageJsonChanged),
    });

    console.log(reportMd);
  } finally {
    if (tempCloneDir) {
      fs.rmSync(tempCloneDir, { recursive: true, force: true });
    }
  }
}

main();
