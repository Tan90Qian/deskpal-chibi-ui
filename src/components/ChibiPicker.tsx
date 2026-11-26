import { CHIBI_ROSTER, resolveCharacter, useChibiStore } from "../chibi";
import { Icon, Switch } from "../ui";

export interface PickerTarget {
  userKey: string;
  name: string;
  isMe?: boolean;
  app?: string | null;
  detail?: string | null;
}

export function ChibiPicker({ target, onClose }: { target: PickerTarget; onClose: () => void }) {
  const { assignments, autoMatchAi, setAssigned, setAutoMatchAi } = useChibiStore();
  const active = resolveCharacter(target);
  const manualId = assignments[target.userKey] ?? null;

  const baseList = CHIBI_ROSTER.filter((c) => c.base);
  const skinList = CHIBI_ROSTER.filter((c) => !c.base);

  const pick = (id: string) => {
    setAssigned(target.userKey, id);
    onClose();
  };

  return (
    <div class="dialog-backdrop chibi-picker-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="dialog chibi-picker-modal" role="dialog" aria-modal="true" aria-label={`为 ${target.name} 选择 Q 版角色`}>
        <div class="picker-head">
          <div class="picker-title-group">
            <h3>为 {target.name} 换装</h3>
            <span class="picker-sub">当前：{active.name}{manualId ? "（已指定）" : "（自动分配）"}</span>
          </div>
          <button type="button" class="icon-button picker-close" aria-label="关闭" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        {target.isMe && (
          <div class="picker-auto-row">
            <div class="picker-auto-text">
              <strong>自动跟随当前 AI 工具变身</strong>
              <span>使用 Antigravity / Claude / DeepSeek 等时自动换对应角色</span>
            </div>
            <Switch checked={autoMatchAi} label="自动跟随当前 AI 工具变身" onChange={setAutoMatchAi} />
          </div>
        )}

        <div class="picker-scroll">
          <p class="picker-group-label">基础 AI 娘（9）</p>
          <div class="picker-grid">
            {baseList.map((c) => {
              const selected = active.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  class={selected ? "picker-card selected" : "picker-card"}
                  style={{ "--char-accent": c.accent } as Record<string, string>}
                  onClick={() => pick(c.id)}
                >
                  <span class="picker-thumb">
                    <img src={c.avatar} alt={c.name} />
                  </span>
                  <span class="picker-name">{c.name}</span>
                  <span class="picker-tag">{c.tag}</span>
                  {selected && <span class="picker-check">✓</span>}
                </button>
              );
            })}
          </div>

          <p class="picker-group-label">限定换装皮肤（5）</p>
          <div class="picker-grid">
            {skinList.map((c) => {
              const selected = active.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  class={selected ? "picker-card selected" : "picker-card"}
                  style={{ "--char-accent": c.accent } as Record<string, string>}
                  onClick={() => pick(c.id)}
                >
                  <span class="picker-thumb">
                    <img src={c.avatar} alt={c.name} />
                  </span>
                  <span class="picker-name">{c.name}</span>
                  <span class="picker-tag">{c.tag}</span>
                  {selected && <span class="picker-check">✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div class="picker-foot">
          <button
            type="button"
            disabled={!manualId}
            onClick={() => {
              setAssigned(target.userKey, null);
              onClose();
            }}
          >
            恢复自动分配
          </button>
          <button type="button" class="primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
