import { useEffect, useState } from "react";
import { useStore, store } from "../store/store";

/* 每册一份的数据文件：public/data/<册号>-<名称>.json（考点 points、课文 lessons、真题 exams） */

const cache = new Map<string, unknown>();
const pending = new Map<string, Promise<unknown>>();
const key = (book: string, name: string) => `${book}-${name}`;

export function loadBookData<T>(name: string, book = store.get().settings.book): Promise<T | null> {
  const k = key(book, name);
  let p = pending.get(k);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/${k}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        cache.set(k, d);
        return d;
      })
      .catch(() => {
        pending.delete(k);
        return null;
      });
    pending.set(k, p);
  }
  return p as Promise<T | null>;
}

/** 已经加载好的当前册数据（没加载完是 null） */
export const peekBookData = <T,>(name: string, book = store.get().settings.book) => (cache.get(key(book, name)) ?? null) as T | null;

/** 当前册的数据，切换册数时自动换 */
export function useBookData<T>(name: string): T | null {
  const book = useStore((s) => s.settings.book);
  const [d, setD] = useState<{ book: string; data: T | null }>(() => ({ book, data: peekBookData<T>(name, book) }));
  useEffect(() => {
    let live = true;
    void loadBookData<T>(name, book).then((data) => live && setD({ book, data }));
    return () => {
      live = false;
    };
  }, [name, book]);
  return d.book === book ? d.data : peekBookData<T>(name, book);
}
