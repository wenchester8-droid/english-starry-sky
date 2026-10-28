import { store } from "../store/store";

/** 课本册数。ready = 内容已经做好可以学；其他几册先在菜单里占位，显示「准备中」 */
export interface Book {
  id: string;
  name: string;
  /** 简称：搜索结果、标签上用 */
  short: string;
  /** 上册 / 下册 / 全册：按日期给新同学预选时用 */
  term: "a" | "b" | "all";
  ready: boolean;
}

export const BOOKS: Book[] = [
  { id: "7a", name: "七年级上册", short: "七上", term: "a", ready: true },
  { id: "7b", name: "七年级下册", short: "七下", term: "b", ready: true },
  { id: "8a", name: "八年级上册", short: "八上", term: "a", ready: true },
  { id: "8b", name: "八年级下册", short: "八下", term: "b", ready: true },
  { id: "9", name: "九年级", short: "九年级", term: "all", ready: true },
];

/** 中考总复习：三年内容按中考考法重新组织，只放在左上角菜单里，不进新手引导（以后单独设计） */
export const ZK_BOOK: Book = { id: "zk", name: "中考总复习", short: "中考", term: "all", ready: false };

export const bookById = (id: string) => [...BOOKS, ZK_BOOK].find((b) => b.id === id) ?? BOOKS[0];

/** 新同学第一次进来时预选哪一册：9 月到次年 1 月是上学期，2 月到 8 月是下学期；挑这个学期第一本做好的 */
export function suggestBook(now = new Date()): string {
  const m = now.getMonth() + 1;
  const term = m >= 9 || m === 1 ? "a" : "b";
  const ready = BOOKS.filter((b) => b.ready);
  return (ready.find((b) => b.term === term) ?? ready[0] ?? BOOKS[0]).id;
}

/** 「人教版八年级上册」：分享图片、页脚上显示当前选的册 */
export const bookTag = (id = store.get().settings.book) => `人教版${bookById(id).name}`;
