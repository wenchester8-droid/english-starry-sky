/**
 * 成就徽章：全部从已有的学习记录算出来，不另外记数据，所以以前的进度也能补算。
 * 老师定：不分金银铜，每个成就就是一枚徽章；同一系列的几枚颜色各不相同（越难颜色越深越暖）。共 100 枚。
 * 奖励按难度悄悄配：容易 5 碎片、中等 15 碎片、很难 30 碎片 + 1 个稀有奖励。不出老师奖励券。
 * 徽章 id 就是美工交图的文件名（徽章设计需求.md），已经上线的 id 不要改。
 */
import { FACTS } from "../lib/facts";
import { chainTo, drawRare, factKinds, FX, isExcellent, isPassed, MUSIC, SKINS, type GameState, type Prize } from "./game";
import { store, type Progress } from "./store";

export type Metric =
  | "streak"
  | "checkins"
  | "hours"
  | "answers"
  | "remember"
  | "excellent"
  | "perfect"
  | "units"
  | "stars"
  | "reading"
  | "readingFull"
  | "challenges"
  | "readDays"
  | "readMaxDay"
  | "wpm"
  | "typing"
  | "dictation"
  | "facts"
  | "music"
  | "fx"
  | "skins"
  | "chests"
  | "redeemed"
  | "egg"
  | "patched"
  | "scratched"
  | "dayHours"
  | "dayNew"
  | "dayRight";

export type Level = 1 | 2 | 3;
/** 徽章墙上的大分组 */
export const GROUPS = ["学习", "挑战", "练习", "收藏", "隐藏"] as const;
export type Group = (typeof GROUPS)[number];

export interface Series {
  id: string;
  group: Group;
  name: string;
  /** 进度的单位，空的话不显示「x/y」 */
  unit: string;
}

export interface Badge {
  id: string;
  series: string;
  name: string;
  /** 达成条件（隐藏成就达成前不显示） */
  desc: string;
  metric: Metric;
  need: number;
  level: Level;
  color: string;
  hidden?: boolean;
}

/** 颜色阶梯：从易到难 草绿 → 青绿 → 天蓝 → 靛蓝 → 紫 → 玫红 → 火红 → 琥珀 */
export const LADDER = [
  ["草绿", "#5f9f52"],
  ["青绿", "#23948a"],
  ["天蓝", "#3f8cc4"],
  ["靛蓝", "#4f63c4"],
  ["紫", "#8662cf"],
  ["玫红", "#cf5c94"],
  ["火红", "#d8542f"],
  ["琥珀", "#c98a1c"],
] as const;
/** 一个系列 n 枚，均匀取阶梯上的颜色；不满 8 枚的不用最后的琥珀 */
const colorAt = (i: number, n: number) => {
  if (n === 1) return LADDER[2][1];
  const last = n >= 8 ? 7 : 6;
  return LADDER[Math.round((i * last) / (n - 1))][1];
};

type Item = [need: number, name: string, level: Level, id?: string];
interface Def extends Series {
  metric: Metric;
  desc: (n: number) => string;
  items: Item[];
}

const DEFS: Def[] = [
  /* ---------- 学习 ---------- */
  {
    id: "streak", group: "学习", name: "坚持打卡", unit: "天", metric: "streak",
    desc: (n) => `连续完成每日任务 ${n} 天`,
    items: [[3, "三天不断", 1], [7, "坚持一周", 1], [14, "两周不停", 1], [30, "月度坚持", 2], [60, "两月如一", 2], [100, "百日不辍", 3], [200, "持之以恒", 3], [365, "一年如一日", 3]],
  },
  {
    id: "checkins", group: "学习", name: "累计打卡", unit: "天", metric: "checkins",
    desc: (n) => `累计完成每日任务 ${n} 天（不用连续）`,
    items: [[10, "十天之约", 1], [30, "积少成多", 1], [60, "日积月累", 2], [100, "百日之功", 2], [200, "两百天", 3], [300, "三百天", 3]],
  },
  {
    id: "hours", group: "学习", name: "学习时长", unit: "小时", metric: "hours",
    desc: (n) => `累计学习 ${n} 小时`,
    items: [[1, "初入门", 1], [10, "渐入佳境", 2], [30, "学而不厌", 2], [50, "五十小时", 3], [100, "百小时", 3]],
  },
  {
    id: "answers", group: "学习", name: "答题数", unit: "题", metric: "answers",
    desc: (n) => `累计答题 ${n} 道（只算第一次作答）`,
    items: [[100, "百题斩", 1], [500, "五百题", 1], [1000, "千题达人", 2], [3000, "三千题", 2], [5000, "五千题", 3], [10000, "万题王者", 3]],
  },
  {
    id: "remember", group: "学习", name: "记住单词", unit: "个词", metric: "remember",
    desc: (n) => `记住 ${n} 个词（隔段时间再考又答对）`,
    items: [[50, "小有积累", 1], [100, "百词斩", 1], [200, "词汇达人", 2], [500, "过目不忘", 2], [800, "八百词", 2], [1000, "千词在胸", 3], [1500, "一千五百词", 3], [2000, "词汇大师", 3]],
  },
  {
    id: "excellent", group: "学习", name: "优秀的一天", unit: "天", metric: "excellent",
    desc: (n) => (n === 1 ? "一天答 20 题以上，第一次作答正确率 90% 以上" : `有 ${n} 天做到「优秀的一天」`),
    items: [[1, "优秀的一天", 1], [5, "五天优秀", 1], [10, "十天优秀", 2], [30, "常胜学霸", 2], [60, "六十天优秀", 3], [100, "百日优秀", 3]],
  },
  {
    id: "perfect", group: "学习", name: "满分一天", unit: "天", metric: "perfect",
    desc: (n) => (n === 1 ? "一天答 20 题以上，第一次作答全部正确" : `有 ${n} 天做到「满分一天」`),
    items: [[1, "满分一天", 1], [5, "五次满分", 2], [20, "满分专业户", 3]],
  },
  {
    id: "units", group: "学习", name: "单元过关", unit: "个单元", metric: "units",
    desc: (n) => (n === 1 ? "一个单元 90% 的词都记住了" : `${n} 个单元过关`),
    items: [[1, "首个单元过关", 1], [3, "三关连过", 1], [5, "五关连过", 2], [10, "一册通关", 2], [20, "两册通关", 3], [30, "三册通关", 3]],
  },
  {
    id: "stars", group: "学习", name: "点亮星座", unit: "个星座", metric: "stars",
    desc: (n) => (n === 1 ? "一个单元的词全部学过，连成星座" : `连成 ${n} 个星座`),
    items: [[1, "第一个星座", 1], [5, "星光点点", 1], [10, "星河初现", 2], [20, "满天星斗", 2], [40, "星空之主", 3]],
  },

  /* ---------- 挑战（真题阅读馆） ---------- */
  {
    id: "reading", group: "挑战", name: "真题阅读", unit: "篇", metric: "reading",
    desc: (n) => (n === 1 ? "第一次做完一篇真题阅读" : `做完 ${n} 篇真题阅读`),
    items: [[1, "初读真题", 1], [5, "五篇在手", 1], [10, "阅读小能手", 1], [30, "真题达人", 2], [50, "五十篇", 2], [100, "百篇阅读", 3], [200, "阅读大师", 3]],
  },
  {
    id: "readingFull", group: "挑战", name: "一题不错", unit: "篇", metric: "readingFull",
    desc: (n) => (n === 1 ? "一篇真题阅读第一次做就全对" : `${n} 篇真题阅读第一次做就全对`),
    items: [[1, "一题不错", 1], [5, "五篇全对", 2], [10, "十篇全对", 2], [30, "阅读满分王", 3]],
  },
  {
    id: "challenges", group: "挑战", name: "挑战宝箱", unit: "个", metric: "challenges",
    desc: (n) => (n === 1 ? "第一次拿到挑战宝箱（一篇文章最多错 1 题）" : `累计拿到 ${n} 个挑战宝箱`),
    items: [[1, "挑战成功", 1], [10, "十次挑战", 2], [30, "挑战王者", 3]],
  },
  {
    id: "readDays", group: "挑战", name: "阅读习惯", unit: "天", metric: "readDays",
    desc: (n) => `有 ${n} 天做过真题阅读`,
    items: [[7, "一周书香", 1], [30, "阅读成习惯", 2]],
  },
  {
    id: "readMaxDay", group: "挑战", name: "一口气", unit: "篇", metric: "readMaxDay",
    desc: (n) => `一天之内做完 ${n} 篇真题阅读`,
    items: [[3, "一口气三篇", 1]],
  },

  /* ---------- 练习（打字、听写） ---------- */
  {
    id: "wpm", group: "练习", name: "打字速度", unit: "词/分", metric: "wpm",
    desc: (n) => `打字练习速度到每分钟 ${n} 词（正确率 90% 以上）`,
    items: [[20, "键盘新手", 1], [30, "手指灵活", 1], [40, "指尖如飞", 2], [60, "键盘侠", 3]],
  },
  {
    id: "typing", group: "练习", name: "打字练习", unit: "次", metric: "typing",
    desc: (n) => `完成 ${n} 次打字练习（单词、句子、听写都算）`,
    items: [[10, "勤练十次", 1], [50, "五十次", 2], [100, "百练成钢", 3]],
  },
  {
    id: "dictation", group: "练习", name: "听写", unit: "次", metric: "dictation",
    desc: (n) => `完成 ${n} 次听写（网页听写或纸笔听写）`,
    items: [[10, "顺风耳", 2]],
  },

  /* ---------- 收藏 ---------- */
  {
    id: "facts", group: "收藏", name: "冷知识卡", unit: "种", metric: "facts",
    desc: (n) => (n >= FACTS.length ? "集齐全部冷知识卡" : `集到 ${n} 种冷知识卡`),
    items: [[50, "小小好奇心", 1], [100, "好奇宝宝", 1], [300, "博闻强识", 2], [600, "百科全书", 2], [FACTS.length, "冷知识之王", 3, "facts999"]],
  },
  {
    id: "music", group: "收藏", name: "环境音乐", unit: "首", metric: "music",
    desc: (n) => (n >= MUSIC.length ? "集齐全部环境音乐" : `宝箱里开出 ${n} 首环境音乐`),
    items: [[5, "爱听音乐", 1], [15, "音乐收藏家", 2], [MUSIC.length, "知音", 3, "musicAll"]],
  },
  {
    id: "fx", group: "收藏", name: "星图特效", unit: "种", metric: "fx",
    desc: () => "集齐全部星图特效",
    items: [[FX.length, "星图大师", 2, "fxAll"]],
  },
  {
    id: "skins", group: "收藏", name: "插画主题", unit: "种", metric: "skins",
    desc: (n) => (n >= SKINS.length - 1 ? "解锁全部插画主题" : n === 1 ? "解锁第一种新插画主题" : `解锁 ${n} 种新插画主题`),
    items: [[1, "焕然一新", 1, "skin1"], [2, "换个心情", 2], [SKINS.length - 1, "主题收藏家", 3, "skinsAll"]],
  },
  {
    id: "chests", group: "收藏", name: "开宝箱", unit: "个", metric: "chests",
    desc: (n) => `累计打开 ${n} 个宝箱`,
    items: [[10, "开箱新手", 1], [50, "开箱达人", 2], [100, "百宝箱", 3]],
  },
  {
    id: "redeemed", group: "收藏", name: "老师奖励券", unit: "张", metric: "redeemed",
    desc: () => "用掉一张老师奖励券（老师确认兑换）",
    items: [[1, "说到做到", 2]],
  },
];

/** 隐藏成就：达成前只显示问号，各有各的条件，颜色各不相同 */
const HIDDEN: Omit<Badge, "series" | "level" | "hidden">[] = [
  { id: "egg", name: "眼疾手快", desc: "找到了藏起来的彩蛋宝箱", metric: "egg", need: 1, color: LADDER[1][1] },
  { id: "patched", name: "失而复得", desc: "用补签卡补上了断掉的一天", metric: "patched", need: 1, color: LADDER[5][1] },
  { id: "scratched", name: "幸运儿", desc: "刮开了一张老师奖励券", metric: "scratched", need: 1, color: LADDER[7][1] },
  { id: "dayHours", name: "废寝忘食", desc: "一天学习超过 1 小时", metric: "dayHours", need: 1, color: LADDER[6][1] },
  { id: "dayNew", name: "如饥似渴", desc: "一天学了 50 个新词", metric: "dayNew", need: 50, color: LADDER[3][1] },
  { id: "dayRight", name: "百发百中", desc: "一天第一次作答答对 100 题", metric: "dayRight", need: 100, color: LADDER[4][1] },
];

export const SERIES: Series[] = [
  ...DEFS.map(({ id, group, name, unit }) => ({ id, group, name, unit })),
  { id: "hidden", group: "隐藏", name: "隐藏成就", unit: "" },
];

export const BADGES: Badge[] = [
  ...DEFS.flatMap((s) =>
    s.items.map(([need, name, level, id], i) => ({ id: id ?? `${s.id}${need}`, series: s.id, name, desc: s.desc(need), metric: s.metric, need, level, color: colorAt(i, s.items.length) })),
  ),
  ...HIDDEN.map((h) => ({ ...h, series: "hidden", level: 1 as Level, hidden: true })),
];

export const REWARD: Record<Level, number> = { 1: 5, 2: 15, 3: 30 };
/** 成就上线前就达成的徽章一起补发，碎片最多这么多（防止老用户一下子解锁好几种画风） */
export const BACKFILL_CAP = 100;
/** 打字速度只看这些模式（纸笔听写不计速度），正确率要到 90% */
const WPM_ACC = 90;

/** 历史上最长的连续打卡天数（补签的日子也算） */
function bestStreak(g: GameState) {
  const days = [...new Set([...g.earned, ...g.patched])].sort();
  let best = 0;
  for (const d of days) best = Math.max(best, chainTo(g, d));
  return best;
}

const localDay = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
const max = (xs: number[]) => xs.reduce((a, b) => Math.max(a, b), 0);

export function metrics(p: Progress): Record<Metric, number> {
  const g = p.game;
  const days = Object.values(p.days);
  const reads = Object.values(p.reading);
  const readPerDay = new Map<string, number>();
  for (const r of reads) readPerDay.set(localDay(r.at), (readPerDay.get(localDay(r.at)) ?? 0) + 1);
  return {
    streak: bestStreak(g),
    checkins: new Set([...g.earned, ...g.patched]).size,
    hours: Math.floor(days.reduce((s, d) => s + d.t, 0) / 360) / 10,
    answers: days.reduce((s, d) => s + d.r, 0),
    remember: Object.values(p.cards).filter(isPassed).length,
    excellent: Object.keys(p.days).filter((k) => isExcellent(p, k)).length,
    perfect: days.filter((d) => d.r >= 20 && d.c >= d.r).length,
    units: g.units.length,
    stars: g.constellations.length,
    reading: reads.length,
    readingFull: reads.filter((r) => r.right >= r.total).length,
    challenges: g.challengeEarned.length,
    readDays: readPerDay.size,
    readMaxDay: max([...readPerDay.values()]),
    wpm: max(p.typing.filter((t) => t.mode !== "paper" && t.accuracy >= WPM_ACC).map((t) => t.wpm)),
    typing: p.typing.length,
    dictation: p.typing.filter((t) => t.mode === "dictation" || t.mode === "paper").length,
    facts: factKinds(g),
    music: g.music.length,
    fx: g.fx.length,
    skins: g.skins.length - 1,
    chests: g.daily.length + g.weekly.length + g.units.length + g.challenge.length + Number(g.egg),
    redeemed: g.coupons.filter((c) => c.redeemed).length,
    egg: Number(g.egg),
    patched: Number(g.patched.length > 0),
    scratched: Number(g.coupons.some((c) => c.kind !== "mystery")),
    dayHours: Number(days.some((d) => d.t >= 3600)),
    dayNew: max(days.map((d) => d.n)),
    dayRight: max(days.map((d) => d.c)),
  };
}

export type BadgeState = Badge & { value: number; got: boolean; claimed: boolean };

export function badgeStates(p: Progress): BadgeState[] {
  const m = metrics(p);
  return BADGES.map((x) => {
    const value = m[x.metric];
    return { ...x, value, got: value >= x.need, claimed: x.id in p.game.badges };
  });
}

/** 达成了、还没领奖励的徽章（补发之前，所有已达成的都算在补发里） */
export const pendingBadges = (p: Progress) => badgeStates(p).filter((x) => x.got && !x.claimed);

export interface BadgeReward {
  badges: Badge[];
  shards: number;
  rare: Prize[];
}

/** 领取一枚徽章的奖励。补发之前不能单个领，要先一起补发。 */
export function claimBadge(id: string, r: () => number = Math.random): BadgeReward | null {
  let out: BadgeReward | null = null;
  store.progress((p) => {
    if (!p.game.badgeInit) return p;
    const x = pendingBadges(p).find((s) => s.id === id);
    if (!x) return p;
    const g: GameState = { ...p.game, badges: { ...p.game.badges, [id]: Date.now() } };
    const shards = REWARD[x.level];
    g.shards += shards;
    const rare = x.level === 3 ? [drawRare(g, r)] : [];
    out = { badges: [x], shards, rare };
    return { ...p, game: g };
  });
  return out;
}

/** 补发：成就上线前就达成的徽章一次全部点亮，只给碎片、最多 BACKFILL_CAP 个，不给稀有奖励。只能补发一次。 */
export function claimBackfill(): BadgeReward | null {
  let out: BadgeReward | null = null;
  store.progress((p) => {
    if (p.game.badgeInit) return p;
    const list = pendingBadges(p);
    const now = Date.now();
    const shards = Math.min(BACKFILL_CAP, list.reduce((s, x) => s + REWARD[x.level], 0));
    const badges = { ...p.game.badges };
    for (const x of list) badges[x.id] = now;
    out = { badges: list, shards, rare: [] };
    return { ...p, game: { ...p.game, badges, badgeInit: true, shards: p.game.shards + shards } };
  });
  return out;
}
