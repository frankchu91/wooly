import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";

import { earliestCloseDate } from "../../engine/conditions";
import { STATUS_ORDER } from "../../engine/types";
import type { Bonus, TrackedItem, TrackStatus } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { Badge, BankAvatar, Button, Card, MoneyText, cn, dateLabel } from "../../ui";
import { requirementsProgress, stageContextLine } from "./trackerModel";

export interface PipelineCardProps {
  item: TrackedItem;
  /** The bonus this item refers to, or `undefined` if it's since dropped out of the
   * dataset (e.g. expired). The card still renders — with the bonus id as its title and
   * no money value — rather than crashing. */
  bonus: Bonus | undefined;
  today: Date;
  onSelect: (id: string) => void;
  /** Called after the menu's Remove, so the page can drop a `?item=` pointing here. */
  onUntrack?: (id: string) => void;
}

const MENU_ITEM_CLASS =
  "block w-full rounded-control px-3 py-2 text-left text-sm text-ink transition-colors duration-200 ease-out hover:bg-mint/60";

const toISO = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Which stage change the inline date form is confirming: `advance` walks to the next
 * stage (the "Next" button), `set` jumps straight to a chosen one ("Move to…"). */
interface PendingMove {
  stage: TrackStatus;
  mode: "advance" | "set";
}

/**
 * One compact card in a pipeline column (spec §4.3.3): who, how much, the single line of
 * context that matters at this stage, and the two actions the user reaches for — "Next"
 * (with an inline date confirm) and a kebab menu. Always an `<li>`; its column renders a
 * `<ul>` of these.
 */
export function PipelineCard({ item, bonus, today, onSelect, onUntrack }: PipelineCardProps) {
  const advance = useStore((state) => state.advance);
  const setStatus = useStore((state) => state.setStatus);
  const untrack = useStore((state) => state.untrack);

  const [menuOpen, setMenuOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [date, setDate] = useState(() => toISO(today));

  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // The menu's items change as the "Move to…" submenu opens and closes, so the keyboard
  // model reads them from the DOM rather than from a fixed ref array (as `PlanCard`
  // does) — same behaviour, one source of truth for a list that isn't static.
  function menuItems(): HTMLElement[] {
    return Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  }

  // Moves focus into the popover as soon as it opens, regardless of whether it was
  // opened by mouse or keyboard — standard menu-button behaviour.
  useEffect(() => {
    if (menuOpen) menuItems()[0]?.focus();
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setMoveOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
    setMoveOpen(false);
    triggerRef.current?.focus();
  }

  function focusItem(index: number) {
    const items = menuItems();
    if (items.length === 0) return;
    const wrapped = ((index % items.length) + items.length) % items.length;
    items[wrapped]?.focus();
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLUListElement>) {
    const currentIndex = menuItems().findIndex((el) => el === document.activeElement);
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        closeMenu();
        break;
      case "ArrowDown":
        event.preventDefault();
        focusItem(currentIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItem(currentIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        focusItem(0);
        break;
      case "End":
        event.preventDefault();
        focusItem(menuItems().length - 1);
        break;
      default:
        break;
    }
  }

  function startMove(move: PendingMove) {
    setDate(toISO(today));
    setPending(move);
    setMenuOpen(false);
    setMoveOpen(false);
  }

  function confirmMove() {
    if (!pending) return;
    if (pending.mode === "advance") advance(item.id, date);
    else setStatus(item.id, pending.stage, date);
    setPending(null);
  }

  const currentIndex = STATUS_ORDER.indexOf(item.status);
  const nextStatus: TrackStatus | undefined = STATUS_ORDER[currentIndex + 1];
  const context = stageContextLine(item, bonus, today);
  const progress = requirementsProgress(item, bonus);

  // Closing before the hold window is up can claw the bonus back or trigger a fee, so
  // the confirm form says so — and its button stops pretending this is routine.
  const opened = item.dates.opened;
  const safeCloseISO = bonus && opened ? earliestCloseDate(bonus, opened) : null;
  const closingEarly =
    pending?.stage === "closed" && safeCloseISO !== null && toISO(today) < safeCloseISO;

  // The card reads as one object, so the whole of it opens the drawer — except the
  // controls that already do something of their own (the menu, Next, and the date form
  // inside it). The title stays a real button, so this is never the only way in.
  function handleCardClick(event: ReactMouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button, a, input, [role=menu]")) return;
    onSelect(item.id);
  }

  return (
    <Card
      as="li"
      onClick={handleCardClick}
      className="relative flex cursor-pointer flex-col gap-2.5 p-4"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onSelect(item.id)}
          className="flex min-w-0 flex-1 items-start gap-2.5 rounded-control text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <BankAvatar name={bonus?.bank ?? item.bonusId} size={28} />
          <span className="min-w-0 flex-1">
            {/* `line-clamp` brings its own `display`, so no `block` beside it — the two fight
             * and `block` wins, which is how the clamp quietly stopped clamping. */}
            <span className="line-clamp-2 font-heading text-sm font-semibold text-ink">
              {bonus?.title ?? item.bonusId}
            </span>
            {bonus ? (
              <MoneyText value={bonus.bonus_max} size="md" />
            ) : (
              // The id is already the title; saying it twice explains nothing, and the
              // user still deserves to know why there is no money on this card.
              <span className="block text-xs text-muted">{t.tracker.ledger.missingOffer}</span>
            )}
          </span>
        </button>

        <div ref={menuRef} className="relative shrink-0">
          <button
            ref={triggerRef}
            type="button"
            aria-label={t.plan.moreActions}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => {
              setMenuOpen((open) => !open);
              setMoveOpen(false);
            }}
            className="rounded-control p-1.5 text-muted transition-colors duration-200 ease-out hover:bg-mint/60 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <MoreHorizontal size={18} aria-hidden="true" />
          </button>

          {menuOpen ? (
            <ul
              role="menu"
              onKeyDown={handleMenuKeyDown}
              className="absolute right-0 top-full z-20 mt-1 w-48 rounded-control bg-surface p-1 shadow-card"
            >
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    onSelect(item.id);
                  }}
                  className={MENU_ITEM_CLASS}
                >
                  {t.tracker.menu.details}
                </button>
              </li>

              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={moveOpen}
                  onClick={() => setMoveOpen((open) => !open)}
                  className={MENU_ITEM_CLASS}
                >
                  {t.tracker.menu.moveTo}
                </button>
                {moveOpen ? (
                  <ul role="menu" aria-label={t.tracker.menu.moveTo} className="pl-2">
                    {STATUS_ORDER.filter((stage) => stage !== item.status).map((stage) => (
                      <li key={stage} role="none">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => startMove({ stage, mode: "set" })}
                          className={MENU_ITEM_CLASS}
                        >
                          {t.tracker.statuses[stage]}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>

              {bonus ? (
                <li role="none">
                  <a
                    role="menuitem"
                    href={bonus.doc_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={closeMenu}
                    className={MENU_ITEM_CLASS}
                  >
                    {t.bonuses.openDoc}
                  </a>
                </li>
              ) : null}

              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setMoveOpen(false);
                    untrack(item.id);
                    onUntrack?.(item.id);
                  }}
                  className={cn(MENU_ITEM_CLASS, "text-coral-dark")}
                >
                  {t.tracker.untrack}
                </button>
              </li>
            </ul>
          ) : null}
        </div>
      </div>

      <p className={cn("text-xs", context.tone === "warn" ? "text-coral-dark" : "text-muted")}>
        {context.text}
      </p>

      {progress.total > 0 ? (
        <div>
          <Badge tone="neutral">
            {t.tracker.pipeline.requirements(progress.done, progress.total)}
          </Badge>
        </div>
      ) : null}

      {pending ? (
        <div className="flex flex-col gap-2 rounded-control bg-cream p-2.5">
          {closingEarly && safeCloseISO ? (
            <p className="text-xs text-coral-dark">
              {t.tracker.closeEarly(dateLabel(safeCloseISO))}
            </p>
          ) : null}
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            aria-label={t.tracker.dateFor(t.tracker.statuses[pending.stage])}
            className="w-full rounded-control border border-mint bg-surface px-2 py-1.5 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={confirmMove}>
              {closingEarly ? t.tracker.closeAnyway : t.common.save}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
              {t.common.cancel}
            </Button>
          </div>
        </div>
      ) : item.status !== "closed" && nextStatus ? (
        <div>
          <Button size="sm" onClick={() => startMove({ stage: nextStatus, mode: "advance" })}>
            {t.tracker.next}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
