import { useEffect, useRef, useState } from "react";

/**
 * 刮刮卡的银色涂层：手机上用手指、电脑上按住鼠标来回擦，擦掉的地方露出下面的内容。
 * 擦够一会儿（约一两秒、大概三个来回）就自动把剩下的涂层抹掉，然后调用 onDone。
 */
export function ScratchFoil({ hint, onDone }: { hint: string; onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"idle" | "scratching" | "clearing">("idle");
  const drawn = useRef(0);
  const last = useRef<{ x: number; y: number } | null>(null);
  const done = useRef(false);

  // 画银色涂层和提示字
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const paint = () => {
      const { width, height } = cv.getBoundingClientRect();
      if (!width) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = width * dpr;
      cv.height = height * dpr;
      const g = cv.getContext("2d")!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const grad = g.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, "#eef0f4");
      grad.addColorStop(0.5, "#b4bac6");
      grad.addColorStop(1, "#e2e6ec");
      g.fillStyle = grad;
      g.fillRect(0, 0, width, height);
      g.strokeStyle = "rgba(255,255,255,0.22)";
      g.lineWidth = 5;
      for (let x = -height; x < width; x += 12) {
        g.beginPath();
        g.moveTo(x, height);
        g.lineTo(x + height, 0);
        g.stroke();
      }
      g.fillStyle = "#4a4f5c";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `800 ${Math.min(15, height / 3)}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
      g.fillText(hint, width / 2, height / 2);
    };
    paint();
    const ro = new ResizeObserver(() => !done.current && drawn.current === 0 && paint());
    ro.observe(cv);
    return () => ro.disconnect();
  }, [hint]);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    setState("clearing");
    window.setTimeout(onDone, 450);
  };

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width };
  };

  const scratch = (e: React.PointerEvent) => {
    const cv = canvas.current;
    if (!cv || done.current) return;
    // 鼠标要按住才擦；手指、触控笔一碰就擦
    if (e.pointerType === "mouse" && !(e.buttons & 1)) {
      last.current = null;
      return;
    }
    const p = pos(e);
    const g = cv.getContext("2d")!;
    g.globalCompositeOperation = "destination-out";
    g.lineCap = "round";
    g.lineJoin = "round";
    g.lineWidth = 26;
    g.beginPath();
    const from = last.current ?? { x: p.x - 0.1, y: p.y };
    g.moveTo(from.x, from.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    drawn.current += Math.hypot(p.x - from.x, p.y - from.y);
    last.current = { x: p.x, y: p.y };
    if (state === "idle") setState("scratching");
    // 擦过的总长度超过大约三个来回，就算刮开了
    if (drawn.current > p.w * 3) finish();
  };

  return (
    <canvas
      ref={canvas}
      className={`scratch-canvas ${state === "clearing" ? "is-clearing" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`${hint}：按住来回擦，或按回车直接刮开`}
      onPointerDown={(e) => {
        try {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* 有的浏览器不支持，不影响擦 */
        }
        last.current = null;
        scratch(e);
      }}
      onPointerMove={scratch}
      onPointerUp={() => (last.current = null)}
      onPointerCancel={() => (last.current = null)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && finish()}
    />
  );
}
