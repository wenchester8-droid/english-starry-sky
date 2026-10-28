import { useId } from "react";
import { bookTag } from "../lib/books";
import { APP_NAME } from "../lib/unit";
import { useStore } from "../store/store";

/**
 * 标志：深蓝圆盘上的「星图罗盘」。
 * 一直在动：外圈 HUD 弧线慢慢转、一颗小星沿轨道绕圈、指针轻轻摆；
 * 悬停时刻度环转一圈、指针转一圈。public/brand/mark.svg 是同一个图的独立文件（开屏、图标用）。
 */
export function Mark({ size }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  const bg = `${id}-bg`;
  const n = `${id}-n`;
  const glow = `${id}-glow`;
  return (
    <span className="mark" style={size ? { width: size, height: size } : undefined} aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <defs>
          <radialGradient id={bg} cx="50%" cy="38%" r="65%">
            <stop offset="0" stopColor="#1B2C5A" />
            <stop offset="1" stopColor="#070C1E" />
          </radialGradient>
          <linearGradient id={n} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8FF6FF" />
            <stop offset="1" stopColor="#3D7BFF" />
          </linearGradient>
          <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx="32" cy="32" r="31" fill={`url(#${bg})`} />
        <circle cx="32" cy="32" r="29" fill="none" stroke="#5FE3FF" strokeOpacity=".45" strokeWidth=".8" />
        <g className="mark-ticks">
          <circle cx="32" cy="32" r="26" fill="none" stroke="#9FDFFF" strokeOpacity=".55" strokeWidth="2" strokeDasharray=".5 1.77" />
          <path d="M32 3.5v5M60.5 32h-5M32 60.5v-5M3.5 32h5" stroke="#CFF6FF" strokeWidth="1.4" strokeLinecap="round" />
        </g>
        <g className="mark-arcs">
          <circle cx="32" cy="32" r="21" fill="none" stroke="#5FE3FF" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="18 15" />
          <circle cx="32" cy="32" r="17" fill="none" stroke="#A78BFF" strokeOpacity=".7" strokeWidth=".8" strokeDasharray="4 3 26 20" />
        </g>
        <g className="mark-orbit" filter={`url(#${glow})`}>
          <circle cx="32" cy="3" r="1.9" fill="#FFFFFF" />
        </g>
        <g className="mark-needle" filter={`url(#${glow})`}>
          <path d="M32 9 36.2 32H27.8Z" fill={`url(#${n})`} />
          <path d="M32 55 36.2 32H27.8Z" fill="#B9C4E6" fillOpacity=".35" />
          <path d="M32 9V32" stroke="#FFFFFF" strokeOpacity=".7" strokeWidth=".6" />
        </g>
        <circle cx="32" cy="32" r="3.2" fill="#070C1E" stroke="#8FF6FF" strokeWidth="1.2" />
        <circle className="mark-core" cx="32" cy="32" r="1.1" fill="#8FF6FF" />
      </svg>
    </span>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  const book = useStore((s) => s.settings.book);
  return (
    <span className="logo">
      <Mark />
      <span className="logo-text">
        <b>{APP_NAME}</b>
        {!compact && <small>{bookTag(book)}</small>}
      </span>
    </span>
  );
}
