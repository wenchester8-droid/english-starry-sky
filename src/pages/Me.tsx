import { unitShort } from "../lib/unit";
import { useMemo, useState } from "react";
import { useAtlas } from "../atlas/context";
import { isMastered } from "../store/srs";
import { dayKey, store, useStore, type Settings } from "../store/store";
import { PasswordForm } from "../ui/Gate";
import { Sheet } from "../ui/Sheet";
import { streakOf } from "./Today";
import { CLOUD_ENV, displayName, FREE_CLASS, logout, save, setGuest, useAccount, useGuest, useSync } from "../lib/cloud";

export function Me({ privateAvailable }: { privateAvailable: boolean }) {
  const atlas = useAtlas();
  const progress = useStore((s) => s.progress);
  const settings = useStore((s) => s.settings);
  const saveError = useStore((s) => s.saveError);

  const stats = useMemo(() => {
    const cards = Object.values(progress.cards);
    const days = Object.values(progress.days);
    const r = days.reduce((n, d) => n + d.r, 0);
    const c = days.reduce((n, d) => n + d.c, 0);
    const t = days.reduce((n, d) => n + d.t, 0);
    const now = Date.now();
    const forecast = Array.from({ length: 7 }, (_, i) => {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      end.setDate(end.getDate() + i);
      const start = new Date(end);
      start.setHours(0, 0, 0, 0);
      return cards.filter((x) => (i === 0 ? x.due <= end.getTime() : x.due >= start.getTime() && x.due <= end.getTime())).length;
    });
    void now;
    return { learned: cards.length, mastered: cards.filter(isMastered).length, reviews: r, accuracy: r ? Math.round((c / r) * 100) : 0, minutes: Math.round(t / 60), forecast };
  }, [progress]);

  const set = (patch: Partial<Settings>) => store.settings(patch);
  const maxF = Math.max(1, ...stats.forecast);

  return (
    <div className="page me">
      <header className="page-head">
        <p className="eyebrow">我的</p>
        <h1 className="display">学习记录与设置</h1>
      </header>

      <AccountBar />

      <section className="stat-strip">
        <div>
          <dt>连续学习</dt>
          <dd>
            {streakOf(progress.days)}
            <small>天</small>
          </dd>
        </div>
        <div>
          <dt>已点亮</dt>
          <dd>{stats.learned.toLocaleString()}</dd>
        </div>
        <div>
          <dt>长期记住</dt>
          <dd>{stats.mastered.toLocaleString()}</dd>
        </div>
        <div>
          <dt>首次正确率</dt>
          <dd>
            {stats.accuracy}
            <small>%</small>
          </dd>
        </div>
        <div>
          <dt>学习时长</dt>
          <dd>
            {stats.minutes}
            <small>分钟</small>
          </dd>
        </div>
      </section>

      {/* 学习记录放在宝库上面 */}
      <div className="me-grid me-grid-stats">
        <section className="panel">
          <h3 className="eyebrow">过去 20 周</h3>
          <Heatmap days={progress.days} />
          <p className="muted">一格是一天，颜色越浓，那天答得越多。「长期记住」指记忆稳定度超过 21 天。</p>
        </section>

        <section className="panel">
          <h3 className="eyebrow">未来 7 天的复习量</h3>
          <ol className="forecast">
            {stats.forecast.map((n, i) => (
              <li key={i}>
                <span style={{ height: `${(n / maxF) * 100}%` }} />
                <b>{n}</b>
                <small>{i === 0 ? "今天" : i === 1 ? "明天" : `+${i}`}</small>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="me-grid">
        <section className="panel settings">
          <h3 className="eyebrow">学习设置</h3>
          <Field label="每日新词" hint="复习不设上限，算法只安排快要遗忘的词。">
            <div className="segmented">
              {[5, 10, 15, 20, 30].map((n) => (
                <button key={n} className={settings.dailyNew === n ? "is-on" : ""} onClick={() => set({ dailyNew: n })}>
                  {n}
                </button>
              ))}
            </div>
          </Field>
          <Field label="从哪个单元开始" hint="跳过已经学过的单元。">
            <div className="segmented segmented-wrap">
              {atlas.cefr.map((l, i) => (
                <button key={l} className={settings.startLevel === i ? "is-on" : ""} onClick={() => set({ startLevel: i, starts: { ...settings.starts, [settings.book]: i } })} title={l}>
                  {unitShort(l)}
                </button>
              ))}
            </div>
          </Field>
          <Field label="目标记忆率" hint="越高复习越频繁。90% 是大多数人的甜点。">
            <div className="segmented">
              {[0.85, 0.9, 0.95].map((n) => (
                <button key={n} className={settings.retention === n ? "is-on" : ""} onClick={() => set({ retention: n })}>
                  {Math.round(n * 100)}%
                </button>
              ))}
            </div>
          </Field>
          <Field label="发音">
            <div className="segmented">
              <button className={settings.accent === "uk" ? "is-on" : ""} onClick={() => set({ accent: "uk" })}>
                课本原声
              </button>
              <button className={settings.accent === "us" ? "is-on" : ""} onClick={() => set({ accent: "us" })}>
                美音优先
              </button>
            </div>
          </Field>
          <Field label="外观">
            <div className="segmented">
              {(
                [
                  ["system", "跟随系统"],
                  ["light", "浅色"],
                  ["dark", "深色"],
                ] as const
              ).map(([k, l]) => (
                <button key={k} className={settings.theme === k ? "is-on" : ""} onClick={() => set({ theme: k })}>
                  {l}
                </button>
              ))}
            </div>
          </Field>
          <Toggle label="自动播放发音" on={settings.autoplay} set={(v) => set({ autoplay: v })} />
          <Toggle label="界面音效" on={settings.sfx} set={(v) => set({ sfx: v })} />
          <Toggle label="开屏动画（每天一次）" on={settings.splash} set={(v) => set({ splash: v })} />
          <Toggle label="复习时加入拼写题" on={settings.spell} set={(v) => set({ spell: v })} />
          <Toggle label="挑战模式（「练习」变成「挑战」：读真题、做原题）" on={settings.challenge} set={(v) => set({ challenge: v })} />
          {privateAvailable && (
            <Field label="词库" hint="私人词库只在本机开发服务器中可用，不会被打包发布。">
              <div className="segmented">
                <button className={settings.dataset === "open" ? "is-on" : ""} onClick={() => set({ dataset: "open" })}>
                  开放图鉴
                </button>
                <button className={settings.dataset === "private" ? "is-on" : ""} onClick={() => set({ dataset: "private" })}>
                  私人 8000
                </button>
              </div>
            </Field>
          )}
        </section>

        {/* 进度在云端，不再有导出/导入/清空；只在浏览器存不了时提醒一句 */}
        {saveError && (
          <section className="panel">
            <p className="warn-text">这台手机的浏览器存不了进度（可能开了无痕模式）。进度还会同步到云端，但请换成普通模式打开。</p>
          </section>
        )}
      </div>
    </div>
  );
}

function AccountBar() {
  const account = useAccount();
  const guest = useGuest();
  const sync = useSync();
  const [pw, setPw] = useState(false);
  if (guest)
    return (
      <section className="account-bar is-guest">
        <div>
          <b>游客</b>
          <small className="is-warn">
            学习数据只存在这台设备的浏览器里，请不要清除浏览器缓存，否则进度会丢失。{CLOUD_ENV && "注册账号后进度会一起带上云端。"}
          </small>
        </div>
        {/* 没配云端（开源版直接运行）就只有游客，不显示登录按钮 */}
        {CLOUD_ENV && (
          <button className="btn btn-primary btn-sm" onClick={() => setGuest(false)}>
            注册 / 登录
          </button>
        )}
      </section>
    );
  if (!account) return null;
  const time = sync.at ? new Date(sync.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "";
  const status =
    sync.state === "saving" ? "正在同步…" : sync.state === "offline" ? "没连上网，联网后会自动同步" : time ? `已同步到云端 · ${time}` : "进度会自动同步到云端";
  const out = async () => {
    if (!confirm("退出后，这台手机上的进度会清掉（云端还在）。下次输入同样的名字和密码就能找回。确定退出？")) return;
    await logout();
  };
  return (
    <section className="account-bar">
      <div>
        <b>
          {displayName(account)}
          {account.cls === FREE_CLASS && <em className="account-tag">自由学习</em>}
        </b>
        <small className={sync.state === "offline" ? "is-warn" : ""}>{status}</small>
      </div>
      {sync.state === "offline" && (
        <button className="btn btn-ghost btn-sm" onClick={() => void save(true)}>
          重试
        </button>
      )}
      <button className="btn btn-ghost btn-sm" onClick={() => setPw(true)}>
        改密码
      </button>
      <button className="btn btn-ghost btn-sm" onClick={out}>
        退出
      </button>
      <Sheet open={pw} onClose={() => setPw(false)} label="改密码">
        <h2 className="display">改密码</h2>
        <p className="muted">改完后，别的手机上要用新密码重新登录。</p>
        <PasswordForm onDone={() => setPw(false)} />
      </Sheet>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <div>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="field toggle">
      <b>{label}</b>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => set(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}

function Heatmap({ days }: { days: Record<string, { r: number }> }) {
  const weeks = 20;
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (weeks * 7 - 1) - end.getDay());
  const cells: { k: string; v: number; future: boolean }[] = [];
  const d = new Date(start);
  for (let i = 0; i < (weeks + 1) * 7; i++) {
    const k = dayKey(d);
    cells.push({ k, v: days[k]?.r ?? 0, future: d > end });
    d.setDate(d.getDate() + 1);
  }
  const lvl = (v: number) => (v === 0 ? 0 : v < 10 ? 1 : v < 25 ? 2 : v < 50 ? 3 : 4);
  return (
    <div className="heatmap" role="img" aria-label="学习热力图">
      {cells.map((c) => (
        <span key={c.k} className={`h${c.future ? "x" : lvl(c.v)}`} title={`${c.k} · ${c.v} 题`} />
      ))}
    </div>
  );
}
