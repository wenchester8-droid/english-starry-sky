import { useStore } from "../store/store";

/** 每种特效放几个小元素 */
const COUNT: Record<string, number> = { aurora: 3, meteor: 6, snow: 40, sakura: 16, comet: 2, bubble: 14, nebula: 4, lantern: 9, firework: 5, ripple: 3 };

/** 宝箱开出来的星图特效：盖在星图画布上的一层纯装饰动画。 */
export function GalaxyFx() {
  const fx = useStore((s) => s.progress.game.fxOn);
  if (fx === "off") return null;
  const n = COUNT[fx] ?? 18;
  return (
    <div className={`galaxy-fx fx-${fx}`} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <i key={i} style={{ "--i": i, "--m3": i % 3, "--m4": i % 4, "--m5": i % 5, "--x": `${(i * 37) % 100}%`, "--y": `${(i * 53) % 100}%` } as React.CSSProperties} />
      ))}
    </div>
  );
}
