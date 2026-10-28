/** 课本单元的短名："Starter Unit 1" → "S1"，"Unit 7" → "U7" */
export const unitShort = (title: string) => title.replace("Starter Unit ", "S").replace(/^Unit /, "U");

/** "Starter Unit 1" → "starter-unit-1"，和考点数据里的单元 id 一致 */
export const unitId = (title: string) => title.toLowerCase().replace(/\s+/g, "-");

export const APP_NAME = "英语星空";

/** 单元宝箱的记录名：七上沿用「Unit 1」（老存档不变），其他册加册号「8a Unit 1」，免得各册的 Unit 1 撞名 */
export const unitKey = (book: string | undefined, title: string) => (!book || book === "7a" ? title : `${book} ${title}`);

const BOOK_SHORT: Record<string, string> = { "7b": "七下", "8a": "八上", "8b": "八下", "9": "九年级" };
/** 显示用：「8a Unit 1」→「八上 Unit 1」 */
export const unitLabel = (key: string) => key.replace(/^(7b|8a|8b|9) /, (_, b: string) => `${BOOK_SHORT[b]} `);
