/** 游戏化数据的结构和校验（不依赖 store，避免循环引用）。 */
import { FACTS } from "../lib/facts";
import { AMBIENCE } from "../lib/ambience";

/** 解锁一种插画主题要的碎片：天天打卡大约 35 天（老师定：比集齐音乐难，一个月出头一种） */
export const SKIN_COST = 100;
/** 已收集的冷知识卡种数 */
export const factKinds = (g: { facts: Record<string, number> }) => Object.keys(g.facts).length;
export const SKINS = [
  { id: "base", name: "默认主题", desc: "现在的插画" },
  { id: "fantasy", name: "幻想冒险主题", desc: "明亮奇幻的冒险插画" },
  { id: "agent", name: "特工任务风主题", desc: "侦察、探险的任务插画" },
  { id: "delta", name: "三角洲主题", desc: "硬核战术行动风的插画" },
  { id: "genshin", name: "原神主题", desc: "二次元奇幻冒险风的插画" },
] as const;
/** 环境音乐里免费的那一首，其余靠宝箱解锁。 */
export const FREE_MUSIC = "stars";
/** 宝箱能开出的环境音乐：除了免费的那首，其余都在 src/lib/ambience.ts 里，名字只在那里改 */
export const MUSIC = AMBIENCE.filter((a) => a.id !== FREE_MUSIC).map((a) => ({ id: a.id, name: a.label }));
/** 音乐列表的显示顺序：免费那首在最前，接着是已解锁的（按解锁先后），没解锁的按原顺序排在后面。 */
export function musicOrder<T extends { id: string }>(list: readonly T[], owned: readonly string[]): T[] {
  const rank = (id: string) => (id === FREE_MUSIC ? -1 : owned.includes(id) ? owned.indexOf(id) : owned.length);
  return [...list].sort((a, b) => rank(a.id) - rank(b.id));
}
export const FX = [
  { id: "meteor", name: "流星雨" },
  { id: "aurora", name: "极光" },
  { id: "firefly", name: "萤火" },
  { id: "snow", name: "星夜飘雪" },
  { id: "sakura", name: "樱花雨" },
  { id: "comet", name: "彗星" },
  { id: "bubble", name: "星泡泡" },
  { id: "nebula", name: "星云" },
  { id: "lantern", name: "孔明灯" },
  { id: "firework", name: "烟花" },
  { id: "ripple", name: "星环涟漪" },
] as const;
/** mystery：还没刮开；刮开后学生在「免一次作业券」和「小礼品一个」里二选一。stationery 只用于旧数据。 */
export const COUPONS = { mystery: "神秘奖励", homework: "免一次作业券", gift: "小礼品一个", stationery: "文具一份" } as const;
export const COUPON_CHOICES = ["homework", "gift"] as const;
/** 有效期：从获得那天算起 30 天（没刮开的券、免作业券）；小礼品选定后不过期 */
export const HOMEWORK_DAYS = 30;
export const couponExpiry = (c: { at: number }) => c.at + HOMEWORK_DAYS * 864e5;
/** 免作业券、没刮开的券都是 30 天；过期没刮开整张作废 */
export const isExpired = (c: { kind: string; at: number; redeemed?: number }, now = Date.now()) =>
  (c.kind === "homework" || c.kind === "mystery") && !c.redeemed && now > couponExpiry(c);
export type CouponKind = keyof typeof COUPONS;
export const MAX_PATCHES = 3;
/** 游客和自己注册的同学（不在老师名单里）：宝箱不出老师奖励券，出到的换成碎片 */
let couponsOff = false;
export const setCouponsOff = (v: boolean) => {
  couponsOff = v;
};
export const areCouponsOff = () => couponsOff;

export interface Coupon {
  id: string;
  kind: CouponKind;
  at: number;
  redeemed?: number;
}

export interface GameState {
  /** 完成了当天任务、拿到今日宝箱的日期（开不开都算） */
  earned: string[];
  /** 已开每日宝箱的日期 */
  daily: string[];
  /** 已开周宝箱的日期 */
  weekly: string[];
  /** 已开单元宝箱的单元名 */
  units: string[];
  /** 每开一个单元宝箱记一笔当天日期（一天最多开 UNIT_PER_DAY 个） */
  unitDays: string[];
  /** 用补签卡补上的日期 */
  patched: string[];
  shards: number;
  skins: string[];
  skin: string;
  music: string[];
  fx: string[];
  fxOn: string;
  /** 冷知识卡：已收集的卡号（值恒为 1，重复的换碎片） */
  facts: Record<string, number>;
  patches: number;
  coupons: Coupon[];
  /** 连续多少个宝箱没出稀有（保底用） */
  dry: number;
  /** 彩蛋宝箱（连点左上角图标）拿到了、放在宝库里还没开 */
  eggGot: boolean;
  /** 彩蛋宝箱开过了：每人只送一次 */
  egg: boolean;
  /** 挑战宝箱：拿到的日期（真题阅读第一次答对 4 题以上，一天最多 1 个） */
  challengeEarned: string[];
  /** 已开挑战宝箱的日期 */
  challenge: string[];
  /** 连成了星座的单元（记录名同单元宝箱，unitKey） */
  constellations: string[];
  /** 已领取奖励的成就徽章：徽章 id → 领取时间 */
  badges: Record<string, number>;
  /** 成就上线前就达成的徽章补发过了（补发只有一次，碎片有上限） */
  badgeInit: boolean;
}

export const emptyGame = (): GameState => ({
  earned: [],
  daily: [],
  weekly: [],
  units: [],
  unitDays: [],
  patched: [],
  shards: 0,
  skins: ["base"],
  skin: "base",
  music: [],
  fx: [],
  fxOn: "off",
  facts: {},
  patches: 0,
  coupons: [],
  dry: 0,
  eggGot: false,
  egg: false,
  challengeEarned: [],
  challenge: [],
  constellations: [],
  badges: {},
  badgeInit: false,
});

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const strs = (v: unknown, max = 1000) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(-max) : []);
const int = (v: unknown, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(hi, Math.round(v))) : 0);

export function sanitizeGame(v: unknown): GameState {
  const g = emptyGame();
  if (!isObj(v)) return g;
  g.daily = strs(v.daily, 800);
  // 开过的日子一定是完成过任务的日子
  g.earned = [...new Set([...strs(v.earned, 800), ...g.daily])].sort();
  g.weekly = strs(v.weekly, 200);
  g.units = strs(v.units, 100);
  g.unitDays = strs(v.unitDays, 100);
  g.constellations = strs(v.constellations, 200);
  g.patched = strs(v.patched, 200);
  g.shards = int(v.shards, 100000);
  g.skins = [...new Set(["base", ...strs(v.skins).filter((s) => SKINS.some((k) => k.id === s))])];
  g.skin = typeof v.skin === "string" && g.skins.includes(v.skin) ? v.skin : "base";
  g.music = strs(v.music).filter((s) => MUSIC.some((m) => m.id === s));
  g.fx = strs(v.fx).filter((s) => FX.some((m) => m.id === s));
  g.fxOn = typeof v.fxOn === "string" && g.fx.includes(v.fxOn) ? v.fxOn : "off";
  // 旧数据是卡号列表（每种 1 张），新数据是 卡号 → 张数
  if (Array.isArray(v.facts)) for (const x of v.facts) if (Number.isInteger(x) && x >= 0 && x < FACTS.length) g.facts[x] = 1;
  if (isObj(v.facts))
    for (const [k, n] of Object.entries(v.facts)) if (Number(k) >= 0 && Number(k) < FACTS.length && int(n, 1) > 0) g.facts[k] = 1;
  g.patches = int(v.patches, MAX_PATCHES);
  if (Array.isArray(v.coupons))
    g.coupons = v.coupons
      .filter((c): c is Coupon => isObj(c) && typeof c.id === "string" && (c.kind as string) in COUPONS && typeof c.at === "number")
      .map((c) => ({ id: c.id, kind: c.kind, at: c.at, ...(typeof c.redeemed === "number" ? { redeemed: c.redeemed } : {}) }));
  g.dry = int(v.dry, 100);
  g.egg = v.egg === true;
  g.eggGot = g.egg || v.eggGot === true;
  g.challenge = strs(v.challenge, 800);
  // 开过的日子一定是拿到过的日子
  g.challengeEarned = [...new Set([...strs(v.challengeEarned, 800), ...g.challenge])].sort();
  if (isObj(v.badges))
    for (const [k, t] of Object.entries(v.badges)) if (/^[\w-]{1,24}$/.test(k) && typeof t === "number" && Number.isFinite(t)) g.badges[k] = t;
  g.badgeInit = v.badgeInit === true;
  return g;
}

