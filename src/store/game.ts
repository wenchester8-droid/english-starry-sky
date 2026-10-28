/**
 * 游戏化：每日 / 周 / 单元宝箱，皮肤碎片，收藏品和老师奖励券。
 * 全部存在 progress.game 里，跟着学习进度一起保存和导出备份。
 */
import type { Atlas } from "../atlas/types";
import { FACTS } from "../lib/facts";
import { unitKey } from "../lib/unit";
import { areCouponsOff, COUPON_CHOICES, FX, isExpired, MAX_PATCHES, MUSIC, SKIN_COST, type CouponKind, type GameState } from "./gameState";
import { dayKey, store, type Progress } from "./store";

export * from "./gameState";

/* ---------- 什么时候能开宝箱 ---------- */

const shift = (k: string, d: number) => {
  const [y, m, dd] = k.split("-").map(Number);
  return dayKey(new Date(y, m - 1, dd + d));
};

/** 截至某天（含）连续完成任务几天，补签的日子也算。 */
export function chainTo(g: GameState, day = dayKey()) {
  const on = new Set([...g.earned, ...g.patched]);
  let n = 0;
  for (let k = day; on.has(k); k = shift(k, -1)) n++;
  return n;
}

/** 今天还没完成的话，算到昨天为止的连续天数。 */
export function currentChain(g: GameState) {
  const t = dayKey();
  return g.earned.includes(t) ? chainTo(g, t) : chainTo(g, shift(t, -1));
}

/** 昨天断了、前天还连着、手里有补签卡 → 可以补昨天。 */
export function canPatchYesterday(g: GameState) {
  const y = shift(dayKey(), -1);
  const on = new Set([...g.earned, ...g.patched]);
  return g.patches > 0 && !on.has(y) && on.has(shift(y, -1));
}

/** 完成当天任务时记一笔：今日宝箱到手，以后什么时候开都行。 */
export function markEarned() {
  const t = dayKey();
  store.progress((p) => (p.game.earned.includes(t) ? p : { ...p, game: { ...p.game, earned: [...p.game.earned, t] } }));
}

/** 单元过关线：单元里这么多比例的词「记住了」才送单元宝箱 */
export const UNIT_PASS = 0.9;
/** 记住了 = 学过以后隔一段时间再考又答对，进入了长期复习（st 2）；只是点过一遍不算 */
export const isPassed = (c?: { st: number }) => c?.st === 2;
export const unitPassNeed = (total: number) => Math.ceil(total * UNIT_PASS);
/** 单元宝箱一天最多开几个 */
export const UNIT_PER_DAY = 3;
export const unitLeftToday = (g: GameState, t = dayKey()) => Math.max(0, UNIT_PER_DAY - g.unitDays.filter((d) => d === t).length);

export function unitStatus(atlas: Atlas, p: Progress) {
  return atlas.cefr.map((name, i) => {
    let total = 0;
    let seen = 0;
    let passed = 0;
    for (const w of atlas.words)
      if (w.cefr === i) {
        total++;
        const c = p.cards[w.id];
        if (c) seen++;
        if (isPassed(c)) passed++;
      }
    const done = total > 0 && seen === total && passed >= unitPassNeed(total);
    const key = unitKey(atlas.book, name);
    return { name, key, total, seen, passed, done, ready: done && !p.game.units.includes(key), opened: p.game.units.includes(key) };
  });
}

export type ChestKind = "daily" | "weekly" | "unit" | "challenge";
export interface ChestTicket {
  kind: ChestKind;
  unit?: string;
  /** 今日 / 周 / 挑战宝箱是哪一天拿到的 */
  day?: string;
  /** 试玩：不占用今天的次数，可以无限开（只在开发版里出现） */
  free?: boolean;
  /** 彩蛋宝箱：连点左上角图标送的，每人只有一次 */
  egg?: boolean;
}

/** 现在可以开的所有宝箱：没开的今日宝箱、周宝箱都会一直留着。 */
export function readyChests(atlas: Atlas, p: Progress, dailyDone: boolean): ChestTicket[] {
  const g = p.game;
  const t = dayKey();
  const earned = dailyDone && !g.earned.includes(t) ? [...g.earned, t] : g.earned;
  const out: ChestTicket[] = [];
  const opened = new Set(g.daily);
  for (const d of earned) if (!opened.has(d)) out.push({ kind: "daily", day: d });
  const withToday = { ...g, earned };
  const weeklyOpened = new Set(g.weekly);
  // 补签补上的日子也算连续的一天，正好是第 7 天时周宝箱照给
  const counted = [...new Set([...earned, ...g.patched])].sort();
  for (const d of counted) if (!weeklyOpened.has(d) && chainTo(withToday, d) % 7 === 0) out.push({ kind: "weekly", day: d });
  // 单元宝箱一天最多 3 个：同时过关更多单元，剩下的明天再给
  for (const u of unitStatus(atlas, p).filter((u) => u.ready).slice(0, unitLeftToday(g, t))) out.push({ kind: "unit", unit: u.key });
  const challengeOpened = new Set(g.challenge);
  for (const d of g.challengeEarned) if (!challengeOpened.has(d)) out.push({ kind: "challenge", day: d });
  if (g.eggGot && !g.egg) out.push({ kind: "daily", egg: true });
  return out;
}

/* ---------- 星座：一个单元的词全部点亮，星图上连成星座 ---------- */

/** 连成星座送的碎片（特效已经集齐时） */
export const CONSTELLATION_SHARDS = 5;

/** 当前这一册里，词已经全部点亮（每个都学过）的单元 */
export function litUnits(atlas: Atlas, p: Pick<Progress, "cards">) {
  return atlas.cefr
    .map((name, i) => {
      const words = atlas.words.filter((w) => w.cefr === i);
      return { name, index: i, key: unitKey(atlas.book, name), lit: words.length > 0 && words.every((w) => p.cards[w.id]) };
    })
    .filter((u) => u.lit);
}

export interface ConstellationGift {
  key: string;
  name: string;
  /** 解锁的特效 id；特效集齐了就是碎片 */
  fx?: string;
  shards?: number;
}

/** 新连成的星座记下来，每个送一个还没有的星图特效（集齐了换碎片）。返回这次送了什么。 */
export function grantConstellations(units: { key: string; name: string }[], r: () => number = Math.random): ConstellationGift[] {
  const gifts: ConstellationGift[] = [];
  store.progress((p) => {
    const fresh = units.filter((u) => !p.game.constellations.includes(u.key));
    if (!fresh.length) return p;
    const g: GameState = { ...p.game, constellations: [...p.game.constellations, ...fresh.map((u) => u.key)] };
    for (const u of fresh) {
      const left = FX.filter((m) => !g.fx.includes(m.id));
      if (left.length) {
        const m = left[Math.floor(r() * left.length)];
        g.fx = [...g.fx, m.id];
        gifts.push({ key: u.key, name: u.name, fx: m.id });
      } else {
        g.shards += CONSTELLATION_SHARDS;
        gifts.push({ key: u.key, name: u.name, shards: CONSTELLATION_SHARDS });
      }
    }
    return { ...p, game: g };
  });
  return gifts;
}

/* ---------- 挑战模式 · 真题阅读 ---------- */

/** 挑战宝箱：一篇文章第一次做题，最多错 1 题（5 题对 4 题、六选五对 4 空）就给，一天最多 1 个（老师定） */
export const challengePass = (right: number, total: number) => total >= 2 && right >= total - 1;

/** 记下一篇文章的成绩：只有第一次算数。返回这次是不是第一次、有没有拿到挑战宝箱。 */
export function recordReading(id: string, right: number, total: number) {
  let first = false;
  let chest = false;
  store.progress((p) => {
    if (p.reading[id]) return p;
    first = true;
    const t = dayKey();
    let game = p.game;
    if (challengePass(right, total) && !game.challengeEarned.includes(t)) {
      chest = true;
      game = { ...game, challengeEarned: [...game.challengeEarned, t] };
    }
    return { ...p, game, reading: { ...p.reading, [id]: { at: Date.now(), right, total } } };
  });
  return { first, chest };
}

/** 今天的挑战宝箱拿过了没有（拿到就算，开不开都行） */
export const challengeEarnedToday = (g: GameState) => g.challengeEarned.includes(dayKey());

/** 彩蛋：把一个宝箱放进宝库（不直接弹出来）。已经拿过的返回 false */
export function grantEgg() {
  let ok = false;
  store.progress((p) => {
    if (p.game.eggGot || p.game.egg) return p;
    ok = true;
    return { ...p, game: { ...p.game, eggGot: true } };
  });
  return ok;
}

/** 优秀加成：这一天第一次作答的正确率到 90%、至少答了 20 题，今日宝箱碎片翻倍（照顾尖子生，老师定） */
export const EXCELLENT_ACC = 0.9;
export const EXCELLENT_MIN = 20;
export function isExcellent(p: Progress, day = dayKey()) {
  const d = p.days[day];
  return !!d && d.r >= EXCELLENT_MIN && d.c >= d.r * EXCELLENT_ACC;
}

/** 今天的任务算完成：今天答过题，而且今日旅程（复习 + 新词）都做完了。 */
export function isDailyDone(p: Progress, planLeft: number) {
  const active = p.session && !p.session.finished;
  return (p.days[dayKey()]?.r ?? 0) > 0 && planLeft === 0 && !active;
}

/* ---------- 开箱 ---------- */

export type Rarity = "common" | "rare" | "legend";
export interface Prize {
  rarity: Rarity;
  icon: "shard" | "fact" | "patch" | "music" | "fx" | "coupon";
  title: string;
  desc: string;
  /** 重复或超额时换成的碎片数 */
  converted?: number;
  /** 宝箱必给的皮肤碎片个数 */
  n?: number;
}

// 碎片个数从下面的格子里随机抽一格。画风从 90 碎片涨到 100 时，每箱平均也多给 1/9，攒够一种画风的天数不变：
// 今日/周宝箱平均 20/9 ≈ 2.2 个（原来 1–3 个平均 2）；单元宝箱平均 65/9 ≈ 7.2 个（原来 5–8 个平均 6.5）
// 挑战宝箱 2–4 个，平均 28/9 ≈ 3.1 个（老师定：比今日宝箱稍多）
const SMALL = [1, 1, 2, 2, 2, 3, 3, 3, 3];
const MID = [2, 2, 3, 3, 3, 3, 4, 4, 4];
const BIG = [5, 6, 6, 7, 7, 8, 8, 9, 9];
// 音乐单独按固定比例出：每次稀有奖励有 30% 是音乐，天天打卡平均每月集到约 3 首（老师定）；挑战宝箱出音乐的比例高一些
const MUSIC_SHARE = 0.3;
const RULES: Record<ChestKind, { shards: number[]; draws: number; rare: number; legend: number; forceRare?: boolean; music: number }> = {
  daily: { shards: SMALL, draws: 1, rare: 0.15, legend: 0.004, music: MUSIC_SHARE },
  weekly: { shards: SMALL, draws: 3, rare: 0.3, legend: 0.004, music: MUSIC_SHARE },
  unit: { shards: BIG, draws: 1, rare: 1, legend: 0.014, forceRare: true, music: MUSIC_SHARE },
  challenge: { shards: MID, draws: 1, rare: 0.25, legend: 0.004, music: 0.5 },
};
const PITY = 7;
const COUPONS_PER_MONTH = 3;

const sameMonth = (a: number, b: number) => {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth();
};

function drawLegend(g: GameState, now: number, r: () => number): Prize {
  // 不在老师名单里的同学（游客、自己注册的）：没有老师给兑换，换成碎片
  if (areCouponsOff()) {
    g.shards += 5;
    return { rarity: "legend", icon: "shard", title: "传说奖励 · 碎片 × 5", desc: "运气真好！开出了传说奖励，换成 5 个碎片。", converted: 5 };
  }
  // 每人每月最多 3 张，超出的换成碎片
  if (g.coupons.filter((c) => sameMonth(c.at, now)).length >= COUPONS_PER_MONTH) {
    g.shards += 5;
    return { rarity: "legend", icon: "coupon", title: "老师奖励券（本月已满）", desc: `这个月已经拿满 ${COUPONS_PER_MONTH} 张券了，这张换成 5 个碎片。`, converted: 5 };
  }
  const kind: CouponKind = "mystery";
  g.coupons = [...g.coupons, { id: `${now.toString(36)}-${Math.floor(r() * 1e6).toString(36)}`, kind, at: now }];
  return { rarity: "legend", icon: "coupon", title: "老师奖励券 · 神秘奖励", desc: "这是一张刮刮卡！打开右上角的宝库，刮开它，在两个奖励里选一个。免作业券一个月内有效。" };
}

export function drawRare(g: GameState, r: () => number, musicShare = MUSIC_SHARE): Prize {
  const pool: (() => Prize)[] = [];
  if (g.patches < MAX_PATCHES)
    pool.push(() => {
      g.patches++;
      return { rarity: "rare", icon: "patch", title: "补签卡", desc: "哪天忘了打卡，可以用它补上，连续天数不断。" };
    });
  const fx = FX.filter((m) => !g.fx.includes(m.id));
  if (fx.length)
    pool.push(() => {
      const m = fx[Math.floor(r() * fx.length)];
      g.fx = [...g.fx, m.id];
      return { rarity: "rare", icon: "fx", title: `星图特效 · ${m.name}`, desc: "在「我的宝库」里打开，星图上就会出现。" };
    });
  const music = MUSIC.filter((m) => !g.music.includes(m.id));
  if (music.length && r() < musicShare) {
    const m = music[Math.floor(r() * music.length)];
    g.music = [...g.music, m.id];
    return { rarity: "rare", icon: "music", title: `环境音乐 · ${m.name}`, desc: "右上角的耳机按钮里可以播放。" };
  }
  if (!pool.length) {
    g.shards += 3;
    return music.length
      ? { rarity: "rare", icon: "shard", title: "稀有奖励 · 碎片", desc: "补签卡已存满、星图特效已集齐，这次的稀有奖励换成 3 个碎片。", converted: 3 }
      : { rarity: "rare", icon: "shard", title: "稀有奖励（已集齐）", desc: "稀有奖励你已经全都有了，这次换成 3 个碎片。", converted: 3 };
  }
  return pool[Math.floor(r() * pool.length)]();
}

function drawCommon(g: GameState, r: () => number): Prize {
  const i = Math.floor(r() * FACTS.length);
  if (g.facts[i]) {
    g.shards += 1;
    return { rarity: "common", icon: "fact", title: "冷知识卡（重复）", desc: `「${FACTS[i].title}」这张你已经有了，换成 1 个碎片。`, converted: 1 };
  }
  g.facts = { ...g.facts, [i]: 1 };
  return { rarity: "common", icon: "fact", title: `冷知识卡 · ${FACTS[i].title}`, desc: FACTS[i].text };
}

/** 掷骰子开箱，返回这次开出的东西，并把结果存起来。 */
export function openChest(ticket: ChestTicket, r: () => number = Math.random): Prize[] {
  const now = Date.now();
  const rule = RULES[ticket.kind];
  let prizes: Prize[] = [];
  store.progress((p) => {
    const g: GameState = { ...p.game };
    const t = dayKey();
    if (ticket.free) {
      /* 试玩不记次数 */
    } else if (ticket.egg) {
      if (g.egg) return p;
      g.egg = true;
    } else if (ticket.kind === "daily") {
      const d = ticket.day ?? t;
      if (g.daily.includes(d)) return p;
      if (!g.earned.includes(d)) g.earned = [...g.earned, d];
      g.daily = [...g.daily, d];
    } else if (ticket.kind === "weekly") {
      const d = ticket.day ?? t;
      if (g.weekly.includes(d)) return p;
      g.weekly = [...g.weekly, d];
    } else if (ticket.kind === "challenge") {
      const d = ticket.day ?? t;
      if (g.challenge.includes(d) || !g.challengeEarned.includes(d)) return p;
      g.challenge = [...g.challenge, d];
    } else {
      if (!ticket.unit || g.units.includes(ticket.unit) || !unitLeftToday(g, t)) return p;
      g.units = [...g.units, ticket.unit];
      g.unitDays = [...g.unitDays, t];
    }
    const excellent = ticket.kind === "daily" && !ticket.free && !ticket.egg && isExcellent(p, ticket.day ?? t);
    const shards = rule.shards[Math.floor(r() * rule.shards.length)] * (excellent ? 2 : 1);
    g.shards += shards;
    const out: Prize[] = [
      excellent
        ? { rarity: "common", icon: "shard", title: `皮肤碎片 × ${shards}（优秀 ×2）`, desc: `那天正确率到了 ${EXCELLENT_ACC * 100}%，碎片翻倍！攒够 ${SKIN_COST} 个可以解锁一种新插画主题。`, n: shards }
        : { rarity: "common", icon: "shard", title: `皮肤碎片 × ${shards}`, desc: `攒够 ${SKIN_COST} 个可以解锁一种新插画主题。`, n: shards },
    ];
    let gotRare = false;
    for (let d = 0; d < rule.draws; d++) {
      const pity = d === 0 && g.dry >= PITY - 1;
      const x = r();
      if (!rule.forceRare && x < rule.legend) out.push(drawLegend(g, now, r));
      else if (rule.forceRare || pity || x < rule.legend + rule.rare) out.push(drawRare(g, r, rule.music));
      else {
        out.push(drawCommon(g, r));
        continue;
      }
      gotRare = true;
    }
    // 单元宝箱：必出一样稀有之外，另有 1% 出老师奖励券
    if (rule.forceRare && r() < rule.legend) out.push(drawLegend(g, now, r));
    g.dry = gotRare ? 0 : g.dry + 1;
    // 展示顺序：传说 → 稀有 → 普通
    const rank = { legend: 0, rare: 1, common: 2 };
    prizes = out.map((x, i) => ({ x, i })).sort((a, b) => rank[a.x.rarity] - rank[b.x.rarity] || a.i - b.i).map(({ x }) => x);
    return { ...p, game: g };
  });
  return prizes;
}

/* ---------- 宝库里的操作 ---------- */

const updateGame = (fn: (g: GameState) => GameState) => store.progress((p) => ({ ...p, game: fn(p.game) }));

export function unlockSkin(id: string) {
  updateGame((g) => (g.skins.includes(id) || g.shards < SKIN_COST ? g : { ...g, shards: g.shards - SKIN_COST, skins: [...g.skins, id], skin: id }));
}
export const pickSkin = (id: string) => updateGame((g) => (g.skins.includes(id) ? { ...g, skin: id } : g));
export const pickFx = (id: string) => updateGame((g) => ({ ...g, fxOn: id === "off" || g.fx.includes(id) ? id : g.fxOn }));
/** 刮开后二选一，选定就不能改 */
export const chooseCoupon = (id: string, kind: (typeof COUPON_CHOICES)[number]) =>
  updateGame((g) => ({ ...g, coupons: g.coupons.map((c) => (c.id === id && c.kind === "mystery" && !isExpired(c) ? { ...c, kind } : c)) }));
export const redeemCoupon = (id: string) => updateGame((g) => ({ ...g, coupons: g.coupons.map((c) => (c.id === id && !isExpired(c) ? { ...c, redeemed: Date.now() } : c)) }));
export function patchYesterday() {
  updateGame((g) => (canPatchYesterday(g) ? { ...g, patches: g.patches - 1, patched: [...g.patched, shift(dayKey(), -1)] } : g));
}

/** 一次开很多个宝箱时，把奖励合并成一张汇总：传说、稀有逐条列出，碎片和冷知识卡合并。 */
export function summarize(all: Prize[]): Prize[] {
  const rank = { legend: 0, rare: 1, common: 2 };
  const special = all.filter((p) => p.rarity !== "common" && !p.converted).sort((a, b) => rank[a.rarity] - rank[b.rarity]);
  const converted = all.reduce((n, p) => n + (p.converted ?? 0), 0);
  const shards = all.reduce((n, p) => n + (p.n ?? 0), 0) + converted;
  const facts = all.filter((p) => p.icon === "fact" && !p.converted);
  const out: Prize[] = [...special];
  out.push({
    rarity: "common",
    icon: "shard",
    title: `皮肤碎片 共 ${shards} 个`,
    desc: converted ? `其中 ${converted} 个是重复的奖励换来的。` : `攒够 ${SKIN_COST} 个可以解锁一种新插画主题。`,
  });
  if (facts.length)
    out.push({
      rarity: "common",
      icon: "fact",
      title: `新冷知识卡 ${facts.length} 张`,
      desc: facts.map((p) => `「${p.title.replace("冷知识卡 · ", "")}」`).join(""),
    });
  return out;
}
