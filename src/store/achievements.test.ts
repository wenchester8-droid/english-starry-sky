/**
 * 成就徽章规则演练：达成判定、补发上限、领取奖励、防重复领取。
 * 运行：npm test
 */
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

const g = globalThis as unknown as Record<string, unknown>;
g.window ??= { setTimeout, clearTimeout, addEventListener() {} };
g.document ??= { addEventListener() {}, visibilityState: "visible" };

const { store, emptyProgress, dayKey, sanitizeProgress } =
  await import("./store");
const ach = await import("./achievements");
type Progress = ReturnType<typeof emptyProgress>;

const DAY = 864e5;
const key = (offset: number) => dayKey(new Date(Date.now() + offset * DAY));
const card = {
  due: Date.now() + DAY,
  s: 1,
  d: 5,
  el: 0,
  sd: 0,
  ls: 0,
  reps: 2,
  lapses: 0,
  st: 2 as const,
  seen: Date.now(),
};

beforeEach(() => store.progress(() => emptyProgress("test")));
const P = () => store.get().progress;
const set = (fn: (p: Progress) => Progress) => store.progress(fn);
const got = (id: string) => ach.badgeStates(P()).find((x) => x.id === id)!.got;

test("一共 100 枚；已经用过的 id 没改（美工交图的文件名靠它）", () => {
  assert.equal(ach.BADGES.length, 100);
  for (const id of ["streak3", "streak100", "hours1", "hours30", "remember1000", "excellent1", "perfect1", "units1", "stars20", "reading1", "readingFull1", "reading30", "facts999", "wpm20", "wpm40", "skin1", "fxAll", "musicAll", "egg", "patched", "scratched"])
    assert.ok(ach.BADGES.some((x) => x.id === id), id);
  for (const x of ach.BADGES) assert.match(x.id, /^[A-Za-z0-9]{1,24}$/);
});

test("挑战：篇数、全对、挑战宝箱、阅读天数、一天几篇", () => {
  const at = (d: number, h = 10) => new Date(Date.now() + d * DAY).setHours(h);
  set((p) => ({
    ...p,
    reading: { a: { at: at(-2), right: 5, total: 5 }, b: { at: at(-1, 9), right: 3, total: 5 }, c: { at: at(-1, 11), right: 5, total: 5 }, d: { at: at(-1, 15), right: 4, total: 5 } },
    game: { ...p.game, challengeEarned: [key(-2), key(-1)] },
  }));
  const m = ach.metrics(P());
  assert.equal(m.reading, 4);
  assert.equal(m.readingFull, 2);
  assert.equal(m.challenges, 2);
  assert.equal(m.readDays, 2);
  assert.equal(m.readMaxDay, 3);
  assert.ok(got("reading1") && got("readingFull1") && got("challenges1") && got("readMaxDay3"));
  assert.ok(!got("reading5"));
});

test("徽章 id 不重复，每枚都属于一个系列", () => {
  assert.equal(new Set(ach.BADGES.map((x) => x.id)).size, ach.BADGES.length);
  for (const x of ach.BADGES)
    assert.ok(
      ach.SERIES.some((s) => s.id === x.series),
      x.id,
    );
});

test("新学生：一枚徽章都没有", () => {
  assert.equal(ach.pendingBadges(P()).length, 0);
});

test("最长连续打卡：断过以后按历史最长算", () => {
  set((p) => ({
    ...p,
    game: {
      ...p.game,
      earned: [
        key(-20),
        key(-19),
        key(-18),
        key(-17),
        key(-16),
        key(-15),
        key(-14),
        key(-2),
        key(-1),
      ],
    },
  }));
  assert.equal(ach.metrics(P()).streak, 7);
  assert.ok(got("streak7"));
  assert.ok(!got("streak30"));
});

test("补签的日子也算连续", () => {
  set((p) => ({
    ...p,
    game: { ...p.game, earned: [key(-3), key(-1)], patched: [key(-2)] },
  }));
  assert.equal(ach.metrics(P()).streak, 3);
  assert.ok(got("streak3"));
  assert.ok(got("patched"));
});

test("记住单词只算进入长期复习的词", () => {
  const cards: Progress["cards"] = {};
  for (let i = 0; i < 60; i++) cards[`w${i}`] = { ...card, st: i < 50 ? 2 : 1 };
  set((p) => ({ ...p, cards }));
  assert.equal(ach.metrics(P()).remember, 50);
  assert.ok(got("remember50"));
});

test("优秀的一天：至少 20 题、正确率 90%；满分一天要全对", () => {
  set((p) => ({
    ...p,
    days: {
      [key(-2)]: { n: 0, r: 20, c: 18, t: 600 },
      [key(-1)]: { n: 0, r: 19, c: 19, t: 600 },
    },
  }));
  assert.ok(got("excellent1"));
  assert.ok(!got("perfect1"));
  set((p) => ({
    ...p,
    days: { ...p.days, [key(0)]: { n: 0, r: 25, c: 25, t: 600 } },
  }));
  assert.ok(got("perfect1"));
});

test("打字速度只算正确率 90% 以上、不算纸笔听写", () => {
  set((p) => ({
    ...p,
    typing: [
      { at: 1, mode: "word", items: 10, wpm: 50, accuracy: 80 },
      { at: 2, mode: "paper", items: 10, wpm: 99, accuracy: 100 },
      { at: 3, mode: "sentence", items: 10, wpm: 22, accuracy: 95 },
    ],
  }));
  assert.equal(ach.metrics(P()).wpm, 22);
  assert.ok(got("wpm20"));
  assert.ok(!got("wpm40"));
});

test("补发：以前达成的一起领，碎片最多 100，没有稀有奖励，只能补发一次", () => {
  const cards: Progress["cards"] = {};
  for (let i = 0; i < 1000; i++) cards[`w${i}`] = card;
  // 记住单词 6 枚 + 单元过关 4 枚 + 开宝箱 10 个 + 彩蛋 = 12 枚，碎片远超 100
  set((p) => ({
    ...p,
    cards,
    game: {
      ...p.game,
      egg: true,
      eggGot: true,
      units: Array.from({ length: 10 }, (_, i) => `7a:U${i}`),
    },
  }));
  assert.equal(ach.pendingBadges(P()).length, 12);
  // 补发之前不能单个领
  assert.equal(ach.claimBadge("egg"), null);
  const r = ach.claimBackfill()!;
  assert.equal(r.badges.length, 12);
  assert.equal(r.shards, ach.BACKFILL_CAP);
  assert.equal(r.rare.length, 0);
  assert.equal(P().game.shards, r.shards);
  assert.equal(ach.claimBackfill(), null);
  assert.equal(ach.pendingBadges(P()).length, 0);
});

test("补发没到上限时按实际给", () => {
  set((p) => ({ ...p, game: { ...p.game, egg: true, eggGot: true } }));
  assert.equal(ach.claimBackfill()!.shards, 5);
});

test("补发以后：新达成的徽章单个领，难的给 30 碎片 + 稀有奖励，不能重复领", () => {
  ach.claimBackfill();
  set((p) => ({
    ...p,
    game: {
      ...p.game,
      units: Array.from({ length: 30 }, (_, i) => `7a:U${i}`),
    },
  }));
  // 单元宝箱也算开过的宝箱，所以「开箱新手」一起达成
  assert.deepEqual(
    ach.pendingBadges(P()).map((x) => x.id),
    ["units1", "units3", "units5", "units10", "units20", "units30", "chests10"],
  );
  assert.equal(ach.claimBadge("units1")!.shards, 5);
  assert.equal(ach.claimBadge("units5")!.shards, 15);
  const hard = ach.claimBadge("units20", () => 0)!;
  assert.equal(hard.shards, 30);
  assert.equal(hard.rare.length, 1);
  assert.equal(ach.claimBadge("units20"), null);
  assert.ok(P().game.shards >= 50);
});

test("没达成的徽章领不了", () => {
  ach.claimBackfill();
  assert.equal(ach.claimBadge("streak100"), null);
  assert.equal(P().game.shards, 0);
});

test("领取记录随备份保存，坏数据会被丢掉", () => {
  ach.claimBackfill();
  const raw = JSON.parse(
    JSON.stringify({
      ...P(),
      game: { ...P().game, badges: { egg: 123, "bad id!": 1, x: "no" } },
    }),
  );
  const back = sanitizeProgress(raw, "test");
  assert.deepEqual(back.game.badges, { egg: 123 });
  assert.equal(back.game.badgeInit, true);
});
