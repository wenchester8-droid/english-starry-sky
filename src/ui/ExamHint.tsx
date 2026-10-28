import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { peekBookData, useBookData } from "../lib/bookData";

interface Hit {
  p: number;
  sec: string;
  t: string;
}
type Kind = "zk" | "mock" | "school";
interface ExamsData {
  papers: { title: string; region: string; year: number; kind: Kind }[];
  /** n：每种卷子里出现的份数；h：挑出来展示的几条原句 */
  words: Record<string, { n: Record<Kind, number>; h: Hit[] }>;
  points: Record<string, Hit[]>;
}
const KIND_NAME: Record<Kind, string> = { zk: "中考真题", mock: "模拟卷", school: "学校考卷" };

export const useExams = () => useBookData<ExamsData>("exams");

export function examCount(kind: "words" | "points", id: string) {
  const cache = peekBookData<ExamsData>("exams");
  if (!cache) return 0;
  if (kind === "points") return cache.points[id]?.length ?? 0;
  const w = cache.words[id];
  return w ? w.n.zk + w.n.mock + w.n.school : 0;
}

/** 【】里的词高亮 */
function Quote({ text }: { text: string }) {
  return (
    <>
      {text.split(/【|】/).map((s, i) => (i % 2 ? <mark key={i}>{s}</mark> : <span key={i}>{s}</span>))}
    </>
  );
}

/** 词卡、考点页底部的真题提示：「!」+ 出现次数，点开看出处和原句 */
export function ExamHint({ kind, id }: { kind: "words" | "points"; id: string }) {
  const d = useExams();
  const [open, setOpen] = useState(false);
  if (!d) return null;
  const w = kind === "words" ? d.words[id] : undefined;
  const hits = kind === "points" ? d.points[id] : w?.h;
  if (!hits?.length) return null;
  const summary = w
    ? `在 ${examCount("words", id)} 份试卷里出现过：` +
      (Object.keys(KIND_NAME) as Kind[])
        .filter((k) => w.n[k])
        .map((k) => `${KIND_NAME[k]} ${w.n[k]} 份`)
        .join("、")
    : `河南中考考过 ${hits.length} 次`;
  return (
    <aside className={`exam-hint ${open ? "is-open" : ""}`}>
      <button className="exam-sum" onClick={(e) => (e.stopPropagation(), setOpen(!open))} aria-expanded={open}>
        <span className="exam-bang">!</span>
        <span>{summary}</span>
        <ChevronDown size={16} className="exam-chev" />
      </button>
      {open && (
        <ul>
          {hits.map((h, i) => (
            <li key={i}>
              <small>
                {d.papers[h.p].title}
                {h.sec && ` · ${h.sec}`}
              </small>
              <p lang="en">
                <Quote text={h.t} />
              </p>
            </li>
          ))}
          {w && examCount("words", id) > hits.length && <li className="exam-more">另有 {examCount("words", id) - hits.length} 份试卷也出现过，没有逐条列出</li>}
        </ul>
      )}
    </aside>
  );
}
