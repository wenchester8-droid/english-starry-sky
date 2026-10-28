/**
 * 挑战模式 · 真题阅读馆的数据：public/data/reading.json（app/scripts/build_reading_web.py 生成）。
 * 每篇文章带着「七上学生不认识的词」（cand），这里再按学生自己学过的词（八上、九年级单词）扣掉，算出他的生词数和难度。
 */
import { useEffect, useState } from "react";

/** 解析：ev 是原文依据（逐字在正文里，答错时在原文里标出来），why 是为什么选这个 */
export interface Explain {
  ev: string;
  why: string;
}
export interface ReadingQ {
  n: number;
  stem: string;
  /** [选项字母, 内容]；内容可能是 [图:路径] */
  opts: [string, string][];
  ans: string;
  ex?: Explain;
}
export interface ReadingSix {
  six: true;
  blanks: number[];
  opts: [string, string][];
  /** 空格编号 → 字母 */
  ans: Record<string, string>;
  ex?: Record<string, Explain>;
}
/** [关键词, 词条 id（八上、九年级的词）或 null, 中文（课本外的词）或 null, 出现次数, 原文里的写法, 最早出现在第几册（1 七下 2 八上 3 八下 4 九年级 9 课本里没有）] */
export type Cand = [string, string | null, string | null, number, string[], number];

/** 课本册的先后：学生选了哪一册，它前面的册里的词都算学过 */
const BOOK_ORDER = ["7a", "7b", "8a", "8b", "9"];
export const bookLevel = (book: string) => Math.max(0, BOOK_ORDER.indexOf(book));
export interface Article {
  id: string;
  src: string;
  kind: string;
  year: number | null;
  title: string;
  words: number;
  body: string[];
  qs: (ReadingQ | ReadingSix)[];
  cand: Cand[];
  ai: boolean;
}

export const isSix = (q: ReadingQ | ReadingSix): q is ReadingSix => "six" in q;
/** 一篇文章一共几个得分点（选择题一题一个，六选五一空一个） */
export const points = (a: Article) => a.qs.reduce((n, q) => n + (isSix(q) ? q.blanks.length : 1), 0);

/** 生词率分档：≤5% 能读，≤10% 有点难，再高就先不显示 */
export const READ_OK = 0.05;
export const READ_STRETCH = 0.1;
export type Level = "ok" | "stretch" | "hard";
export const LEVEL_NAME: Record<Level, string> = { ok: "能读", stretch: "有点难", hard: "太难" };

export interface Status {
  article: Article;
  /** 这个学生还不认识的词（按 cand 的顺序） */
  unknown: Cand[];
  /** 不认识的词在文中出现的总次数 */
  hits: number;
  rate: number;
  level: Level;
}

/** level：学生所选册在 BOOK_ORDER 里的位置（bookLevel），前面各册的词算认识 */
export function statusOf(a: Article, learned: ReadonlySet<string>, level = 0): Status {
  const unknown = a.cand.filter((c) => !(c[5] < level || (c[1] && learned.has(c[1]))));
  const hits = unknown.reduce((n, c) => n + c[3], 0);
  const rate = a.words ? hits / a.words : 1;
  return { article: a, unknown, hits, rate, level: rate <= READ_OK ? "ok" : rate <= READ_STRETCH ? "stretch" : "hard" };
}

/** 学哪些八上、九年级单词能多解锁文章：按「能把多少篇太难的文章拉进有点难」排序，取前几个词。 */
export function unlockHint(all: Status[], learned: ReadonlySet<string>, level = 0, limit = 8) {
  const hard = all.filter((s) => s.level === "hard");
  const score = new Map<string, number>();
  for (const s of hard) {
    const need = s.hits - Math.floor(s.article.words * READ_STRETCH);
    // 只看差得不多的文章（学十来个词就能读），差太远的先不管
    if (need > 12) continue;
    for (const c of s.unknown) if (c[1] && !learned.has(c[1])) score.set(c[1], (score.get(c[1]) ?? 0) + c[3] / Math.max(1, need));
  }
  const words = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
  const after = new Set([...learned, ...words]);
  const gain = hard.filter((s) => statusOf(s.article, after, level).level !== "hard").length;
  return { words, gain };
}

let cache: Promise<Article[]> | null = null;
export function loadReading(): Promise<Article[]> {
  if (!cache)
    cache = fetch(`${import.meta.env.BASE_URL}data/reading.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`真题阅读加载失败（${r.status}）`);
        return r.json() as Promise<{ articles: Article[] }>;
      })
      .then((d) => d.articles)
      .catch((e) => {
        cache = null;
        throw e;
      });
  return cache;
}

export function useReading() {
  const [list, setList] = useState<Article[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadReading().then(
      (l) => live && setList(l),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, []);
  return { list, error };
}

/** 正文里的 [图:路径] 换成网址 */
export const imgUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;
export const IMG = /\[图:([^\]]+)\]/g;
