/** 首页问候语：大标题一句 + 最多一行小字。优先级：生日 > 考试当天 > 考前倒计时 > 周末 > 平日。 */

/** 考试日期（老师设置）：date 写 "YYYY-MM-DD"。 */
export const EXAMS: { date: string; name: string }[] = [];

/** 学生生日 "MM-DD"，按姓名查。等老师传来带出生年月的名单再填。 */
export const BIRTHDAYS: Record<string, string> = {};

/** 平日鼓励语：每次打开网页随机换一句，不和上次看到的重复。每句控制在十来个字。 */
const DAILY = [
  "每天记几个，一学期就很多。",
  "今天也来了，真不错。",
  "读出声来，记得更牢。",
  "错了不怕，再来一次。",
  "十分钟，也是进步。",
  "先复习，再学新词。",
  "坚持，是最厉害的天赋。",
  "开口说一句英语吧。",
  "一步一步，慢慢变强。",
  "今天的你，比昨天更棒。",
  "记不住？明天再见它一次。",
  "跟着录音，读三遍。",
  "Every day counts. 每天都算数。",
  "小目标：今天全对一次。",
  "单词会了，句子就不难。",
  "认真十分钟，胜过发呆一小时。",
  "加油，你可以的。",
  "拼一拼，写一写，记得快。",
  "Good job! 继续保持。",
  "今天也要闪闪发光。",
  "学一点，就多懂一点。",
  "别着急，慢慢来。",
  "看图想词，想词说句。",
  "你已经比开始时强多了。",
  "多听多读，耳朵会变灵。",
  "今天学的，晚上回想一遍。",
  "相信自己，再试一次。",
  "一天一点，积少成多。",
  "认真的你最好看。",
  "Let's go! 出发吧。",
];

const WEEKEND = ["周末也来学，你真棒！", "休息好，也别忘了学一点。", "周末十分钟，周一更轻松。"];

const LAST_KEY = "word-atlas:greet-last";
const picked = new Map<string[], string>();

/** 这次打开网页抽一句，切换页面时不变；和上次打开看到的那句错开 */
function pick(list: string[]) {
  const done = picked.get(list);
  if (done) return done;
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_KEY);
  } catch {
    /* optional */
  }
  const pool = list.length > 1 ? list.filter((l) => l !== last) : list;
  const line = pool[Math.floor(Math.random() * pool.length)];
  picked.set(list, line);
  try {
    localStorage.setItem(LAST_KEY, line);
  } catch {
    /* optional */
  }
  return line;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function timeOfDay(h: number) {
  if (h < 5) return "夜深了";
  if (h < 11) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

export type Greeting = { kind: "birthday" | "examday" | "exam" | "weekend" | "daily"; title: string; sub: string };

export function greetingFor(now: Date, name: string | undefined, preview?: string | null): Greeting {
  const who = name || "同学";
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const today = ymd(now);

  const birthday = !!name && BIRTHDAYS[name] === today.slice(5);
  if (birthday || preview === "birthday") return { kind: "birthday", title: `生日快乐，${who}！`, sub: "Happy birthday! 新一岁，加油。" };

  const hello = `${timeOfDay(now.getHours())}，${who}。`;
  const examToday = EXAMS.find((e) => e.date === today);
  if (examToday || preview === "examday") return { kind: "examday", title: hello, sub: "今天考试，细心就是胜利。" };

  const soon = EXAMS.map((e) => ({ ...e, days: Math.round((new Date(`${e.date}T00:00`).getTime() - start) / 864e5) }))
    .filter((e) => e.days >= 1 && e.days <= 7)
    .sort((a, b) => a.days - b.days)[0];
  if (soon || preview === "exam") {
    const e = soon ?? { name: "单元测", days: 3 };
    return { kind: "exam", title: hello, sub: `离${e.name}还有 ${e.days} 天，加油！` };
  }

  const day = now.getDay();
  if (day === 0 || day === 6 || preview === "weekend")
    return { kind: "weekend", title: `周末好，${who}。`, sub: pick(WEEKEND) };

  return { kind: "daily", title: hello, sub: pick(DAILY) };
}
