import { BookOpen, Headphones, ListChecks, RotateCcw, Sparkles } from "lucide-react";
import { useAtlas } from "../atlas/context";
import { go } from "../lib/router";
import { cue } from "../lib/sound";
import { unitId, unitKey } from "../lib/unit";
import { isPassed, unitPassNeed } from "../store/game";
import { buildSession } from "../store/session";
import { isMastered } from "../store/srs";
import { store, useStore } from "../store/store";
import { Sheet } from "./Sheet";

const ROUND = 10;

/** 点首页学习路线上的单元圈圈：这个单元的进度 + 学新词、复习、看考点、查看词表 */
export function UnitSheet({ index, onClose }: { index: number | null; onClose: () => void }) {
  return (
    <Sheet open={index !== null} onClose={onClose} label="单元">
      {index !== null && <UnitPanel index={index} onDone={onClose} />}
    </Sheet>
  );
}

function UnitPanel({ index, onDone }: { index: number; onDone: () => void }) {
  const atlas = useAtlas();
  const progress = useStore((s) => s.progress);
  const settings = useStore((s) => s.settings);
  const title = atlas.cefr[index];
  const words = atlas.words.filter((w) => w.cefr === index);
  const fresh = words.filter((w) => !progress.cards[w.id]);
  const learned = words.filter((w) => progress.cards[w.id]);
  const mastered = learned.filter((w) => isMastered(progress.cards[w.id]));
  const passed = learned.filter((w) => isPassed(progress.cards[w.id])).length;
  const need = unitPassNeed(words.length);
  const chestDone = progress.game.units.includes(unitKey(atlas.book, title));
  const due = learned.filter((w) => progress.cards[w.id].due <= Date.now());
  const reviewIds = (due.length ? due : learned).slice(0, 30).map((w) => w.id);

  const startWith = (ids: string[]) => {
    const s = buildSession(atlas, progress, settings, { ids });
    if (!s.steps.length) return;
    store.progress((p) => ({ ...p, session: s }));
    if (settings.sfx) void cue("start");
    onDone();
    go({ page: "learn" });
  };
  const open = (fn: () => void) => () => {
    onDone();
    fn();
  };

  return (
    <div className="unit-panel">
      <p className="eyebrow">学习路线</p>
      <h2 className="display unit-panel-title">{title}</h2>
      <dl className="unit-panel-stats">
        <div>
          <dt>全部</dt>
          <dd>{words.length}</dd>
        </div>
        <div>
          <dt>已学</dt>
          <dd>{learned.length}</dd>
        </div>
        <div>
          <dt>已掌握</dt>
          <dd>{mastered.length}</dd>
        </div>
        <div>
          <dt>该复习</dt>
          <dd>{due.length}</dd>
        </div>
      </dl>
      <div className="unit-panel-bar" aria-hidden="true">
        <span className="seen" style={{ width: `${(learned.length / Math.max(1, words.length)) * 100}%` }} />
        <span className="done" style={{ width: `${(mastered.length / Math.max(1, words.length)) * 100}%` }} />
      </div>
      <div className="unit-panel-actions">
        <button className="btn btn-primary btn-xl" disabled={!fresh.length} onClick={() => startWith(fresh.slice(0, ROUND).map((w) => w.id))}>
          <Sparkles size={19} /> {fresh.length ? `学这个单元的新词（${Math.min(ROUND, fresh.length)} 个）` : "这个单元的新词都学过了"}
        </button>
        <button className="btn btn-ghost btn-xl" disabled={!learned.length} onClick={() => startWith(reviewIds)}>
          <RotateCcw size={19} /> {learned.length ? `复习这个单元（${reviewIds.length} 个）` : "还没学过，先学新词"}
        </button>
        <button className="btn btn-ghost btn-xl" onClick={open(() => go({ page: "points", unit: unitId(title) }))}>
          <Headphones size={19} /> 读这个单元的课文
        </button>
        <button className="btn btn-ghost btn-xl" onClick={open(() => go({ page: "points", unit: unitId(title), sec: "points" }))}>
          <ListChecks size={19} /> 看这个单元的考点
        </button>
        <button className="btn btn-ghost btn-xl" onClick={open(() => go({ page: "atlas", level: title, view: "grid" }))}>
          <BookOpen size={19} /> 查看词表
        </button>
      </div>
      {!chestDone && words.length > 0 && (
        <p className="muted unit-panel-note">
          单元宝箱：学完后隔一段时间再复习答对，才算记住。已记住 {passed} / {need} 个就能领{passed >= need && fresh.length ? "（还要先把新词学完）" : ""}。
        </p>
      )}
      {fresh.length > ROUND && <p className="muted unit-panel-note">每次学 {ROUND} 个，这个单元还有 {fresh.length} 个新词。</p>}
    </div>
  );
}
