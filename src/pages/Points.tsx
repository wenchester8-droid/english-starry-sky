import { ArrowLeft, ArrowRight, BookX, Check, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useAtlas } from "../atlas/context";
import { go, useLocation } from "../lib/router";
import { cue } from "../lib/sound";
import { normalize, shuffle } from "../lib/text";

/** 比对答案时忽略大小写、多余空格和句末标点 */
const same = (a: string, b: string) => normalize(a).replace(/[.?!,]/g, "").trim() === normalize(b).replace(/[.?!,]/g, "").trim();
import { unitShort } from "../lib/unit";
import { store } from "../store/store";
import { useBookData } from "../lib/bookData";
import { ExamHint, examCount, useExams } from "../ui/ExamHint";
import { LessonList, LessonView, lessonsOf, useLessons, type Lesson } from "../ui/Lessons";
import { play } from "../lib/audio";
import { Speak } from "../ui/Speak";

/** 考点朗读（scripts/build_points_audio.py 用英音录好） */
const audioUrl = (name: string) => `${import.meta.env.BASE_URL}audio/points/${name}.mp3`;

/* ---------- 数据：考点讲解与练习题（public/data/<册号>-points.json） ---------- */

/** s：填好正确答案的完整句子，答完后显示并朗读 */
type Q = (
  | { t: "choice"; q: string; o: string[]; a: number }
  | { t: "fill"; q: string; a: string[] }
  | { t: "order"; w: string[]; a: string }
) & { e: string; kp?: string; s?: string };

export interface Point {
  id: string;
  cat: "grammar" | "sentence";
  /** 统一知识点名称，和老师的成绩追踪表一致 */
  kp: string;
  title: string;
  explain: string;
  examples: { en: string; zh: string }[];
  questions: Q[];
}
interface PointsData {
  cats: { id: string; name: string }[];
  units: { unit: string; points: Point[] }[];
}

const usePoints = () => useBookData<PointsData>("points");

/* ---------- 进度：每道题的作答记录，单独存一份 ---------- */

interface Qa {
  n: number;
  ok: number;
  last: boolean;
  kp: string;
  at: number;
}
const KEY = "qishang:qa";
let qa: Record<string, Qa> = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
})();
const subs = new Set<() => void>();
function record(key: string, kp: string, ok: boolean) {
  const r = qa[key] ?? { n: 0, ok: 0, last: false, kp, at: 0 };
  qa = { ...qa, [key]: { n: r.n + 1, ok: r.ok + (ok ? 1 : 0), last: ok, kp, at: Date.now() } };
  try {
    localStorage.setItem(KEY, JSON.stringify(qa));
  } catch {
    /* 存不了就只在这次打开时有效 */
  }
  subs.forEach((f) => f());
}
const useQa = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
    () => qa,
  );
/** 做了考点题时通知，云同步用 */
export const onQaChange = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
/** 备份 / 恢复时一起带上考点进度 */
export const exportQa = () => qa;
export function importQa(v: unknown) {
  if (v && typeof v === "object") {
    qa = v as Record<string, Qa>;
    localStorage.setItem(KEY, JSON.stringify(qa));
    subs.forEach((f) => f());
  }
}

const qKey = (p: Point, i: number) => `${p.id}#${i}`;
const kpOf = (p: Point, q: Q) => q.kp ?? p.kp;

export interface Item {
  key: string;
  point: Point;
  q: Q;
}
const itemsOf = (p: Point): Item[] => p.questions.map((q, i) => ({ key: qKey(p, i), point: p, q }));

function stat(p: Point, rec: Record<string, Qa>) {
  let done = 0,
    right = 0;
  p.questions.forEach((_, i) => {
    const r = rec[qKey(p, i)];
    if (r) {
      done++;
      if (r.last) right++;
    }
  });
  return { done, right, total: p.questions.length };
}

/* ---------- 页面 ---------- */

export function PointsPage() {
  const d = usePoints();
  useExams();
  const [open, setOpen] = useState<Point | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const { route } = useLocation();
  const unitFromRoute = route.page === "points" ? route.unit : undefined;
  const secFromRoute = route.page === "points" ? route.sec : undefined;
  // 从首页单元面板点「看这个单元的考点」：滚到这个单元
  useEffect(() => {
    if (!d || !unitFromRoute || open || lesson) return;
    window.setTimeout(() => (document.getElementById(`pt-${unitFromRoute}-${secFromRoute}`) ?? document.getElementById(`pt-${unitFromRoute}`))?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }, [d, unitFromRoute, secFromRoute, open, lesson]);
  const [quiz, setQuiz] = useState<{ items: Item[]; title: string } | null>(null);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [open, quiz, lesson]);
  if (!d) return <span className="spinner" />;
  if (lesson) return <LessonView lesson={lesson} onBack={() => setLesson(null)} />;
  if (quiz) return <Quiz items={quiz.items} title={quiz.title} onExit={() => setQuiz(null)} />;
  if (open) return <PointDetail point={open} onBack={() => setOpen(null)} onPractice={(items) => setQuiz({ items, title: open.title })} />;
  return <PointsHome d={d} onOpen={setOpen} onLesson={setLesson} />;
}

function PointsHome({
  d,
  onOpen,
  onLesson,
}: {
  d: PointsData;
  onOpen: (p: Point) => void;
  onLesson: (l: Lesson) => void;
}) {
  const atlas = useAtlas();
  const rec = useQa();
  const lessons = useLessons();
  const [cat, setCat] = useState<"all" | "lesson" | Point["cat"]>("all");
  const unitTitle = (id: string) => atlas.cefr.find((t) => t.toLowerCase().replace(/\s+/g, "-") === id) ?? id;
  const all = d.units.flatMap((u) => u.points);
  const total = all.reduce((n, p) => n + p.questions.length, 0);

  return (
    <div className="page points">
      <header className="page-head">
        <p className="eyebrow">课本 · 课文与考点</p>
        <h1 className="display">
          跟着课本，
          <br className="br-sm" />
          一个单元一个单元学。
        </h1>
        <p className="lede">每个单元先听读课文和对话（课本原声），再学语法和句型：{all.length} 个考点、{total} 道练习题，每题都有解析。标着「中考考过」的，河南中考真的考过。</p>
      </header>

      <div className="chips pt-cats" role="group" aria-label="考点类型">
        <button className={`chip-btn ${cat === "all" ? "is-on" : ""}`} onClick={() => setCat("all")}>
          全部
        </button>
        <button className={`chip-btn ${cat === "lesson" ? "is-on" : ""}`} onClick={() => setCat("lesson")}>
          课文与对话
        </button>
        {d.cats.map((c) => (
          <button key={c.id} className={`chip-btn ${cat === c.id ? "is-on" : ""}`} onClick={() => setCat(c.id as Point["cat"])}>
            {c.name}
          </button>
        ))}
      </div>

      {d.units.map((u) => {
        const pts = cat === "lesson" ? [] : u.points.filter((p) => cat === "all" || p.cat === cat);
        const ls = cat === "all" || cat === "lesson" ? lessonsOf(lessons, u.unit) : [];
        if (!pts.length && !ls.length) return null;
        const title = unitTitle(u.unit);
        return (
          <section key={u.unit} className="pt-unit" id={`pt-${u.unit}`}>
            <h2 className="pt-unit-title">
              <span className="station-mini">{unitShort(title)}</span>
              {title}
            </h2>
            {ls.length > 0 && (
              <>
                <h3 className="pt-sub">课文与对话</h3>
                <LessonList lessons={ls} onOpen={onLesson} />
              </>
            )}
            {pts.length > 0 && cat === "all" && (
              <h3 className="pt-sub" id={`pt-${u.unit}-points`}>
                语法与句型
              </h3>
            )}
            <ul className="pt-list">
              {pts.map((p) => {
                const s = stat(p, rec);
                const pct = s.done ? s.right / s.total : 0;
                return (
                  <li key={p.id}>
                    <button onClick={() => onOpen(p)}>
                      <span className="pt-main">
                        <b>{p.title}</b>
                        <small>
                          <span className={`pt-cat pt-cat-${p.cat}`}>{p.cat === "grammar" ? "语法" : "句型"}</span>
                          {p.kp}
                          {examCount("points", p.id) > 0 && <span className="pt-exam">中考考过</span>}
                        </small>
                      </span>
                      <span className={`pt-score ${s.done === s.total && s.right === s.total ? "is-full" : ""}`} style={{ "--p": pct } as React.CSSProperties}>
                        {s.done ? `${s.right}/${s.total}` : `${s.total} 题`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/* ---------- 考点错题：放在练习页，课本页只管学 ---------- */

export function WrongPanel({ onPractice }: { onPractice: (items: Item[], title: string) => void }) {
  const d = usePoints();
  const rec = useQa();
  const wrong = useMemo(() => (d ? d.units.flatMap((u) => u.points).flatMap(itemsOf).filter((it) => rec[it.key] && !rec[it.key].last) : []), [d, rec]);
  const weak = useMemo(() => {
    const m = new Map<string, number>();
    wrong.forEach((it) => m.set(kpOf(it.point, it.q), (m.get(kpOf(it.point, it.q)) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [wrong]);
  if (!d) return null;
  return (
    <section className={`mode-card wrong-card ${wrong.length ? "is-on" : ""}`}>
      <BookX size={22} strokeWidth={1.7} />
      <b>考点错题</b>
      <small>{wrong.length ? `课本考点练习里还有 ${wrong.length} 道题没做对，再做一遍。` : "课本考点练习里做错的题会出现在这里，重新做对就会移出。"}</small>
      {/* 错题只在一个考点时，按考点练和「重练错题」是一回事，不再单独列出 */}
      {weak.length > 1 && (
        <div className="chips">
          {weak.map(([kp, n]) => (
            <button key={kp} className="chip-btn" onClick={() => onPractice(wrong.filter((it) => kpOf(it.point, it.q) === kp), kp)}>
              {kp} {n} 题
            </button>
          ))}
        </div>
      )}
      <button className="btn btn-primary" onClick={() => onPractice(shuffle(wrong), "错题重练")} disabled={!wrong.length}>
        <RotateCcw size={16} /> {wrong.length ? `重练 ${wrong.length} 题` : "暂无错题"}
      </button>
    </section>
  );
}

function PointDetail({ point, onBack, onPractice }: { point: Point; onBack: () => void; onPractice: (items: Item[]) => void }) {
  const rec = useQa();
  const items = itemsOf(point);
  const wrong = items.filter((it) => rec[it.key] && !rec[it.key].last);
  return (
    <div className="page points pt-detail">
      <button className="btn btn-ghost btn-sm pt-back" onClick={onBack}>
        <ArrowLeft size={16} /> 全部考点
      </button>
      <p className="eyebrow">
        {point.cat === "grammar" ? "语法" : "句型与交际"} · {point.kp}
      </p>
      <h1 className="display pt-title">{point.title}</h1>
      <section className="panel pt-explain">{point.explain}</section>
      <section className="block">
        <h3 className="eyebrow">课本例句</h3>
        <ul className="examples">
          {point.examples.map((x, i) => (
            <li key={x.en}>
              <p className="ex-en" lang="en">
                {x.en}
                <Speak url={audioUrl(`${point.id}-ex${i}`)} text={x.en} size="sm" className="ex-speak" />
              </p>
              <p className="ex-zh">{x.zh}</p>
            </li>
          ))}
        </ul>
      </section>
      <ExamHint kind="points" id={point.id} />
      <div className="pt-actions">
        <button className="btn btn-primary btn-xl" onClick={() => onPractice(shuffle(items))}>
          练习 {items.length} 题 <ArrowRight size={20} />
        </button>
        {wrong.length > 0 && (
          <button className="btn btn-ghost" onClick={() => onPractice(wrong)}>
            只练错的 {wrong.length} 题
          </button>
        )}
      </div>
    </div>
  );
}

export function Quiz({ items, title, onExit }: { items: Item[]; title: string; onExit: () => void }) {
  const [i, setI] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const sfx = () => store.get().settings.sfx;

  if (i >= items.length) {
    const right = results.filter(Boolean).length;
    return (
      <div className="page points pt-done">
        <p className="eyebrow">{title}</p>
        <h1 className="display">练完了！</h1>
        <div className="pt-result">
          <b>
            {right}
            <small>/{items.length}</small>
          </b>
          <span>答对 · 正确率 {Math.round((right / Math.max(1, items.length)) * 100)}%</span>
        </div>
        <div className="pt-actions">
          <button className="btn btn-primary btn-xl" onClick={onExit}>
            返回 <ArrowRight size={20} />
          </button>
          <button className="btn btn-ghost" onClick={() => go({ page: "today" })}>
            回到今日
          </button>
        </div>
      </div>
    );
  }

  const it = items[i];
  return (
    <div className="page points pt-quiz">
      <div className="pt-quiz-top">
        <button className="icon-btn" onClick={onExit} aria-label="退出">
          <X size={20} />
        </button>
        <div className="pt-progress">
          <span style={{ width: `${(i / items.length) * 100}%` }} />
        </div>
        <span className="pt-count">
          {i + 1}/{items.length}
        </span>
      </div>
      <QuizCard
        key={i}
        item={it}
        onAnswer={(ok) => {
          setResults((r) => [...r, ok]);
          record(it.key, kpOf(it.point, it.q), ok);
          if (sfx()) void cue(ok ? "correct" : "wrong");
        }}
        onNext={() => setI((n) => n + 1)}
      />
    </div>
  );
}

function QuizCard({ item, onAnswer, onNext }: { item: Item; onAnswer: (ok: boolean) => void; onNext: () => void }) {
  const { q, point } = item;
  const [done, setDone] = useState<null | boolean>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const tokens = useMemo(() => (q.t === "order" ? shuffle(q.w.map((w, idx) => ({ w, idx }))) : []), [q]);
  const [chosen, setChosen] = useState<number[]>([]);
  const qIndex = item.key.split("#")[1];
  const sentenceUrl = q.s ? audioUrl(`${point.id}-q${qIndex}`) : null;
  const finish = (ok: boolean) => {
    setDone(ok);
    onAnswer(ok);
    // 答完把完整的正确句子读一遍（等对错音效先响完）
    if (sentenceUrl && store.get().settings.autoplay) window.setTimeout(() => void play(sentenceUrl, q.s!, "uk"), 450);
  };
  const label = q.t === "choice" ? "单项选择" : q.t === "fill" ? "填空" : "连词成句";
  const answer = q.t === "choice" ? `${String.fromCharCode(65 + q.a)}. ${q.o[q.a]}` : q.t === "fill" ? q.a[0] : q.a;

  return (
    <section className="pt-card">
      <p className="eyebrow">
        {label} · {point.title}
      </p>
      {q.t !== "order" && (
        <p className="pt-stem" lang="en">
          {q.q}
        </p>
      )}

      {q.t === "choice" && (
        <ul className="options options-en">
          {q.o.map((o, k) => {
            const cls = done === null ? "" : k === q.a ? "is-answer" : picked === k ? "is-chosen" : "is-dim";
            return (
              <li key={k}>
                <button
                  className={`option ${cls}`}
                  disabled={done !== null}
                  onClick={() => {
                    setPicked(k);
                    finish(k === q.a);
                  }}
                >
                  <kbd>{String.fromCharCode(65 + k)}</kbd>
                  <span lang="en">{o}</span>
                  {done !== null && k === q.a && <Check size={20} className="option-mark" />}
                  {done !== null && picked === k && k !== q.a && <X size={20} className="option-mark" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {q.t === "fill" && (
        <form
          className="pt-fill"
          onSubmit={(e) => {
            e.preventDefault();
            if (done === null && typed.trim()) finish(q.a.some((a) => same(a, typed)));
          }}
        >
          <input
            className={done === null ? "" : done ? "is-ok" : "is-bad"}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="填写答案"
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            readOnly={done !== null}
          />
          {done === null && (
            <button className="btn btn-primary btn-xl" disabled={!typed.trim()}>
              确认
            </button>
          )}
        </form>
      )}

      {q.t === "order" && (
        <>
          <div className={`pt-sentence ${done === null ? "" : done ? "is-ok" : "is-bad"}`}>
            {chosen.length ? (
              chosen.map((k) => (
                <button key={k} className="pt-token" disabled={done !== null} onClick={() => setChosen((c) => c.filter((x) => x !== k))}>
                  {q.w[k]}
                </button>
              ))
            ) : (
              <span className="muted">按顺序点下面的单词</span>
            )}
          </div>
          <div className="pt-tokens">
            {tokens.map(({ w, idx }) => (
              <button key={idx} className="pt-token" disabled={chosen.includes(idx) || done !== null} onClick={() => setChosen((c) => [...c, idx])}>
                {w}
              </button>
            ))}
          </div>
          {done === null && (
            <button
              className="btn btn-primary btn-xl"
              disabled={chosen.length !== q.w.length}
              onClick={() => finish(same(chosen.map((k) => q.w[k]).join(" "), q.a))}
            >
              确认
            </button>
          )}
        </>
      )}

      {done !== null && (
        <div className={`pt-feedback ${done ? "is-right" : "is-wrong"}`} role="status">
          <p className="feedback-verdict">{done ? "答对了" : "没关系，看看解析"}</p>
          {!done && (
            <p className="pt-answer" lang="en">
              正确答案：{answer}
            </p>
          )}
          {q.s && (
            <p className="pt-full" lang="en">
              <span>{q.s}</span>
              <Speak url={sentenceUrl} text={q.s} size="sm" />
            </p>
          )}
          <p className="pt-why">{q.e}</p>
          <button className="btn btn-primary btn-xl" onClick={onNext} autoFocus>
            下一题 <ArrowRight size={20} />
          </button>
        </div>
      )}
    </section>
  );
}
