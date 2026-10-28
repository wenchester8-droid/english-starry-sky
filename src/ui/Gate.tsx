import { ArrowRight } from "lucide-react";
import { useState } from "react";
import {
  DEFAULT_PASS,
  changePassword,
  login,
  logout,
  register,
  setGuest,
  useAccount,
} from "../lib/cloud";
import { APP_NAME } from "../lib/unit";
import { toast } from "./Toast";

/** 进门：填名字和密码。老师名单里的同学第一次的密码是 123456；
 *  名单外的可以自己注册（只能注册学生），也可以先当游客（进度只存在这台设备上）。
 *  不同班有同名的，云端会让先选班级。 */
export function Gate() {
  const [mode, setMode] = useState<"login" | "register" | "guest">("login");
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  /** 不同班同名时才有：可选的班级 */
  const [classes, setClasses] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reg = mode === "register";
  const guest = mode === "guest";
  const ready =
    name.trim().length > 0 &&
    pass.trim().length > 0 &&
    (!reg || again.trim().length > 0);

  const enter = async (cls?: string) => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await login(name.trim(), pass.trim(), cls);
      if ("classes" in r) setClasses(r.classes);
      else toast(`欢迎你，${r.name || name.trim()}`, "ok");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const signUp = async () => {
    if (!ready || busy) return;
    const n = name.trim();
    const p = pass.trim();
    if (!/^[0-9A-Za-z\u4e00-\u9fa5]{2,12}$/.test(n))
      return setError("名字要 2 到 12 个字，只能用汉字、字母和数字");
    if (p.length < 4) return setError("密码至少 4 位");
    if (p === DEFAULT_PASS) return setError(`不能用 ${DEFAULT_PASS}，换一个吧`);
    if (p !== again.trim()) return setError("两次输入的密码不一样");
    setBusy(true);
    setError("");
    try {
      await register(n, p);
      toast(
        `注册成功，欢迎你，${n}！记住你的名字和密码，换手机时用它登录`,
        "ok",
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (guest) return setGuest(true);
    void (reg ? signUp() : enter());
  };
  const switchMode = (m: "login" | "register" | "guest") => {
    setMode(m);
    setError("");
    setPass("");
    setAgain("");
  };

  return (
    <div
      className="onboard"
      role="dialog"
      aria-modal="true"
      aria-label={reg ? "注册" : guest ? "游客进入" : "登录"}
    >
      <div className="onboard-card">
        <img
          className="onboard-art"
          src={`${import.meta.env.BASE_URL}brand/hero.webp`}
          alt=""
        />
        <form className="onboard-body gate" onSubmit={submit}>
          <p className="eyebrow">欢迎来到{APP_NAME}</p>
          {!classes && (
            <div className="gate-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                className={mode === "login" ? "is-on" : ""}
                onClick={() => switchMode("login")}
              >
                登录
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={reg}
                className={reg ? "is-on" : ""}
                onClick={() => switchMode("register")}
              >
                注册新账号
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={guest}
                className={guest ? "is-on" : ""}
                onClick={() => switchMode("guest")}
              >
                游客进入
              </button>
            </div>
          )}
          <h1 className="display">
            {classes
              ? "你是哪个班的？"
              : reg
                ? "注册一个学生账号"
                : guest
                  ? "先不登录，直接看看"
                  : "你叫什么名字？"}
          </h1>
          {classes ? (
            <fieldset>
              <legend>有同学和你同名，选一下自己的班级</legend>
              <div className="choice-grid">
                {classes.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className="choice"
                    disabled={busy}
                    onClick={() => void enter(c)}
                  >
                    <b>{/^[0-9.]+$/.test(c) ? `${c}班` : c}</b>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setClasses(null);
                  setError("");
                }}
              >
                返回
              </button>
            </fieldset>
          ) : guest ? (
            <p className="gate-guest-note">
              游客不用名字和密码，马上就能学。学习数据只存在这台设备的浏览器里，
              <b>请不要清除浏览器缓存</b>
              ，否则进度会丢失。以后注册账号，进度会一起带上。
            </p>
          ) : (
            <>
              <label className="gate-field">
                <span>{reg ? "起个名字" : "我的名字"}</span>
                <input
                  autoComplete="username"
                  maxLength={12}
                  placeholder={reg ? "2 到 12 个字，重名就加数字，如 张伟2" : "写全名"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="gate-field">
                <span>{reg ? "设一个密码" : "密码"}</span>
                <input
                  type="password"
                  autoComplete={reg ? "new-password" : "current-password"}
                  maxLength={20}
                  placeholder={
                    reg
                      ? "4 到 20 位，自己记得住的"
                      : `第一次登录是 ${DEFAULT_PASS}`
                  }
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                />
              </label>
              {reg && (
                <label className="gate-field">
                  <span>再输一遍密码</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    maxLength={20}
                    value={again}
                    onChange={(e) => setAgain(e.target.value)}
                  />
                </label>
              )}
            </>
          )}
          {error && (
            <p className="gate-error" role="alert">
              {error}
            </p>
          )}
          {!classes && (
            <button
              type="submit"
              className="btn btn-primary btn-xl"
              disabled={!guest && (!ready || busy)}
            >
              {guest
                ? "以游客身份进入"
                : busy
                  ? reg
                    ? "正在注册…"
                    : "正在进入…"
                  : reg
                    ? "注册并进入"
                    : "进入"}{" "}
              <ArrowRight size={20} />
            </button>
          )}
          {!guest && (
            <p className="muted">
              {reg
                ? "只需要名字和密码，不收集手机号等个人信息。注册后学习进度会自动同步到云端，换手机用同样的名字和密码登录就能找回。"
                : `老师名单里的同学第一次用 ${DEFAULT_PASS} 登录，进来后改成自己的密码；自己注册的同学用注册时的名字和密码。换手机输入同样的名字和密码，进度会自动找回。`}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

/** 改密码表单：第一次登录时强制出现，「我的」页也能打开 */
export function PasswordForm({ onDone }: { onDone?: () => void }) {
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const p = pass.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (p.length < 4) return setError("密码至少 4 位");
    if (p === DEFAULT_PASS)
      return setError(`不能再用 ${DEFAULT_PASS}，换一个吧`);
    if (p !== again.trim()) return setError("两次输入的不一样");
    setBusy(true);
    setError("");
    try {
      await changePassword(p);
      toast("密码改好了，记住它哦", "ok");
      onDone?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="gate" onSubmit={submit}>
      <label className="gate-field">
        <span>新密码</span>
        <input
          type="password"
          autoComplete="new-password"
          maxLength={20}
          placeholder="4 到 20 位，自己记得住的"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />
      </label>
      <label className="gate-field">
        <span>再输一遍</span>
        <input
          type="password"
          autoComplete="new-password"
          maxLength={20}
          value={again}
          onChange={(e) => setAgain(e.target.value)}
        />
      </label>
      {error && (
        <p className="gate-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="btn btn-primary btn-xl"
        disabled={!p || !again.trim() || busy}
      >
        {busy ? "正在保存…" : "保存新密码"}
      </button>
    </form>
  );
}

/** 第一次登录（还是 123456）：先改密码才能用，免得同学拿 123456 登你的号 */
export function MustChangePassword() {
  const account = useAccount();
  if (!account) return null;
  return (
    <div
      className="onboard"
      role="dialog"
      aria-modal="true"
      aria-label="设置密码"
    >
      <div className="onboard-card">
        <div className="onboard-body">
          <p className="eyebrow">
            {account.name || `${account.cls}班 · ${account.code} 号`}
          </p>
          <h1 className="display">
            {account.name
              ? `${account.name}，设一个自己的密码`
              : "设一个自己的密码"}
          </h1>
          <p className="muted">
            现在用的是初始密码 {DEFAULT_PASS}
            ，同学都知道。改成只有你知道的，以后换手机也用它登录。
          </p>
          <PasswordForm />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void logout()}
          >
            不是我，退出
          </button>
        </div>
      </div>
    </div>
  );
}
