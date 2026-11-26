import { MINI_FRAME_COUNT, useMiniFrame, type ChibiCharacter, type ChibiStateKey } from "../chibi";

/**
 * Renders one integer-aligned frame from CrossPet's 20-frame horizontal mini.webp sprite sheet
 * (native 2720x148 -> 20 cells of 136x148). Zero translateY / subpixel resampling -> razor crisp.
 */
export function MiniSprite({
  char,
  stateKey,
  seed,
  cellWidth,
  alt,
}: {
  char: ChibiCharacter;
  stateKey: ChibiStateKey;
  seed: string;
  cellWidth: number;
  alt: string;
}) {
  const frameIdx = useMiniFrame(stateKey, seed);
  if (!char.mini) {
    const fallback = char.pools[stateKey]?.[0] ?? char.pools.idle[0];
    return <img class="mini-fallback-img" src={fallback} alt={alt} />;
  }

  const w = Math.round(cellWidth);
  const h = Math.round((w * 148) / 136);
  const totalW = w * MINI_FRAME_COUNT;
  const offsetX = -(frameIdx * w);

  return (
    <span
      class="mini-sprite"
      role="img"
      aria-label={alt}
      style={{
        width: `${w}px`,
        height: `${h}px`,
        backgroundImage: `url("${char.mini}")`,
        backgroundSize: `${totalW}px ${h}px`,
        backgroundPosition: `${offsetX}px 0px`,
      }}
    />
  );
}
