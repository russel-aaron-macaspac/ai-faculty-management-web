type ToastOptions = {
  title: string;
  description?: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
};

type ToastSubscriber = (t: ToastOptions) => void;

const subscribers: ToastSubscriber[] = [];

export function subscribeToast(fn: ToastSubscriber) {
  subscribers.push(fn);
  return () => {
    const idx = subscribers.indexOf(fn);
    if (idx !== -1) subscribers.splice(idx, 1);
  };
}

export function toast(opts: ToastOptions) {
  for (const s of subscribers) {
    try {
      s(opts);
    } catch (e) {
      // ignore
    }
  }
}

export default toast;
