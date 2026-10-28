import { duck } from "./sound";

let current: HTMLAudioElement | null = null;
let token = 0;

/* ---------- 录音预先下载 ----------
 * 线上服务器给文件加了 no-store（浏览器不缓存），而 <audio> 用的是分段请求，离线缓存（sw.js）也不接，
 * 结果同一个词每读一次都要重新下载，手机上要等一两秒。这里用 fetch 把整段录音下载到内存（顺带进离线缓存），
 * 播放时直接用内存里的那份。 */
const ready = new Map<string, string>(); // 网址 → 已下载好的 blob 地址
const loading = new Map<string, Promise<void>>();

export function preloadAudio(url: string | null | undefined) {
  if (!url || ready.has(url)) return Promise.resolve();
  let p = loading.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => {
        ready.set(url, URL.createObjectURL(b));
        if (ready.size > 400) {
          const [old, blob] = ready.entries().next().value as [string, string];
          URL.revokeObjectURL(blob);
          ready.delete(old);
        }
      })
      .catch(() => undefined)
      .finally(() => loading.delete(url));
    loading.set(url, p);
  }
  return p;
}

export function stopAudio() {
  token++;
  current?.pause();
  current = null;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

/** Play a recording, falling back to the device voice. Resolves when playback ends. */
export async function play(url: string | null | undefined, text: string, accent: "uk" | "us" = "uk", rate = 1) {
  duck(true);
  try {
    return await speak(url, text, accent, rate);
  } finally {
    duck(false);
  }
}

async function speak(url: string | null | undefined, text: string, accent: "uk" | "us", rate: number) {
  stopAudio();
  const mine = ++token;
  if (url) {
    // 已经下载好的直接播（要在点击的同一刻调用 play，手机浏览器才允许出声，所以不能先 await 下载）
    const a = new Audio(ready.get(url) ?? url);
    if (!ready.has(url)) void preloadAudio(url);
    a.playbackRate = rate;
    current = a;
    try {
      await a.play();
      await new Promise<void>((r) => {
        a.onended = () => r();
        a.onpause = () => r();
      });
      return "recorded" as const;
    } catch {
      if (mine !== token) return "stopped" as const;
      current = null;
    }
  }
  if (!("speechSynthesis" in window)) return "unsupported" as const;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = accent === "uk" ? "en-GB" : "en-US";
  u.rate = rate * 0.95;
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-") === u.lang);
  const best = voices.find((v) => /premium|enhanced|natural|google/i.test(v.name)) || voices[0];
  if (best) u.voice = best;
  await new Promise<void>((r) => {
    u.onend = () => r();
    u.onerror = () => r();
    speechSynthesis.speak(u);
  });
  return "device" as const;
}
