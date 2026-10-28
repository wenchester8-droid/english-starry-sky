import { BookOpen, BookText, ChevronLeft, ChevronRight, Github, PenLine, Search, Trophy, User, type LucideIcon } from "lucide-react";
import { useConstellations } from "./galaxy/useConstellations";
import { useCallback, useEffect, useState } from "react";
import { AtlasContext, useAtlas, useEntry } from "./atlas/context";
import { loadOpenAtlas, loadPrivateAtlas, withShelf } from "./atlas/data";
import { BOOKS, bookById, bookTag } from "./lib/books";
import type { Atlas } from "./atlas/types";
import { closeWord, currentLocation, go, openWord, useLocation, type Route } from "./lib/router";
import { AtlasPage } from "./pages/Atlas";
import { About } from "./pages/About";
import { Learn } from "./pages/Learn";
import { Me } from "./pages/Me";
import { Onboarding } from "./pages/Onboarding";
import { Practice } from "./pages/Practice";
import { Challenge } from "./pages/Challenge";
import { PointsPage } from "./pages/Points";
import { Today } from "./pages/Today";
import { Teacher } from "./pages/Teacher";
import { noTeacher, refresh, useAccount, useGuest, warmUp } from "./lib/cloud";
import { setCouponsOff } from "./store/game";
import { Gate, MustChangePassword } from "./ui/Gate";
import { cue } from "./lib/sound";
import { store, useStore } from "./store/store";
import { EntryView } from "./ui/EntryView";
import { AmbienceController, AmbiencePicker } from "./ui/Ambience";
import { Logo, Mark } from "./ui/Logo";
import { BookSwitcher } from "./ui/BookSwitcher";
import { Palette } from "./ui/Palette";
import { Sheet } from "./ui/Sheet";
import { shouldShowSplash, Splash } from "./ui/Splash";
import { Toasts } from "./ui/Toast";
import { ChestAutoPop, useEarnDaily, useEggChest } from "./ui/Chest";
import { TreasuryButton, TreasurySheet } from "./ui/Treasury";
import { BadgeButton, BadgeSheet, useBadgeToasts } from "./ui/Badges";

// 「今日」用标志当图标，和左上角的标志一致
const TodayIcon = ({ size }: { size?: number; strokeWidth?: number; className?: string }) => <Mark size={size} />;

const NAV: { page: Route["page"]; label: string; icon: LucideIcon | typeof TodayIcon }[] = [
  { page: "today", label: "今日", icon: TodayIcon },
  { page: "atlas", label: "图鉴", icon: BookOpen },
  { page: "points", label: "课本", icon: BookText },
  { page: "practice", label: "练习", icon: PenLine },
  { page: "me", label: "我的", icon: User },
];
/** 挑战模式打开后，「练习」这一格变成「挑战」（真题阅读馆） */
const useNav = () => {
  const challenge = useStore((s) => s.settings.challenge);
  return challenge ? NAV.map((n) => (n.page === "practice" ? { ...n, label: "挑战", icon: Trophy } : n)) : NAV;
};

function useTheme() {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const paint = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0D1120" : "#F6F1E7");
    };
    paint();
    // Keep the browser bar in step when the system flips light/dark.
    mq.addEventListener("change", paint);
    return () => mq.removeEventListener("change", paint);
  }, [theme]);
  return theme;
}

/** 各册共用一份学习进度（按单词记），沿用七上时的存档名，老同学的进度不丢 */
const PROGRESS_ID = "pep-7a";

export default function App() {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [shelf, setShelf] = useState<Atlas[] | null>(null);
  const [priv, setPriv] = useState<Atlas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dataset = useStore((s) => s.settings.dataset);
  const book = bookById(useStore((s) => s.settings.book)).id;
  useTheme();

  useEffect(() => {
    Promise.all(BOOKS.filter((b) => b.ready).map((b) => loadOpenAtlas(b.id))).then(
      (all) => {
        setShelf(all);
        if (import.meta.env.DEV) loadPrivateAtlas(all[0]).then(setPriv, () => null);
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  const [open, setOpen] = useState<Atlas | null>(null);
  useEffect(() => {
    if (!shelf) return;
    const current = shelf.find((a) => a.book === book) ?? shelf[0];
    setOpen(withShelf(current, shelf));
  }, [shelf, book]);

  useEffect(() => {
    const next = dataset === "private" && priv ? priv : open;
    if (next && next !== atlas) {
      store.useDataset(next.kind === "open" ? PROGRESS_ID : next.id);
      setAtlas(next);
    }
  }, [dataset, open, priv, atlas]);

  if (error)
    return (
      <div className="boot">
        <Logo />
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => location.reload()}>
          重新加载
        </button>
      </div>
    );
  if (!atlas)
    return (
      <div className="boot" aria-busy="true">
        <Logo />
        <span className="spinner" />
      </div>
    );
  return (
    <AtlasContext.Provider value={atlas}>
      <Shell privateAvailable={!!priv} />
    </AtlasContext.Provider>
  );
}

function Shell({ privateAvailable }: { privateAvailable: boolean }) {
  const { route, word } = useLocation();
  const nav = useNav();
  const challenge = useStore((s) => s.settings.challenge);
  const onboarded = useStore((s) => s.settings.onboarded);
  const account = useAccount();
  const guest = useGuest();
  // 游客和自己注册的同学没有老师给兑换，宝箱里不出老师奖励券（换成碎片）
  setCouponsOff(noTeacher(account));
  const free = route.page === "about" || route.page === "teacher";
  const eggTap = useEggChest();
  const [palette, setPalette] = useState(false);
  const [splash, setSplash] = useState(shouldShowSplash);
  const focus = route.page === "learn";
  const bookName = bookTag(useStore((s) => s.settings.book));
  useEarnDaily();
  useBadgeToasts();
  useConstellations();

  // 打开网页时看看别的手机有没有传上来更新的进度；还没登录的，趁开场动画把登录要用的东西先准备好
  useEffect(() => {
    if (account) void refresh();
    else warmUp();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA";
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      } else if (e.key === "/" && !typing && !focus) {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [focus]);

  useEffect(() => {
    if (!word) window.scrollTo({ top: 0 });
  }, [route.page]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`app ${focus ? "is-focus" : ""}`}>
      {!focus && (
        <header className="topbar">
          <div className="topbar-brand">
            <a className="topbar-logo" href="#/" aria-label="首页" onClick={eggTap}>
              <Logo compact />
            </a>
            <BookSwitcher />
          </div>
          <nav className="topnav" aria-label="主导航">
            {nav.map(({ page, label }) => (
              <a key={page} href={page === "today" ? "#/" : `#/${page}`} className={route.page === page ? "is-on" : ""} aria-current={route.page === page ? "page" : undefined}>
                {label}
                </a>
            ))}
          </nav>
          <div className="topbar-tools">
            <button className="search-pill" onClick={() => setPalette(true)} aria-label="搜索单词">
              <Search size={17} />
              <span>搜索单词</span>
              <kbd>⌘K</kbd>
            </button>
            <TreasuryButton />
            <BadgeButton />
            <AmbiencePicker />
            <a className="icon-btn hide-sm" href="#/about" aria-label="关于与开源" title="关于与开源">
              <Github size={19} />
            </a>
          </div>
        </header>
      )}

      <main className="main" id="main">
        {route.page === "today" && <Today />}
        {route.page === "atlas" && <AtlasPage route={route} />}
        {route.page === "learn" && <Learn />}
        {route.page === "practice" && (challenge ? <Challenge /> : <Practice />)}
        {route.page === "points" && <PointsPage />}
        {route.page === "me" && <Me privateAvailable={privateAvailable} />}
        {route.page === "about" && <About />}
        {route.page === "teacher" && <Teacher />}
      </main>

      {!focus && (
        <footer className="footer">
          <Logo compact />
          <p>
            {bookName} · 插画大部分由老师制作，部分插画与美音来自开源项目「词光」 ·{" "}
            <a className="footer-about" href="#/about">
              关于
            </a>
          </p>
        </footer>
      )}

      {!focus && (
        <nav className="tabbar" aria-label="主导航">
          {nav.map(({ page, label, icon: Icon }) => (
            <a key={page} href={page === "today" ? "#/" : `#/${page}`} className={route.page === page ? "is-on" : ""} aria-current={route.page === page ? "page" : undefined}>
              <Icon size={22} strokeWidth={route.page === page ? 2.1 : 1.7} className={`tab-ico tab-ico-${challenge && page === "practice" ? "challenge" : page}`} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
      )}

      <WordSheet id={word} />
      <Palette open={palette} onClose={() => setPalette(false)} />
      {!account && !guest && !free && !splash && <Gate />}
      {account?.mustChange && !free && !splash && <MustChangePassword />}
      {((account && !account.mustChange) || guest) && !onboarded && !free && !splash && <Onboarding />}
      {splash && <Splash onDone={() => setSplash(false)} />}
      <TreasurySheet />
      <BadgeSheet />
      <ChestAutoPop />
      <Toasts />
      <AmbienceController />
    </div>
  );
}

function WordSheet({ id }: { id: string | null }) {
  const atlas = useAtlas();
  const opened = id !== null;
  useEffect(() => {
    if (opened && store.get().settings.sfx) void cue("page");
  }, [opened]);
  const { entry, error } = useEntry(id);
  const ref = id ? atlas.byId.get(id) : undefined;
  // 别的册的词（从复习、错题里点开的）不在本册的顺序里，不显示上一个 / 下一个
  const inBook = !!ref && atlas.words[ref.order]?.id === ref.id;
  const neighbor = useCallback(
    (d: number) => {
      if (!ref || !inBook) return;
      const n = atlas.words[ref.order + d];
      if (n) go(currentLocation().route, n.id, true);
    },
    [atlas, ref, inBook],
  );
  useEffect(() => {
    if (!id) return;
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "ArrowLeft") neighbor(-1);
      if (e.key === "ArrowRight") neighbor(1);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [id, neighbor]);
  return (
    <Sheet open={!!id} onClose={closeWord} label={ref ? `${ref.word} 词条` : "词条"} wide>
      {entry ? (
        <EntryView key={entry.id} entry={entry} />
      ) : error ? (
        <p className="sheet-error">{error}</p>
      ) : (
        <span className="spinner" />
      )}
      {ref && inBook && (
        <nav className="sheet-nav" aria-label="切换词条">
          <button className="icon-btn" onClick={() => neighbor(-1)} disabled={ref.order === 0} aria-label="上一个">
            <ChevronLeft size={20} />
          </button>
          <span>
            {(ref.order + 1).toLocaleString()} / {atlas.count.toLocaleString()}
          </span>
          <button className="icon-btn" onClick={() => neighbor(1)} disabled={ref.order >= atlas.count - 1} aria-label="下一个">
            <ChevronRight size={20} />
          </button>
        </nav>
      )}
    </Sheet>
  );
}

export { openWord };
