/**
 * 游戏规则演练：模拟学生的各种用法，逐条核对宝箱、碎片、奖励券、补签、音乐等规则。
 * 运行：npm test
 */
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

// store 在浏览器里运行，测试时补上它用到的 window / document
const g = globalThis as unknown as Record<string, unknown>;
g.window ??= { setTimeout, clearTimeout, addEventListener() {} };
g.document ??= { addEventListener() {}, visibilityState: "visible" };

const { store, emptyProgress, dayKey, sanitizeProgress } = await import("./store");
const game = await import("./game");
const { FACTS } = await import("../lib/facts");
type Atlas = Parameters<typeof game.readyChests>[0];

const DAY = 864e5;
const key = (offset: number) => dayKey(new Date(Date.now() + offset * DAY));

/** 一个只有两个单元、每单元 3 个词的小词库 */
const atlas = {
  cefr: ["Unit A", "Unit B"],
  words: [0, 0, 0, 1, 1, 1].map((cefr, i) => ({ id: `w${i}`, cefr })),
} as unknown as Atlas;
const card = { due: Date.now() + DAY, s: 1, d: 5, el: 0, sd: 0, ls: 0, reps: 1, lapses: 0, st: 1 as const, seen: Date.now() };
/** 隔段时间复习又答对、进入长期复习的词 */
const kept = { ...card, st: 2 as const, reps: 2 };

/** 固定顺序的「骰子」，用完以后一直给 0.99（= 什么都不中） */
const dice = (...xs: number[]) => () => (xs.length ? xs.shift()! : 0.99);

beforeEach(() => store.progress(() => emptyProgress("test")));
const G = () => store.get().progress.game;
const setGame = (patch: Partial<ReturnType<typeof G>>) => store.progress((p) => ({ ...p, game: { ...p.game, ...patch } }));

/* ---------- 今日宝箱 ---------- */

test("今日任务没做完：没有今日宝箱", () => {
  assert.equal(game.readyChests(atlas, store.get().progress, false).filter((t) => t.kind === "daily").length, 0);
});

test("今日任务做完：有 1 个今日宝箱；开过以后不能再开", () => {
  let ready = game.readyChests(atlas, store.get().progress, true);
  const daily = ready.filter((t) => t.kind === "daily");
  assert.equal(daily.length, 1);
  assert.ok(game.openChest(daily[0], dice()).length > 0);
  assert.equal(game.openChest(daily[0], dice()).length, 0, "同一个宝箱第二次开不能再给东西");
  ready = game.readyChests(atlas, store.get().progress, true);
  assert.equal(ready.filter((t) => t.kind === "daily").length, 0);
});

test("没开的今日宝箱会攒着，几天的都能开", () => {
  setGame({ earned: [key(-3), key(-2), key(-1)] });
  const daily = game.readyChests(atlas, store.get().progress, false).filter((t) => t.kind === "daily");
  assert.equal(daily.length, 3);
});

/* ---------- 周宝箱、连续天数、补签 ---------- */

test("连续完成 7 天给 1 个周宝箱，14 天给 2 个", () => {
  setGame({ earned: Array.from({ length: 14 }, (_, i) => key(i - 13)) });
  const weekly = game.readyChests(atlas, store.get().progress, false).filter((t) => t.kind === "weekly");
  assert.equal(weekly.length, 2);
});

test("中间断一天，周宝箱要重新数", () => {
  const days = Array.from({ length: 8 }, (_, i) => key(i - 8)).filter((_, i) => i !== 3); // 断在第 4 天
  setGame({ earned: days });
  assert.equal(game.readyChests(atlas, store.get().progress, false).filter((t) => t.kind === "weekly").length, 0);
});

test("补签：昨天忘了，用补签卡补上后连续天数不断", () => {
  setGame({ earned: [key(-3), key(-2)], patches: 1 });
  assert.equal(game.canPatchYesterday(G()), true);
  game.patchYesterday();
  assert.equal(G().patches, 0);
  assert.equal(game.chainTo(G(), key(-1)), 3);
  assert.equal(game.canPatchYesterday(G()), false, "补过就不能再补");
});

test("补签补上的那天正好是第 7 天，周宝箱不能丢", () => {
  // 前 6 天都完成，第 7 天（昨天）忘了，今天补签
  setGame({ earned: Array.from({ length: 6 }, (_, i) => key(i - 7)), patches: 1 });
  game.patchYesterday();
  const weekly = game.readyChests(atlas, store.get().progress, false).filter((t) => t.kind === "weekly");
  assert.equal(weekly.length, 1, "连续 7 天（含补签的一天）应该给周宝箱");
});

test("没有补签卡、或者断了两天，不能补签", () => {
  setGame({ earned: [key(-3), key(-2)], patches: 0 });
  assert.equal(game.canPatchYesterday(G()), false);
  setGame({ earned: [key(-4)], patches: 2 });
  assert.equal(game.canPatchYesterday(G()), false);
});

/* ---------- 单元宝箱 ---------- */

test("单元过关送 1 个单元宝箱，只送一次", () => {
  store.progress((p) => ({ ...p, cards: { w0: kept, w1: kept } }));
  assert.equal(game.readyChests(atlas, store.get().progress, false).filter((t) => t.kind === "unit").length, 0, "没学完不给");
  store.progress((p) => ({ ...p, cards: { ...p.cards, w2: kept } }));
  const unit = game.readyChests(atlas, store.get().progress, false).filter((t) => t.kind === "unit");
  assert.equal(unit.length, 1);
  game.openChest(unit[0], dice());
  assert.equal(game.readyChests(atlas, store.get().progress, false).filter((t) => t.kind === "unit").length, 0);
});

test("单元里的词只点过一遍、没记住：不给单元宝箱", () => {
  store.progress((p) => ({ ...p, cards: { w0: card, w1: card, w2: card } }));
  assert.equal(game.readyChests(atlas, store.get().progress, false).filter((t) => t.kind === "unit").length, 0);
  // 3 个词要记住 ceil(2.7) = 3 个，差一个也不行
  store.progress((p) => ({ ...p, cards: { w0: kept, w1: kept, w2: card } }));
  assert.equal(game.readyChests(atlas, store.get().progress, false).filter((t) => t.kind === "unit").length, 0);
});

test("单元宝箱一天最多 3 个：第 4 个明天才给", () => {
  // 4 个单元、每单元 1 个词，全都记住了
  const big = { cefr: ["U1", "U2", "U3", "U4"], words: [0, 1, 2, 3].map((cefr, i) => ({ id: `w${i}`, cefr })) } as unknown as Atlas;
  store.progress((p) => ({ ...p, cards: Object.fromEntries(["w0", "w1", "w2", "w3"].map((id) => [id, kept])) }));
  const units = () => game.readyChests(big, store.get().progress, false).filter((t) => t.kind === "unit");
  assert.equal(units().length, 3, "同一天只摆出 3 个");
  for (const t of units()) game.openChest(t, dice());
  assert.equal(units().length, 0, "今天开满了");
  assert.equal(game.openChest({ kind: "unit", unit: "U4" }, dice()).length, 0, "硬开也开不出");
  setGame({ unitDays: G().unitDays.map(() => key(-1)) });
  assert.equal(units().length, 1, "第二天给第 4 个");
});

test("优秀加成：当天答满 20 题、正确率 90%，今日宝箱碎片翻倍", () => {
  const t = dayKey();
  const shardsOf = (r: number, c: number) => {
    store.progress(() => ({ ...emptyProgress("test"), days: { [t]: { r, c, n: 0, t: 0 } } }));
    return game.openChest({ kind: "daily", day: t }, dice(0.99, 0.99)).find((p) => p.n)!.n!;
  };
  assert.equal(shardsOf(20, 18), 6, "20 题对 18（90%）→ 3×2");
  assert.equal(shardsOf(20, 17), 3, "85% 不翻倍");
  assert.equal(shardsOf(10, 10), 3, "题太少不翻倍");
  // 周宝箱不翻倍
  store.progress(() => ({ ...emptyProgress("test"), days: { [t]: { r: 30, c: 30, n: 0, t: 0 } } }));
  assert.equal(game.openChest({ kind: "weekly", day: t }, dice(0.99)).find((p) => p.n)!.n!, 3);
});

test("单元宝箱：碎片 5–9 个，必出一样稀有", () => {
  store.progress((p) => ({ ...p, cards: { w0: kept, w1: kept, w2: kept } }));
  const [t] = game.readyChests(atlas, store.get().progress, false).filter((x) => x.kind === "unit");
  const before = G().shards;
  const prizes = game.openChest(t, dice(0.5, 0.9, 0.1));
  const base = prizes.find((p) => p.n)!.n!;
  assert.ok(base >= 5 && base <= 9);
  assert.ok(G().shards >= before + base);
  assert.ok(prizes.some((p) => p.rarity === "rare"));
});

/* ---------- 保底 ---------- */

test("连续 6 个宝箱没出稀有，第 7 个一定出稀有", () => {
  for (let i = 0; i < 6; i++) game.openChest({ kind: "daily", free: true }, dice(0.5, 0.99, 0.5));
  assert.equal(G().dry, 6);
  const prizes = game.openChest({ kind: "daily", free: true }, dice(0.5, 0.99, 0.5, 0.5));
  assert.ok(prizes.some((p) => p.rarity !== "common"), "第 7 个必出稀有");
  assert.equal(G().dry, 0);
});

/* ---------- 老师奖励券 ---------- */

test("奖励券：游客和自己注册的同学开不出券，换成 5 个碎片", () => {
  game.setCouponsOff(true);
  try {
    const before = G().shards;
    const got = game.openChest({ kind: "daily", free: true }, dice(0.5, 0.001));
    assert.equal(G().coupons.length, 0);
    assert.ok(got.some((p) => p.rarity === "legend" && p.converted === 5));
    assert.ok(G().shards >= before + 5);
  } finally {
    game.setCouponsOff(false);
  }
});

test("奖励券：开出来是没刮开的神秘券，30 天内刮开二选一", () => {
  game.openChest({ kind: "daily", free: true }, dice(0.5, 0.001));
  const [c] = G().coupons;
  assert.equal(c.kind, "mystery");
  game.chooseCoupon(c.id, "homework");
  assert.equal(G().coupons[0].kind, "homework");
  game.chooseCoupon(c.id, "gift");
  assert.equal(G().coupons[0].kind, "homework", "选定以后不能改");
});

test("每人每月最多 3 张券，第 4 张换成 5 个碎片", () => {
  for (let i = 0; i < 3; i++) game.openChest({ kind: "daily", free: true }, dice(0.5, 0.001));
  assert.equal(G().coupons.length, 3);
  const before = G().shards;
  const prizes = game.openChest({ kind: "daily", free: true }, dice(0.5, 0.001));
  assert.equal(G().coupons.length, 3);
  const conv = prizes.find((p) => p.icon === "coupon");
  assert.equal(conv?.converted, 5);
  assert.equal(G().shards, before + prizes.find((p) => p.n)!.n! + 5);
});

test("上个月的券不占这个月的名额", () => {
  const lastMonth = Date.now() - 40 * DAY;
  setGame({ coupons: [1, 2, 3].map((i) => ({ id: `old${i}`, kind: "gift" as const, at: lastMonth })) });
  game.openChest({ kind: "daily", free: true }, dice(0.5, 0.001));
  assert.equal(G().coupons.length, 4);
});

test("没刮开的券过了 30 天作废，不能再选", () => {
  setGame({ coupons: [{ id: "x", kind: "mystery", at: Date.now() - 31 * DAY }] });
  assert.equal(game.isExpired(G().coupons[0]), true);
  game.chooseCoupon("x", "gift");
  assert.equal(G().coupons[0].kind, "mystery");
});

test("免作业券 30 天过期，不能再兑换；小礼品不过期", () => {
  setGame({
    coupons: [
      { id: "hw", kind: "homework", at: Date.now() - 31 * DAY },
      { id: "gf", kind: "gift", at: Date.now() - 300 * DAY },
    ],
  });
  game.redeemCoupon("hw");
  game.redeemCoupon("gf");
  assert.equal(G().coupons[0].redeemed, undefined, "过期的免作业券不能兑换");
  assert.ok(G().coupons[1].redeemed, "小礼品随时可以兑换");
});

/* ---------- 稀有奖励、音乐、冷知识卡、画风 ---------- */

test("补签卡最多存 3 张", () => {
  setGame({ patches: 3 });
  for (let i = 0; i < 20; i++) game.openChest({ kind: "unit", unit: `u${i}`, free: true }, dice(0.5, 0.99, 0.0));
  assert.equal(G().patches, 3);
});

test("音乐还没集齐时，稀有奖励换成碎片的说明不能说「已经全都有了」", () => {
  // 补签卡满、特效集齐，只剩音乐没集齐；这次没抽中音乐
  setGame({ patches: 3, fx: game.FX.map((f) => f.id) });
  const prizes = game.openChest({ kind: "unit", unit: "u", free: true }, dice(0.5, 0.99, 0.99));
  const rare = prizes.find((p) => p.rarity === "rare")!;
  assert.ok(!/全都有了/.test(rare.desc), `说明写成了：${rare.desc}`);
});

test("音乐大约 30% 的稀有奖励里出，不会超出列表", () => {
  let music = 0;
  const rng = (() => {
    let s = 7;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();
  for (let i = 0; i < 300; i++) {
    const before = G().music.length;
    game.openChest({ kind: "unit", unit: `u${i}`, free: true }, rng);
    if (G().music.length > before) music++;
  }
  assert.ok(G().music.length <= game.MUSIC.length);
  assert.ok(new Set(G().music).size === G().music.length, "同一首不会给两次");
  assert.ok(music > 0);
});

test("冷知识卡：新卡收进来，重复的换 1 个碎片", () => {
  game.openChest({ kind: "daily", free: true }, dice(0.5, 0.99, 0));
  assert.equal(Object.keys(G().facts).length, 1);
  const before = G().shards;
  const prizes = game.openChest({ kind: "daily", free: true }, dice(0.5, 0.99, 0));
  assert.equal(Object.keys(G().facts).length, 1);
  assert.equal(G().shards, before + prizes.find((p) => p.n)!.n! + 1);
  assert.equal(FACTS.length, 999);
});

test("画风：碎片够 100 才能解锁，解锁扣 100", () => {
  setGame({ shards: 99 });
  game.unlockSkin("fantasy");
  assert.ok(!G().skins.includes("fantasy"));
  setGame({ shards: 105 });
  game.unlockSkin("fantasy");
  assert.ok(G().skins.includes("fantasy"));
  assert.equal(G().shards, 5);
  assert.equal(G().skin, "fantasy");
});

/* ---------- 存档 ---------- */

test("旧存档能读：冷知识卡旧格式、文具券、乱写的数据被清掉", () => {
  const p = sanitizeProgress(
    {
      version: 2,
      game: {
        facts: [0, 3, 3, 5000],
        coupons: [{ id: "a", kind: "stationery", at: 1 }, { id: "b", kind: "cash", at: 1 }],
        skins: ["fantasy", "hack"],
        skin: "hack",
        shards: -5,
        patches: 99,
        daily: ["2026-10-01"],
      },
    },
    "x",
  );
  assert.deepEqual(Object.keys(p.game.facts).sort(), ["0", "3"]);
  assert.deepEqual(p.game.coupons.map((c) => c.id), ["a"]);
  assert.deepEqual(p.game.skins, ["base", "fantasy"]);
  assert.equal(p.game.skin, "base");
  assert.equal(p.game.shards, 0);
  assert.equal(p.game.patches, 3);
  assert.ok(p.game.earned.includes("2026-10-01"), "开过今日宝箱的日子算完成过任务");
});

test("音乐列表：免费那首在最前，已解锁的按解锁先后往上排，没解锁的保持原顺序", () => {
  const ids = game.musicOrder(game.MUSIC, ["harp", "rain"]).map((m) => m.id);
  assert.deepEqual(ids.slice(0, 2), ["harp", "rain"]);
  assert.deepEqual(ids.slice(2), game.MUSIC.map((m) => m.id).filter((id) => id !== "harp" && id !== "rain"));
  assert.equal(game.musicOrder([{ id: "rain" }, { id: game.FREE_MUSIC }], ["rain"])[0].id, game.FREE_MUSIC);
});

/* ---------- 挑战宝箱（真题阅读） ---------- */

test("挑战：最多错 1 题才给挑战宝箱；错 2 题不给", () => {
  assert.deepEqual(game.recordReading("a1", 3, 5), { first: true, chest: false });
  assert.equal(game.readyChests(atlas, store.get().progress, false).filter((t) => t.kind === "challenge").length, 0);
  assert.deepEqual(game.recordReading("a2", 4, 5), { first: true, chest: true });
  assert.equal(game.readyChests(atlas, store.get().progress, false).filter((t) => t.kind === "challenge").length, 1);
});

test("挑战：一天最多 1 个挑战宝箱；同一篇只有第一次的成绩算数", () => {
  game.recordReading("a1", 5, 5);
  assert.deepEqual(game.recordReading("a2", 5, 5), { first: true, chest: false }, "今天已经拿过了");
  assert.deepEqual(game.recordReading("a1", 0, 5), { first: false, chest: false }, "再读不改成绩");
  assert.equal(store.get().progress.reading.a1.right, 5);
});

test("挑战宝箱：开过不能再开；没拿到的日子开不了；碎片 2–4 个", () => {
  game.recordReading("a1", 5, 5);
  const [t] = game.readyChests(atlas, store.get().progress, false).filter((x) => x.kind === "challenge");
  const got = game.openChest(t, dice());
  assert.ok(got.length > 0);
  const shard = got.find((p) => p.icon === "shard");
  assert.ok(shard && shard.n! >= 2 && shard.n! <= 4);
  assert.equal(game.openChest(t, dice()).length, 0);
  assert.equal(game.openChest({ kind: "challenge", day: key(-5) }, dice()).length, 0, "那天没拿到挑战宝箱");
});

test("挑战宝箱：稀有概率 25%、稀有里一半是音乐", () => {
  setGame({ challengeEarned: [key(0)] });
  // 骰子：碎片格子、稀有判定 0.2（< 0.004 + 0.25）、音乐判定 0.4（< 0.5）、挑哪首
  const got = game.openChest({ kind: "challenge", day: key(0) }, dice(0, 0.2, 0.4, 0));
  assert.ok(got.some((p) => p.icon === "music"), "挑战宝箱 0.4 也能出音乐（今日宝箱要 < 0.3）");
});

test("挑战记录能存进备份、读回来", () => {
  game.recordReading("a1", 4, 5);
  const back = sanitizeProgress(JSON.parse(JSON.stringify(store.get().progress)), "test");
  assert.equal(back.reading.a1.right, 4);
  assert.deepEqual(back.game.challengeEarned, [key(0)]);
});

/* ---------- 星座 ---------- */

test("星座：单元的词全部点亮才连成，只送一次，每个送一个没有的特效", () => {
  store.progress((p) => ({ ...p, cards: { w0: card, w1: card } }));
  assert.equal(game.litUnits(atlas, store.get().progress).length, 0, "差一个词不算");
  store.progress((p) => ({ ...p, cards: { ...p.cards, w2: card } }));
  const lit = game.litUnits(atlas, store.get().progress);
  assert.deepEqual(lit.map((u) => u.key), ["Unit A"]);
  const [gift] = game.grantConstellations(lit, dice(0));
  assert.equal(gift.fx, game.FX[0].id);
  assert.deepEqual(G().constellations, ["Unit A"]);
  assert.deepEqual(G().fx, [game.FX[0].id]);
  assert.equal(game.grantConstellations(lit).length, 0, "同一个星座不重复送");
});

test("星座：特效已经集齐就换成碎片", () => {
  setGame({ fx: game.FX.map((f) => f.id), shards: 0 });
  const [gift] = game.grantConstellations([{ key: "Unit B", name: "Unit B" }]);
  assert.equal(gift.shards, game.CONSTELLATION_SHARDS);
  assert.equal(G().shards, game.CONSTELLATION_SHARDS);
});

test("星座：旧存档没有这一项也能读", () => {
  const p = sanitizeProgress({ game: { shards: 3 } }, "test");
  assert.deepEqual(p.game.constellations, []);
});
