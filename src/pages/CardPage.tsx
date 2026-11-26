import { useEffect, useState } from "preact/hooks";
import type { Bridge, CardMessage } from "../bridge";
import { resolveCharacter, stateKeyForPresence, useChibiStore, useLivingPose } from "../chibi";
import { StatusBadge } from "../host";
import { setLocale, t } from "../i18n";
import { applyTheme } from "../theme";
import { Icon } from "../ui";

/** 置顶到桌面的单人 Q 版手游状态小卡片（280×84），支持原地眨眼与多姿态切换。 */
export function CardPage({ bridge }: { bridge: Bridge }) {
  useChibiStore();
  const [card, setCard] = useState<CardMessage | null>(null);

  useEffect(() => {
    bridge.on((m) => {
      if (m.type !== "card") return;
      applyTheme(m.theme);
      setLocale(m.locale);
      setCard(m);
    });
    bridge.notify({ type: "ready" });
  }, []);

  if (!card) return null;
  return <CardBody card={card} bridge={bridge} />;
}

function CardBody({ card, bridge }: { card: CardMessage; bridge: Bridge }) {
  const { member, detail } = card;
  const chibi = resolveCharacter({
    userKey: member.userId,
    name: member.name,
    app: member.view.app,
    detail: member.view.detail,
  });
  const stateKey = stateKeyForPresence(member.view);
  const poseUrl = useLivingPose(chibi, stateKey);

  return (
    <div
      class={member.online ? `pin-card game-pin-card tv-${member.view.tone}` : `pin-card game-pin-card offline tv-${member.view.tone}`}
      style={{ "--char-accent": chibi.accent } as Record<string, string>}
      aria-label={member.name}
    >
      <div class="pin-chibi-box">
        <img src={poseUrl} alt={member.name} />
      </div>
      <div class="row-main">
        <p class="row-title">
          <span class="row-name">{member.name}</span>
          {member.meta && <span class="row-meta">{member.meta}</span>}
        </p>
        <div>
          <StatusBadge view={member.view} />
        </div>
        {detail && <p class="pin-card-detail">{detail}</p>}
      </div>
      <button class="icon-button pin-card-close" aria-label={t("status.unpin")} title={t("status.unpin")} onClick={() => bridge.notify({ type: "window.close" })}>
        <Icon name="close" />
      </button>
    </div>
  );
}
