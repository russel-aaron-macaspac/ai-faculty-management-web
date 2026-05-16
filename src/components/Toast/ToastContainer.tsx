"use client";

import { useEffect, useRef, useState } from 'react';
import { subscribeToast } from '@/lib/toast';

type ToastItem = {
  id: string;
  title: string;
  description?: string;
  type?: string;
  duration?: number;
  entering?: boolean;
  leaving?: boolean;
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const dismissTimer = { current: null } as { current: ReturnType<typeof setTimeout> | null };
    const removeTimer = { current: null } as { current: ReturnType<typeof setTimeout> | null };

    const ANIMATION_DURATION = 200; // ms

    const scheduleAutoDismiss = (id: string, duration: number) => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      if (removeTimer.current) { clearTimeout(removeTimer.current); removeTimer.current = null; }
      dismissTimer.current = setTimeout(() => {
        // mark leaving
        setToasts((prev) => prev.map((p) => (p.id === id ? { ...p, leaving: true } : p)));
        // remove after animation
        removeTimer.current = setTimeout(() => setToasts((prev) => prev.filter((p) => p.id !== id)), ANIMATION_DURATION);
      }, duration);
    };

    const unsub = subscribeToast((t) => {
      const id = String(Date.now()) + Math.random().toString(36).slice(2, 8);
      const item: ToastItem = { id, ...t, entering: true };

      setToasts((prev) => {
        if (prev.length === 0) {
          // show immediately
          setTimeout(() => setToasts((p) => p.map((x) => (x.id === id ? { ...x, entering: false } : x))), 20);
          scheduleAutoDismiss(id, t.duration ?? 4000);
          return [item];
        }

        // there is an existing toast: animate it out then replace
        const existingId = prev[0].id;
        // stop any active dismiss timers
        if (dismissTimer.current) { clearTimeout(dismissTimer.current); dismissTimer.current = null; }
        if (removeTimer.current) { clearTimeout(removeTimer.current); removeTimer.current = null; }

        // mark existing as leaving
        setToasts((p) => p.map((x) => (x.id === existingId ? { ...x, leaving: true } : x)));

        // after exit animation, replace with the new toast
        setTimeout(() => {
          setToasts([item]);
          // trigger enter
          setTimeout(() => setToasts((p) => p.map((x) => (x.id === id ? { ...x, entering: false } : x))), 20);
          scheduleAutoDismiss(id, t.duration ?? 4000);
        }, ANIMATION_DURATION);

        return prev;
      });
    });

    return unsub;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div aria-live="polite" className="fixed left-1/2 top-4 z-50 flex transform -translate-x-1/2 flex-col items-center gap-3">
      {toasts.map((t) => {
        const typeColor = t.type === 'success' ? 'bg-emerald-500' : t.type === 'error' ? 'bg-rose-500' : t.type === 'warning' ? 'bg-amber-500' : 'bg-sky-500';
        return (
          <div
            key={t.id}
            className={
              `max-w-md w-full rounded-md overflow-hidden shadow-2xl flex text-sm transition-all duration-200 ease-out ` +
              (t.leaving ? 'opacity-0 -translate-y-3' : t.entering ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0')
            }
          >
            <div className={`${typeColor} w-1`} />
            <div className="flex-1 bg-white px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
              
                  <div className="font-medium text-slate-900">{t.title}</div>
                </div>
                <button
                  onClick={() => {
                    // animate out then remove
                    setToasts((s) => s.map((x) => (x.id === t.id ? { ...x, leaving: true } : x)));
                    setTimeout(() => setToasts((s) => s.filter((x) => x.id !== t.id)), 200);
                  }}
                  className="text-slate-400 hover:text-slate-700"
                >
                  ×
                </button>
              </div>
              {t.description && <div className="text-slate-600 mt-1">{t.description}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
