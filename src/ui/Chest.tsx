import { CalendarCheck, Crown, Gem, Lightbulb, Lock, Music, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAtlas } from "../atlas/context";
import { burst } from "../lib/burst";
import { cue } from "../lib/sound";
import { canPatchYesterday, grantEgg, currentChain, isDailyDone, markEarned, openChest, patchYesterday, summarize, readyChests, SKIN_COST, unitLeftToday, isExcellent, EXCELLENT_ACC, EXCELLENT_MIN, challengeEarnedToday, type ChestKind, type ChestTicket, type Prize } from "../store/game";
import { todayPlan } from "../store/session";
import { dayKey, useStore } from "../store/store";
import { Sheet } from "./Sheet";
import { unitLabel, unitShort } from "../lib/unit";
import { openTreasury } from "./Treasury";
import { toast } from "./Toast";

const NAME: Record<ChestKind, string> = { daily: "今日宝箱", weekly: "周宝箱", unit: "单元宝箱", challenge: "挑战宝箱" };
/** 宝箱档次：今日 = 普通，挑战 = 进阶（蓝色），单元 = 稀有，周 = 传说。 */
const TIER: Record<ChestKind, string> = { daily: "普通宝箱", challenge: "进阶宝箱", unit: "稀有宝箱", weekly: "传说宝箱" };

/** 现在能开的宝箱，以及今天的任务还差多少。 */
export function useChests() {
  const atlas = useAtlas();
  const progress = useStore((s) => s.progress);
  const settings = useStore((s) => s.settings);
  return useMemo(() => {
    const plan = todayPlan(atlas, progress, settings);
    const left = plan.due.length + plan.fresh.length;
    const done = isDailyDone(progress, left);
    return { ready: readyChests(atlas, progress, done), left, done, game: progress.game, progress };
  }, [atlas, progress, settings]);
}

/** 做完当天任务就把今日宝箱记下来，第二天没开也还在。放在外壳里只挂一次。 */
export function useEarnDaily() {
  const { done, game } = useChests();
  const earnedToday = game.earned.includes(dayKey());
  useEffect(() => {
    if (done && !earnedToday) markEarned();
  }, [done, earnedToday]);
}

export function ChestArt({ kind = "daily", open = false, locked = false, size = 72 }: { kind?: ChestKind; open?: boolean; locked?: boolean; size?: number }) {
  return (
    <svg className={`chest-art chest-${kind} ${open ? "is-open" : ""} ${locked ? "is-locked" : ""}`} viewBox="0 0 100 90" width={size} height={size * 0.9} aria-hidden="true">
      <ellipse cx="50" cy="84" rx="38" ry="4" className="chest-shadow" />
      <g className="chest-glow">
        <circle cx="50" cy="40" r="30" />
      </g>
      <rect x="14" y="40" width="72" height="40" rx="6" className="chest-body" />
      <rect x="14" y="52" width="72" height="5" className="chest-band" />
      <rect x="44" y="40" width="12" height="40" className="chest-band" />
      <g className="chest-lid">
        <path d="M14 42 V30 Q14 12 50 12 Q86 12 86 30 V42 Z" className="chest-body chest-lid-top" />
        <rect x="44" y="12" width="12" height="30" className="chest-band" />
      </g>
      <rect x="45" y="44" width="10" height="12" rx="2" className="chest-lock" />
    </svg>
  );
}

const PRIZE_ICON = { shard: Gem, fact: Lightbulb, patch: CalendarCheck, music: Music, fx: Sparkles, coupon: Crown };
const RARITY = { common: "普通", rare: "稀有", legend: "传说" };

/** manual：自动弹出时宝箱先关着，让学生自己点开。 */
function ChestOpener({ ticket, batch = [], manual = false, onClose }: { ticket: ChestTicket | null; batch?: ChestTicket[]; manual?: boolean; onClose: () => void }) {
  const [prizes, setPrizes] = useState<Prize[] | null>(null);
  const [many, setMany] = useState(0);
  const busy = useRef(false);
  const sfx = useStore((s) => s.settings.sfx);
  const close = () => {
    setPrizes(null);
    setMany(0);
    busy.current = false;
    onClose();
  };
  const celebrate = (got: Prize[]) => {
    const r = document.querySelector(".chest-sheet .chest-tap")?.getBoundingClientRect();
    if (r) burst(r.left + r.width / 2, r.top + r.height / 3, 60);
    if (sfx) void cue(got.some((p) => p.rarity !== "common") ? "streak" : "complete");
  };
  const open = () => {
    if (!ticket || prizes || busy.current) return;
    busy.current = true;
    const got = openChest(ticket);
    if (!got.length) {
      // 这个宝箱已经在别处开过了
      close();
      return;
    }
    setPrizes(got);
    celebrate(got);
  };
  // 只有一个宝箱：点了就直接开，不用在界面里再点一次
  const auto = useRef<ChestTicket | null>(null);
  useEffect(() => {
    if (!ticket || prizes || manual || batch.length > 1 || auto.current === ticket) return;
    auto.current = ticket;
    window.setTimeout(open, 0);
  });
  const openAll = () => {
    if (prizes || batch.length < 2 || busy.current) return;
    busy.current = true;
    const got = batch.flatMap((t) => openChest(t));
    setMany(batch.length);
    setPrizes(summarize(got));
    celebrate(got);
  };
  const title = ticket ? (ticket.egg ? "彩蛋宝箱" : ticket.kind === "unit" ? `${NAME.unit} · ${unitLabel(ticket.unit ?? "")}` : NAME[ticket.kind]) : "";
  return (
    <Sheet open={!!ticket} onClose={close} label={title} className={`chest-sheet tier-${ticket?.kind ?? "daily"}`}>
      <div className="chest-sky" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <i key={i} style={{ "--i": i, "--x": `${(i * 41) % 100}%`, "--y": `${(i * 29) % 70}%` } as React.CSSProperties} />
        ))}
      </div>
      <p className="chest-title">
        <span className="chest-tier">{ticket ? TIER[ticket.kind] : ""}</span>
        {title}
      </p>
      {!prizes ? (
        <>
          <button className="chest-tap" onClick={open} aria-label="打开宝箱">
            <span className="chest-rays" aria-hidden="true" />
            <ChestArt kind={ticket?.kind} size={180} />
          </button>
          <p className="chest-hint">{batch.length > 1 ? `攒了 ${batch.length} 个，点宝箱开一个` : manual ? "新宝箱到手！点一下宝箱，打开它" : "点一下宝箱，打开它"}</p>
          {manual && (
            <div className="chest-actions">
              <button className="btn btn-ghost chest-later" onClick={close}>
                稍后再开
              </button>
            </div>
          )}
          {batch.length > 1 && (
            <div className="chest-actions">
              <button className="btn btn-primary chest-all" onClick={openAll}>
                全部打开（{batch.length} 个）
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="chest-tap is-opened">
            <span className="chest-rays" aria-hidden="true" />
            <ChestArt kind={ticket?.kind} size={140} open />
          </div>
          {many > 1 && <p className="chest-hint">一共打开了 {many} 个{ticket ? NAME[ticket.kind] : ""}</p>}
          <ul className="prizes">
            {prizes.map((p, i) => {
              const Icon = PRIZE_ICON[p.icon];
              return (
                <li key={i} className={`prize prize-${p.rarity} ${p.icon === "coupon" && !p.converted ? "prize-coupon" : ""}`} style={{ "--i": i } as React.CSSProperties}>
                  <span className="prize-icon">
                    <Icon size={22} />
                  </span>
                  <span className="prize-text">
                    <b>{p.title}</b>
                    <small>{p.desc}</small>
                  </span>
                  <em className="prize-tag">{RARITY[p.rarity]}</em>
                </li>
              );
            })}
          </ul>
          <div className="chest-actions">
            <button className="btn btn-primary" onClick={close}>
              收下
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                close();
                openTreasury();
              }}
            >
              去我的宝库
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

const ticketId = (t: ChestTicket) => `${t.kind}:${t.egg ? "egg" : (t.day ?? t.unit ?? "")}`;
const RANK: Record<ChestKind, number> = { weekly: 0, unit: 1, challenge: 2, daily: 3 };

/** 刚得到新宝箱（完成当天任务、连续满 7 天、单元过关）就直接弹出来；
 *  打开网页时已经攒着的不弹；正在学习时先不打扰，等这轮学完再弹。 */
export function ChestAutoPop() {
  const { ready } = useChests();
  const busy = useStore((s) => !!s.progress.session && !s.progress.session.finished);
  const seen = useRef<Set<string> | null>(null);
  const [queue, setQueue] = useState<ChestTicket[]>([]);
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(ready.map(ticketId));
      return;
    }
    // 彩蛋宝箱直接进宝库，不弹出来
    const fresh = ready.filter((t) => !t.egg && !seen.current!.has(ticketId(t)));
    if (!fresh.length) return;
    fresh.forEach((t) => seen.current!.add(ticketId(t)));
    setQueue((q) => [...q, ...fresh].sort((a, b) => RANK[a.kind] - RANK[b.kind]));
  }, [ready]);
  // 正在显示的那个一直留到学生关掉；排队的如果已经在宝库里开掉了，就不再弹
  const [current, setCurrent] = useState<ChestTicket | null>(null);
  const live = new Set(ready.map(ticketId));
  useEffect(() => {
    if (current || busy) return;
    const next = queue.find((t) => live.has(ticketId(t)));
    if (next) setCurrent(next);
    else if (queue.length) setQueue([]);
  });
  const ticket = current;
  return createPortal(<ChestOpener key={ticket ? ticketId(ticket) : "none"} ticket={ticket} manual onClose={() => {
        setQueue((q) => q.filter((t) => !ticket || ticketId(t) !== ticketId(ticket)));
        setCurrent(null);
      }} />, document.body);
}

/** 宝箱并排：周（传说）· 单元（稀有）· 挑战（进阶，开了挑战模式或拿到过才显示）· 今日（普通），点哪个开哪个。 */
export function ChestShelf({ compact = false }: { compact?: boolean }) {
  const { ready, left, game, progress } = useChests();
  const challengeOn = useStore((s) => s.settings.challenge);
  const [ticket, setTicket] = useState<ChestTicket | null>(null);
  const t = dayKey();
  const chain = currentChain(game);
  const daily = ready.filter((x) => x.kind === "daily");
  const weekly = ready.filter((x) => x.kind === "weekly");
  const units = ready.filter((x) => x.kind === "unit");
  const challenges = ready.filter((x) => x.kind === "challenge");

  const slots: { kind: ChestKind; ticket?: ChestTicket; opened: boolean; note: string; count: number }[] = [
    {
      kind: "weekly",
      ticket: weekly[0],
      count: weekly.length,
      opened: game.weekly.includes(t),
      note: weekly.length ? "点我打开" : `再连续 ${7 - (chain % 7)} 天`,
    },
    {
      kind: "unit",
      ticket: units[0],
      count: units.length,
      opened: false,
      note: units[0] ? `${unitShort(unitLabel(units[0].unit ?? ""))} 过关了` : !unitLeftToday(game) ? "今天领满 3 个了，明天再来" : "单元里九成的词记住就送",
    },
    ...(challengeOn || game.challengeEarned.length
      ? [
          {
            kind: "challenge" as const,
            ticket: challenges[0],
            count: challenges.length,
            opened: game.challenge.includes(t),
            note: challenges.length ? "点我打开" : challengeEarnedToday(game) ? "明天再来" : "读一篇真题，最多错 1 题",
          },
        ]
      : []),
    {
      kind: "daily",
      ticket: daily[0],
      count: daily.length,
      opened: game.daily.includes(t),
      note: daily.length ? (isExcellent(progress, daily[0].day) ? "优秀！碎片翻倍" : "点我打开") : game.earned.includes(t) ? "明天再来" : left > 0 ? `还差 ${left} 个词` : "答几道题就能开",
    },
  ];

  return (
    <div className={`chest-shelf ${compact ? "is-compact" : ""} ${slots.length > 3 ? "has-4" : ""}`}>
      {slots.map((x) => {
        const can = !!x.ticket;
        return (
          <button
            key={x.kind}
            className={`chest-slot slot-${x.kind} ${can ? "is-ready" : ""}`}
            onClick={() => x.ticket && setTicket(x.ticket)}
            disabled={!can}
            aria-label={`${NAME[x.kind]}（${TIER[x.kind]}）：${x.note}`}
          >
            <span className="chest-slot-art">
              <ChestArt kind={x.kind} open={x.opened && !can} locked={!can && !x.opened} size={compact ? 60 : 76} />
              {!can && !x.opened && (
                <span className="chest-lock-badge">
                  <Lock size={12} />
                </span>
              )}
              {can && <span className="treasury-badge chest-count">{x.count}</span>}
            </span>
            <b>{NAME[x.kind]}</b>
            <small className="chest-slot-tier">{TIER[x.kind]}</small>
            <small className="chest-slot-note">{x.note}</small>
          </button>
        );
      })}
      {createPortal(<ChestOpener ticket={ticket} batch={ticket ? ready.filter((x) => x.kind === ticket.kind) : []} onClose={() => setTicket(null)} />, document.body)}
    </div>
  );
}

/** 每日任务 + 宝箱栏（放在右上角的宝库面板里）。 */
export function ChestPanel({ inSheet = false }: { inSheet?: boolean }) {
  const { ready, left, game, progress } = useChests();
  const [ticket, setTicket] = useState<ChestTicket | null>(null);
  const today = useStore((s) => s.progress.days[dayKey()]);
  const chain = currentChain(game);
  const openedToday = game.earned.includes(dayKey()) && !ready.some((x) => x.kind === "daily");

  let status: React.ReactNode;
  if (ready.length) status = <>有 {ready.length} 个宝箱可以打开，点一下宝箱！</>;
  else if (openedToday) status = <>今天的任务完成了，明天再来。</>;
  else if (!(today?.r ?? 0) && left > 0) status = <>完成今天的旅程，就能打开今日宝箱。</>;
  else if (left > 0) status = <>还差 {left} 个词，就能打开今日宝箱。</>;
  else status = <>答几道题，就能打开今日宝箱。</>;

  return (
    <section className={`${inSheet ? "" : "panel"} chest-panel ${ready.length ? "is-ready" : ""} ${inSheet ? "in-sheet" : ""}`}>
      <div className="chest-copy">
        <h3 className="eyebrow">每日任务 · 宝箱</h3>
        <p className="chest-status">{status}</p>
        <p className="chest-excellent">
          {isExcellent(progress)
            ? <>今天正确率 {Math.round(((today?.c ?? 0) / Math.max(1, today?.r ?? 0)) * 100)}%，优秀！今日宝箱碎片翻倍</>
            : <>今天答满 {EXCELLENT_MIN} 题、正确率到 {EXCELLENT_ACC * 100}%，今日宝箱碎片翻倍{today?.r ? `（现在 ${today.r} 题、${Math.round((today.c / today.r) * 100)}%）` : ""}</>}
        </p>
        <p className="chest-chain">
          已连续 <b>{chain}</b> 天
          <span className="chest-shards">
            <Gem size={14} /> 碎片 {game.shards}/{SKIN_COST}
          </span>
        </p>
        {canPatchYesterday(game) && (
          <button className="btn btn-ghost chest-patch" onClick={patchYesterday}>
            <CalendarCheck size={16} /> 昨天忘了？用补签卡补上（剩 {game.patches} 张）
          </button>
        )}
      </div>
      <ChestShelf compact={inSheet} />
      {import.meta.env.DEV && (
        <div className="chest-try">
          <span>试玩（只在老师电脑上出现）：</span>
          {(["weekly", "unit", "challenge", "daily"] as const).map((k) => (
            <button key={k} className="chip-btn" onClick={() => setTicket({ kind: k, unit: k === "unit" ? "试玩单元" : undefined, free: true })}>
              再开一个{NAME[k]}
            </button>
          ))}
        </div>
      )}
      {createPortal(<ChestOpener ticket={ticket} onClose={() => setTicket(null)} />, document.body)}
    </section>
  );
}



const EGG_TAPS = 5;
/** 两次点击间隔超过这么久，就从头数 */
const EGG_GAP = 600;

/** 彩蛋：连点左上角图标 5 次，送一个宝箱，放进右上角的宝库（每人只送一次）。返回给图标用的点击处理。 */
export function useEggChest() {
  const taps = useRef({ n: 0, at: 0 });
  return () => {
    const now = Date.now();
    const t = taps.current;
    t.n = now - t.at < EGG_GAP ? t.n + 1 : 1;
    t.at = now;
    if (t.n !== EGG_TAPS) return;
    if (grantEgg()) toast("发现彩蛋！送你一个宝箱，已经放进右上角的宝库", "ok");
    else toast("彩蛋宝箱已经领过啦，每人只有一次", "info");
  };
}
