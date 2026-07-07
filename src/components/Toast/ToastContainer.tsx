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

type TimerSet = {
  enter: ReturnType<typeof setTimeout> | null;
  dismiss: ReturnType<typeof setTimeout> | null;
  remove: ReturnType<typeof setTimeout> | null;
};

const ANIMATION_DURATION = 200;

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastsRef = useRef<ToastItem[]>([]);
  const timersRef = useRef<TimerSet>({ enter: null, dismiss: null, remove: null });

  useEffect(() => {
    toastsRef.current = toasts;
  }, [toasts]);

  useEffect(() => {
    const clearTimer = (key: keyof TimerSet) => {
      const timer = timersRef.current[key];
      if (timer) {
        clearTimeout(timer);
        timersRef.current[key] = null;
      }
    };

    const clearTimers = () => {
      clearTimer('enter');
      clearTimer('dismiss');
      clearTimer('remove');
    };

    const commitToasts = (nextToasts: ToastItem[]) => {
      toastsRef.current = nextToasts;
      setToasts(nextToasts);
    };

    const setToastEnteringComplete = (id: string) => {
      const nextToasts = toastsRef.current.map((toast) => {
        if (toast.id === id) {
          return { ...toast, entering: false };
        }

        return toast;
      });

      commitToasts(nextToasts);
    };

    const setToastLeaving = (id: string) => {
      const nextToasts = toastsRef.current.map((toast) => {
        if (toast.id === id) {
          return { ...toast, leaving: true };
        }

        return toast;
      });

      commitToasts(nextToasts);
    };

    const removeToast = (id: string) => {
      const remainingToasts = toastsRef.current.filter((toast) => toast.id !== id);
      commitToasts(remainingToasts);
    };

    const showToast = (item: ToastItem, duration: number) => {
      clearTimers();
      commitToasts([item]);
      timersRef.current.enter = setTimeout(setToastEnteringComplete, 20, item.id);
      timersRef.current.dismiss = setTimeout(setToastLeaving, duration, item.id);
      timersRef.current.remove = setTimeout(removeToast, duration + ANIMATION_DURATION, item.id);
    };

    const replaceToast = (item: ToastItem, duration: number, existingId: string) => {
      clearTimers();
      setToastLeaving(existingId);
      timersRef.current.remove = setTimeout(showToast, ANIMATION_DURATION, item, duration);
    };

    const unsub = subscribeToast((toast) => {
      const id = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
      const item: ToastItem = { id, ...toast, entering: true };
      const duration = toast.duration ?? 4000;
      const currentToasts = toastsRef.current;

      if (currentToasts.length === 0) {
        showToast(item, duration);
        return;
      }

      replaceToast(item, duration, currentToasts[0].id);
    });

    return () => {
      clearTimers();
      unsub();
    };
  }, []);

  const dismissToast = (id: string) => {
    const nextToasts = toastsRef.current.map((toast) => {
      if (toast.id === id) {
        return { ...toast, leaving: true };
      }

      return toast;
    });

    commitToasts(nextToasts);
    timersRef.current.remove = setTimeout(removeToast, ANIMATION_DURATION, id);
  };

  if (toasts.length === 0) return null;

  return (
    <div aria-live="polite" className="fixed left-1/2 top-4 z-50 flex transform -translate-x-1/2 flex-col items-center gap-3">
      {toasts.map((toast) => {
        let typeColor = 'bg-[#0F172A]';
        if (toast.type === 'success') {
          typeColor = 'bg-emerald-500';
        } else if (toast.type === 'error') {
          typeColor = 'bg-rose-500';
        } else if (toast.type === 'warning') {
          typeColor = 'bg-amber-500';
        }

        let motionClass = 'opacity-100 translate-y-0';
        if (toast.leaving) {
          motionClass = 'opacity-0 -translate-y-3';
        } else if (toast.entering) {
          motionClass = 'opacity-0 -translate-y-2';
        }

        return (
          <div
            key={toast.id}
            className={`flex w-full max-w-md overflow-hidden rounded-[12px] text-sm shadow-2xl transition-all duration-200 ease-out ${motionClass}`}
          >
            <div className={`${typeColor} w-1`} />
            <div className="flex-1 bg-white px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="font-medium text-slate-900">{toast.title}</div>
                </div>
                <button onClick={() => dismissToast(toast.id)} className="text-slate-400 hover:text-slate-700">
                  ×
                </button>
              </div>
              {toast.description && <div className="mt-1 text-slate-600">{toast.description}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
