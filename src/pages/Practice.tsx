import { Check, Eye, Headphones, Languages, RotateCcw, Snail, Type, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { prefetch, useAtlas } from "../atlas/context";
import { MEDIA, type Entry } from "../atlas/types";
import { play, stopAudio } from "../lib/audio";
import { cue } from "../lib/sound";
import { hashSeed, shuffle } from "../lib/text";
import { store, useStore } from "../store/store";
import { AmbiencePicker } from "../ui/Ambience";
import { Illustration } from "../ui/Illustration";
import { Quiz, WrongPanel, type Item } from "./Points";
import { ChallengeSwitch } from "./Challenge";

/** 三种听写都写在本子上：屏幕出题、给答案，学生自己判对错（考试是手写，不练打字） */
type Mode = "word" | "dictation" | "sentence";
type Source = "recent" | "mistakes" | "saved" | "path";

const MODES: [Mode, string, string, typeof Type][] = [
  ["word", "单词听写", "听发音、看图，写出单词", Type],
  ["dictation", "短句听写", "听英文短句，写下整句", Headphones],
  ["sentence", "中文听写", "看中文意思，写出英文句子", Languages],
];
const SOURCES: [Source, string][] = [
  ["recent", "最近学过"],
  ["mistakes", "错词本"],
  ["saved", "收藏"],
  ["path", "学习路线"],
];

const RANGE_KEY = "word-atlas:practice-range:";
const unitShort = (u: string) => u.replace(/^Starter Unit /, "预备").replace(/^Unit /, "");
const sorted = (a: number, b: number): [number, number] => (a <= b ? [a, b] : [b, a]);

function loadRange(book: string, n: number, start: number): [number, number] {
  try {
    const r = JSON.parse(localStorage.getItem(RANGE_KEY + book) || "null");
    if (Array.isArray(r) && r[0] >= 0 && r[1] < n && r[0] <= r[1]) return [r[0], r[1]];
  } catch {
    /* optional */
  }
  return [Math.min(start, n - 1), n - 1];
}

/** 单元范围：点一个只练这一单元，再点一个就选中两者之间的全部；也可以按住拖过去 */
function UnitRange({ units, value, onChange }: { units: string[]; value: [number, number]; onChange: (r: [number, number]) => void }) {
  const [anchor, setAnchor] = useState<number | null>(null);
  const drag = useRef<{ from: number; moved: boolean; second: boolean } | null>(null);
  const at = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-u]");
    return el ? Number(el.dataset.u) : null;
  };
  const [lo, hi] = value;
  return (
    <div className="unit-range">
      <div
        className="unit-range-track"
        onPointerDown={(e) => {
          const u = at(e.clientX, e.clientY);
          if (u === null) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const second = anchor !== null && anchor !== u;
          const from = second ? anchor : u;
          drag.current = { from, moved: false, second };
          onChange(sorted(from, u));
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          const u = d && at(e.clientX, e.clientY);
          if (!d || u === null) return;
          if (u !== d.from) d.moved = true;
          onChange(sorted(d.from, u));
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          setAnchor(d.moved || d.second ? null : d.from);
        }}
        onPointerCancel={() => (drag.current = null)}
      >
        {units.map((u, i) => (
          <button
            key={u}
            type="button"
            data-u={i}
            className={`${i >= lo && i <= hi ? "is-in" : ""} ${i === lo ? "is-lo" : ""} ${i === hi ? "is-hi" : ""} ${i === anchor ? "is-anchor" : ""}`}
            aria-pressed={i >= lo && i <= hi}
            aria-label={u}
          >
            {unitShort(u)}
          </button>
        ))}
      </div>
      <div className="unit-range-foot">
        <small>{anchor !== null ? "再点一个单元，就选到那里为止" : "点一个单元只练它；再点另一个，中间的都选上；也可以按住拖动"}</small>
        {(lo !== 0 || hi !== units.length - 1) && (
          <button
            type="button"
            className="unit-range-all"
            onClick={() => {
              setAnchor(null);
              onChange([0, units.length - 1]);
            }}
          >
            全部单元
          </button>
        )}
      </div>
    </div>
  );
}

export function Practice() {
  const atlas = useAtlas();
  const progress = useStore((s) => s.progress);
  const startLevel = useStore((s) => s.settings.startLevel);
  const [mode, setMode] = useState<Mode>("word");
  const [source, setSource] = useState<Source>(() => (Object.keys(progress.cards).length ? "recent" : "path"));
  const [ranges, setRanges] = useState<Record<string, [number, number]>>({});
  const book = atlas.book ?? "7a";
  const range = ranges[book] ?? loadRange(book, atlas.cefr.length, startLevel);
  const setRange = (r: [number, number]) => {
    setRanges((m) => ({ ...m, [book]: r }));
    try {
      localStorage.setItem(RANGE_KEY + book, JSON.stringify(r));
    } catch {
      /* optional */
    }
  };
  const [round, setRound] = useState<{ entries: Entry[]; key: number } | null>(null);
  const [quiz, setQuiz] = useState<{ items: Item[]; title: string } | null>(null);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [quiz]);

  const pool = useMemo(() => {
    const learned = Object.entries(progress.cards)
      .sort((a, b) => (b[1].last ?? 0) - (a[1].last ?? 0))
      .map(([id]) => id);
    const ids =
      // 学习路线：本册选中单元范围里的全部单词，学生自己挑练哪几个单元
      source === "recent"
        ? learned
        : source === "mistakes"
          ? progress.mistakes
          : source === "saved"
            ? progress.bookmarks
            : atlas.words.filter((w) => w.cefr >= range[0] && w.cefr <= range[1]).map((w) => w.id);
    // 短句、中文听写只算有例句的词：显示的就是实际能出的句子数，抽题也不会抽到空的
    return ids.filter((id) => {
      const w = atlas.byId.get(id);
      return !!w && (mode === "word" || (w.media & MEDIA.ex) > 0);
    });
  }, [atlas, progress.cards, progress.mistakes, progress.bookmarks, source, range[0], range[1], mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    // 最近学过：从最近的 60 个里抽，练的是刚学的；其他来源：整个来源里随机抽（原来只从前 60 个抽，学习路线总是抽到第一单元）
    const ids = shuffle(source === "recent" ? pool.slice(0, 60) : pool, hashSeed(String(Date.now()))).slice(0, 10);
    const entries = (await prefetch(atlas, ids)).filter((e): e is Entry => !!e && (mode === "word" || e.ex.length > 0));
    if (entries.length) setRound({ entries, key: Date.now() });
  };

  if (quiz) return <Quiz items={quiz.items} title={quiz.title} onExit={() => setQuiz(null)} />;
  if (round) return <PaperRound key={round.key} mode={mode} entries={round.entries} onExit={() => setRound(null)} onAgain={start} />;

  const rounds = progress.typing.filter((t) => t.mode === mode);
  const noun = mode === "word" ? "词" : mode === "dictation" ? "短句" : "句子";
  const best = rounds.reduce((m, t) => Math.max(m, t.accuracy), 0);
  return (
    <div className="page practice">
      <header className="page-head">
        <div className="challenge-head">
          <p className="eyebrow">练习</p>
          <ChallengeSwitch />
        </div>
        <h1 className="display">拿出本子，写下来。</h1>
        <p className="lede">屏幕出题，你在本子上写，写完对答案。写错的会进错词本，不会改动记忆进度。</p>
      </header>
      <div className="practice-grid">
        <section className="panel">
          <h3 className="eyebrow">模式</h3>
          <div className="mode-cards">
            {MODES.map(([k, name, desc, Icon]) => (
              <button key={k} className={`mode-card ${mode === k ? "is-on" : ""}`} onClick={() => setMode(k)} aria-pressed={mode === k}>
                <Icon size={22} strokeWidth={1.7} />
                <b>{name}</b>
                <small>{desc}</small>
              </button>
            ))}
          </div>
          {/* 短句、中文听写写的是这些词的例句，标题和说明跟着改，免得学生以为还是写单词 */}
          <h3 className="eyebrow">{mode === "word" ? "词来自" : "句子来自（用这些词的例句出题）"}</h3>
          <div className="segmented segmented-wide segmented-wrap">
            {SOURCES.map(([k, label]) => (
              <button key={k} className={source === k ? "is-on" : ""} onClick={() => setSource(k)} aria-pressed={source === k}>
                {label}
              </button>
            ))}
          </div>
          {source === "path" && <UnitRange units={atlas.cefr} value={range} onChange={setRange} />}
          <p className="muted">
            {pool.length
              ? source === "path"
                ? `${atlas.cefr[range[0]]}${range[1] !== range[0] ? ` – ${atlas.cefr[range[1]]}` : ""}，共 ${pool.length} 个${noun}，每轮随机抽 ${Math.min(10, pool.length)} 个。${mode === "sentence" ? "" : "每题都会自动朗读，家长不会读也能照着屏幕给孩子听写。"}`
                : source === "recent"
                  ? pool.length <= 10
                    ? `最近学过 ${pool.length} 个${noun}，每轮全部练一遍。`
                    : `从最近学过的 ${Math.min(pool.length, 60)} 个${noun}里，每轮随机抽 10 个。`
                  : pool.length <= 10
                    ? `共 ${pool.length} 个${noun}，每轮全部练一遍。`
                    : `共 ${pool.length} 个${noun}，每轮随机抽 10 个。`
              : `这里还没有${noun}。先去学几个${noun}，或者换成「学习路线」。`}
          </p>
          <button className="btn btn-primary btn-xl" onClick={start} disabled={!pool.length}>
            开始一轮
          </button>
        </section>
        <WrongPanel onPractice={(items, title) => setQuiz({ items, title })} />
        <section className="panel practice-side">
          <img src={`${import.meta.env.BASE_URL}brand/listen.webp`} alt="" />
          <dl className="mini-stats">
            <div>
              <dt>最好成绩</dt>
              <dd>
                {best}
                <small>% 全对</small>
              </dd>
            </div>
            <div>
              <dt>完成轮次</dt>
              <dd>{rounds.length}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

/* ---------- 写在本子上：听或看，写下来，再对答案、自己判对错 ---------- */

/** 把答案里容易写错的地方标出来：本词、大写字母、标点 */
function markTricky(sentence: string, word: string) {
  const out: { text: string; kind: "word" | "cap" | "punct" | "" }[] = [];
  const head = word.toLowerCase().split(/\s+/)[0];
  for (const tok of sentence.match(/[A-Za-z]+(?:['’][A-Za-z]+)*|[^A-Za-z\s]+|\s+/g) ?? []) {
    if (/^[A-Za-z]/.test(tok)) {
      const low = tok.toLowerCase();
      if (head && (low === head || (low.startsWith(head) && low.length - head.length <= 3))) out.push({ text: tok, kind: "word" });
      else if (/[A-Z]/.test(tok)) out.push({ text: tok, kind: "cap" });
      else out.push({ text: tok, kind: "" });
    } else if (/\S/.test(tok)) out.push({ text: tok, kind: "punct" });
    else out.push({ text: tok, kind: "" });
  }
  return out;
}

function PaperRound({ mode, entries, onExit, onAgain }: { mode: Mode; entries: Entry[]; onExit: () => void; onAgain: () => void }) {
  const atlas = useAtlas();
  const settings = useStore((s) => s.settings);
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [results, setResults] = useState<boolean[]>([]);
  const e = entries[i];
  const done = i >= entries.length;
  const answer = (x: Entry) => (mode === "word" ? x.w : x.ex[0].en);
  const say = (rate = 1) =>
    mode === "word" ? play(atlas.audio(e, settings.accent), e.w, settings.accent, rate) : play(atlas.audio(e, "ex"), e.ex[0].en, settings.accent, rate);

  useEffect(() => {
    // 中文听写不自动读，读了就成了短句听写
    if (!done && mode !== "sentence") void say();
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopAudio(), []);

  const judge = (ok: boolean) => {
    if (settings.sfx) void cue(ok ? "correct" : "wrong");
    const next = [...results, ok];
    setResults(next);
    // 写错的词进错词本，以后在「错词本」里还能再练
    if (!ok) store.progress((p) => ({ ...p, mistakes: [e.id, ...p.mistakes.filter((x) => x !== e.id)].slice(0, 300) }));
    if (i + 1 >= entries.length) {
      const right = next.filter(Boolean).length;
      store.progress((p) => ({
        ...p,
        typing: [...p.typing, { at: Date.now(), mode, items: entries.length, wpm: 0, accuracy: Math.round((right / entries.length) * 100) }].slice(-500),
      }));
      if (settings.sfx) void cue("complete");
    }
    setShown(false);
    setI(i + 1);
  };

  const unit = mode === "word" ? "个" : "句";
  if (done) {
    const right = results.filter(Boolean).length;
    const wrong = entries.filter((_, k) => !results[k]);
    return (
      <div className="page practice">
        <section className="panel typing-done">
          <p className="eyebrow">{MODES.find((m) => m[0] === mode)?.[1]}完成</p>
          <h1 className="display">
            {right}
            <small>
              /{entries.length} {unit}全对
            </small>
          </h1>
          {wrong.length > 0 && (
            <div className="paper-wrong">
              <p className="lede">这几{unit}写错了，已经放进错词本：</p>
              <ul>
                {wrong.map((w) => (
                  <li key={w.id} lang="en">
                    {answer(w)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="summary-actions">
            <button className="btn btn-ghost" onClick={onExit}>
              返回
            </button>
            <button className="btn btn-primary btn-xl" onClick={onAgain} autoFocus>
              <RotateCcw size={18} /> 再来一轮
            </button>
          </div>
        </section>
      </div>
    );
  }

  const parts = markTricky(answer(e), e.w);
  const tip =
    mode === "word" ? "听发音、看图和意思，在本子上写出这个单词。" : mode === "dictation" ? "听英文句子，在本子上写下整句。注意大小写和标点。" : "看中文意思，在本子上写出英文句子。注意大小写和标点。";
  return (
    <div className="page practice typing paper">
      <header className="typing-top">
        <button className="btn btn-ghost" onClick={onExit}>
          结束
        </button>
        <AmbiencePicker />
        <div className="learn-progress">
          <span style={{ width: `${(i / entries.length) * 100}%` }} />
        </div>
        <span className="typing-meter">
          第 <b>{i + 1}</b>/{entries.length} {unit}
        </span>
      </header>
      <section className="paper-stage">
        <p className="paper-tip">{tip}</p>
        {mode === "word" && (
          <div className="paper-cue">
            <Illustration src={atlas.img(e)} word={e.w} topic={0} eager />
            <p>
              <span className="pos">{e.senses[0].pos}</span> {e.senses[0].zh}
            </p>
          </div>
        )}
        {mode === "sentence" && <p className="paper-zh">{e.ex[0].zh}</p>}
        <div className="paper-listen">
          <button className={`btn ${mode === "sentence" ? "btn-ghost" : "btn-primary btn-xl"}`} onClick={() => say()}>
            <Headphones size={20} /> {mode === "sentence" ? "想不起来？听一遍" : "再听一遍"}
          </button>
          {mode !== "sentence" && (
            <button className="btn btn-ghost" onClick={() => say(0.7)}>
              <Snail size={18} /> 慢速
            </button>
          )}
        </div>

        {!shown ? (
          <button className="btn btn-ghost btn-xl paper-reveal" onClick={() => setShown(true)}>
            <Eye size={20} /> 写好了，看答案
          </button>
        ) : (
          <div className="paper-answer">
            <p className={`paper-sentence ${mode === "word" ? "is-word" : ""}`} lang="en">
              {parts.map((p, k) => (p.kind ? <mark key={k} className={`pm-${p.kind}`}>{p.text}</mark> : <span key={k}>{p.text}</span>))}
            </p>
            {mode === "word" ? (
              <p className="muted">{e.uk}</p>
            ) : (
              <>
                {mode === "dictation" && <p className="paper-zh-small">{e.ex[0].zh}</p>}
                <p className="paper-legend">
                  <mark className="pm-word">本课单词 {e.w}</mark>
                  <mark className="pm-cap">大写</mark>
                  <mark className="pm-punct">标点</mark>
                </p>
              </>
            )}
            <p className="muted">{mode === "word" ? "一个字母一个字母地对照，全对才算对。" : "逐个对照，单词拼写、大小写、标点都对，才算全对。"}</p>
            <div className="paper-judge">
              <button className="btn btn-ghost btn-xl" onClick={() => judge(false)}>
                <X size={20} /> 有错
              </button>
              <button className="btn btn-primary btn-xl" onClick={() => judge(true)}>
                <Check size={20} /> 全对
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
