import { useEffect, useState } from "preact/hooks";
import type { MemberItem, PanelState, PresenceView, UnclassifiedItem } from "../bridge";
import { resolveCharacter, useChibiStore } from "../chibi";
import { ChibiPicker, type PickerTarget } from "../components/ChibiPicker";
import { HomeStage, getMemberChibi } from "../components/HomeStage";
import { PresenceDetail, StatusBadge, useCountdown, useHost } from "../host";
import { t } from "../i18n";
import { isLinux } from "../platform";
import { Avatar, Hint, HoverTip, Icon, Section, Switch } from "../ui";

export function StatusPage({ state, onViewStats }: { state: PanelState; onViewStats: (member: { userId: string; name: string }) => void }) {
  useChibiStore();
  const { ask, run, toast } = useHost();
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const room = state.rooms.find((r) => r.id === state.selectedRoomId);
  const { correction } = state;

  const correct = async () => {
    if (!correction.target) {
      toast(t("status.noTarget"), true);
      return;
    }
    const a = await ask({
      title: t("status.correct"),
      message: t("status.correctMessage", { name: correction.target }),
      select: { options: correction.options, initial: correction.current },
      ...(correction.title && {
        checkbox: { label: t("status.titleOnly"), initial: correction.keyword !== null, reveals: true },
        input: { initial: correction.keyword ?? correction.title, placeholder: t("status.titleKeyword"), maxLength: 150, required: true },
      }),
      okText: t("common.save"),
    });
    if (a.ok) await run({ type: "presence.correct", category: a.selected, keyword: a.checked && correction.title ? a.text : null }, t("status.correctSaved"));
  };

  const reset = async () => {
    const a = await ask({ title: t("status.resetTitle"), message: t("rule.removeMessage", { name: correction.target ?? "" }), okText: t("status.reset") });
    if (a.ok) await run({ type: "presence.resetCorrection" }, t("status.resetDone"));
  };

  return (
    <>
      <HomeStage
        state={state}
        onPickCharacter={setPickerTarget}
        onCorrect={() => void correct()}
        onResetCorrection={() => void reset()}
      />

      {/* Light mode keeps protagonist status strip right beneath the Cafe Diorama; Dark mode embeds it in the Starry Lobby */}
      <div class="light-only-me">
        <MyStatus
          state={state}
          onPickMe={() =>
            setPickerTarget({
              userKey: state.me.userId || "me",
              name: state.me.displayName,
              isMe: true,
              app: state.me.view.app,
              detail: state.me.full,
            })
          }
          onCorrect={() => void correct()}
          onReset={() => void reset()}
        />
      </div>

      <Section
        title={
          <span class="roster-head-title">
            <span class="roster-bar" aria-hidden="true" />
            <span>{t("status.members")}</span>
            {room && <span class="roster-count">{state.members.length}</span>}
            {room && state.members.length > 1 && <Hint text={t("status.dragToSortOffline")} />}
          </span>
        }
        aside={room && state.members.length > 0 ? <span class="roster-tip">点头像换角色 · 拖动排序</span> : undefined}
        label={t("status.members")}
      >
        {state.emptyHint && (
          <p class="infobar">
            <Icon name="info" />
            {state.emptyHint}
          </p>
        )}
        {room && state.members.length > 0 && (
          <MemberList
            roomId={room.id}
            members={state.members}
            onViewStats={onViewStats}
            onPickMember={(m) =>
              setPickerTarget({
                userKey: m.userId,
                name: m.name,
                app: m.view.app,
                detail: m.view.detail,
              })
            }
          />
        )}
      </Section>

      {state.unclassified.length > 0 && <Unclassified state={state} />}

      {pickerTarget && <ChibiPicker target={pickerTarget} onClose={() => setPickerTarget(null)} />}
    </>
  );
}

function MemberList({
  roomId,
  members,
  onViewStats,
  onPickMember,
}: {
  roomId: string;
  members: MemberItem[];
  onViewStats: (member: { userId: string; name: string }) => void;
  onPickMember: (member: MemberItem) => void;
}) {
  const { run } = useHost();
  const [drag, setDrag] = useState<{ id: string; order: string[] } | null>(null);
  const [saved, setSaved] = useState<string[] | null>(null);
  const hostOrder = members.map((m) => m.userId);
  const hostKey = hostOrder.join();
  useEffect(() => setSaved(null), [hostKey]);

  const base = saved ? [...saved.filter((id) => hostOrder.includes(id)), ...hostOrder.filter((id) => !saved.includes(id))] : hostOrder;
  const order = drag?.order ?? base;
  const byId = new Map(members.map((m) => [m.userId, m]));
  const canDrag = members.length > 1;

  const over = (e: DragEvent, targetId: string) => {
    if (!drag) return;
    e.preventDefault();
    if (targetId === drag.id || byId.get(targetId)!.trailing !== byId.get(drag.id)!.trailing) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const rest = drag.order.filter((id) => id !== drag.id);
    rest.splice(rest.indexOf(targetId) + (e.clientY > rect.top + rect.height / 2 ? 1 : 0), 0, drag.id);
    if (rest.join() !== drag.order.join()) setDrag({ ...drag, order: rest });
  };
  const end = async () => {
    if (!drag) return;
    const next = drag.order;
    setDrag(null);
    if (next.join() === base.join()) return;
    setSaved(next);
    const result = await run({ type: "member.reorder", roomId, userIds: next });
    if (!result.ok) setSaved(null);
  };

  return (
    <ul class={drag ? "list member-roster dragging" : "list member-roster"} onDragOver={(e) => drag && e.preventDefault()} onDrop={(e) => e.preventDefault()}>
      {order.map((id) => {
        const m = byId.get(id)!;
        return (
          <MemberRow
            key={id}
            member={m}
            onViewStats={() => onViewStats({ userId: m.userId, name: m.name })}
            onPick={() => onPickMember(m)}
            drag={
              canDrag
                ? {
                    draggable: true,
                    onDragStart: (e: DragEvent) => {
                      e.dataTransfer?.setData("text/plain", m.name);
                      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
                      setDrag({ id, order: base });
                    },
                    onDragOver: (e: DragEvent) => over(e, id),
                    onDragEnd: () => void end(),
                  }
                : {}
            }
            dragging={drag?.id === id}
          />
        );
      })}
    </ul>
  );
}

type DragProps = {
  draggable?: boolean;
  onDragStart?: (e: DragEvent) => void;
  onDragOver?: (e: DragEvent) => void;
  onDragEnd?: () => void;
};

function MemberRow({
  member,
  onViewStats,
  onPick,
  drag,
  dragging,
}: {
  member: MemberItem;
  onViewStats: () => void;
  onPick: () => void;
  drag: DragProps;
  dragging: boolean;
}) {
  const { run } = useHost();
  const dragClass = dragging ? " dragging" : "";
  const chibi = getMemberChibi(member);

  if (member.blocked) {
    return (
      <li class={`list-row member offline${dragClass}`} aria-label={member.name} {...drag}>
        <Avatar name={member.name} tone={member.view.tone} />
        <div class="row-main">
          <div class="member-line">
            <p class="row-title">
              <span class="row-name">{member.name}</span>
            </p>
          </div>
          <div class="member-line">
            <StatusBadge view={member.view} />
          </div>
          <p class="member-detail" />
        </div>
      </li>
    );
  }
  const label = member.pinned ? t("status.unpinName", { name: member.name }) : t("status.pinName", { name: member.name });
  return (
    <li
      class={`list-row member game-member tv-${member.view.tone}${member.online ? "" : " offline"}${dragClass}`}
      style={{ "--char-accent": chibi.accent } as Record<string, string>}
      aria-label={member.name}
      {...drag}
    >
      <Avatar
        name={member.name}
        tone={member.view.tone}
        client={member.client}
        chibiSrc={chibi.avatar}
        accent={chibi.accent}
        title={`点击为 ${member.name} 更换 Q 版角色（当前：${chibi.name}）`}
        onClick={onPick}
      />
      <div class="row-main">
        <div class="member-line">
          <p class="row-title">
            <span class="row-name">{member.name}</span>
            {member.isOwner && (
              <span class="badge owner-crown">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M3 18h18l-2-10-4.5 4L12 5l-2.5 7L5 8z" />
                </svg>
                {t("common.owner")}
              </span>
            )}
          </p>
          <div class="member-actions">
            {member.shareStats && (
              <button class="icon-button pin-button" title={t("status.viewStats")} aria-label={t("status.viewStatsOf", { name: member.name })} onClick={onViewStats}>
                <Icon name="chart" />
              </button>
            )}
            {!isLinux() && (
              <button
                class={member.pinned ? "icon-button pin-button active" : "icon-button pin-button"}
                title={member.pinned ? t("status.unpin") : t("status.pin")}
                aria-label={label}
                aria-pressed={member.pinned}
                onClick={() => run({ type: member.pinned ? "member.unpin" : "member.pin", userId: member.userId })}
              >
                <Icon name={member.pinned ? "pinned" : "pin"} />
              </button>
            )}
          </div>
        </div>
        <div class="member-line">
          <StatusBadge view={member.view} />
          {member.meta && <span class="member-meta">{member.meta}</span>}
        </div>
        <MemberDetail view={member.view} />
      </div>
    </li>
  );
}

function MemberDetail({ view }: { view: PresenceView }) {
  if (!view.app && !view.detail) return <p class="member-detail" />;
  const showDetail = view.detail && view.detail.trim() !== view.app?.trim();
  return (
    <p class="member-detail" title={[view.app, view.detail].filter(Boolean).join("\n")}>
      {view.app && <span class="member-detail-app">{view.app}</span>}
      {view.app && showDetail && <span class="member-detail-sep"> · </span>}
      {showDetail && view.detail}
    </p>
  );
}

function MyStatus({
  state,
  onPickMe,
  onCorrect,
  onReset,
}: {
  state: PanelState;
  onPickMe: () => void;
  onCorrect: () => void;
  onReset: () => void;
}) {
  const { run } = useHost();
  const { me, correction } = state;
  const meChar = resolveCharacter({
    userKey: me.userId || "me",
    name: me.displayName,
    isMe: true,
    app: me.view.app,
    detail: me.full,
  });

  return (
    <Section label={t("status.mine")}>
      <div class={`card me game-me tv-${me.view.tone}`} style={{ "--char-accent": meChar.accent } as Record<string, string>}>
        <div class="me-head">
          <Avatar
            name={me.displayName}
            tone={me.view.tone}
            client={me.client}
            chibiSrc={meChar.avatar}
            accent={meChar.accent}
            title={`点击更换我的角色（当前：${meChar.name}）`}
            onClick={onPickMe}
          />
          <div class="row-main">
            <div class="row-title">
              <span class="row-name">{me.displayName}</span>
              {me.pending ? <Pending pending={me.pending} source={me.source} /> : me.meta && <span class="row-meta">{me.meta}</span>}
            </div>
            <div class="me-second-row">
              <HoverTip text={[me.full, !me.pending && me.source].filter(Boolean).join("\n\n") || null} class="me-presence">
                <p class={`me-headline tv-${me.view.tone}`}>
                  <span class="status-dot" aria-hidden="true" />
                  <span>{me.view.headline}</span>
                </p>
                <PresenceDetail view={me.view} tip={false} />
              </HoverTip>
              <div class="me-inline-actions">
                {!me.paused && (
                  <button class="icon-button me-mini-btn" title={t("status.correct")} aria-label={t("status.correct")} onClick={onCorrect}>
                    <Icon name="tag" />
                  </button>
                )}
                {!me.paused && correction.personal && (
                  <button class="icon-button me-mini-btn" title={t("status.reset")} aria-label={t("status.reset")} onClick={onReset}>
                    <Icon name="undo" />
                  </button>
                )}
                <label class="inline-switch me-pause-chip" title={t("status.pause")}>
                  <span>暂停</span>
                  <Switch checked={me.paused} label={t("status.pause")} onChange={(v) => run({ type: "presence.pause", paused: v })} />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function Pending({ pending, source }: { pending: NonNullable<PanelState["me"]["pending"]>; source: string | null }) {
  const left = useCountdown(pending.remainingMs);
  const seconds = Math.ceil(left / 1000);
  const progress = Math.min(1, Math.max(0, 1 - left / (pending.totalSeconds * 1000)));
  const why = [source, t("pending.why", { seconds: pending.totalSeconds })].filter(Boolean).join("\n");
  return (
    <HoverTip text={pending.full ? `${pending.full}\n\n${why}` : why} class={`pending tv-${pending.view.tone}`}>
      <span class="pending-text" role="status" aria-label={seconds > 0 ? t("pending.label", { seconds, state: pending.view.headline }) : t("pending.labelSoon", { state: pending.view.headline })}>
        <Icon name="timer" class="pending-icon" />
        {seconds > 0 ? (
          <>
            <b>{seconds}</b>
            {t("pending.unit")}
            <span class="pending-verb">{t("pending.verb")}</span>
          </>
        ) : (
          <>
            {t("pending.soon")}
            <span class="pending-verb">{t("pending.soonVerb")}</span>
          </>
        )}
        <Icon name="forward" class="pending-arrow" />
        <span class="status-dot" aria-hidden="true" />
        <span class="pending-state">{pending.view.headline}</span>
      </span>
      <span class="progress" aria-hidden="true">
        <span style={{ width: `${Math.max(8, progress * 100)}%` }} />
      </span>
    </HoverTip>
  );
}

function Unclassified({ state }: { state: PanelState }) {
  const { ask, run } = useHost();
  const classify = async (item: UnclassifiedItem) => {
    const a = await ask({
      title: t("rule.ask", { name: item.name }),
      message: t("unclassified.message"),
      select: { options: state.correction.options, initial: "Work" },
      okText: t("common.save"),
    });
    if (a.ok) await run({ type: "rules.set", kind: item.kind, pattern: item.pattern, name: item.name, category: a.selected }, t("common.saved"));
  };

  return (
    <Section
      title={
        <>
          {t("unclassified.title")}
          <Hint text={t("unclassified.note")} />
        </>
      }
      label={t("unclassified.title")}
    >
      <ul class="list">
        {state.unclassified.map((item) => (
          <li key={item.pattern} class="list-row compact">
            <div class="row-main">
              <p class="row-title">
                <span class="row-name" title={item.name}>
                  {item.name}
                </span>
              </p>
              <p class="sub">{item.today}</p>
            </div>
            <button onClick={() => classify(item)}>{t("unclassified.classify")}</button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
