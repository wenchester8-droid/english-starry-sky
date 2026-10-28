import { unitShort } from "../lib/unit";
import { ArrowRight, Flame, PenLine, Sparkles } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { prefetch, useAtlas, useEntry } from "../atlas/context";
import { useAccount } from "../lib/cloud";
import { go, openWord } from "../lib/router";
import { cue } from "../lib/sound";
import { greetingFor } from "../lib/greeting";
import { hashSeed } from "../lib/text";
import { buildSession, todayPlan } from "../store/session";
import { isMastered } from "../store/srs";
import { dayKey, store, useStore } from "../store/store";
import { Galaxy } from "../galaxy/Galaxy";
import { Highlight, Pronounce } from "../ui/EntryView";
import { Illustration } from "../ui/Illustration";
import { Ring } from "../ui/Ring";
import { UnitSheet } from "../ui/UnitPanel";

const BRAND = `${import.meta.env.BASE_URL}brand`;

// 开发版可用 ?greet=weekend|exam|examday|birthday 预览各种问候语
const PREVIEW = import.meta.env.DEV
  ? new URLSearchParams(location.search).get("greet")
  : null;

export function streakOf(days: Record<string, { r: number }>) {
  let n = 0;
  const d = new Date();
  if (!(days[dayKey(d)]?.r > 0)) d.setDate(d.getDate() - 1);
  while (days[dayKey(d)]?.r > 0) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function Today() {
  const atlas = useAtlas();
  const progress = useStore((s) => s.progress);
  const settings = useStore((s) => s.settings);
  const plan = useMemo(
    () => todayPlan(atlas, progress, settings),
    [atlas, progress, settings],
  );
  // Warm the first cards of today's journey so the session opens instantly.
  const firstIds = [...plan.due.slice(0, 4), ...plan.fresh.slice(0, 6)].join(
    ",",
  );
  useEffect(() => {
    const ids = firstIds.split(",").filter(Boolean);
    const t = window.setTimeout(() => void prefetch(atlas, ids), 800);
    return () => window.clearTimeout(t);
  }, [atlas, firstIds]);
  const now = new Date();
  const name = useAccount()?.name;
  const hello = greetingFor(now, name, PREVIEW);
  const today = progress.days[dayKey()];
  const streak = streakOf(progress.days);
  const active =
    progress.session && !progress.session.finished ? progress.session : null;
  const total = plan.due.length + plan.fresh.length;
  const goal = settings.dailyNew + Math.min(plan.due.length, 60);
  const doneToday = today?.r ?? 0;

  const start = (opts?: { reviewOnly?: boolean; extra?: number }) => {
    if (!active) {
      const s = buildSession(
        atlas,
        progress,
        opts?.extra
          ? { ...settings, dailyNew: (today?.n ?? 0) + opts.extra }
          : settings,
        { reviewOnly: opts?.reviewOnly },
      );
      if (!s.steps.length) return;
      store.progress((p) => ({ ...p, session: s }));
    }
    if (settings.sfx) void cue("start");
    go({ page: "learn" });
  };

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const k = dayKey(d);
    return {
      k,
      label: "日一二三四五六"[d.getDay()],
      v: progress.days[k]?.r ?? 0,
      today: i === 6,
    };
  });

  // 进度各册共用，这里只数当前这一册的词，和星图上的点亮数对得上
  const learned = atlas.words.filter((w) => progress.cards[w.id]).length;
  const mastered = atlas.words.filter((w) => progress.cards[w.id] && isMastered(progress.cards[w.id])).length;
  const teaser = (active ? active.newIds : plan.fresh)
    .slice(0, 5)
    .map((id) => atlas.byId.get(id)!)
    .filter(Boolean);

  return (
    <div className="page today">
      <header className="greet">
        <p className="eyebrow">
          {now.getMonth() + 1}月{now.getDate()}日 · 星期
          {"日一二三四五六"[now.getDay()]}
        </p>
        <h1 className="display">{hello.title}</h1>
        <p className="greet-sub">{hello.sub}</p>
      </header>

      <section
        className={`journey ${total === 0 && !active ? "is-clear" : ""}`}
      >
        <img
          className="journey-art"
          src={`${BRAND}/hero.webp`}
          alt=""
          fetchPriority="high"
        />
        <div className="journey-body">
          {active ? (
            <>
              <p className="eyebrow eyebrow-light">旅程进行中</p>
              <h2>
                还剩 <b>{active.steps.length - active.index}</b> 步
              </h2>
              <p className="journey-lede">进度已保存，随时接着走。</p>
            </>
          ) : total > 0 ? (
            <>
              <p className="eyebrow eyebrow-light">今日旅程</p>
              <h2>
                {plan.due.length > 0 && (
                  <>
                    复习 <b>{plan.due.length}</b>
                  </>
                )}
                {plan.due.length > 0 && plan.fresh.length > 0 && <i> · </i>}
                {plan.fresh.length > 0 && (
                  <>
                    新词 <b>{plan.fresh.length}</b>
                  </>
                )}
              </h2>
              <p className="journey-lede">
                约 {plan.minutes} 分钟。先温故，再知新。
              </p>
            </>
          ) : (
            <>
              <p className="eyebrow eyebrow-light">今日已完成</p>
              <h2>今天的星，都亮了。</h2>
              <p className="journey-lede">
                记忆需要一点留白。想多走一段，也可以。
              </p>
            </>
          )}
          {teaser.length > 0 && (
            <div className="teaser" aria-label="今天将遇见的新词">
              {teaser.map((w, i) => (
                <Illustration
                  key={w.id}
                  src={atlas.img(w, "thumb")}
                  word={w.word}
                  topic={w.topic}
                  className={`teaser-${i}`}
                />
              ))}
              <span>今天会遇见它们</span>
            </div>
          )}
          <div className="journey-actions">
            {active || total > 0 ? (
              <button
                className="btn btn-primary btn-xl"
                onClick={() => start()}
              >
                {active ? "继续旅程" : "开始今天的旅程"}{" "}
                <ArrowRight size={20} />
              </button>
            ) : (
              <button
                className="btn btn-primary btn-xl"
                onClick={() => start({ extra: 5 })}
              >
                再认识 5 个新词 <Sparkles size={18} />
              </button>
            )}
            {!active && plan.due.length > 0 && plan.fresh.length > 0 && (
              <button
                className="btn btn-glass"
                onClick={() => start({ reviewOnly: true })}
              >
                只复习
              </button>
            )}
            {!active && total === 0 && (
              <button
                className="btn btn-glass"
                onClick={() => go({ page: "practice" })}
              >
                <PenLine size={18} /> 听写练习
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="today-grid">
        <WordOfDay />

        <section className="panel streak-panel">
          <div className="panel-head">
            <h3 className="eyebrow">这一周</h3>
            <span className={`streak ${streak ? "is-on" : ""}`}>
              <Flame size={16} /> 连续 {streak} 天
            </span>
          </div>
          <div className="streak-body">
            <Ring
              value={goal ? doneToday / goal : 0}
              size={112}
              stroke={8}
              tone="terra"
            >
              <b>{doneToday}</b>
              <small>今日答题</small>
            </Ring>
            <ol className="week">
              {week.map((d) => (
                <li
                  key={d.k}
                  className={`${d.v ? "is-on" : ""} ${d.today ? "is-today" : ""}`}
                  title={`${d.k}：${d.v} 题`}
                >
                  <span
                    style={
                      { "--h": Math.min(1, d.v / 40) } as React.CSSProperties
                    }
                  />
                  <small>{d.label}</small>
                </li>
              ))}
            </ol>
          </div>
          <dl className="mini-stats">
            <div>
              <dt>已点亮</dt>
              <dd>{learned.toLocaleString()}</dd>
            </div>
            <div>
              <dt>已掌握</dt>
              <dd>{mastered.toLocaleString()}</dd>
            </div>
            <div>
              <dt>全部词汇</dt>
              <dd>{atlas.count.toLocaleString()}</dd>
            </div>
          </dl>
        </section>

        <LevelPath />
        <GalaxyPanel learned={learned} total={atlas.count} />
        <Topics />
      </div>
    </div>
  );
}

function GalaxyPanel({ learned, total }: { learned: number; total: number }) {
  const today = useStore((s) => s.progress.days[dayKey()]);
  const ids = useStore((s) => s.progress.cards);
  const todayIds = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Object.entries(ids)
      .filter(([, c]) => c.seen >= start.getTime())
      .map(([id]) => id);
  }, [ids]);
  void today;
  return (
    <section
      className="galaxy-panel"
      onClick={() => go({ page: "atlas", view: "galaxy" })}
      role="link"
      tabIndex={0}
      onKeyDown={(e) =>
        e.key === "Enter" && go({ page: "atlas", view: "galaxy" })
      }
    >
      <Galaxy mode="mini" highlight={todayIds} />
      <div className="galaxy-panel-copy">
        <p className="eyebrow eyebrow-light">你的词汇星图</p>
        <h3>
          已点亮 <b>{learned.toLocaleString()}</b> 颗星
        </h3>
        <p>
          {learned
            ? `还有 ${(total - learned).toLocaleString()} 颗在等你。金色是今天新点亮的。`
            : `${total.toLocaleString()} 个词是 ${total.toLocaleString()} 颗星。学会一个，就点亮一颗。`}
        </p>
        <span className="btn btn-glass">
          进入星图 <ArrowRight size={18} />
        </span>
      </div>
    </section>
  );
}

function WordOfDay() {
  const atlas = useAtlas();
  const pick = useMemo(() => {
    const pool = atlas.words.filter((w) => w.cefr >= 2 && w.media & 1);
    const list = pool.length ? pool : atlas.words;
    return list[hashSeed(dayKey()) % list.length];
  }, [atlas]);
  const { entry } = useEntry(pick?.id);
  if (!pick) return null;
  return (
    <section
      className="panel wotd"
      onClick={() => openWord(pick.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && openWord(pick.id)}
      aria-label={`今日一词：${pick.word}`}
    >
      <Illustration
        src={atlas.img(pick)}
        word={pick.word}
        topic={pick.topic}
        className="wotd-art"
      />
      <div className="wotd-body">
        <h3 className="eyebrow">今日一词</h3>
        <p className="wotd-word" lang="en">
          {pick.word}
        </p>
        {entry && (
          <div onClick={(e) => e.stopPropagation()}>
            <Pronounce entry={entry} refw={pick} />
          </div>
        )}
        <p className="wotd-zh">{pick.zh}</p>
        {entry?.ex[0] && (
          <p className="wotd-ex" lang="en">
            <Highlight text={entry.ex[0].en} word={entry.w} />
          </p>
        )}
      </div>
    </section>
  );
}

function LevelPath() {
  const atlas = useAtlas();
  const cards = useStore((s) => s.progress.cards);
  const start = useStore((s) => s.settings.startLevel);
  const [openUnit, setOpenUnit] = useState<number | null>(null);
  const route = useRef<HTMLOListElement>(null);
  const [cols, setCols] = useState(6);
  const [road, setRoad] = useState<RoadGeo | null>(null);
  const levels = useMemo(() => {
    const out = atlas.cefr.map((name) => ({
      name,
      total: 0,
      seen: 0,
      mastered: 0,
    }));
    for (const w of atlas.words) {
      const l = out[w.cefr];
      l.total++;
      const c = cards[w.id];
      if (c) {
        l.seen++;
        if (isMastered(c)) l.mastered++;
      }
    }
    return out;
  }, [atlas, cards]);
  // 量出每个单元圆圈的位置，画连接它们的小路；宽度变了（转屏、缩放窗口）重新量
  useLayoutEffect(() => {
    const el = route.current;
    if (!el) return;
    const measure = () => {
      const c = Math.max(3, Math.min(6, Math.floor(el.clientWidth / 120)));
      if (c !== cols) return setCols(c);
      const box = (el.parentElement ?? el).getBoundingClientRect(); // 以外框为准，小路画在外框里
      const pts = [...el.querySelectorAll<HTMLElement>(".station")].map(
        (st) => {
          const r = st.getBoundingClientRect();
          return {
            x: r.left - box.left + r.width / 2,
            y: r.top - box.top + r.height / 2,
            r: r.width / 2,
          };
        },
      );
      setRoad({ w: box.width, h: box.height, pts });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cols, levels.length]);
  return (
    <section className="panel path-panel">
      <div className="panel-head">
        <h3 className="eyebrow">学习路线 · 课本单元</h3>
        <span className="legend">
          <i className="lg-seen" /> 已学 <i className="lg-done" /> 已掌握
        </span>
      </div>
      <div className="route-wrap">
        {road && (
          <RouteRoad
            {...road}
            cols={cols}
            walked={levels.map((l) => l.seen > 0)}
          />
        )}
        <ol
          className="route"
          ref={route}
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {levels.map((l, i) => {
            const seen = l.seen / Math.max(1, l.total);
            const done = l.mastered / Math.max(1, l.total);
            // 蛇形排列：单数行从左往右，双数行从右往左，换行处正好在上一个单元的正下方
            const row = Math.floor(i / cols);
            const col = row % 2 ? cols - (i % cols) : (i % cols) + 1;
            return (
              <li
                key={l.name}
                className={`${i === start ? "is-start" : ""} ${l.seen ? "is-on" : ""}`}
                style={{ gridRow: row + 1, gridColumn: col }}
              >
                <button
                  onClick={() => setOpenUnit(i)}
                  aria-label={`${l.name}，已学 ${l.seen} / ${l.total}`}
                >
                  <span
                    className="station"
                    style={
                      { "--seen": seen, "--done": done } as React.CSSProperties
                    }
                  >
                    <b>{unitShort(l.name)}</b>
                  </span>
                  <span className="station-name">{l.name}</span>
                  <span className="station-count">
                    {l.seen}
                    <small>/{l.total}</small>
                  </span>
                  {i === start && <span className="station-flag">起点</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <UnitSheet index={openUnit} onClose={() => setOpenUnit(null)} />
    </section>
  );
}

interface RoadGeo {
  w: number;
  h: number;
  pts: { x: number; y: number; r: number }[];
}

/**
 * 单元之间的小路：圆点虚线、微微下垂，中间一个小箭头指向下一个单元；行尾从外侧绕一道弯折到下一行。
 * 只是装饰，点不了（点在路上什么也不会发生）；走过的路段（下一个单元已经开始学）用暖黄色。
 */
function RouteRoad({
  w,
  h,
  pts,
  cols,
  walked,
}: RoadGeo & { cols: number; walked: boolean[] }) {
  const cell = w / cols;
  const segs = pts.slice(1).map((b, k) => {
    const a = pts[k];
    let d: string;
    let arrow: string;
    if (Math.abs(a.y - b.y) < 4) {
      // 同一行：从左圆边到右圆边，中间往下垂一点
      const dir = Math.sign(b.x - a.x) || 1;
      const x1 = a.x + dir * (a.r + 10);
      const x2 = b.x - dir * (b.r + 10);
      const mx = (x1 + x2) / 2;
      d = `M ${x1} ${a.y} Q ${mx} ${a.y + 12} ${x2} ${b.y}`;
      const my = a.y + 6;
      arrow = `M ${mx - dir * 4} ${my - 5} L ${mx + dir * 3} ${my} L ${mx - dir * 4} ${my + 5}`;
    } else {
      // 换行：在行尾外侧画一道弯，从上一个单元绕到正下方的下一个单元
      const side = a.x > w / 2 ? 1 : -1;
      const room = Math.max(10, cell / 2 - a.r - 4);
      const ax = a.x + side * (a.r + 6);
      const bx = b.x + side * (b.r + 6);
      const k1 = side * room * 1.35;
      d = `M ${ax} ${a.y} C ${ax + k1} ${a.y}, ${bx + k1} ${b.y}, ${bx} ${b.y}`;
      const tx = ax + side * room;
      const ty = (a.y + b.y) / 2;
      arrow = `M ${tx - 5} ${ty - 4} L ${tx} ${ty + 3} L ${tx + 5} ${ty - 4}`;
    }
    return { d, arrow, on: walked[k + 1] };
  });
  return (
    <svg
      className="route-road"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
    >
      {segs.map((s, i) => (
        <g key={i} className={s.on ? "is-walked" : ""}>
          <path className="road-hit" d={s.d} />
          <path className="road-dots" d={s.d} />
          <path className="road-arrow" d={s.arrow} />
        </g>
      ))}
    </svg>
  );
}

function Topics() {
  const atlas = useAtlas();
  const counts = useMemo(() => {
    const c = new Array(atlas.topics.length).fill(0);
    atlas.words.forEach((w) => c[w.topic]++);
    return c;
  }, [atlas]);
  return (
    <section className="topics-panel">
      <div className="panel-head">
        <h3 className="eyebrow">按词的类型浏览</h3>
        <button className="link" onClick={() => go({ page: "atlas" })}>
          打开图鉴
        </button>
      </div>
      <ul className="topic-tiles">
        {atlas.topics.map(([key, name], i) => (
          <li key={key}>
            <button
              onClick={() => go({ page: "atlas", topic: key, view: "grid" })}
            >
              <img
                src={`${BRAND}/topic-${key}.webp`}
                alt=""
                loading="lazy"
                onError={(e) => (e.currentTarget.style.visibility = "hidden")}
              />
              <span>
                <b>{name}</b>
                <small>{counts[i]} 个词</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
