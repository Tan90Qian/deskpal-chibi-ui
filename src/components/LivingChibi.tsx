import { useEffect, useState } from "preact/hooks";
import type { ChibiStateKey } from "../chibi";

/**
 * Double-buffered cross-fade chibi renderer:
 * - Preloads next pose before fading in (280ms smooth cross-fade, zero blank flash)
 * - Foot-anchored gentle breathing (no vertical floating / no dizziness)
 * - Alternating CSS squish class on headpat (never remounts <img> DOM nodes!)
 * - 60fps pure-vector status ambient particles (sparkles / notes / Zzz / hearts)
 */
export function LivingChibi({
  src,
  alt,
  stateKey,
  className,
  patCount,
}: {
  src: string;
  alt: string;
  stateKey: ChibiStateKey;
  className?: string;
  patCount: number;
}) {
  const [slotA, setSlotA] = useState(src);
  const [slotB, setSlotB] = useState(src);
  const [activeSlot, setActiveSlot] = useState<"a" | "b">("a");

  useEffect(() => {
    const current = activeSlot === "a" ? slotA : slotB;
    if (src === current) return;

    let cancelled = false;
    const loader = new Image();
    loader.onload = () => {
      if (cancelled) return;
      if (activeSlot === "a") {
        setSlotB(src);
        setActiveSlot("b");
      } else {
        setSlotA(src);
        setActiveSlot("a");
      }
    };
    loader.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  const patClass = patCount === 0 ? "" : patCount % 2 === 1 ? " pat-a" : " pat-b";

  return (
    <span class={`living-chibi${className ? ` ${className}` : ""}${patClass}`}>
      <StatusParticles stateKey={stateKey} />

      {patCount > 0 && (
        <span class="pat-hearts" key={patCount} aria-hidden="true">
          <span class="p-heart h1">♥</span>
          <span class="p-heart h2">✦</span>
          <span class="p-heart h3">♥</span>
        </span>
      )}

      {/* Never remount .living-stack so cross-fade layers stay rock-solid on pixel */}
      <span class="living-stack">
        <img class={`living-layer${activeSlot === "a" ? " on" : ""}`} src={slotA} alt={alt} />
        <img class={`living-layer${activeSlot === "b" ? " on" : ""}`} src={slotB} alt="" aria-hidden="true" />
      </span>
    </span>
  );
}

function StatusParticles({ stateKey }: { stateKey: ChibiStateKey }) {
  if (stateKey === "away") {
    return (
      <span class="fx-particles fx-away" aria-hidden="true">
        <span class="fx-p p1">z</span>
        <span class="fx-p p2">Z</span>
        <span class="fx-p p3">z</span>
      </span>
    );
  }
  if (stateKey === "relax") {
    return (
      <span class="fx-particles fx-relax" aria-hidden="true">
        <span class="fx-p p1">♪</span>
        <span class="fx-p p2">♫</span>
        <span class="fx-p p3">✦</span>
      </span>
    );
  }
  if (stateKey === "chat") {
    return (
      <span class="fx-particles fx-chat" aria-hidden="true">
        <span class="fx-p p1">♥</span>
        <span class="fx-p p2">✦</span>
      </span>
    );
  }
  if (stateKey === "work") {
    return (
      <span class="fx-particles fx-work" aria-hidden="true">
        <span class="fx-p p1">✦</span>
        <span class="fx-p p2">✧</span>
        <span class="fx-p p3">✦</span>
      </span>
    );
  }
  return (
    <span class="fx-particles fx-idle" aria-hidden="true">
      <span class="fx-p p1">✧</span>
      <span class="fx-p p2">✦</span>
    </span>
  );
}
