import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState } from "react";
import { useAtlas } from "../atlas/context";
import { BOOKS, bookById, suggestBook } from "../lib/books";
import { APP_NAME } from "../lib/unit";
import { store, useStore } from "../store/store";
import { StartChoice } from "../ui/StartPicker";
import { toast } from "../ui/Toast";

/** 第一次打开：① 选册数（按日期预选好）② 从哪里开始。每天几颗新星默认 10，在「我的」里改。 */
export function Onboarding() {
  const atlas = useAtlas();
  const settings = useStore((s) => s.settings);
  const [step, setStep] = useState<1 | 2>(1);
  const [book, setBook] = useState(() => suggestBook());
  const [level, setLevel] = useState(0);

  // 选好册数先存下来，第二步的单元列表就是这一册的
  const next = () => {
    store.settings({ book });
    setLevel(0);
    setStep(2);
  };
  const finish = () => store.settings({ onboarded: true, startLevel: level, starts: { ...settings.starts, [settings.book]: level } });

  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-label="欢迎">
      <div className="onboard-card">
        <img className="onboard-art" src={`${import.meta.env.BASE_URL}brand/hero.webp`} alt="" />
        <div className="onboard-body">
          <p className="eyebrow">
            欢迎来到{APP_NAME} · 第 {step} 步，共 2 步
          </p>
          {step === 1 ? (
            <>
              <h1 className="display">你在学哪一册？</h1>
              <fieldset>
                <legend>人教版</legend>
                <div className="choice-grid">
                  {BOOKS.map((b) => (
                    <button
                      key={b.id}
                      className={`choice ${book === b.id ? "is-on" : ""} ${b.ready ? "" : "is-soon"}`}
                      aria-pressed={book === b.id}
                      aria-disabled={!b.ready}
                      onClick={() => (b.ready ? setBook(b.id) : toast(`${b.name}还在准备中`, "warn"))}
                    >
                      <b>{b.name}</b>
                      <small>{b.ready ? (b.id === suggestBook() ? "这学期" : "可以学") : "准备中"}</small>
                    </button>
                  ))}
                </div>
              </fieldset>
              <button className="btn btn-primary btn-xl" onClick={next}>
                下一步 <ArrowRight size={20} />
              </button>
            </>
          ) : (
            <>
              <h1 className="display">
                {bookById(settings.book).name}，
                <br />
                {atlas.count.toLocaleString()} 颗星等你点亮。
              </h1>
              <fieldset>
                <legend>从哪里开始？</legend>
                <StartChoice value={level} onChange={setLevel} />
              </fieldset>
              <button className="btn btn-primary btn-xl" onClick={finish}>
                出发 <ArrowRight size={20} />
              </button>
              <button className="btn btn-ghost btn-sm onboard-back" onClick={() => setStep(1)}>
                <ArrowLeft size={16} /> 上一步
              </button>
            </>
          )}
          <p className="muted">进度会自动存到云端，换手机输入同样的名字和密码就能找回；每天点亮几颗新星，以后可以在「我的」里修改。</p>
        </div>
      </div>
    </div>
  );
}
