import { CalendarCheck, Check, Crown, Lightbulb, Lock, Music, Sparkles } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { burst } from "../lib/burst";
import { ChestArt, ChestPanel, useChests } from "./Chest";
import { Sheet } from "./Sheet";
import { ScratchFoil } from "./Scratch";
import { AMBIENCE_ICONS } from "./ambienceIcons";
import { AMBIENCE, type AmbienceId } from "../lib/ambience";
import { CAT_NAME, FACTS } from "../lib/facts";
import type { FactCat } from "../lib/facts/types";
import { chooseCoupon, COUPON_CHOICES, COUPONS, couponExpiry, type Coupon, isExpired, factKinds, FREE_MUSIC, FX, MUSIC, musicOrder, pickFx, pickSkin, redeemCoupon, SKIN_COST, SKINS, unlockSkin } from "../store/game";
import { store, useStore } from "../store/store";
import { noTeacher, useAccount } from "../lib/cloud";
import { toast } from "./Toast";

const fmt = (t: number) => {
  const d = new Date(t);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

type Shelf = "music" | "fx" | "patch" | "facts";
/** 收藏的四类（老师定的顺序）：补签卡、环境音乐、星图特效、冷知识卡 */
const TABS = [
  ["patch", CalendarCheck, "补签卡"],
  ["music", Music, "环境音乐"],
  ["fx", Sparkles, "星图特效"],
  ["facts", Lightbulb, "冷知识卡"],
] as const;
const INTRO: Record<Shelf, string> = {
  music: "学习时的背景声音。点一首播放，再点一下停止；带锁的要从宝箱里开出来。",
  fx: "打开后，「今日」页和图鉴里的星图上会出现动画。",
  patch: "哪天忘了完成任务，第二天在上面的宝箱栏里点「用补签卡补上」，连续天数就不会断。",
  facts: "点一张卡片看内容。抽到已经有的卡，会换成 1 个碎片。",
};

/** 「我的」页里的宝库：碎片和插画主题、奖励券、收藏品。 */
export function Treasury() {
  const g = useStore((s) => s.progress.game);
  const ambience = useStore((s) => s.settings.ambience);
  const [shelf, setShelf] = useState<Shelf>("patch");
  const counts: Record<Shelf, string> = {
    music: `${g.music.length + 1}/${MUSIC.length + 1}`,
    fx: `${g.fx.length}/${FX.length}`,
    patch: `${g.patches} 张`,
    facts: `${factKinds(g)}/${FACTS.length}`,
  };
  const done = (c: Coupon) => Number(!!c.redeemed || isExpired(c));
  const coupons = [...g.coupons].sort((a, b) => done(a) - done(b) || b.at - a.at);
  // 游客和自己注册的同学没有老师兑换，不显示奖励券（以前拿到过的照常显示）
  const showCoupons = !noTeacher(useAccount()) || coupons.length > 0;

  return (
    <section className="treasury">
      <div className="panel-head">
        <h2 className="treasury-title">我的宝库</h2>
      </div>

      <ChestPanel inSheet />

      <h4 className="treasury-h">插画主题</h4>
      <ul className="skins">
        {SKINS.map((k) => {
          const owned = g.skins.includes(k.id);
          const on = g.skin === k.id;
          const pct = Math.min(1, g.shards / SKIN_COST);
          return (
            <li key={k.id} className={`skin skin-${k.id} ${on ? "is-on" : ""} ${owned ? "" : "is-locked"}`}>
              <span className="skin-swatch" aria-hidden="true">
                <SkinIcon id={k.id} />
              </span>
              <span className="skin-text">
                <b>{k.name}</b>
                <small>{k.desc}</small>
              </span>
              {owned ? (
                <button className={`btn ${on ? "btn-sage" : "btn-ghost"}`} onClick={() => pickSkin(k.id)} disabled={on}>
                  {on ? (
                    <>
                      <Check size={16} /> 使用中
                    </>
                  ) : (
                    "换上"
                  )}
                </button>
              ) : g.shards >= SKIN_COST ? (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    unlockSkin(k.id);
                    toast(`解锁了「${k.name}」！新主题的插画正在陆续画，没画好的词先显示默认插画。`, "ok");
                  }}
                >
                  用 {SKIN_COST} 碎片解锁
                </button>
              ) : (
                <span className="skin-progress" title={`${g.shards}/${SKIN_COST}`}>
                  <i style={{ width: `${pct * 100}%` }} />
                  <small>
                    <Lock size={12} /> {g.shards}/{SKIN_COST}
                  </small>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {showCoupons && (
        <h4 className="treasury-h">
          <Crown size={16} /> 老师奖励券
        </h4>
      )}
      {!showCoupons ? null : coupons.length ? (
        <ul className="coupons">
          {coupons.map((c) => (
            <CouponCard key={c.id} c={c} />
          ))}
        </ul>
      ) : (
        <p className="muted">还没有。宝箱里有很小的机会开出老师奖励券，它是一张刮刮卡，刮开有神秘奖励。</p>
      )}

      <h4 className="treasury-h">收藏</h4>
      <div className="collect-box">
        <div className="collect-tabs" role="tablist" aria-label="收藏">
          {TABS.map(([k, Icon, label]) => (
            <button key={k} role="tab" className={`collect-tab ${shelf === k ? "is-on" : ""}`} onClick={() => setShelf(k)} aria-selected={shelf === k}>
              <Icon size={18} />
              <span>{label}</span>
              <small>{counts[k]}</small>
            </button>
          ))}
        </div>
        <div className="collect-panel" role="tabpanel">
          <p className="collect-intro">{INTRO[shelf]}</p>

      {shelf === "patch" && <p className="shelf muted">现在有 {g.patches} 张，最多存 3 张。</p>}

      {shelf === "music" && (
        <div className="shelf chips" aria-label="环境音乐">
          {musicOrder([{ id: FREE_MUSIC, name: AMBIENCE.find((a) => a.id === FREE_MUSIC)?.label ?? "" }, ...MUSIC], g.music).map((m) => {
            const has = m.id === FREE_MUSIC || g.music.includes(m.id);
            const on = has && ambience === m.id;
            return (
              <button key={m.id} className={`chip-btn ${on ? "is-on" : ""}`} disabled={!has} onClick={() => store.settings({ ambience: on ? "off" : (m.id as typeof ambience) })} title={has ? (on ? "点一下停止" : "点一下播放") : "还没开出来"}>
                {has ? <MusicIcon id={m.id} /> : <Lock size={14} />} {m.name}
              </button>
            );
          })}
        </div>
      )}

      {shelf === "fx" && (
        <div className="shelf chips" aria-label="星图特效">
          <button className={`chip-btn ${g.fxOn === "off" ? "is-on" : ""}`} onClick={() => pickFx("off")}>
            不用特效
          </button>
          {FX.map((m) => {
            const has = g.fx.includes(m.id);
            return (
              <button key={m.id} className={`chip-btn ${g.fxOn === m.id ? "is-on" : ""}`} disabled={!has} onClick={() => pickFx(m.id)} title={has ? undefined : "还没开出来"}>
                {has ? <Sparkles size={14} /> : <Lock size={14} />} {m.name}
              </button>
            );
          })}
        </div>
      )}

      {shelf === "facts" &&
        (factKinds(g) ? <FactShelf owned={g.facts} /> : <p className="shelf muted">还没有冷知识卡。开宝箱时最常开出的就是它。</p>)}
        </div>
      </div>
    </section>
  );
}

/** 老师奖励券：刮刮卡。刮开 → 二选一 → 落袋；用券时老师确认兑换。 */
function CouponCard({ c }: { c: Coupon }) {
  const [foil, setFoil] = useState<"on" | "off">("on");
  const scratched = foil !== "on";
  const mystery = c.kind === "mystery";
  const expired = isExpired(c);
  const daysLeft = Math.max(0, Math.ceil((couponExpiry(c) - Date.now()) / 864e5));
  // 浏览器自带的确认框在有些手机、内嵌浏览器里会被拦掉，所以确认直接做在券上
  const [asking, setAsking] = useState<(typeof COUPON_CHOICES)[number] | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const pick = (k: (typeof COUPON_CHOICES)[number], e: React.MouseEvent) => {
    setAsking(null);
    chooseCoupon(c.id, k);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, 70);
    toast(`「${COUPONS[k]}」已经收进宝库！用的时候拿给老师看。`, "ok");
  };
  return (
    <li className={`coupon ${c.redeemed || expired ? "is-used" : ""} ${mystery ? "is-mystery" : ""}`}>
      <span className="coupon-seal" aria-hidden="true">
        {c.redeemed ? <Check size={22} /> : <Crown size={24} />}
      </span>
      <span className="coupon-body">
        <small className="coupon-kicker">老师奖励券 · 传说</small>
        {mystery && expired ? (
          <b>没有刮开，已作废</b>
        ) : mystery ? (
          <div className={`scratch ${scratched ? "is-off" : ""}`}>
            {asking ? (
              <div className="coupon-ask">
                <span>
                  确定选「{COUPONS[asking]}」吗？选好就不能改了。
                </span>
                <button className="btn coupon-btn" onClick={(e) => pick(asking, e)}>
                  确定
                </button>
                <button className="btn btn-ghost coupon-cancel" onClick={() => setAsking(null)}>
                  再想想
                </button>
              </div>
            ) : (
              <div className="scratch-under">
                {COUPON_CHOICES.map((k) => (
                  <button key={k} className="scratch-pick" onClick={() => setAsking(k)} disabled={!scratched} tabIndex={scratched ? 0 : -1}>
                    {COUPONS[k]}
                  </button>
                ))}
              </div>
            )}
            {foil === "on" && <ScratchFoil hint={`按住来回刮一刮 · 还剩 ${daysLeft} 天`} onDone={() => setFoil("off")} />}
          </div>
        ) : (
          <b>{COUPONS[c.kind]}</b>
        )}
        <small>
          {fmt(c.at)} 获得
          {c.redeemed
            ? ` · ${fmt(c.redeemed)} 已兑换`
            : expired
              ? ` · 已于 ${fmt(couponExpiry(c))} 过期`
              : c.kind === "homework"
                ? ` · 有效期至 ${fmt(couponExpiry(c))}（还剩 ${daysLeft} 天）`
                : mystery
                  ? scratched
                    ? ` · 二选一，选好就不能改；还剩 ${daysLeft} 天，到 ${fmt(couponExpiry(c))} 不选就作废`
                    : ` · 还剩 ${daysLeft} 天，${fmt(couponExpiry(c))} 前不刮开就作废`
                  : " · 长期有效，用的时候拿给老师看"}
        </small>
      </span>
      {!c.redeemed && !mystery && !expired &&
        (redeeming ? (
          <span className="coupon-ask coupon-ask-redeem">
            <span>请老师确认：兑换后这张券就用掉了。</span>
            <button
              className="btn coupon-btn"
              onClick={() => {
                redeemCoupon(c.id);
                setRedeeming(false);
                toast(`「${COUPONS[c.kind]}」已兑换`, "ok");
              }}
            >
              确认兑换
            </button>
            <button className="btn btn-ghost coupon-cancel" onClick={() => setRedeeming(false)}>
              取消
            </button>
          </span>
        ) : (
          <button className="btn coupon-btn" onClick={() => setRedeeming(true)}>
            老师确认兑换
          </button>
        ))}
    </li>
  );
}

/** 冷知识卡：按类别筛选，卡片只显示标题、排成紧凑的格子，列表区域固定高度、在框里滚动，点开的内容显示在上方。 */
function FactShelf({ owned }: { owned: Record<string, number> }) {
  const ids = Object.keys(owned).map(Number).filter((i) => FACTS[i]).sort((a, b) => a - b);
  const cats = (Object.keys(CAT_NAME) as FactCat[]).map((c) => ({
    c,
    have: ids.filter((i) => FACTS[i].cat === c).length,
    total: FACTS.filter((f) => f.cat === c).length,
  }));
  const [cat, setCat] = useState<FactCat | "all">("all");
  const list = cat === "all" ? ids : ids.filter((i) => FACTS[i].cat === cat);
  const [pick, setPick] = useState<number | null>(null);
  const shown = pick !== null && list.includes(pick) ? pick : (list[0] ?? null);
  // 翻页代替滚动：每页 12 张
  const PER = 12;
  const pages = Math.max(1, Math.ceil(list.length / PER));
  const [page, setPage] = useState(0);
  const cur = Math.min(page, pages - 1);
  const choose = (c: FactCat | "all") => {
    setCat(c);
    setPage(0);
    setPick(null);
  };
  return (
    <div className="shelf fact-shelf">
      <div className="fact-cats" role="tablist" aria-label="冷知识卡类别">
        <button className={`fact-cat ${cat === "all" ? "is-on" : ""}`} onClick={() => choose("all")}>
          全部 <small>{ids.length}</small>
        </button>
        {cats.map(({ c, have, total }) => (
          <button key={c} className={`fact-cat ${cat === c ? "is-on" : ""}`} onClick={() => choose(c)} disabled={!have}>
            {CAT_NAME[c]} <small>{have}/{total}</small>
          </button>
        ))}
      </div>
      {shown !== null && (
        <div className="fact-detail">
          <b>{FACTS[shown].title}</b>
          <p>{FACTS[shown].text}</p>
          <small className="fact-meta">
            {CAT_NAME[FACTS[shown].cat]} · {FACTS[shown].grade}
          </small>
        </div>
      )}
      <ul className="fact-grid">
        {list.slice(cur * PER, cur * PER + PER).map((i) => (
          <li key={i}>
            <button className={`fact-chip ${shown === i ? "is-on" : ""}`} onClick={() => setPick(i)} title={FACTS[i].title}>
              {FACTS[i].title}
            </button>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="fact-pager">
          <button className="btn btn-ghost" onClick={() => setPage(cur - 1)} disabled={cur === 0}>
            上一页
          </button>
          <span>
            第 {cur + 1} / {pages} 页
          </span>
          <button className="btn btn-ghost" onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1}>
            下一页
          </button>
        </div>
      )}
    </div>
  );
}

function MusicIcon({ id }: { id: string }) {
  const Icon = AMBIENCE_ICONS[id as AmbienceId] ?? Music;
  return <Icon size={14} />;
}

/* ---------- 右上角宝箱图标 + 底部弹出的宝库面板 ---------- */

let opened = false;
const subs = new Set<() => void>();
export function openTreasury(v = true) {
  opened = v;
  subs.forEach((f) => f());
}
const useOpened = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => opened,
  );

/** 攒了宝箱时，每次打开网页图标都会左右晃，学生点过一次就停（只记在这次打开里）。 */
let poked = false;

export function TreasuryButton() {
  const { ready, game } = useChests();
  const unscratched = game.coupons.filter((c) => c.kind === "mystery" && !isExpired(c)).length;
  const n = ready.length + unscratched;
  const [still, setStill] = useState(poked);
  return (
    <button
      className={`icon-btn treasury-btn ${still || !n ? "" : "is-shaking"}`}
      onClick={() => {
        poked = true;
        setStill(true);
        openTreasury();
      }} aria-label={n ? `我的宝库，有 ${n} 个宝箱或奖励券没开` : "我的宝库"} title="我的宝库">
      <ChestArt size={24} />
      {n > 0 && <span className="treasury-badge">{n}</span>}
    </button>
  );
}

export function TreasurySheet() {
  const open = useOpened();
  return (
    <Sheet open={open} onClose={() => openTreasury(false)} label="我的宝库" className="sheet-bottom treasury-sheet">
      <Treasury />
    </Sheet>
  );
}

/** 插画主题方框里的小图标：每个主题一种风格，白线条画在主题色块上 */
function SkinIcon({ id }: { id: string }) {
  const p = { width: 28, height: 28, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (id) {
    // 幻想冒险：城堡加一颗星
    case "fantasy":
      return (
        <svg {...p}>
          <path d="M4 21V11l2-1.5L8 11v-3l2-1.5L12 8l2-1.5L16 8v3l2-1.5 2 1.5v10z" />
          <path d="M10 21v-4a2 2 0 0 1 4 0v4" />
          <path d="M12 1.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" fill="currentColor" stroke="none" />
        </svg>
      );
    // 特工任务：瞄准镜
    case "agent":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="7.5" />
          <circle cx="12" cy="12" r="2" />
          <path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5" />
        </svg>
      );
    // 三角洲：三角徽章加军衔折线
    case "delta":
      return (
        <svg {...p}>
          <path d="M12 2.5L22 20H2z" />
          <path d="M7.5 15.5L12 12l4.5 3.5" />
          <path d="M9 18.5l3-2.3 3 2.3" />
        </svg>
      );
    // 原神：八角星罗盘，奇幻元素感
    case "genshin":
      return (
        <svg {...p}>
          <path d="M12 1.5l2 7.3 7.5 3.2-7.5 3.2-2 7.3-2-7.3L2.5 12l7.5-3.2z" />
          <path d="M5.5 5.5l3.2 3.2M18.5 5.5l-3.2 3.2M5.5 18.5l3.2-3.2M18.5 18.5l-3.2-3.2" strokeWidth={1.2} />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      );
    // 默认：打开的课本加一点笔触
    default:
      return (
        <svg {...p}>
          <path d="M2.5 5.5c3-1.2 6.5-1.2 9.5 1 3-2.2 6.5-2.2 9.5-1v13c-3-1.2-6.5-1.2-9.5 1-3-2.2-6.5-2.2-9.5-1z" />
          <path d="M12 6.5v13" />
          <path d="M17.5 2.5l.6 1.3 1.3.6-1.3.6-.6 1.3-.6-1.3-1.3-.6 1.3-.6z" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}
