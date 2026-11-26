import { useEffect, useState } from "preact/hooks";
import type { PresenceView } from "./bridge";
import packData from "./chibi-pack.generated.json";

export type ChibiStateKey = "idle" | "work" | "browse" | "chat" | "relax" | "away";

export interface ChibiCharacter {
  id: string;
  name: string;
  tag: string;
  accent: string;
  base: boolean;
  avatar: string;
  mini: string | null;
  blink: string | null;
  pools: Record<ChibiStateKey, string[]>;
}

const STORAGE_ASSIGN = "deskpal.chibi.assignments.v1";
const STORAGE_AUTO_AI = "deskpal.chibi.autoMatchAi.v1";

export const MINI_FRAME_NAMES: string[] = packData.miniFrames;
export const MINI_FRAME_COUNT = MINI_FRAME_NAMES.length;
const MINI_INDEX = new Map(MINI_FRAME_NAMES.map((name, idx) => [name, idx]));

export const CHIBI_ROSTER: ChibiCharacter[] = packData.characters as ChibiCharacter[];
const BASE_CHARS = CHIBI_ROSTER.filter((c) => c.base);
const BY_ID = new Map(CHIBI_ROSTER.map((c) => [c.id, c]));

type AssignmentMap = Record<string, string>;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

function loadAssignments(): AssignmentMap {
  try {
    const raw = localStorage.getItem(STORAGE_ASSIGN);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as AssignmentMap) : {};
  } catch {
    return {};
  }
}

function loadAutoMatchAi(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_AUTO_AI);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

let assignmentsCache: AssignmentMap = loadAssignments();
let autoMatchAiCache: boolean = loadAutoMatchAi();

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_ASSIGN) {
      assignmentsCache = loadAssignments();
      notify();
    } else if (e.key === STORAGE_AUTO_AI) {
      autoMatchAiCache = loadAutoMatchAi();
      notify();
    }
  });
}

export function setAssignedCharacter(userKey: string, characterId: string | null) {
  const next = { ...assignmentsCache };
  if (characterId && BY_ID.has(characterId)) next[userKey] = characterId;
  else delete next[userKey];
  assignmentsCache = next;
  try {
    localStorage.setItem(STORAGE_ASSIGN, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
  notify();
}

export function setAutoMatchAi(enabled: boolean) {
  autoMatchAiCache = enabled;
  try {
    localStorage.setItem(STORAGE_AUTO_AI, enabled ? "1" : "0");
  } catch {
    // ignore storage errors
  }
  notify();
}

export function useChibiStore() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return {
    assignments: assignmentsCache,
    autoMatchAi: autoMatchAiCache,
    setAssigned: setAssignedCharacter,
    setAutoMatchAi,
  };
}

export function stableHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function detectAiCharacter(app: string | null | undefined, detail?: string | null): string | null {
  const hay = `${app ?? ""} ${detail ?? ""}`.toLowerCase();
  if (!hay.trim()) return null;
  if (hay.includes("antigravity") || hay.includes("gemini")) return "gemini";
  if (hay.includes("claude")) return "claude";
  if (hay.includes("deepseek")) return "deepseek";
  if (hay.includes("chatgpt") || hay.includes("codex") || hay.includes("openai")) return "gpt";
  if (hay.includes("kimi")) return "kimi";
  if (hay.includes("qwen") || hay.includes("千问")) return "qwen";
  if (hay.includes("grok")) return "grok";
  if (hay.includes("doubao") || hay.includes("豆包") || hay.includes("trae")) return "doubao";
  if (hay.includes("zcode") || hay.includes("glm") || hay.includes("智谱")) return "glm";
  return null;
}

export function resolveCharacter(options: {
  userKey: string;
  name: string;
  isMe?: boolean;
  app?: string | null;
  detail?: string | null;
}): ChibiCharacter {
  const manual = assignmentsCache[options.userKey];
  if (manual && BY_ID.has(manual)) return BY_ID.get(manual)!;

  if (options.isMe && autoMatchAiCache) {
    const matched = detectAiCharacter(options.app, options.detail);
    if (matched && BY_ID.has(matched)) return BY_ID.get(matched)!;
  }

  const byApp = detectAiCharacter(options.app);
  if (byApp && BY_ID.has(byApp)) return BY_ID.get(byApp)!;

  const idx = stableHash(options.userKey || options.name) % BASE_CHARS.length;
  return BASE_CHARS[idx];
}

export function stateKeyForPresence(view: PresenceView, paused = false): ChibiStateKey {
  if (paused) return "away";
  const head = (view.headline || "").toLowerCase();
  if (head.includes("锁屏") || head.includes("lock")) return "away";
  switch (view.tone) {
    case "work":
      return "work";
    case "browse":
      return "browse";
    case "chat":
      return "chat";
    case "relax":
    case "game":
      return "relax";
    case "away":
    case "offline":
      return "away";
    default:
      return "idle";
  }
}

export function shortBubbleText(view: PresenceView, paused = false): string {
  if (paused) return "暂停";
  const head = view.headline || "";
  if (head.includes("锁屏") || head.toLowerCase().includes("lock")) return "锁屏";
  if (view.tone === "away") return "Zzz";
  if (view.app) {
    const cleaned = view.app.replace(/^www\./i, "");
    if (/^antigravity$/i.test(cleaned)) return "AGY";
    return cleaned.length > 7 ? cleaned.slice(0, 6) + "…" : cleaned;
  }
  if (head.includes("浏览网页")) return "浏览中";
  if (head.includes("看视频")) return "看视频";
  if (head.includes("玩游戏")) return "游戏中";
  if (head.includes("聊天")) return "聊天中";
  if (head.includes("工作")) return "工作中";
  if (head.includes("其他")) return "活动中";
  return head.length > 4 ? head.slice(0, 4) : head;
}

/** Preload an image list so pose swaps and blinks never flash blank. */
function preloadImages(urls: (string | null | undefined)[]) {
  for (const url of urls) {
    if (!url) continue;
    const img = new Image();
    img.src = url;
  }
}

/**
 * Living protagonist pose hook:
 * - Zero spatial drift (100% crisp, no subpixel blur)
 * - Natural idle-blink.webp blink when showing idle.webp
 * - Smooth multi-pose cycling within the current state's pool every ~5.5s
 * - Temporary happy pose override when headpatted
 */
export function useLivingPose(char: ChibiCharacter, stateKey: ChibiStateKey, forceHappy = false): string {
  const pool = char.pools[stateKey]?.length ? char.pools[stateKey] : char.pools.idle;
  const happyUrl = char.pools.relax?.[0] ?? char.pools.chat?.[0] ?? char.pools.idle[0];
  const [poseIdx, setPoseIdx] = useState(0);
  const [blinking, setBlinking] = useState(false);

  // Reset to first pose when character or state changes, and preload pool + blink + happy
  useEffect(() => {
    setPoseIdx(0);
    setBlinking(false);
    preloadImages([...pool, char.blink, happyUrl]);
  }, [char.id, stateKey]);

  // Multi-pose rotation every 5.5 seconds when pool has > 1 pose
  useEffect(() => {
    if (pool.length <= 1) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setBlinking(false);
      setPoseIdx((prev) => (prev + 1) % pool.length);
    }, 5500);
    return () => window.clearInterval(timer);
  }, [char.id, stateKey, pool.length]);

  const activeUrl = forceHappy ? happyUrl : (pool[poseIdx % pool.length] ?? char.pools.idle[0]);
  const canBlink = Boolean(!forceHappy && char.blink && activeUrl.endsWith("/idle.webp"));

  // Natural eye blink every ~4.2s when on idle.webp
  useEffect(() => {
    if (!canBlink) {
      setBlinking(false);
      return;
    }
    let blinkTimeout: number | undefined;
    let closeTimeout: number | undefined;
    let alive = true;

    const schedule = () => {
      const wait = 3400 + Math.floor(Math.random() * 2200);
      blinkTimeout = window.setTimeout(() => {
        if (!alive) return;
        if (!document.hidden) {
          setBlinking(true);
          closeTimeout = window.setTimeout(() => {
            if (!alive) return;
            setBlinking(false);
            schedule();
          }, 150);
        } else {
          schedule();
        }
      }, wait);
    };

    schedule();
    return () => {
      alive = false;
      if (blinkTimeout !== undefined) window.clearTimeout(blinkTimeout);
      if (closeTimeout !== undefined) window.clearTimeout(closeTimeout);
    };
  }, [canBlink, char.id]);

  return blinking && char.blink ? char.blink : activeUrl;
}

interface MiniAnimSpec {
  frames: number[];
  intervalMs: number;
}

function toFrames(names: string[]): number[] {
  return names.map((n) => MINI_INDEX.get(n) ?? 0);
}

const MINI_ANIM_VARIANTS: Record<ChibiStateKey, MiniAnimSpec[]> = {
  work: [
    { frames: toFrames(["think-a", "think-b", "notes", "think-a"]), intervalMs: 780 },
    { frames: toFrames(["carry-a", "carry-b", "carry-c", "notes"]), intervalMs: 520 },
  ],
  browse: [
    { frames: toFrames(["read", "read", "point", "think-a"]), intervalMs: 880 },
    { frames: toFrames(["read", "notes", "read", "think-b"]), intervalMs: 840 },
  ],
  chat: [
    { frames: toFrames(["wave", "happy", "wave", "idle"]), intervalMs: 740 },
  ],
  relax: [
    { frames: toFrames(["happy", "run-a", "run-b", "run-c"]), intervalMs: 480 },
    { frames: toFrames(["happy", "gift", "happy", "wave"]), intervalMs: 740 },
  ],
  away: [
    { frames: toFrames(["sleep"]), intervalMs: 2400 },
  ],
  idle: [
    { frames: toFrames(["idle", "idle", "wave", "idle"]), intervalMs: 1100 },
    { frames: toFrames(["idle", "move-a", "move-b", "move-c"]), intervalMs: 620 },
  ],
};

/** Discrete frame stepper for mini.webp 20-frame sprite sheet (zero subpixel blur). */
export function useMiniFrame(stateKey: ChibiStateKey, seed: string): number {
  const variants = MINI_ANIM_VARIANTS[stateKey] ?? MINI_ANIM_VARIANTS.idle;
  const h = stableHash(seed);
  const spec = variants[h % variants.length];
  const [step, setStep] = useState(() => h % spec.frames.length);

  useEffect(() => {
    setStep(h % spec.frames.length);
    if (spec.frames.length <= 1) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setStep((s) => (s + 1) % spec.frames.length);
    }, spec.intervalMs);
    return () => window.clearInterval(timer);
  }, [stateKey, seed, spec.intervalMs, spec.frames.length]);

  return spec.frames[step % spec.frames.length] ?? 0;
}
