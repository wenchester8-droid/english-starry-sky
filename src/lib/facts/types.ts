export type FactCat = "word" | "grammar" | "spell" | "build" | "talk" | "culture" | "exam" | "fun";
export type Grade = "七年级" | "八年级" | "九年级" | "初中";

export interface Fact {
  cat: FactCat;
  grade: Grade;
  title: string;
  /** 中文讲解，英文只用初中课标词（中考范围内） */
  text: string;
}

export const CAT_NAME: Record<FactCat, string> = {
  word: "单词小故事",
  grammar: "语法小窍门",
  spell: "拼写和发音",
  build: "构词法",
  talk: "日常交际",
  culture: "英语国家文化",
  exam: "中考小陷阱",
  fun: "趣味英语",
};

/** 批量写卡：[标题, 讲解] */
export const mk = (cat: FactCat, grade: Grade, rows: [string, string][]): Fact[] => rows.map(([title, text]) => ({ cat, grade, title, text }));
