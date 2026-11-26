import { useEffect, useRef, useState } from "preact/hooks";
import type { MemberItem, PanelState } from "../bridge";
import { resolveCharacter, shortBubbleText, stateKeyForPresence, useChibiStore, useLivingPose } from "../chibi";
import { useCountdown, useHost } from "../host";
import { t } from "../i18n";
import { HoverTip, Icon, Switch } from "../ui";
import type { PickerTarget } from "./ChibiPicker";
import { LivingChibi } from "./LivingChibi";
import { MiniSprite } from "./MiniSprite";

interface HomeStageProps {
  state: PanelState;
  onPickCharacter: (target: PickerTarget) => void;
  onCorrect: () => void;
  onResetCorrection: () => void;
}

const CAFE_SLOTS: { left: string; bottom: string; front?: boolean }[] = [
  { left: "10%", bottom: "16px" },
  { left: "25%", bottom: "22px" },
  { left: "63%", bottom: "22px" },
  { left: "77%", bottom: "11px", front: true },
  { left: "90%", bottom: "19px" },
];

const TONE_DOT_COLORS: Record<string, string> = {
  work: "#5698FF",
  browse: "#A285FF",
  chat: "#4DF0A9",
  relax: "#FFA64D",
  game: "#FF7AB8",
  away: "#FFC456",
  other: "#6FD889",
  offline: "#7E87A2",
};

export function HomeStage({ state, onPickCharacter, onCorrect, onResetCorrection }: HomeStageProps) {
  useChibiStore();
  const { run } = useHost();
  const [patCount, setPatCount] = useState(0);
  const [patting, setPatting] = useState(false);
  const patTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    if (patTimer.current !== undefined) window.clearTimeout(patTimer.current);
  }, []);

  const triggerPat = () => {
    setPatCount((c) => c + 1);
    setPatting(true);
    if (patTimer.current !== undefined) window.clearTimeout(patTimer.current);
    patTimer.current = window.setTimeout(() => setPatting(false), 2200);
  };

  const { me, correction } = state;
  const room = state.rooms.find((r) => r.id === state.selectedRoomId);
  const onlineFriends = room ? state.members.filter((m) => m.online && !m.blocked).slice(0, 5) : [];

  const meTarget: PickerTarget = {
    userKey: me.userId || "me",
    name: me.displayName,
    isMe: true,
    app: me.view.app,
    detail: me.full,
  };
  const meChar = resolveCharacter(meTarget);
  const meStateKey = stateKeyForPresence(me.view, me.paused);
  const mePoseUrl = useLivingPose(meChar, meStateKey, patting);
  const meBubble = patting ? "嘿嘿~" : shortBubbleText(me.view, me.paused);

  const friendActors = onlineFriends.map((m) => {
    const target: PickerTarget = {
      userKey: m.userId,
      name: m.name,
      app: m.view.app,
      detail: m.view.detail,
    };
    const char = resolveCharacter(target);
    const stateKey = stateKeyForPresence(m.view);
    return { member: m, target, char, stateKey };
  });

  const totalOnStage = 1 + friendActors.length;

  return (
    <>
      {/* LIGHT THEME: Cozy Cafe Study Room Diorama */}
      <section class="cafe-stage" aria-label="云吸猫自习室">
        <svg class="cafe-stage-bg" viewBox="0 0 396 170" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="cafeWallGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#FFF5DF" />
              <stop offset="100%" stop-color="#FBE9C8" />
            </linearGradient>
            <linearGradient id="cafeSkyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#AEE1FF" />
              <stop offset="100%" stop-color="#E7F6FF" />
            </linearGradient>
            <linearGradient id="cafeFloorGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#E6BF8D" />
              <stop offset="100%" stop-color="#D5A66E" />
            </linearGradient>
            <clipPath id="cafeWindowClip">
              <path d="M0,36 A66,36 0 0,1 132,36 L132,74 L0,74 Z" />
            </clipPath>
          </defs>
          <rect width="396" height="114" fill="url(#cafeWallGrad)" />
          <rect y="78" width="396" height="36" fill="#F4DFBA" />
          <line x1="0" y1="78" x2="396" y2="78" stroke="#D8B685" stroke-width="2" />
          <g transform="translate(132, 14)">
            <path d="M0,36 A66,36 0 0,1 132,36 L132,74 L0,74 Z" fill="url(#cafeSkyGrad)" />
            {/* Smooth 60fps drifting sky clouds clipped inside arched window */}
            <g clip-path="url(#cafeWindowClip)">
              <g class="cafe-clouds-drift">
                <circle cx="24" cy="34" r="11" fill="#FFFFFF" opacity="0.92" />
                <circle cx="38" cy="32" r="14" fill="#FFFFFF" opacity="0.92" />
                <circle cx="52" cy="36" r="10" fill="#FFFFFF" opacity="0.92" />
                <circle cx="98" cy="44" r="9" fill="#FFFFFF" opacity="0.88" />
                <circle cx="109" cy="43" r="11" fill="#FFFFFF" opacity="0.88" />
                <circle cx="156" cy="34" r="11" fill="#FFFFFF" opacity="0.92" />
                <circle cx="170" cy="32" r="14" fill="#FFFFFF" opacity="0.92" />
                <circle cx="184" cy="36" r="10" fill="#FFFFFF" opacity="0.92" />
              </g>
            </g>
            <path d="M0,36 A66,36 0 0,1 132,36 L132,74 L0,74 Z" fill="none" stroke="#9C7148" stroke-width="3" />
            <line x1="66" y1="0" x2="66" y2="74" stroke="#9C7148" stroke-width="2.5" />
            <line x1="0" y1="42" x2="132" y2="42" stroke="#9C7148" stroke-width="2.5" />
            <polygon points="10,74 52,74 26,156 -14,156" fill="#FFF7D4" opacity="0.28" />
            <polygon points="74,74 118,74 94,156 52,156" fill="#FFF7D4" opacity="0.24" />
          </g>
          <g transform="translate(14, 34)">
            <rect width="74" height="72" rx="6" fill="#C99662" stroke="#6B4A31" stroke-width="2" />
            <rect x="6" y="8" width="62" height="17" rx="2" fill="#9E6E42" />
            <rect x="6" y="30" width="62" height="17" rx="2" fill="#9E6E42" />
            <rect x="6" y="52" width="62" height="14" rx="2" fill="#9E6E42" />
            <rect x="10" y="10" width="7" height="15" rx="1" fill="#FF8E8E" />
            <rect x="18" y="12" width="6" height="13" rx="1" fill="#7AC7FF" />
            <rect x="25" y="9" width="8" height="16" rx="1" fill="#FFD166" />
            <rect x="46" y="11" width="7" height="14" rx="1" fill="#9BE0B0" />
            <rect x="54" y="10" width="8" height="15" rx="1" fill="#C2A3FF" />
            <rect x="12" y="32" width="8" height="15" rx="1" fill="#FFB36B" />
            <rect x="21" y="34" width="7" height="13" rx="1" fill="#8CD7C6" />
            <rect x="30" y="31" width="7" height="16" rx="1" fill="#F79AC0" />
          </g>
          <g transform="translate(306, 36)">
            <rect width="68" height="38" rx="5" fill="#FFFDF8" stroke="#6B4A31" stroke-width="2" />
            <circle cx="22" cy="19" r="9" fill="#FFE0A3" />
            <text x="48" y="22" font-size="8.5" font-weight="800" fill="#826754" text-anchor="middle">CAFE</text>
            <rect x="48" y="58" width="20" height="16" rx="3" fill="#E38B59" stroke="#6B4A31" stroke-width="1.8" />
            <circle cx="58" cy="51" r="9" fill="#6BC489" stroke="#4D3729" stroke-width="1.5" />
            <circle cx="51" cy="54" r="6" fill="#53B074" stroke="#4D3729" stroke-width="1.5" />
            <circle cx="65" cy="54" r="6" fill="#7BD699" stroke="#4D3729" stroke-width="1.5" />
          </g>
          <rect y="112" width="396" height="58" fill="url(#cafeFloorGrad)" />
          <line x1="0" y1="112" x2="396" y2="112" stroke="#6B4A31" stroke-width="2.2" />
          <line x1="0" y1="132" x2="396" y2="132" stroke="#C4915A" stroke-width="1.2" opacity="0.6" />
          <line x1="0" y1="152" x2="396" y2="152" stroke="#C4915A" stroke-width="1.2" opacity="0.6" />
          <ellipse cx="198" cy="140" rx="154" ry="22" fill="#FFF1DC" stroke="#E0B687" stroke-width="2.5" />
          <ellipse cx="198" cy="140" rx="142" ry="16" fill="none" stroke="#F4C4A8" stroke-width="1.8" stroke-dasharray="6 5" />
        </svg>

        <div class="cafe-top-bar">
          <span class="cafe-badge">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#B5651D" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>
            {room ? `${room.name} · ${totalOnStage}人同屏` : "单人自习室"}
          </span>
          <button type="button" class="cafe-pick-btn" onClick={() => onPickCharacter(meTarget)}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>
            换角色
          </button>
        </div>

        {/* Friends on Cafe Stage — crisp integer-aligned 20-frame mini.webp animations */}
        {friendActors.map(({ member, target, char, stateKey }, idx) => {
          const slot = CAFE_SLOTS[idx];
          if (!slot) return null;
          return (
            <button
              key={member.userId}
              type="button"
              class={`cafe-actor${slot.front ? " front" : ""}`}
              style={{ left: slot.left, bottom: slot.bottom }}
              title={`${member.name} · ${member.view.headline}（点击换角色）`}
              onClick={() => onPickCharacter(target)}
            >
              <span class={`cafe-bubble tv-${member.view.tone}`}>
                <span class="b-dot" />
                {shortBubbleText(member.view)}
              </span>
              <MiniSprite char={char} stateKey={stateKey} seed={member.userId} cellWidth={58} alt={member.name} />
              <span class="cafe-shadow" />
              <span class="cafe-tag">{member.name}</span>
            </button>
          );
        })}

        {/* Protagonist Center-Front — cross-fade living chibi + headpat squish + 60fps SVG particles */}
        <button
          type="button"
          class="cafe-actor hero front"
          style={{ left: "44%", bottom: "10px" }}
          title={`${me.displayName} · ${meChar.name}（点击摸摸头）`}
          onClick={triggerPat}
        >
          <span class={`cafe-bubble tv-${patting ? "relax" : me.view.tone}`}>
            <span class="b-dot" />
            {meBubble}
          </span>
          <LivingChibi src={mePoseUrl} alt={me.displayName} stateKey={meStateKey} className="cafe-hero-living" patCount={patCount} />
          <span class="cafe-shadow" />
          <span class="cafe-tag">我 · {me.displayName}</span>
        </button>
      </section>

      {/* DARK THEME: Starry Anime Gacha Lobby + Integrated Protagonist HUD + Mini Sprite Bench */}
      <section class="star-lobby" aria-label="星夜自习大厅">
        <div class="star-slash" aria-hidden="true" />
        <span class="star-spark twinkle-a" style={{ top: "14px", left: "110px" }} aria-hidden="true">✦</span>
        <span class="star-spark cyan twinkle-b" style={{ top: "36px", right: "18px" }} aria-hidden="true">✦</span>
        <span class="star-spark small twinkle-c" style={{ top: "84px", left: "18px" }} aria-hidden="true">★</span>

        <div class="star-upper">
          <div class="star-char-col">
            <span class="star-ring" aria-hidden="true" />
            <button
              type="button"
              class="star-skin-chip"
              title={`当前角色：${meChar.name}（点击换装）`}
              onClick={() => onPickCharacter(meTarget)}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>
              {meChar.name}
            </button>
            <button
              type="button"
              class="star-pat-btn"
              title={`${meChar.name}（点击摸摸头）`}
              onClick={triggerPat}
            >
              <LivingChibi src={mePoseUrl} alt={meChar.name} stateKey={meStateKey} className="star-hero-living" patCount={patCount} />
            </button>
          </div>

          <div class="star-hud-col">
            <div class="star-kicker">
              <span>MY STATUS · {room ? "在线同步" : "单人模式"}</span>
              <span class={state.connection.connected ? "star-conn ok" : "star-conn"}>
                ● {state.connection.text}
              </span>
            </div>

            <div class="star-name-row">
              <span class="star-name">{me.displayName}</span>
              {me.client && <span class="star-os">{me.client.toUpperCase().slice(0, 3)}</span>}
            </div>

            <HoverTip text={[me.full, !me.pending && me.source].filter(Boolean).join("\n\n") || null} class="star-status-line">
              <span class={`star-slant tv-${me.view.tone}`}>
                <span>
                  <span class="status-dot" />
                  {me.view.headline}
                </span>
              </span>
              {(me.view.app || me.view.detail) && (
                <span class="star-app">{me.view.app ?? me.view.detail}</span>
              )}
            </HoverTip>

            {me.pending ? (
              <StarPendingBar pending={me.pending} source={me.source} />
            ) : (
              <div class="star-meta-bar">
                <span>{me.meta || "状态稳定"}</span>
                {room && <span class="star-room-mini">{room.name}</span>}
              </div>
            )}

            <div class="star-hud-btns">
              {!me.paused && (
                <button type="button" class="star-btn" onClick={onCorrect}>
                  <Icon name="tag" />
                  <span>{t("status.correct")}</span>
                </button>
              )}
              {!me.paused && correction.personal && (
                <button type="button" class="star-btn icon-only" title={t("status.reset")} aria-label={t("status.reset")} onClick={onResetCorrection}>
                  <Icon name="undo" />
                </button>
              )}
              <label class="star-pause">
                <span>{t("status.pause")}</span>
                <Switch checked={me.paused} label={t("status.pause")} onChange={(v) => run({ type: "presence.pause", paused: v })} />
              </label>
            </div>
          </div>
        </div>

        {/* Bottom Starry Room Chibi Bench — real 20-frame mini.webp sprite animations */}
        {friendActors.length > 0 && (
          <div class="star-bench">
            {friendActors.map(({ member, target, char, stateKey }) => (
              <button
                key={member.userId}
                type="button"
                class="star-bench-unit"
                title={`${member.name} · ${member.view.headline}（点击换装）`}
                onClick={() => onPickCharacter(target)}
              >
                <MiniSprite char={char} stateKey={stateKey} seed={member.userId} cellWidth={40} alt={member.name} />
                <span class="star-bench-label">
                  <span class="star-bench-dot" style={{ background: TONE_DOT_COLORS[member.view.tone] ?? "#A285FF" }} />
                  {member.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function StarPendingBar({ pending, source }: { pending: NonNullable<PanelState["me"]["pending"]>; source: string | null }) {
  const left = useCountdown(pending.remainingMs);
  const seconds = Math.ceil(left / 1000);
  const progress = Math.min(1, Math.max(0, 1 - left / (pending.totalSeconds * 1000)));
  const why = [source, t("pending.why", { seconds: pending.totalSeconds })].filter(Boolean).join("\n");

  return (
    <HoverTip text={pending.full ? `${pending.full}\n\n${why}` : why} class="star-energy-box">
      <div class="star-energy-meta">
        <span>状态切换倒计时</span>
        <b>{seconds > 0 ? `${seconds}s` : "即将"} → {pending.view.headline}</b>
      </div>
      <div class="star-energy-track">
        <div class="star-energy-fill" style={{ width: `${Math.max(8, progress * 100)}%` }} />
      </div>
    </HoverTip>
  );
}

export function getMemberChibi(member: MemberItem) {
  return resolveCharacter({
    userKey: member.userId,
    name: member.name,
    app: member.view.app,
    detail: member.view.detail,
  });
}
