export type Accent = "uk" | "us";

/** Compact row from atlas/index.json: [id, word, zh, ipa, cefr, topic, media]. */
export type IndexRow = [string, string, string, string, number, number, number];

export interface Sense {
  pos: string;
  zh: string;
  en: string;
}

export interface Example {
  en: string;
  zh: string;
  /** 出处：「课本」「2025年河南中考」「改编自…」「拓展」 */
  src?: string;
}

export interface Entry {
  id: string;
  w: string;
  uk: string;
  us: string;
  senses: Sense[];
  ex: Example[];
  col: string[];
  fam: string[];
  syn: string[];
  ant: string[];
  tip: string;
  cefr: string;
  topic: string;
  /** Usage caution (register, offensiveness, spelling), shown with the entry. */
  note?: string;
  /** Media bit flags, see MEDIA. */
  m: number;
  /** 课本页码、是否课标重点词、所属单元 id（英语星空） */
  page?: number;
  key?: boolean;
  unit?: string;
  /** Absolute media URLs for datasets that do not follow the atlas layout. */
  media?: { img?: string | null; uk?: string | null; us?: string | null; ex?: string | null; ex2?: string | null };
}

export const MEDIA = { img: 1, uk: 2, us: 4, ex: 8, ex2: 16 } as const;

export interface WordRef {
  id: string;
  word: string;
  zh: string;
  ipa: string;
  cefr: number;
  topic: number;
  media: number;
  /** Position in the learning path. */
  order: number;
}

export interface Atlas {
  id: string;
  name: string;
  kind: "open" | "private";
  /** 课本册号（7a、8a……），私有词库没有 */
  book?: string;
  /** 所有做好的册（按年级顺序，含当前这册）：搜索框跨册查词用 */
  shelf?: Atlas[];
  count: number;
  examples: number;
  illustrated: number;
  topics: [string, string][];
  cefr: string[];
  words: WordRef[];
  byId: Map<string, WordRef>;
  /** Loads full entries; chunked for the open atlas, in-memory for private sets. */
  entry: (id: string) => Promise<Entry>;
  peek: (id: string) => Entry | undefined;
  img: (ref: WordRef | Entry, size?: "thumb" | "full") => string | null;
  audio: (ref: WordRef | Entry, kind: "uk" | "us" | "ex" | "ex2") => string | null;
}
