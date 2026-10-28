import { Award, BookOpen, BookOpenCheck, CalendarDays, Check, CheckCheck, Crown, Ear, Flag, Flame, Gift, Hourglass, Keyboard, Library, Lightbulb, Lock, Music, Package, Palette, PenLine, Sparkles, Star, Swords, Target, Timer, Trophy, Zap } from "lucide-react";
import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { burst } from "../lib/burst";
import { badgeStates, BACKFILL_CAP, claimBackfill, claimBadge, pendingBadges, REWARD, SERIES, type BadgeReward, type BadgeState } from "../store/achievements";
import { useStore } from "../store/store";
import { EMBLEM_IDS } from "./badgeEmblems";
import { Sheet } from "./Sheet";
import { toast } from "./Toast";

const ICON: Record<string, typeof Award> = {
  streak: Flame,
  checkins: CalendarDays,
  hours: Hourglass,
  answers: PenLine,
  remember: BookOpenCheck,
  excellent: Target,
  perfect: Trophy,
  units: Flag,
  stars: Star,
  reading: BookOpen,
  readingFull: CheckCheck,
  challenges: Swords,
  readDays: Library,
  readMaxDay: Zap,
  wpm: Timer,
  typing: Keyboard,
  dictation: Ear,
  facts: Lightbulb,
  music: Music,
  fx: Sparkles,
  skins: Palette,
  chests: Package,
  redeemed: Crown,
  hidden: Gift,
};

/** 没达成时显示的进度 */
function progressText(x: BadgeState) {
  if (x.hidden) return "？？？";
  const s = SERIES.find((s) => s.id === x.series);
  if (x.metric === "wpm") return `最快 ${x.value} 词/分`;
  if (!s?.unit) return "还没达成";
  return `${x.value}/${x.need} ${s.unit}`;
}

const rewardText = (x: BadgeState) => `${REWARD[x.level]} 碎片${x.level === 3 ? " + 1 个稀有奖励" : ""}`;
const secret = (x: BadgeState) => !!x.hidden && !x.got;

function announce(got: BadgeReward | null, e?: React.MouseEvent) {
  if (!got || !got.badges.length) return;
  if (e) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, 50);
  }
  const extra = got.rare.map((p) => `，还有「${p.title}」`).join("");
  toast(`${got.badges.length > 1 ? `领取了 ${got.badges.length} 枚徽章` : `领取了「${got.badges[0].name}」`}：${got.shards} 碎片${extra}`, "ok");
}

/** 徽章墙：一个系列一行，点一枚看详情、领奖励。 */
export function BadgeWall() {
  const progress = useStore((s) => s.progress);
  const list = useMemo(() => badgeStates(progress), [progress]);
  const init = progress.game.badgeInit;
  const pending = list.filter((x) => x.got && !x.claimed);
  const [pick, setPick] = useState<string | null>(null);
  const shown = list.find((x) => x.id === pick) ?? null;
  const total = list.filter((x) => x.got).length;
  const backfill = Math.min(BACKFILL_CAP, pending.reduce((s, x) => s + REWARD[x.level], 0));

  return (
    <section className="badge-wall">
      <div className="panel-head">
        <h2 className="treasury-title">成就徽章</h2>
      </div>
      <p className="collect-intro">
        已点亮 {total}/{list.length} 枚。每个成就就是一枚徽章，同一行越往右越难，颜色也越深。
      </p>

      {!init && pending.length > 0 && (
        <div className="badge-backfill">
          <span>
            你已经达成了 {pending.length} 个成就！一起领取共 {backfill} 碎片
            {backfill >= BACKFILL_CAP ? `（以前达成的一起补发，最多 ${BACKFILL_CAP} 碎片）` : ""}。
          </span>
          <button className="btn btn-primary" onClick={(e) => announce(claimBackfill(), e)}>
            一起领取
          </button>
        </div>
      )}
      {init && pending.length > 1 && (
        <div className="badge-backfill">
          <span>有 {pending.length} 枚徽章的奖励还没领。</span>
          <button
            className="btn btn-primary"
            onClick={(e) => {
              const all: BadgeReward = { badges: [], shards: 0, rare: [] };
              for (const x of pending) {
                const got = claimBadge(x.id);
                if (got) {
                  all.badges.push(...got.badges);
                  all.shards += got.shards;
                  all.rare.push(...got.rare);
                }
              }
              announce(all, e);
            }}
          >
            全部领取
          </button>
        </div>
      )}

      {SERIES.map((s, si) => (
        <div key={s.id} className="badge-row">
          {SERIES.findIndex((x) => x.group === s.group) === si && <h4 className="treasury-h badge-group">{s.group}</h4>}
          <h5>{s.name}</h5>
          <ul>
            {list
              .filter((x) => x.series === s.id)
              .map((x, i) => (
                <li key={x.id}>
                  <button className={`badge ${pick === x.id ? "is-on" : ""}`} onClick={() => setPick(x.id)} aria-label={secret(x) ? "隐藏成就" : x.name}>
                    <Medal x={x} delay={(si * 1.3 + i * 0.6) % 4.5} />
                    <span className="badge-name">{secret(x) ? "？？？" : x.name}</span>
                    {!x.got && <small className="badge-prog">{progressText(x)}</small>}
                    {x.got && !x.claimed && <small className="badge-claim">可领取</small>}
                  </button>
                </li>
              ))}
          </ul>
          {shown?.series === s.id && (
            <div className="badge-detail">
              <Medal x={shown} size={60} />
              <span className="badge-detail-text">
                <b>{secret(shown) ? "隐藏成就" : shown.name}</b>
                <small>{secret(shown) ? "达成之前不知道是什么，自己去发现吧。" : shown.desc}</small>
                <small>
                  {shown.got
                    ? shown.claimed
                      ? "已点亮 · 奖励已领取"
                      : `已达成 · 奖励 ${rewardText(shown)}`
                    : `${progressText(shown)} · 奖励 ${shown.hidden ? "？？？" : rewardText(shown)}`}
                </small>
              </span>
              {shown.got && !shown.claimed && init && (
                <button className="btn btn-primary" onClick={(e) => announce(claimBadge(shown.id), e)}>
                  领取
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

/** 桂冠：左右各 7 片叶子沿弧线排开（只有「很难」的徽章有） */
const LAUREL = Array.from({ length: 7 }, (_, i) => {
  const a = ((118 + i * 17) * Math.PI) / 180;
  const x = 60 + 47 * Math.cos(a);
  const y = 60 + 47 * Math.sin(a);
  return { x: +x.toFixed(1), y: +y.toFixed(1), r: +((a * 180) / Math.PI + 90).toFixed(1) };
});
/** 四角星（闪光）：中心 (x, y)，半径 r */
const spark = (x: number, y: number, r: number) =>
  `M${x} ${y - r}Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y}Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r}Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y}Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`;

/** 有图片的中心图案（public/badges/<系列>.webp）；没有的系列先用线条图标 */
const EMBLEMS = new Set(EMBLEM_IDS);
const emblemUrl = (series: string) => `${import.meta.env.BASE_URL}badges/${series}.webp`;

/**
 * 一枚徽章（照老师给的参考图）：金边圆章 + 金边绶带 + 中心图案。越难越华丽：
 * 容易 = 两颗小闪光；中等 = 顶上加一颗星；很难 = 桂冠 + 顶上大星。
 * 没达成也能看到它的样子（淡色 + 小锁）。达成了隔几秒一道反光扫过；没领奖励会轻轻摆动、发光。
 */
function Medal({ x, size = 50, delay = 0 }: { x: BadgeState; size?: number; delay?: number }) {
  const Icon = ICON[x.series] ?? Award;
  const id = useId().replace(/:/g, "");
  const state = x.got ? (x.claimed ? "is-got" : "is-new") : "is-locked";
  const pic = !secret(x) && EMBLEMS.has(x.series);
  return (
    <span className={`medal lv${x.level} ${state}`} style={{ "--medal": x.color, "--delay": `${delay}s`, width: size, height: size * (128 / 120) } as React.CSSProperties} aria-hidden="true">
      <svg viewBox="0 0 120 128" className="medal-svg">
        <defs>
          <linearGradient id={`${id}g`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor="#fff4c4" />
            <stop offset="0.45" stopColor="#f3c552" />
            <stop offset="1" stopColor="#b8771c" />
          </linearGradient>
          <radialGradient id={`${id}f`} cx="0.38" cy="0.3" r="0.8">
            <stop offset="0" className="m-hi" />
            <stop offset="0.6" className="m-mid" />
            <stop offset="1" className="m-lo" />
          </radialGradient>
          <linearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="m-mid" />
            <stop offset="1" className="m-lo" />
          </linearGradient>
          <clipPath id={`${id}c`}>
            <circle cx="60" cy="58" r="31" />
          </clipPath>
        </defs>
        {/* 绶带 */}
        <g fill={`url(#${id}r)`} stroke={`url(#${id}g)`} strokeWidth="2.4" strokeLinejoin="round">
          <path d="M40 84 L24 118 L35 113 L41 124 L56 92 Z" />
          <path d="M80 84 L96 118 L85 113 L79 124 L64 92 Z" />
        </g>
        {/* 桂冠 */}
        {x.level === 3 && (
          <g className="medal-laurel" fill={`url(#${id}g)`} stroke="#9a5b12" strokeWidth="0.9">
            {LAUREL.map((l, i) => (
              <g key={i}>
                <ellipse cx={l.x} cy={l.y} rx="5" ry="9.5" transform={`rotate(${l.r} ${l.x} ${l.y})`} />
                <ellipse cx={120 - l.x} cy={l.y} rx="5" ry="9.5" transform={`rotate(${-l.r} ${120 - l.x} ${l.y})`} />
              </g>
            ))}
          </g>
        )}
        {/* 外圈 + 金边 */}
        <circle cx="60" cy="58" r="41" className="medal-rim" stroke={`url(#${id}g)`} strokeWidth="3" />
        <circle cx="60" cy="58" r="33.5" fill={`url(#${id}f)`} stroke={`url(#${id}g)`} strokeWidth="2.6" />
        {/* 高光 */}
        <ellipse cx="49" cy="40" rx="17" ry="8" fill="#fff" opacity="0.28" transform="rotate(-28 49 40)" />
        {/* 闪光和顶星 */}
        {x.level === 1 && (
          <g fill={`url(#${id}g)`}>
            <path d={spark(39, 42, 5)} />
            <path d={spark(82, 42, 5)} />
          </g>
        )}
        {x.level >= 2 && <path d={spark(60, x.level === 3 ? 13 : 16, x.level === 3 ? 11 : 8)} fill={`url(#${id}g)`} stroke="#9a5b12" strokeWidth="0.8" />}
        <g clipPath={`url(#${id}c)`}>
          <g transform="rotate(20 60 58)">
            <rect className="medal-shine" x="0" y="0" width="16" height="130" />
          </g>
        </g>
      </svg>
      <span className="medal-icon">
        {secret(x) ? <b>?</b> : pic ? <img src={emblemUrl(x.series)} alt="" loading="lazy" /> : <Icon size={size * 0.3} strokeWidth={2.4} />}
      </span>
      {!x.got && (
        <i className="medal-chip medal-lock">
          <Lock size={10} strokeWidth={2.6} />
        </i>
      )}
      {x.claimed && (
        <i className="medal-chip medal-check">
          <Check size={11} strokeWidth={3} />
        </i>
      )}
    </span>
  );
}

/* ---------- 右上角奖章图标 + 底部弹出的徽章墙 ---------- */

let opened = false;
const subs = new Set<() => void>();
export function openBadges(v = true) {
  opened = v;
  subs.forEach((f) => f());
}
const useOpened = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => opened,
  );

/** 有没领的徽章时，每次打开网页图标都会摆动，点过一次就停（角标和闪光还在，和宝箱图标一样）。 */
let poked = false;

export function BadgeButton() {
  const progress = useStore((s) => s.progress);
  const n = useMemo(() => pendingBadges(progress).length, [progress]);
  const [still, setStill] = useState(poked);
  return (
    <button
      className={`icon-btn badge-btn ${n ? "has-new" : ""} ${still || !n ? "" : "is-swinging"}`}
      onClick={() => {
        poked = true;
        setStill(true);
        openBadges();
      }}
      aria-label={n ? `成就徽章，有 ${n} 枚没领` : "成就徽章"}
      title="成就徽章"
    >
      <MedalMark />
      {n > 0 && <span className="treasury-badge">{n}</span>}
    </button>
  );
}

/** 工具栏上的小奖章：挂在绶带上 */
function MedalMark() {
  return (
    <svg className="medal-mark" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path className="mm-ribbon-l" d="M6.5 1.5h4.4l2.1 7.4-3.7 1.2z" />
      <path className="mm-ribbon-r" d="M17.5 1.5h-4.4l-2.1 7.4 3.7 1.2z" />
      <circle className="mm-disc" cx="12" cy="15.2" r="7.3" />
      <circle className="mm-ring" cx="12" cy="15.2" r="5.3" />
      <path className="mm-star" d="M12 11.7l1.05 2.13 2.35.34-1.7 1.66.4 2.34L12 17.1l-2.1 1.07.4-2.34-1.7-1.66 2.35-.34z" />
    </svg>
  );
}

export function BadgeSheet() {
  const open = useOpened();
  return (
    <Sheet open={open} onClose={() => openBadges(false)} label="成就徽章" className="sheet-bottom treasury-sheet badge-sheet">
      <BadgeWall />
    </Sheet>
  );
}

/* ---------- 新达成徽章时的提示 ---------- */

/** 这次打开网页时已经达成的徽章；之后新达成的弹一条提示。学习中先不弹，学完再弹。 */
let seen: { id: string; got: Set<string> } | null = null;

export function useBadgeToasts() {
  const progress = useStore((s) => s.progress);
  useEffect(() => {
    if (progress.session && !progress.session.finished) return;
    const got = badgeStates(progress).filter((x) => x.got);
    if (!seen || seen.id !== progress.datasetId) {
      seen = { id: progress.datasetId, got: new Set(got.map((x) => x.id)) };
      return;
    }
    const fresh = got.filter((x) => !seen!.got.has(x.id));
    for (const x of fresh) seen.got.add(x.id);
    // 一下子多出很多（读进了备份、云端同步），不算新达成，不弹
    if (fresh.length > 3) return;
    for (const x of fresh) toast(`🏅 解锁徽章「${x.name}」！点右上角的奖章图标领取奖励`, "ok");
  }, [progress]);
}
