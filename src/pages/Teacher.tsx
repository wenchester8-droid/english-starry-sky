import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useAtlas } from "../atlas/context";
import { DEFAULT_PASS, callApi } from "../lib/cloud";
import { dayKey } from "../store/store";

/* 老师页：#/teacher，输老师口令，看全班易错词、考点得分率和每个学生的情况；也在这里管登录名单（白名单）。
   数据只在打开时从云端取，不存本机。 */

interface Student {
  cls: string;
  code: string;
  updated: number;
  learned: number;
  mastered: number;
  days: Record<string, { n: number; r: number; c: number; t: number }>;
  mistakes: string[];
  lapses: Record<string, number>;
  kp: Record<string, [number, number, number]>;
  /** 开了挑战模式没有（云函数更新后才有） */
  challenge?: boolean;
  /** 真题阅读：[读了几篇, 第一次做对几个, 一共几个] */
  rd?: [number, number, number];
}

interface Member {
  cls: string;
  code: string;
  /** 老师录入的姓名，只在老师页和学生本人登录后显示 */
  name?: string;
  /** 已经改成自己的密码 */
  changed: boolean;
  /** 登录过 */
  seen: boolean;
}

const PASS_KEY = "qishang:teacher";
const byCls = (a: string, b: string) => a.localeCompare(b, "zh", { numeric: true });

function lastDays(n: number) {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(dayKey(d));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

const ago = (t: number) => {
  if (!t) return "—";
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  return `${days} 天前`;
};

export function Teacher() {
  const atlas = useAtlas();
  const [pass, setPass] = useState(() => sessionStorage.getItem(PASS_KEY) ?? "");
  const [students, setStudents] = useState<Student[] | null>(null);
  const [roster, setRoster] = useState<Member[]>([]);
  /** 名单外自己注册的同学：只看人数，不进学情表 */
  const [free, setFree] = useState<{ total: number; today: number; limit: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState("");
  const classes = useMemo(() => [...new Set(roster.map((m) => m.cls))].sort(byCls), [roster]);
  const cls = classes.includes(picked) ? picked : (classes[0] ?? "");

  const load = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await callApi({ action: "teacher", pass: pass.trim() });
      setStudents(r.students as Student[]);
      setRoster((r.roster as Member[]) ?? []);
      setFree((r.free as typeof free) ?? null);
      try {
        sessionStorage.setItem(PASS_KEY, pass.trim());
      } catch {
        /* 无痕模式 */
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const view = useMemo(() => {
    if (!students) return null;
    const names = new Map(roster.filter((m) => m.cls === cls).map((m) => [m.code, m.name ?? ""]));
    const onList = new Set(names.keys());
    const list = students.filter((s) => s.cls === cls && onList.has(s.code)).sort((a, b) => Number(a.code) - Number(b.code));
    const week = lastDays(7);
    // 易错词：几个人的错词本里有它 + 复习时一共忘了几次
    const words = new Map<string, { people: number; lapses: number }>();
    for (const s of list) {
      const ids = new Set([...s.mistakes, ...Object.keys(s.lapses)]);
      for (const id of ids) {
        const w = words.get(id) ?? { people: 0, lapses: 0 };
        w.people++;
        w.lapses += s.lapses[id] ?? 0;
        words.set(id, w);
      }
    }
    const topWords = [...words.entries()]
      .map(([id, w]) => ({ id, ref: atlas.byId.get(id), ...w }))
      .filter((w) => w.ref)
      .sort((a, b) => b.people - a.people || b.lapses - a.lapses)
      .slice(0, 30);
    // 考点：全班做了几次、对了几次、几个人现在还有错题
    const kps = new Map<string, { n: number; ok: number; people: number }>();
    for (const s of list)
      for (const [kp, [n, ok, wrong]] of Object.entries(s.kp)) {
        const k = kps.get(kp) ?? { n: 0, ok: 0, people: 0 };
        k.n += n;
        k.ok += ok;
        if (wrong > 0) k.people++;
        kps.set(kp, k);
      }
    const topKps = [...kps.entries()]
      .map(([kp, k]) => ({ kp, ...k, rate: k.n ? k.ok / k.n : 1 }))
      .filter((k) => k.n >= 3)
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 20);
    const rows = list.map((s) => {
      const recent = week.map((d) => s.days[d]).filter(Boolean);
      const minutes = Math.round(recent.reduce((n, d) => n + d.t, 0) / 60);
      const r = Object.values(s.days).reduce((n, d) => n + d.r, 0);
      const c = Object.values(s.days).reduce((n, d) => n + d.c, 0);
      const weak = Object.entries(s.kp)
        .filter(([, [n]]) => n >= 2)
        .map(([kp, [n, ok]]) => ({ kp, rate: ok / n }))
        .filter((k) => k.rate < 0.6)
        .sort((a, b) => a.rate - b.rate)
        .slice(0, 2)
        .map((k) => k.kp);
      return { ...s, name: names.get(s.code) ?? "", activeDays: recent.length, minutes, accuracy: r ? Math.round((c / r) * 100) : null, weak };
    });
    const active = rows.filter((r) => r.activeDays > 0).length;
    return { rows, topWords, topKps, active };
  }, [students, roster, cls, atlas]);

  if (!students)
    return (
      <div className="page teacher">
        <header className="page-head">
          <p className="eyebrow">老师</p>
          <h1 className="display">全班学情</h1>
        </header>
        <form className="panel teacher-login" onSubmit={load}>
          <label className="gate-field">
            <span>老师口令</span>
            <input type="password" inputMode="numeric" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} />
          </label>
          {error && (
            <p className="gate-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary" disabled={!pass.trim() || busy}>
            {busy ? "正在读取…" : "查看"}
          </button>
        </form>
      </div>
    );

  return (
    <div className="page teacher">
      <header className="page-head">
        <p className="eyebrow">老师</p>
        <h1 className="display">全班学情</h1>
        {free && (
          <p className="muted">
            名单外自己注册的「自由学习」同学共 {free.total} 人，今天新注册 {free.today} 人（每天上限 {free.limit} 人）。他们不在下面的学情表里，宝箱也不出老师奖励券。
          </p>
        )}
      </header>

      <div className="teacher-bar">
        <div className="segmented">
          {classes.map((c) => (
            <button key={c} className={cls === c ? "is-on" : ""} onClick={() => setPicked(c)}>
              {c}班
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => load()} disabled={busy}>
          <RefreshCw size={15} /> 刷新
        </button>
      </div>

      {!classes.length && <p className="muted">名单还是空的：先在下面「登录名单」里添加班级和编号，学生才能登录。</p>}

      {view && classes.length > 0 && (
        <>
          <section className="stat-strip">
            <div>
              <dt>已登录</dt>
              <dd>
                {view.rows.length}
                <small>人</small>
              </dd>
            </div>
            <div>
              <dt>近 7 天学过</dt>
              <dd>
                {view.active}
                <small>人</small>
              </dd>
            </div>
          </section>

          <div className="me-grid">
            <section className="panel">
              <h3 className="eyebrow">全班易错词</h3>
              {view.topWords.length ? (
                <table className="teacher-table">
                  <thead>
                    <tr>
                      <th>单词</th>
                      <th>错过的人数</th>
                      <th>复习时忘记</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.topWords.map((w) => (
                      <tr key={w.id}>
                        <td>
                          <b className="en">{w.ref!.word}</b> <small>{w.ref!.zh}</small>
                        </td>
                        <td>{w.people}</td>
                        <td>{w.lapses} 次</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">还没有错词记录。</p>
              )}
            </section>

            <section className="panel">
              <h3 className="eyebrow">课本考点得分率（从低到高）</h3>
              {view.topKps.length ? (
                <table className="teacher-table">
                  <thead>
                    <tr>
                      <th>考点</th>
                      <th>得分率</th>
                      <th>还有错题</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.topKps.map((k) => (
                      <tr key={k.kp}>
                        <td>{k.kp}</td>
                        <td className={k.rate < 0.6 ? "is-low" : ""}>{Math.round(k.rate * 100)}%</td>
                        <td>{k.people} 人</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">还没有足够的考点作答记录（每个考点至少 3 次才统计）。</p>
              )}
            </section>
          </div>

          <section className="panel">
            <h3 className="eyebrow">每个学生</h3>
            <div className="teacher-scroll">
              <table className="teacher-table">
                <thead>
                  <tr>
                    <th>编号</th>
                    <th>最近学习</th>
                    <th>近 7 天</th>
                    <th>学过的词</th>
                    <th>单词正确率</th>
                    <th>薄弱考点</th>
                    <th>挑战 · 真题阅读</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((s) => (
                    <tr key={s.code}>
                      <td>
                        {s.code} 号 {s.name && <b>{s.name}</b>}
                      </td>
                      <td>{ago(s.updated)}</td>
                      <td>
                        {s.activeDays} 天 · {s.minutes} 分钟
                      </td>
                      <td>{s.learned}</td>
                      <td>{s.accuracy === null ? "—" : `${s.accuracy}%`}</td>
                      <td>{s.weak.join("、") || "—"}</td>
                      <td>
                        {s.rd && s.rd[0] ? `${s.rd[0]} 篇 · ${Math.round((s.rd[1] / Math.max(1, s.rd[2])) * 100)}%` : s.challenge ? "开了，还没读" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">姓名在下面的登录名单里改；只有老师页和学生本人登录后能看到。</p>
          </section>
        </>
      )}

      <RosterPanel pass={pass.trim()} cls={cls} roster={roster} onChanged={() => load()} onPick={setPicked} />
    </div>
  );
}

/** 登录名单：名单里的「班级 + 编号」才能登录，初始密码 123456；学生忘了密码在这里重置 */
function RosterPanel({ pass, cls, roster, onChanged, onPick }: { pass: string; cls: string; roster: Member[]; onChanged: () => Promise<void>; onPick: (c: string) => void }) {
  const [addCls, setAddCls] = useState("");
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const members = roster.filter((m) => m.cls === cls).sort((a, b) => Number(a.code) - Number(b.code));
  const changed = members.filter((m) => m.changed).length;

  const run = async (data: Record<string, unknown>, done: string) => {
    setBusy(true);
    setMsg("");
    try {
      const r = await callApi({ action: "roster", pass, ...data });
      setMsg(done.replace("{n}", String(r.added ?? "")));
      await onChanged();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = addCls.trim().replace(/班$/, "") || cls;
    await run({ op: "add", cls: c, from: Number(from), to: Number(to) }, `${c}班新加了 {n} 个编号（已在名单里的不变）`);
    onPick(c);
  };

  return (
    <section className="panel roster">
      <h3 className="eyebrow">登录名单</h3>
      <p className="muted">
        学生用「名字 + 密码」登录，所以每个编号都要填上姓名（同班同名请加一、二区分）。初始密码都是 {DEFAULT_PASS}，学生第一次进来必须改成自己的。学生忘了密码，点「重置」就回到 {DEFAULT_PASS}。
      </p>
      <form className="roster-add" onSubmit={add}>
        <label className="gate-field">
          <span>班级</span>
          <input placeholder={cls || "如 7.7"} maxLength={12} value={addCls} onChange={(e) => setAddCls(e.target.value)} />
        </label>
        <label className="gate-field">
          <span>编号从</span>
          <input inputMode="numeric" maxLength={2} value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="gate-field">
          <span>到</span>
          <input inputMode="numeric" maxLength={2} placeholder="如 55" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, ""))} />
        </label>
        <button className="btn btn-primary" disabled={busy || !from || !to || !(addCls.trim() || cls)}>
          加入名单
        </button>
      </form>
      {msg && <p className="muted roster-msg">{msg}</p>}
      {members.length > 0 && (
        <>
          <p className="muted">
            {cls}班名单 {members.length} 人 · 已改密码 {changed} 人 · 还没登录过 {members.filter((m) => !m.seen).length} 人
          </p>
          <div className="teacher-scroll">
            <table className="teacher-table">
              <thead>
                <tr>
                  <th>编号</th>
                  <th>姓名</th>
                  <th>状态</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.code}>
                    <td>{m.code} 号</td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy}
                        title="改姓名"
                        onClick={() => {
                          const name = prompt(`${cls}班 ${m.code} 号的姓名（留空就是不显示名字）`, m.name ?? "");
                          if (name !== null) void run({ op: "name", cls, code: m.code, name: name.trim() }, `${m.code} 号的姓名已保存`);
                        }}
                      >
                        {m.name || "填姓名"}
                      </button>
                    </td>
                    <td className={m.changed ? "" : "is-muted"}>{m.changed ? "已设密码" : m.seen ? `还是 ${DEFAULT_PASS}` : "还没登录"}</td>
                    <td className="roster-actions">
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy || !m.seen}
                        onClick={() => confirm(`把 ${cls}班 ${m.code} 号${m.name ? `（${m.name}）` : ""}的密码重置为 ${DEFAULT_PASS}？这个学生的所有手机都要重新登录。`) && void run({ op: "reset", cls, code: m.code }, `${m.code} 号的密码已重置为 ${DEFAULT_PASS}`)}
                      >
                        重置
                      </button>
                      <button
                        className="btn btn-ghost btn-sm btn-danger"
                        disabled={busy}
                        onClick={() => confirm(`把 ${cls}班 ${m.code} 号${m.name ? `（${m.name}）` : ""}移出名单？之后就不能登录了（学习进度还留在云端，加回来能接着用）。`) && void run({ op: "remove", cls, code: m.code }, `${m.code} 号已移出名单`)}
                      >
                        移除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
