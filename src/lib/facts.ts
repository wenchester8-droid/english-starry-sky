/**
 * 宝箱里的冷知识卡，共 999 种，覆盖七、八、九年级。
 * 卡号 = 在 FACTS 里的位置，学生的收集记录按卡号存：只能往后追加，不能删除或调换顺序。
 */
import { BASE } from "./facts/base";
import { BUILD } from "./facts/build";
import { CULTURE } from "./facts/culture";
import { EXAM } from "./facts/exam";
import { FUN } from "./facts/fun";
import { GRAMMAR } from "./facts/grammar";
import { SPELL } from "./facts/spell";
import { TALK } from "./facts/talk";
import type { Fact } from "./facts/types";
import { WORDS7 } from "./facts/words7";
import { WORDS8 } from "./facts/words8";
import { WORDS9 } from "./facts/words9";

export type { Fact } from "./facts/types";
export { CAT_NAME } from "./facts/types";

export const FACTS: Fact[] = [...BASE, ...WORDS7, ...WORDS8, ...WORDS9, ...GRAMMAR, ...SPELL, ...BUILD, ...TALK, ...CULTURE, ...EXAM, ...FUN];
