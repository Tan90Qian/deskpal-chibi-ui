import fs from "node:fs";
import path from "node:path";

const sourceRoot =
  process.argv[2] ||
  process.env.CROSSPET_CHARACTERS_DIR ||
  path.resolve(import.meta.dirname, "../../crosspet/characters");
if (!fs.existsSync(sourceRoot)) {
  console.error(`CrossPet characters directory not found: ${sourceRoot}`);
  console.error("Usage: node scripts/sync-chibi-assets.mjs <path-to-crosspet/characters>");
  process.exit(1);
}
const outRoot = path.resolve(import.meta.dirname, "../public/chibi");
const generatedJsonPath = path.resolve(import.meta.dirname, "../src/chibi-pack.generated.json");

const roster = [
  { id: "gemini", label: "Gemini", tag: "星空猫猫", base: true },
  { id: "claude", label: "Claude", tag: "橙花书娘", base: true },
  { id: "deepseek", label: "DeepSeek", tag: "大肥鱼女仆", base: true },
  { id: "gpt", label: "GPT", tag: "御姐白龙", base: true },
  { id: "glm", label: "GLM", tag: "黑狐女仆", base: true },
  { id: "kimi", label: "Kimi", tag: "月光乐手", base: true },
  { id: "qwen", label: "Qwen", tag: "国风千金", base: true },
  { id: "grok", label: "Grok", tag: "哥特小恶魔", base: true },
  { id: "doubao", label: "豆包", tag: "生活小帮手", base: true },
  { id: "gemini-magician", label: "魔术师 Gemini", tag: "限定皮肤", base: false },
  { id: "claude-saint", label: "圣女 Claude", tag: "限定皮肤", base: false },
  { id: "deepseek-pajamas", label: "睡衣 DeepSeek", tag: "限定皮肤", base: false },
  { id: "deepseek-hoodie", label: "卫衣 DeepSeek", tag: "限定皮肤", base: false },
  { id: "gpt-onesie", label: "龙崽 GPT", tag: "限定皮肤", base: false },
];

const poolCandidates = {
  idle: [["idle.webp"], ["idle-2.webp"], ["idle-3.webp"], ["stretch.webp"]],
  work: [["writing.webp"], ["thinking.webp"], ["running.webp"]],
  browse: [["searching.webp"], ["reading.webp", "reading-2.webp"]],
  chat: [["listening.webp"], ["hum.webp"], ["happy.webp", "happy-2.webp"]],
  relax: [["happy.webp", "happy-2.webp"], ["proud.webp"], ["hum.webp"]],
  away: [["sleeping.webp", "sleeping-2.webp"], ["yawn.webp"]],
};

fs.mkdirSync(outRoot, { recursive: true });

const characters = [];
let copiedFiles = 0;
let totalBytes = 0;

function pickFirst(srcDir, list) {
  return list.find((f) => fs.existsSync(path.join(srcDir, f))) ?? null;
}

for (const item of roster) {
  const srcDir = path.join(sourceRoot, item.id);
  if (!fs.existsSync(srcDir)) {
    console.warn(`[skip] Missing character folder: ${srcDir}`);
    continue;
  }

  let accent = "#7b5cd6";
  const metaPath = path.join(srcDir, "character.json");
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      if (meta.accent) accent = meta.accent;
    } catch {
      // ignore
    }
  }

  const destDir = path.join(outRoot, item.id);
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });

  const copiedForChar = new Set();
  const copyFile = (file) => {
    if (!file) return null;
    if (!copiedForChar.has(file)) {
      const srcFile = path.join(srcDir, file);
      const destFile = path.join(destDir, file);
      fs.copyFileSync(srcFile, destFile);
      copiedForChar.add(file);
      copiedFiles += 1;
      totalBytes += fs.statSync(destFile).size;
    }
    return `chibi/${item.id}/${file}`;
  };

  const avatar = copyFile(pickFirst(srcDir, ["avatar.webp", "portrait.webp", "idle.webp"]));
  const mini = copyFile(pickFirst(srcDir, ["mini.webp"]));
  const blink = copyFile(pickFirst(srcDir, ["idle-blink.webp"]));

  const pools = {};
  for (const [stateKey, slotGroups] of Object.entries(poolCandidates)) {
    const resolved = [];
    for (const group of slotGroups) {
      const found = pickFirst(srcDir, group);
      if (found) {
        const rel = copyFile(found);
        if (rel && !resolved.includes(rel)) resolved.push(rel);
      }
    }
    if (resolved.length === 0) {
      const fallback = copyFile(pickFirst(srcDir, ["idle.webp"]));
      if (fallback) resolved.push(fallback);
    }
    pools[stateKey] = resolved;
  }

  characters.push({
    id: item.id,
    name: item.label,
    tag: item.tag,
    accent,
    base: item.base,
    avatar,
    mini,
    blink,
    pools,
  });
}

const pack = {
  schemaVersion: 2,
  name: "CrossPet Chibi AI Pack",
  license: "CC BY-NC-SA 4.0 (CrossPet & community creators — non-commercial)",
  miniFrames: [
    "idle", "happy", "sleep",
    "run-a", "run-b", "run-c",
    "wave", "read", "worried",
    "think-a", "think-b", "notes",
    "carry-a", "carry-b", "carry-c",
    "point", "gift",
    "move-a", "move-b", "move-c",
  ],
  characters,
};

const jsonText = JSON.stringify(pack, null, 2) + "\n";
fs.writeFileSync(path.join(outRoot, "pack.json"), jsonText, "utf-8");
fs.writeFileSync(generatedJsonPath, jsonText, "utf-8");

const srcLicense = path.join(sourceRoot, "LICENSE.md");
if (fs.existsSync(srcLicense)) {
  fs.copyFileSync(srcLicense, path.join(outRoot, "LICENSE.md"));
}

console.log(
  `Synced ${characters.length} characters (${copiedFiles} webp files, ${(totalBytes / 1024 / 1024).toFixed(2)} MB) -> ${outRoot}`,
);
