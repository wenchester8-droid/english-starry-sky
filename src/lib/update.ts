/**
 * 自动换成最新版。
 * 微信里打开的网页会被缓存得很久，学生不会去点「刷新」。所以网页一打开、每次从后台切回来，
 * 都去取一次服务器上的 version.json（网址带随机数，微信和离线缓存都拿不了旧的顶替），
 * 发现自己不是最新版，就跳到带新版本号的网址（对微信来说是新网址，只能重新取页面）。
 * 同一个版本最多自动跳一次，防止网络异常时来回刷新。
 */
export const BUILD = __BUILD__;
const KEY = "app:reloaded-for";

const read = () => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};
const write = (v: string) => {
  try {
    sessionStorage.setItem(KEY, v);
  } catch {
    /* 无痕模式存不了也没关系 */
  }
};

async function check() {
  // 正在答题时不打断，等切回别的页面或下次打开再换
  if (location.hash.startsWith("#/learn")) return;
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return;
    const { v } = (await r.json()) as { v?: string };
    if (!v || v === BUILD || read() === v) return;
    write(v);
    // 先让离线缓存脚本也更新到新版，再换页面
    await navigator.serviceWorker
      ?.getRegistration()
      .then((reg) => reg?.update())
      .catch(() => null);
    const url = new URL(location.href);
    url.searchParams.set("v", v);
    location.replace(url.toString());
  } catch {
    /* 没网就算了，下次再查 */
  }
}

export function watchForUpdates() {
  if (!import.meta.env.PROD) return;
  // 换新成功后，把网址里的 ?v= 去掉，免得学生收藏、转发时带着
  const url = new URL(location.href);
  if (url.searchParams.get("v") === BUILD) {
    url.searchParams.delete("v");
    history.replaceState(history.state, "", url.toString());
  }
  void check();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void check();
  });
}
