import { useSyncExternalStore } from "react";

export interface ToastItem {
  id: number;
  message: string;
}

let toasts: ToastItem[] = [];
let nextId = 0;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** Queues a toast message; it auto-dismisses after 3 seconds. */
export function toast(message: string): void {
  const id = nextId++;
  toasts = [...toasts, { id, message }];
  notify();
  setTimeout(() => {
    toasts = toasts.filter((item) => item.id !== id);
    notify();
  }, 3000);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ToastItem[] {
  return toasts;
}

/** Reads the current toast queue; re-renders subscribers as it changes. */
export function useToast(): ToastItem[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Renders the toast queue, bottom-centred. Mount once near the app root. */
export function Toaster() {
  const items = useToast();

  return (
    <div
      role="status"
      aria-live="polite"
      // Clears the mobile tab bar (and the plan page's sticky action) on small screens.
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="pointer-events-auto rounded-control bg-ink px-4 py-2 text-sm font-medium text-white shadow-card"
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}
