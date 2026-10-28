import { ArrowLeft, Languages, Pause, Play, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useBookData } from "../lib/bookData";
import { duck } from "../lib/sound";

/* ---------- 数据：课文、对话、听力录音逐句的文字和时间（public/data/<册号>-lessons.json） ---------- */

export interface LessonLine {
  /** 课本原文（识别结果按课本校对过） */
  t: string;
  /** 中文翻译，有的才显示 */
  zh?: string;
  /** 在录音里的开始、结束时间（秒） */
  s: number;
  e: number;
}
export interface Lesson {
  id: string;
  title: string;
  audio: string;
  lines: LessonLine[];
}
export interface LessonsData {
  units: { unit: string; lessons: Lesson[] }[];
}

export const useLessons = () => useBookData<LessonsData>("lessons");

export const lessonsOf = (d: LessonsData | null, unit: string) => d?.units.find((u) => u.unit === unit)?.lessons ?? [];

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

/** 单元里「课文与对话」的列表 */
export function LessonList({ lessons, onOpen }: { lessons: Lesson[]; onOpen: (l: Lesson) => void }) {
  return (
    <ul className="pt-list lesson-list">
      {lessons.map((l) => (
        <li key={l.id}>
          <button onClick={() => onOpen(l)}>
            <span className="lesson-icon">
              <Volume2 size={18} />
            </span>
            <span className="pt-main">
              <b>{l.title}</b>
              <small>
                {l.lines.length} 句 · {fmt(l.lines.at(-1)?.e ?? 0)}
              </small>
              <small className="lesson-first" lang="en">
                {l.lines[0]?.t}
              </small>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** 点读：点一句读一句；也可以整段连着读，读到哪句亮哪句 */
export function LessonView({ lesson, onBack }: { lesson: Lesson; onBack: () => void }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const stopAt = useRef<number | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  // 正在出声（整段或单句都算），吸顶条上的按钮随时能暂停
  const [playing, setPlaying] = useState(false);
  // 播放条滑到顶栏下面时吸住，并换成紧凑样式
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const hasZh = lesson.lines.some((l) => l.zh);
  const [showZh, setShowZh] = useState(false); // 默认只看英文，不懂再点开中文

  useEffect(() => {
    const a = new Audio(`${import.meta.env.BASE_URL}${lesson.audio}`);
    a.preload = "auto";
    audio.current = a;
    const tick = () => {
      const t = a.currentTime;
      const i = lesson.lines.findIndex((l) => t >= l.s - 0.05 && t < l.e + 0.25);
      if (i >= 0) setCurrent(i);
      if (stopAt.current !== null && t >= stopAt.current) {
        a.pause();
        stopAt.current = null;
      }
    };
    const end = () => {
      setPlaying(false);
      duck(false);
    };
    const start = () => setPlaying(true);
    a.addEventListener("timeupdate", tick);
    a.addEventListener("play", start);
    a.addEventListener("pause", end);
    a.addEventListener("ended", end);
    return () => {
      a.pause();
      a.removeEventListener("timeupdate", tick);
      a.removeEventListener("play", start);
      a.removeEventListener("pause", end);
      a.removeEventListener("ended", end);
      duck(false);
    };
  }, [lesson]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--top")) || 0;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < top + 1), {
      rootMargin: `-${top + 1}px 0px 0px 0px`,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // 当前句滚到可见
  useEffect(() => {
    if (current === null) return;
    document.getElementById(`ln-${current}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current]);

  const playLine = (i: number) => {
    const a = audio.current;
    if (!a) return;
    const l = lesson.lines[i];
    a.pause();
    a.currentTime = Math.max(0, l.s - 0.05);
    stopAt.current = l.e + 0.15;
    setCurrent(i);
    duck(true);
    void a.play().catch(() => null);
  };

  const toggleAll = () => {
    const a = audio.current;
    if (!a) return;
    if (playing) {
      a.pause();
      return;
    }
    stopAt.current = null;
    // 录音开头是报题号、读题目要求，整段播放从正文第一句开始
    if (current === null || a.ended) a.currentTime = Math.max(0, (lesson.lines[0]?.s ?? 0) - 0.3);
    duck(true);
    void a.play().catch(() => null);
  };

  return (
    <div className="page points lesson">
      <button className="btn btn-ghost btn-sm pt-back" onClick={onBack}>
        <ArrowLeft size={16} /> 返回课本
      </button>
      <p className="eyebrow">课文与对话 · 课本原声</p>
      <h1 className="display pt-title">{lesson.title}</h1>
      <div ref={sentinel} aria-hidden />
      <div className={`lesson-bar ${stuck ? "is-stuck" : ""}`}>
        {stuck && (
          <button className="btn btn-ghost lesson-bar-back" onClick={onBack} aria-label="返回课本">
            <ArrowLeft size={18} />
          </button>
        )}
        <button className="btn btn-primary" onClick={toggleAll}>
          {playing ? <Pause size={18} /> : <Play size={18} />} {playing ? "暂停" : stuck ? "播放" : "整段播放"}
        </button>
        {hasZh && (
          <button className={`btn btn-ghost ${showZh ? "is-on" : ""}`} onClick={() => setShowZh(!showZh)} aria-pressed={showZh}>
            <Languages size={18} /> {stuck ? "中文" : showZh ? "隐藏中文" : "显示中文"}
          </button>
        )}
      </div>
      <p className="muted lesson-tip">点一句，听一句，跟着读。{showZh && " 中文是参考译文，不是课本原文。"}</p>
      <ol className="lesson-lines">
        {lesson.lines.map((l, i) => (
          <li key={i} id={`ln-${i}`} className={current === i ? "is-on" : ""}>
            <button onClick={() => playLine(i)}>
              <span className="lesson-en" lang="en">
                {l.t}
              </span>
              {showZh && l.zh && <span className="lesson-zh">{l.zh}</span>}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
