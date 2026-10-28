import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/** Accessible dialog: centered panel on desktop, bottom sheet on phones.
 *  挂到 body 上：页面有进场动画（transform），放在页面里面的话 fixed 定位会跟着页面走，手机上弹窗跑到长页面底部、看起来一片空白。 */
export function Sheet({
  open,
  onClose,
  label,
  children,
  wide = false,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab" && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.classList.add("is-locked");
    requestAnimationFrame(() => panel.current?.focus({ preventScroll: true }));
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("is-locked");
      prev?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="sheet-root" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} className={`sheet ${wide ? "sheet-wide" : ""} ${className}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <span className="sheet-grip" aria-hidden="true" />
        <button className="icon-btn sheet-close" onClick={onClose} aria-label="关闭">
          <X size={20} />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
