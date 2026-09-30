"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import Icon from "./Icons";
import { cn } from "@/lib/utils";

type Tone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tone: Tone;
  message: string;
}

const Ctx = createContext<{ toast: (message: string, tone?: Tone) => void }>({ toast: () => {} });

export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const toast = useCallback((message: string, tone: Tone = "success") => {
    const id = ++seq.current;
    setItems((l) => [...l.slice(-3), { id, tone, message }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), tone === "error" ? 6000 : 3200);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex max-w-md animate-slide-up items-start gap-2.5 rounded-xl px-4 py-3 text-sm text-white shadow-pop",
              t.tone === "success" && "bg-slate-900",
              t.tone === "error" && "bg-red-600",
              t.tone === "info" && "bg-slate-700"
            )}
          >
            <Icon name={t.tone === "error" ? "alert" : t.tone === "success" ? "check" : "info"} size={17} className="mt-0.5 shrink-0" />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
