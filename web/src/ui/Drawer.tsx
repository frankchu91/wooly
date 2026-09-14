import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Drawer({ open, onClose, title, children }: DrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const prefersReducedMotion = useReducedMotion();

  // Keep the latest onClose available to the keydown listener without
  // re-running the open/close effect (and re-stealing focus) on every
  // render just because the parent passed a new callback identity.
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }

      if (event.key === "Tab") {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    // Stop the page behind the drawer scrolling under it — on a phone the drawer covers
    // most of the viewport and a stray drag would otherwise scroll the list, not the
    // panel.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  const transition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: "easeOut" as const };
  const panelInitial = prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 24 };
  const panelExit = prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 24 };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            data-testid="drawer-backdrop"
            className="fixed inset-0 z-40 bg-ink/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            onClick={onClose}
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            // `flex flex-col` + a `min-h-0 flex-1` body is what makes the body (and only
            // the body) the scroll container at both breakpoints — without `min-h-0` the
            // flex item refuses to shrink below its content and the panel grows past the
            // viewport, stranding the actions at the bottom.
            className={
              "fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] w-full flex-col rounded-t-card bg-surface p-5 shadow-card " +
              "md:inset-x-auto md:right-0 md:top-0 md:bottom-auto md:h-full md:max-h-none md:w-full md:max-w-md md:rounded-t-none md:rounded-l-card"
            }
            initial={panelInitial}
            animate={{ opacity: 1, y: 0 }}
            exit={panelExit}
            transition={transition}
          >
            <div className="flex shrink-0 items-center justify-between gap-4">
              <h2 id={titleId} className="font-heading text-lg font-semibold text-ink">
                {title}
              </h2>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-control p-1.5 text-muted transition-colors duration-200 ease-out hover:bg-mint/60 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 min-h-0 flex-1 overflow-y-auto">{children}</div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
