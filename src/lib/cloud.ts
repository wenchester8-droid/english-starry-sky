/* 学生进度上云：名字 + 个人密码登录（老师在老师页加的名单里才有账号，初始密码 123456，
   第一次进来要改成自己的）。账号内部仍是「班级 + 编号」。做题记录自动同步到腾讯云开发，换手机输入同样的名字和密码就能找回。
   密码只在云函数里核对；本机只存登录后发的 token，不存密码。 */
import { useSyncExternalStore } from "react";
import { exportBackup, importBackup, onEdit, resetProgress } from "../store/store";
import { exportQa, importQa, onQaChange } from "../pages/Points";

/** 腾讯云开发的环境号，写在 .env.local 的 VITE_CLOUD_ENV 里（不进代码仓库）。
 *  没配置时网页照样能用：直接以游客身份进入，进度只存在本机浏览器。 */
export const CLOUD_ENV: string = import.meta.env.VITE_CLOUD_ENV || "";
export const DEFAULT_PASS = "123456";
/** 名单外自己注册的同学都在这个组：不进老师页、不出老师奖励券 */
export const FREE_CLASS = "自由学习";

export interface Account {
  cls: string;
  code: string;
  token: string;
  /** 老师录入的姓名（欢迎语用），没录就是空 */
  name?: string;
  /** 还在用初始密码 123456，要先改密码才能用 */
  mustChange?: boolean;
}

const ACCOUNT_KEY = "qishang:account";
/** 游客：不登录直接用，进度只在这台设备的浏览器里 */
const GUEST_KEY = "qishang:guest";
/** 云端最近一次的版本时间（服务器的钟） */
const REMOTE_KEY = "qishang:remoteAt";
/** 本机最近一次改动、最近一次传上去的改动（手机的钟） */
const TOUCHED_KEY = "qishang:touched";
const UPLOADED_KEY = "qishang:uploaded";

const readNum = (k: string) => {
  try {
    return Number(localStorage.getItem(k)) || 0;
  } catch {
    return 0;
  }
};
const writeKey = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* 隐私模式存不了，就只在这次打开时有效 */
  }
};

/** 本机上一次登录的是谁（旧版用班级口令登录的也算），换人登录时用来判断要不要清本机进度 */
let lastUser: { cls: string; code: string } | null = null;
let account: Account | null = (() => {
  try {
    const a = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || "null");
    if (a && typeof a.cls === "string" && typeof a.code === "string") lastUser = { cls: a.cls, code: a.code };
    return lastUser && typeof a.token === "string" ? (a as Account) : null;
  } catch {
    return null;
  }
})();

let guest = (() => {
  if (!CLOUD_ENV) return true; // 没配云端：只能当游客
  try {
    return localStorage.getItem(GUEST_KEY) === "1";
  } catch {
    return false;
  }
})();

export type SyncState = "idle" | "saving" | "saved" | "offline";
let sync: { state: SyncState; at: number } = { state: "idle", at: readNum(REMOTE_KEY) };

const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
export const useAccount = () => useSyncExternalStore(subscribe, () => account);
export const useGuest = () => useSyncExternalStore(subscribe, () => guest && !account);
/** 游客和自己注册的同学：没有老师给他们兑换奖励券 */
export const noTeacher = (a: Account | null) => !a || a.cls === FREE_CLASS;

/** 以游客身份进入（或退回登录页）。游客的进度在本机浏览器里，登录或注册后会一起带上云端 */
export function setGuest(v: boolean) {
  guest = v;
  writeKey(GUEST_KEY, v ? "1" : null);
  emit();
}
export const useSync = () => useSyncExternalStore(subscribe, () => sync);
const setSync = (state: SyncState, at = sync.at) => {
  sync = { state, at };
  emit();
};

/* ---------- 调云函数（SDK 体积大，用到时才加载） ---------- */

type CallFn = (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
let caller: Promise<CallFn> | null = null;

function getCaller(): Promise<CallFn> {
  caller ??= (async () => {
    const { default: cloudbase } = await import("@cloudbase/js-sdk");
    const app = cloudbase.init({ env: CLOUD_ENV, region: "ap-shanghai" });
    const auth = app.auth({ persistence: "local" });
    const state = await auth.getLoginState();
    if (!state) await auth.signInAnonymously();
    return async (data: Record<string, unknown>) => {
      const res = await app.callFunction({ name: "api", data });
      const r = res.result as { statusCode?: number; body?: string } | undefined;
      const body = typeof r?.body === "string" ? JSON.parse(r.body) : (r ?? {});
      if (r?.statusCode && r.statusCode >= 400) throw new CloudError(body.error || "出错了", r.statusCode);
      return body;
    };
  })().catch((e) => {
    caller = null;
    throw e;
  });
  return caller;
}

export class CloudError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

/**
 * 还没登录时提前做好准备：下载云开发工具包（800 多 KB，线上服务器不压缩也不缓存）、做完匿名认证，
 * 再发一个空请求把云函数「叫醒」（隔一阵没人用会冷启动，要一两秒）。
 * 学生看开场动画、输名字密码的这几秒里做完，点「进入」时就只剩登录这一次请求。
 */
let warming: Promise<unknown> | null = null;
export function warmUp() {
  warming ??= getCaller()
    .then((call) => call({ action: "ping" }))
    .catch(() => {
      warming = null; // 网络不好时下次再试；云函数回「未知操作」也算叫醒了
    });
}

export async function callApi(data: Record<string, unknown>) {
  try {
    return await (await getCaller())(data);
  } catch (e) {
    if (e instanceof CloudError) throw e;
    throw new CloudError("连不上网络，请检查后再试");
  }
}

/* ---------- 登录、同步 ---------- */

interface Remote {
  updated: number;
  data: { progress?: unknown; settings?: unknown; qa?: unknown } | null;
}

/** 正在把云端数据写回本机，这期间的改动不算本机改动 */
let adopting = false;
const dirty = () => readNum(TOUCHED_KEY) > readNum(UPLOADED_KEY);

function quietly(fn: () => void) {
  adopting = true;
  try {
    fn();
  } finally {
    adopting = false;
  }
}

function adopt(r: Remote) {
  quietly(() => {
    importBackup(JSON.stringify({ app: "word-atlas", version: 2, progress: r.data!.progress, settings: r.data!.settings ?? {} }));
    importQa(r.data!.qa ?? {});
  });
  writeKey(REMOTE_KEY, String(r.updated));
  writeKey(UPLOADED_KEY, String(readNum(TOUCHED_KEY)));
  setSync("saved", r.updated);
}

/** 云端有别的手机传上来的新版本、本机又没有没传的改动，就用云端的；本机有新改动就传上去 */
function reconcile(r: Remote) {
  if (r.data?.progress && r.updated > readNum(REMOTE_KEY) && !dirty()) adopt(r);
  else if (dirty() || !r.data) void save(true);
  else setSync("saved", r.updated);
}

function setAccount(a: Account | null) {
  account = a;
  if (a) {
    guest = false;
    writeKey(GUEST_KEY, null);
  }
  if (a) lastUser = { cls: a.cls, code: a.code };
  writeKey(ACCOUNT_KEY, a && JSON.stringify(a));
  emit();
}

const forget = () => setAccount(null);

function clearLocal() {
  quietly(() => {
    resetProgress();
    importQa({});
  });
  for (const k of [REMOTE_KEY, TOUCHED_KEY, UPLOADED_KEY]) writeKey(k, null);
}

/** 欢迎语、「我的」页上怎么称呼：有姓名用姓名，没有就用班级编号 */
export const displayName = (a: Account) => a.name || `${a.cls}班 ${a.code} 号`;

/** 用名字 + 密码登录。不同班有同名的，返回 { classes } 让学生先选班级，再带上 cls 重新登录 */
export async function login(name: string, pass: string, cls?: string): Promise<Account | { classes: string[] }> {
  const r = (await callApi({ action: "login", name, pass, ...(cls ? { cls } : {}) })) as unknown as Remote & {
    token: string;
    cls: string;
    code: string;
    name?: string;
    mustChange: boolean;
    needClass?: boolean;
    classes?: string[];
  };
  if (r.needClass) return { classes: r.classes ?? [] };
  const code = String(r.code);
  cls = String(r.cls);
  // 换了一个学生：先清掉本机上一位的进度，免得混在一起
  if (lastUser && (lastUser.cls !== cls || lastUser.code !== code)) clearLocal();
  setAccount({ cls, code, token: r.token, name: r.name || "", mustChange: r.mustChange });
  reconcile(r);
  return account!;
}

/**
 * 自己注册（只能注册学生，进「自由学习」组）。注册完直接登录；
 * 之前当游客学的进度不清掉，会作为这个账号的第一份进度传上云端。
 */
export async function register(name: string, pass: string): Promise<Account> {
  const r = (await callApi({ action: "register", name, pass })) as unknown as Remote & { token: string; cls: string; code: string; name?: string };
  const code = String(r.code);
  const cls = String(r.cls);
  if (lastUser && (lastUser.cls !== cls || lastUser.code !== code)) clearLocal();
  setAccount({ cls, code, token: r.token, name: r.name || name, mustChange: false });
  reconcile(r);
  return account!;
}

/** 改密码。改完 token 换新，别的手机上的登录会失效，要用新密码重新登录 */
export async function changePassword(pass: string) {
  if (!account) throw new CloudError("请先登录");
  const { cls, code, token } = account;
  const r = await callApi({ action: "password", cls, code, token, pass });
  setAccount({ ...account, token: String(r.token), mustChange: false });
}

const auth = (a: Account) => ({ cls: a.cls, code: a.code, token: a.token });

export async function logout() {
  await save();
  clearLocal();
  forget();
  setSync("idle", 0);
}

let timer: number | undefined;
let inflight: Promise<void> | null = null;

export async function save(force = false): Promise<void> {
  window.clearTimeout(timer);
  if (inflight) await inflight;
  if (!account || (!force && !dirty())) return;
  const a = account;
  const touched = readNum(TOUCHED_KEY);
  inflight = (async () => {
    setSync("saving");
    try {
      const data = { ...JSON.parse(exportBackup()), qa: exportQa() };
      const r = await callApi({ action: "save", ...auth(a), data });
      writeKey(REMOTE_KEY, String(Number(r.updated) || 0));
      writeKey(UPLOADED_KEY, String(touched)); // 上传期间又改了的话 touched 更大，下一轮再传
      setSync("saved", Number(r.updated) || Date.now());
    } catch (e) {
      setSync("offline");
      if (e instanceof CloudError && e.status === 403) forget(); // 密码在别的手机改了、或老师重置了：回登录页重新输
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function touch() {
  if (adopting || !account) return;
  writeKey(TOUCHED_KEY, String(Date.now()));
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void save(), 15000);
}

if (typeof window !== "undefined") {
  onEdit(touch);
  onQaChange(touch);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && void save());
  window.addEventListener("online", () => void save());
}

/** 每次打开网页：看看云端有没有别的手机传上来的新进度 */
export async function refresh() {
  if (!account) return;
  try {
    const r = (await callApi({ action: "sync", ...auth(account) })) as unknown as Remote & { name?: string; mustChange: boolean };
    if (!!r.mustChange !== !!account.mustChange || (r.name || "") !== (account.name || "")) setAccount({ ...account, name: r.name || "", mustChange: r.mustChange });
    reconcile(r);
  } catch (e) {
    setSync("offline");
    if (e instanceof CloudError && e.status === 403) forget();
  }
}
