"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export function Menu({ trigger, children, label, className }: { trigger: React.ReactNode; children: React.ReactNode; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div className="menu" ref={box}>
      <button type="button" className={className ?? "icon-btn"} aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}>
        {trigger}
      </button>
      {open ? <div className="menu-panel">{children}</div> : null}
    </div>
  );
}
