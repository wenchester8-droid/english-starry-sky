import { BookOpenCheck, Check, ChevronLeft, Maximize2, Minimize2, Trophy, Volume2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAtlas } from "../atlas/context";
import { play } from "../lib/audio";
import { openWord } from "../lib/router";
import { cue } from "../lib/sound";
import { bookLevel, IMG, imgUrl, isSix, LEVEL_NAME, points, statusOf, unlockHint, useReading, type Article, type Cand, type Explain, type Status } from "../lib/reading";
import { bookById } from "../lib/books";
import { challengeEarnedToday, challengePass, recordReading } from "../store/game";
import { store, useStore } from "../store/store";
import { Sheet } from "../ui/Sheet";
import { toast } from "../ui/Toast";

/* 挑战模式 · 真题阅读馆：按学生学过的词挑出他能读懂的河南中考、模拟卷阅读，读原文、点生词、做原题。
   打开挑战模式后，底部「练习」变成「挑战」，就是这一页。 */

/** 挑战模式开关：练习页和挑战页的页头都有，「我的」页设置里也有 */
export function ChallengeSwitch() {
  const on = useStore((s) => s.settings.challenge);
  return (
    <label className="challenge-switch toggle">
      <Trophy size={16} />
      <b>挑战模式</b>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(e) => {
          store.settings({ challenge: e.target.checked });
          window.scrollTo({ top: 0 });
        }}
      />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}

type Tab = "all" | "ok" | "stretch" | "done";
const TABS: [Tab, string][] = [
  ["all", "全部"],
  ["ok", "能读"],
  ["stretch", "有点难"],
  ["done", "读过的"],
];

export function Challenge() {
  const { list, error } = useReading();
  const cards = useStore((s) => s.progress.cards);
  const reading = useStore((s) => s.progress.reading);
  const game = useStore((s) => s.progress.game);
  const [tab, setTab] = useState<Tab>("all");
  const [open, setOpen] = useState<string | null>(null);
  const book = useStore((s) => s.settings.book);
  const level = bookLevel(book);
  const learned = useMemo(() => new Set(Object.keys(cards)), [cards]);
  const all = useMemo(() => (list ?? []).map((a) => statusOf(a, learned, level)), [list, learned, level]);
  const hint = useMemo(() => unlockHint(all, learned, level), [all, learned, level]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [open]);

  const current = open ? all.find((s) => s.article.id === open) : undefined;
  if (current) return <Reader status={current} onExit={() => setOpen(null)} />;

  const readable = all.filter((s) => s.level !== "hard");
  const shown = readable
    .filter((s) => (tab === "all" ? true : tab === "done" ? !!reading[s.article.id] : s.level === tab))
    .sort((a, b) => Number(!!reading[a.article.id]) - Number(!!reading[b.article.id]) || a.rate - b.rate);
  const okN = readable.filter((s) => s.level === "ok").length;
  const doneN = Object.keys(reading).length;

  return (
    <div className="page challenge">
      <header className="page-head">
        <div className="challenge-head">
          <p className="eyebrow">挑战 · 真题阅读馆</p>
          <ChallengeSwitch />
        </div>
        <h1 className="display">读真题，做原题。</h1>
        <p className="lede">
          这里的文章都来自河南中考和各地模拟卷，答案老师核对过。只列出你能读懂的文章：按{level ? `${bookById(book).name}之前各册的单词` : "七上课本里的词"}，加上你在网页里学过的词来算。学的单词越多，能读的越多。
        </p>
      </header>

      {error && <p className="sheet-error">{error}</p>}
      {!list && !error && <span className="spinner" />}

      {list && (
        <>
          <dl className="mini-stats challenge-stats">
            <div>
              <dt>能读</dt>
              <dd>
                {okN}
                <small> 篇</small>
              </dd>
            </div>
            <div>
              <dt>有点难</dt>
              <dd>
                {readable.length - okN}
                <small> 篇</small>
              </dd>
            </div>
            <div>
              <dt>读过</dt>
              <dd>
                {doneN}
                <small> 篇</small>
              </dd>
            </div>
            <div>
              <dt>今日挑战宝箱</dt>
              <dd className="challenge-chest-state">{challengeEarnedToday(game) ? "已拿到" : "还没拿"}</dd>
            </div>
          </dl>

          {hint.words.length > 0 && hint.gain > 0 && <UnlockHint words={hint.words} gain={hint.gain} />}

          <div className="segmented segmented-wide challenge-tabs">
            {TABS.map(([k, label]) => (
              <button key={k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)} aria-pressed={tab === k}>
                {label}
              </button>
            ))}
          </div>

          {shown.length ? (
            <ul className="rd-list">
              {shown.map((s) => {
                const r = reading[s.article.id];
                return (
                  <li key={s.article.id}>
                    <button className="rd-item" onClick={() => setOpen(s.article.id)}>
                      <span className="rd-item-main">
                        <b lang="en">{s.article.title}</b>
                        <small>
                          {s.article.src} · {s.article.words} 词 · 生词 {s.unknown.length} 个
                        </small>
                      </span>
                      <span className="rd-item-side">
                        {r ? (
                          <em className={`rd-score ${challengePass(r.right, r.total) ? "is-good" : ""}`}>
                            {r.right}/{r.total}
                          </em>
                        ) : (
                          <em className={`rd-level lv-${s.level}`}>{LEVEL_NAME[s.level]}</em>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <section className="panel rd-empty">
              {readable.length ? (
                <p>{tab === "done" ? "还没有读过的文章。挑一篇「能读」的开始吧。" : "这一类暂时没有文章。"}</p>
              ) : (
                <>
                  <p>现在还没有你能读的文章。多学一些单词（可以在左上角切换到八上、九年级提前学），能读的文章就会出现。</p>
                  {hint.words.length > 0 && <p className="muted">真题里最常见、你还没学的词，见上面的提示。</p>}
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** 「再学这几个词，多解锁 N 篇」：点词看词条 */
function UnlockHint({ words, gain }: { words: string[]; gain: number }) {
  const atlas = useAtlas();
  return (
    <section className="panel rd-hint">
      <p>
        <BookOpenCheck size={18} /> 学会下面这 {words.length} 个课本单词，能再解锁 <b>{gain}</b> 篇文章：
      </p>
      <div className="rd-hint-words">
        {words.map((id) => (
          <button key={id} className="chip-btn" onClick={() => openWord(id)} lang="en">
            {atlas.byId.get(id)?.word ?? id}
          </button>
        ))}
      </div>
      <small className="muted">点单词看词条；在左上角切换到对应的册数，就能在「今日」里学它们。</small>
    </section>
  );
}

/* ---------- 读文章、点生词、做题 ---------- */

const WORD_RE = /([A-Za-z]+(?:['’][a-z]+)?)/;
// 六选五的空格编号：前后有多个空格或下划线（行首的也算），或者写成（36）
const BLANK_RE = /(?:^|\s{2,}|_{2,}|[（(]\s*)(\d{1,2})(?=\s{2,}|_{2,}|\s*[)）]|\s*$)[)）]?/;

function Reader({ status, onExit }: { status: Status; onExit: () => void }) {
  const a = status.article;
  const atlas = useAtlas();
  const accent = useStore((s) => s.settings.accent);
  const sfx = useStore((s) => s.settings.sfx);
  const prev = useStore((s) => s.progress.reading[a.id]);
  const [word, setWord] = useState<Cand | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ right: number; total: number; first: boolean; chest: boolean } | null>(null);
  const [warn, setWarn] = useState("");
  /** 手机上文章窗口的大小：做题时文章固定在上面、在框里滚动，可以放大看 */
  const [big, setBig] = useState(false);

  // 原文里的写法 → 生词（只标这个学生还不认识的）
  const surf = useMemo(() => {
    const m = new Map<string, Cand>();
    for (const c of status.unknown) for (const s of c[4]) m.set(s, c);
    return m;
  }, [status.unknown]);

  const keys = a.qs.flatMap((q) => (isSix(q) ? q.blanks.map((b) => `b${b}`) : [`q${q.n}`]));
  const answerOf = (k: string) => {
    for (const q of a.qs) {
      if (isSix(q) && k.startsWith("b") && q.blanks.includes(Number(k.slice(1)))) return q.ans[k.slice(1)];
      if (!isSix(q) && k === `q${q.n}`) return q.ans;
    }
    return "";
  };

  // 答错的题：解析的原文依据要在文章里标出来（答对的不显示解析，老师定）
  const explainOf = (k: string): Explain | undefined => {
    for (const q of a.qs) {
      if (isSix(q) && k.startsWith("b") && q.blanks.includes(Number(k.slice(1)))) return q.ex?.[k.slice(1)];
      if (!isSix(q) && k === `q${q.n}`) return q.ex;
    }
  };
  const wrong = done ? keys.filter((k) => picks[k] !== answerOf(k)) : [];
  const evs = wrong.map((k) => ({ k, ev: explainOf(k)?.ev ?? "" })).filter((x) => x.ev);

  const submit = () => {
    const left = keys.filter((k) => !picks[k]).length;
    if (left) {
      setWarn(`还有 ${left} ${a.qs.some(isSix) ? "个空" : "道题"}没选`);
      return;
    }
    const right = keys.filter((k) => picks[k] === answerOf(k)).length;
    const total = points(a);
    const r = recordReading(a.id, right, total);
    setDone({ right, total, ...r });
    if (sfx) void cue(right === total ? "complete" : right >= total - 1 ? "correct" : "wrong");
    if (r.chest) toast("挑战宝箱到手！", "ok");
    window.setTimeout(() => document.querySelector(".rd-result")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const renderText = (text: string, key: string) => {
    const out: React.ReactNode[] = [];
    let rest = text;
    let n = 0;
    while (rest) {
      const m = BLANK_RE.exec(rest);
      const chunk = m ? rest.slice(0, m.index) : rest;
      for (const [i, part] of chunk.split(WORD_RE).entries()) {
        if (!part) continue;
        // 只有下划线、没有编号的空（「________」）
        if (i % 2 === 0 && /_{3,}/.test(part)) {
          for (const [j, bit] of part.split(/(_{3,})/).entries())
            if (bit) out.push(j % 2 ? <span key={`${key}-${n++}`} className="rd-blank" /> : <span key={`${key}-${n++}`}>{bit}</span>);
          continue;
        }
        const c = i % 2 === 1 ? surf.get(part.toLowerCase().replace("’", "'")) ?? surf.get(part.toLowerCase()) : undefined;
        out.push(
          c ? (
            <button key={`${key}-${n++}`} className="rd-unk" onClick={() => setWord(c)}>
              {part}
            </button>
          ) : (
            <span key={`${key}-${n++}`}>{part}</span>
          ),
        );
      }
      if (!m) break;
      out.push(
        <span key={`${key}-${n++}`} className="rd-blank">
          {m[1]}
        </span>,
      );
      rest = rest.slice(m.index + m[0].length);
    }
    return out;
  };

  /** 一段文字里有答错题的原文依据：把那句标黄（id 用来「在原文中看」时滚过去） */
  const renderMarked = (text: string, key: string): React.ReactNode[] => {
    const hit = evs.map((x) => ({ ...x, at: text.indexOf(x.ev) })).filter((x) => x.at >= 0).sort((a, b) => a.at - b.at)[0];
    if (!hit) return renderText(text, key);
    return [
      ...renderText(text.slice(0, hit.at), `${key}a`),
      <mark key={`${key}m`} id={`ev-${hit.k}`} className="rd-ev">
        {renderText(hit.ev, `${key}m`)}
      </mark>,
      ...renderMarked(text.slice(hit.at + hit.ev.length), `${key}b`),
    ];
  };

  const renderLine = (line: string, i: number) => {
    const parts = line.split(IMG);
    return (
      <p key={i} lang="en">
        {parts.map((p, k) => (k % 2 === 1 ? <img key={k} className="rd-img" src={imgUrl(p)} alt="" loading="lazy" /> : renderMarked(p, `${i}-${k}`)))}
      </p>
    );
  };

  /** 答错的题下面显示解析 */
  const ExplainBox = ({ k }: { k: string }) => {
    if (!done || picks[k] === answerOf(k)) return null;
    const ex = explainOf(k);
    return (
      <div className="rd-ex">
        <p>
          <b>解析</b> 正确答案是 <b>{answerOf(k)}</b>。{ex?.why ?? ""}
        </p>
        {ex?.ev && (
          <button className="rd-ex-go" onClick={() => document.getElementById(`ev-${k}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>
            在原文中看依据（已标黄）
          </button>
        )}
      </div>
    );
  };

  const optText = (t: string) => {
    const m = /^\[图:([^\]]+)\]$/.exec(t.trim());
    return m ? <img className="rd-opt-img" src={imgUrl(m[1])} alt="" /> : <span lang="en">{t}</span>;
  };

  const mark = (k: string, letter: string) => {
    if (!done) return "";
    if (letter === answerOf(k)) return "is-right";
    if (picks[k] === letter) return "is-wrong";
    return "";
  };

  return (
    <div className="page challenge rd">
      <header className="rd-top">
        <button className="btn btn-ghost" onClick={onExit}>
          <ChevronLeft size={18} /> 返回
        </button>
        <span className="rd-src">
          出处：{a.src}
          <em className={`rd-level lv-${status.level}`}>{LEVEL_NAME[status.level]}</em>
        </span>
      </header>

      {/* 文章和题目分开滚动：电脑上左右两栏，手机上文章固定在上面，一边看文章一边做题 */}
      <div className="rd-split">
      <article className={`panel rd-body ${big ? "is-big" : ""}`}>
        <button className="rd-size" onClick={() => setBig(!big)} aria-label={big ? "文章窗口缩小" : "文章窗口放大"}>
          {big ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          {big ? "缩小" : "放大"}
        </button>
        {a.body.map(renderLine)}
        {status.unknown.length > 0 && <p className="rd-tip">画虚线的是你还没学过的词，点一下看意思。</p>}
      </article>

      <section className="panel rd-qs">
        <h3 className="eyebrow">做原题</h3>
        {prev && !done && (
          <p className="muted">
            这篇你读过了，第一次的成绩是 {prev.right}/{prev.total}。可以再做一遍，这次不重复记成绩。
          </p>
        )}
        {a.qs.map((q, qi) =>
          isSix(q) ? (
            <div key={qi} className="rd-q rd-six">
              <p className="rd-stem">从下面的选项中选出能填入空白处的最佳选项（有一项多余）：</p>
              <ul className="rd-six-opts">
                {q.opts.map(([l, t]) => (
                  <li key={l}>
                    <b>{l}.</b> {optText(t)}
                  </li>
                ))}
              </ul>
              {q.blanks.map((b) => (
                <div key={b} className="rd-six-row">
                  <span className="rd-blank">{b}</span>
                  <div className="rd-six-picks">
                    {q.opts.map(([l]) => (
                      <button
                        key={l}
                        className={`rd-pick ${picks[`b${b}`] === l ? "is-on" : ""} ${mark(`b${b}`, l)}`}
                        disabled={!!done}
                        onClick={() => {
                          setWarn("");
                          setPicks((p) => ({ ...p, [`b${b}`]: l }));
                        }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <ExplainBox k={`b${b}`} />
                </div>
              ))}
            </div>
          ) : (
            <div key={qi} className="rd-q">
              <p className="rd-stem" lang="en">
                <b>{q.n}.</b> {q.stem.split(IMG).map((p, k) => (k % 2 === 1 ? <img key={k} className="rd-img" src={imgUrl(p)} alt="" /> : p))}
              </p>
              <ul className={`rd-opts ${q.opts.some(([, t]) => t.startsWith("[图:")) ? "has-img" : ""}`}>
                {q.opts.map(([l, t]) => (
                  <li key={l}>
                    <button
                      className={`rd-opt ${picks[`q${q.n}`] === l ? "is-on" : ""} ${mark(`q${q.n}`, l)}`}
                      disabled={!!done}
                      onClick={() => {
                        setWarn("");
                        setPicks((p) => ({ ...p, [`q${q.n}`]: l }));
                      }}
                    >
                      <b>{l}.</b> {optText(t)}
                      {done && l === answerOf(`q${q.n}`) && <Check size={16} />}
                      {done && picks[`q${q.n}`] === l && l !== answerOf(`q${q.n}`) && <X size={16} />}
                    </button>
                  </li>
                ))}
              </ul>
              <ExplainBox k={`q${q.n}`} />
            </div>
          ),
        )}

        {!done ? (
          <>
            {warn && <p className="rd-warn">{warn}</p>}
            <button className="btn btn-primary btn-xl" onClick={submit}>
              交卷
            </button>
          </>
        ) : (
          <div className="rd-result">
            <p className="display rd-big">
              <b className={challengePass(done.right, done.total) ? "is-pass" : ""}>{done.right}</b>
              <span className="rd-slash">/</span>
              <span className="rd-total">{done.total}</span>
              <small>答对</small>
            </p>
            <p>
              {done.first
                ? done.chest
                  ? "全对或只错 1 题，挑战宝箱到手！"
                  : challengePass(done.right, done.total)
                    ? "做得好！今天的挑战宝箱已经拿过了，明天再来。"
                    : "最多错 1 题才有挑战宝箱。看看错在哪，再挑一篇试试。"
                : "这篇之前读过，这次的成绩不重复记。"}
            </p>
            <div className="summary-actions">
              <button className="btn btn-primary" onClick={onExit}>
                再读一篇
              </button>
            </div>
          </div>
        )}
      </section>
      </div>

      <Sheet open={!!word} onClose={() => setWord(null)} label="生词" className="rd-word-sheet">
        {word && (
          <div className="rd-word">
            <p className="rd-word-head" lang="en">
              <b>{word[1] ? (atlas.byId.get(word[1])?.word ?? word[0]) : word[0]}</b>
              <button className="icon-btn" onClick={() => void play(null, word[0], accent)} aria-label="读音">
                <Volume2 size={18} />
              </button>
            </p>
            {word[1] ? (
              <>
                <p>{atlas.byId.get(word[1])?.zh}</p>
                <p className="muted">课本里的单词，还没学过。打开词条可以看图、听例句。</p>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const id = word[1]!;
                    setWord(null);
                    openWord(id);
                  }}
                >
                  打开词条
                </button>
              </>
            ) : (
              <>
                <p>{word[2] ?? "（暂时没有释义）"}</p>
                <p className="muted">这个词不在课本词表里，读懂文章用，不用背。</p>
              </>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

export type { Article };
