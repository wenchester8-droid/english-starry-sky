import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useAtlas } from "../atlas/context";
import { bookById } from "../lib/books";
import { unitShort } from "../lib/unit";
import { store, useStore } from "../store/store";
import { Sheet } from "./Sheet";

/** 「从哪里开始」：从第一单元开始，或者自己选一个单元（单元列表来自当前这一册） */
export function StartChoice({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  const atlas = useAtlas();
  const [pick, setPick] = useState(value > 0);
  return (
    <div className="start-choice">
      <div className="segmented segmented-wide">
        <button className={!pick ? "is-on" : ""} aria-pressed={!pick} onClick={() => (setPick(false), onChange(0))}>
          从第一单元开始
        </button>
        <button className={pick ? "is-on" : ""} aria-pressed={pick} onClick={() => setPick(true)}>
          自己选单元
        </button>
      </div>
      {pick && (
        <div className="choice-grid">
          {atlas.cefr.map((name, i) => (
            <button key={name} className={`choice ${value === i ? "is-on" : ""}`} onClick={() => onChange(i)} aria-pressed={value === i}>
              <span className="chip chip-level">{unitShort(name)}</span>
              <b>{name}</b>
              <small>{atlas.words.filter((w) => w.cefr === i).length} 个词</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 切换到一本还没学过的册数时弹出：只问从哪里开始，不再走一遍新手引导 */
export function StartSheet() {
  const settings = useStore((s) => s.settings);
  const open = settings.onboarded && !(settings.book in settings.starts);
  const [level, setLevel] = useState(0);
  const save = (i: number) => store.settings({ startLevel: i, starts: { ...settings.starts, [settings.book]: i } });
  // 放到 body 下：顶栏有毛玻璃效果，弹窗放在里面会被裁掉
  return createPortal(
    <Sheet open={open} onClose={() => save(0)} label="从哪里开始">
      {open && (
        <div className="start-sheet">
          <p className="eyebrow">第一次学这一册</p>
          <h2 className="display">{bookById(settings.book).name}，从哪里开始？</h2>
          <StartChoice value={level} onChange={setLevel} />
          <button className="btn btn-primary btn-xl" onClick={() => save(level)}>
            开始学 <ArrowRight size={20} />
          </button>
        </div>
      )}
    </Sheet>,
    document.body,
  );
}
