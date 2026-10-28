import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAtlas } from "../atlas/context";
import { BOOKS, ZK_BOOK, bookById } from "../lib/books";
import { go } from "../lib/router";
import { cue } from "../lib/sound";
import { store, useStore } from "../store/store";
import { StartSheet } from "./StartPicker";
import { toast } from "./Toast";

/** 左上角「人教版七年级上册」：点开切换册数 */
export function BookSwitcher() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const settings = useStore((s) => s.settings);
  const current = bookById(settings.book);
  const [flip, setFlip] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0);
  // 切到做好的另一册：学过的接着上次的起点；没学过的，StartSheet 会问从哪里开始。
  // 换册时放一段「翻开新书」的过场，结束后回到今日页，让人确实感觉到换了一本书。
  const choose = (id: string) => {
    // 换年级时挑战模式自动关掉，底部回到「练习」（老师定：不默认挑战）
    store.settings({ book: id, startLevel: settings.starts[id] ?? 0, challenge: false });
    if (settings.sfx) void cue("book");
    setFlip(id);
  };
  const flipDone = () => {
    setFlip(null);
    go({ page: "today" });
    window.scrollTo({ top: 0 });
    setPulse((n) => n + 1);
  };

  useEffect(() => {
    if (!open) return;
    // 菜单一打开就先把各册课本封面加载好，点下去过场里的封面能立刻出现
    BOOKS.filter((b) => b.ready).forEach((b) => (new Image().src = coverUrl(b.id)));
    const close = (e: Event) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="book-switch" ref={box}>
      <button key={pulse} className={`book-switch-btn ${pulse ? "is-pulse" : ""}`} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        人教版{current.name}
        <ChevronDown size={14} className="book-switch-chev" />
      </button>
      {open && (
        <div className="book-switch-pop" role="menu">
          <p className="eyebrow">人教版 · 选择册数</p>
          <ul>
            {[...BOOKS, ZK_BOOK].map((b) => (
              <li key={b.id} className={b.id === "zk" ? "is-zk" : ""}>
                <button
                  role="menuitemradio"
                  aria-checked={b.id === current.id}
                  className={`${b.id === current.id ? "is-on" : ""} ${b.ready ? "" : "is-soon"}`}
                  onClick={() => {
                    if (!b.ready) toast(`${b.name}还在准备中`, "warn");
                    else if (b.id !== current.id) choose(b.id);
                    setOpen(false);
                  }}
                >
                  <span>{b.name}</span>
                  {b.id === current.id ? <Check size={18} /> : !b.ready && <small>准备中</small>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {flip && <BookFlip id={flip} onDone={flipDone} />}
      {!flip && <StartSheet />}
    </div>
  );
}

const COVERS: Record<string, string> = { "7a": "cover-7a", "7b": "cover-7b", "8a": "cover-8a", "8b": "cover-8b", "9": "cover-9" };
/** 册数封面 public/brand/book-<册号>.webp（开源版是 scripts/make_book_covers.py 画的） */
const coverUrl = (id: string) => `${import.meta.env.BASE_URL}brand/book-${id}.webp`;

/** 换册过场：课本封面翻过来，下面写着册名、单词数和单元数，约 1.2 秒后自己消失。
 *  封面图加载失败时，退回画出来的彩色封面。 */
function BookFlip({ id, onDone }: { id: string; onDone: () => void }) {
  const atlas = useAtlas();
  const ready = atlas.book === id;
  const [leaving, setLeaving] = useState(false);
  const [noImg, setNoImg] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const quiet = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t1 = setTimeout(() => setLeaving(true), quiet ? 700 : 1150);
    const t2 = setTimeout(() => done.current(), quiet ? 900 : 1450);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
  return createPortal(
    <div className={`book-flip ${leaving ? "is-leaving" : ""}`} role="status" aria-live="polite" onClick={() => done.current()}>
      <div className={`book-flip-cover ${noImg ? (COVERS[id] ?? "") : "has-img"}`}>
        {noImg ? (
          <>
            <small>人教版 · 英语</small>
            <b>{bookById(id).name}</b>
          </>
        ) : (
          <img src={coverUrl(id)} alt={`人教版英语${bookById(id).name}课本封面`} onError={() => setNoImg(true)} />
        )}
        <span className="book-flip-spine" aria-hidden="true" />
      </div>
      <p className="book-flip-tip">
        <b>已切换到{bookById(id).name}</b>
        <small>{ready ? `${atlas.count} 个单词 · ${atlas.cefr.length} 个单元` : "正在翻开…"}</small>
      </p>
    </div>,
    document.body,
  );
}
