import { AudioLines, Check, Lock, VolumeX } from "lucide-react";
import { AMBIENCE_ICONS } from "./ambienceIcons";
import { useEffect, useRef, useState } from "react";
import { AMBIENCE, primeCues, setAmbience, type AmbienceId } from "../lib/sound";
import { store, useStore } from "../store/store";
import { FREE_MUSIC, musicOrder } from "../store/gameState";

/** 第一首（星河入梦）免费，其他环境音乐要从宝箱里开出来。 */
export function useMusicUnlocked() {
  const music = useStore((s) => s.progress.game.music);
  return (id: string) => id === FREE_MUSIC || music.includes(id);
}


/** Keeps the ambience in sync with settings; browsers only allow audio after a user gesture. */
export function AmbienceController() {
  const ambience = useStore((s) => s.settings.ambience);
  const volume = useStore((s) => s.settings.ambienceVolume);
  const playable = useMusicUnlocked()(ambience) && ambience !== "off";
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const arm = () => {
      primeCues();
      setArmed(true);
    };
    window.addEventListener("pointerdown", arm, { once: true });
    window.addEventListener("keydown", arm, { once: true });
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, []);
  useEffect(() => {
    if (armed) void setAmbience(playable ? ambience : null, volume);
  }, [armed, ambience, volume, playable]);
  return null;
}

export function AmbiencePicker() {
  const [open, setOpen] = useState(false);
  const ambience = useStore((s) => s.settings.ambience);
  const volume = useStore((s) => s.settings.ambienceVolume);
  const unlocked = useMusicUnlocked();
  const owned = useStore((s) => s.progress.game.music);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const on = ambience !== "off" && unlocked(ambience);
  // 记住静音前在放哪一首，再点静音键就恢复它
  const lastOn = useRef<AmbienceId>(on ? (ambience as AmbienceId) : (FREE_MUSIC as AmbienceId));
  if (on) lastOn.current = ambience as AmbienceId;
  return (
    <div className="amb" ref={box}>
      <button className={`icon-btn amb-btn ${on ? "is-on" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="环境声" title="环境声">
        <AudioLines size={19} />
        {on && <span className="amb-bars" aria-hidden="true"><i /><i /><i /></span>}
      </button>
      {open && (
        <div className="amb-pop" role="dialog" aria-label="环境声">
          <p className="eyebrow">环境声 · 专注陪伴</p>
          <ul>
            {musicOrder(AMBIENCE, owned).map(({ id, label }) => {
              const Icon = AMBIENCE_ICONS[id];
              const has = unlocked(id);
              const sel = ambience === id && has;
              return (
                <li key={id}>
                  <button className={`${sel ? "is-on" : ""} ${has ? "" : "is-locked"}`} onClick={() => has && store.settings({ ambience: sel ? "off" : id })} aria-pressed={sel} disabled={!has} title={has ? undefined : "从宝箱里开出来就能用"}>
                    <Icon size={18} strokeWidth={1.7} />
                    <span>{label}</span>
                    {sel && <Check size={16} />}
                    {!has && <Lock size={14} />}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="amb-vol">
            <button
              className={`amb-mute ${on ? "" : "is-on"}`}
              onClick={() => store.settings({ ambience: on ? "off" : unlocked(lastOn.current) ? lastOn.current : FREE_MUSIC })}
              aria-pressed={!on}
              aria-label={on ? "安静（关掉环境声）" : "恢复环境声"}
              title={on ? "安静" : "恢复"}
            >
              <VolumeX size={17} strokeWidth={1.8} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) =>
                // 静音时拖音量条，也顺便恢复刚才那首
                store.settings({ ambienceVolume: Number(e.target.value), ...(on ? {} : { ambience: unlocked(lastOn.current) ? lastOn.current : FREE_MUSIC }) })
              }
              aria-label="音量"
            />
          </div>
          <p className="amb-note">读单词时会自动压低环境声。带锁的音乐要从宝箱里开出来。</p>
        </div>
      )}
    </div>
  );
}
