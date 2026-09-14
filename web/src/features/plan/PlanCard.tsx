import { ExternalLink, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link } from "react-router-dom";

import { ASSUMED_DD_AMOUNT } from "../../engine";
import type { PlanItem, Warning } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { Badge, BankAvatar, Card, MoneyText, dateLabel, money } from "../../ui";
import { warningToText } from "./reasonText";

export interface PlanCardProps {
  item: PlanItem;
}

// `not_enriched` is handled separately, as an "Unverified" badge linking to the source
// post — it applies to most of the dataset, so as a line of red text it would drown out
// the warnings that are specific to this offer.
const INLINE_WARNINGS: Warning[] = ["dd_unknown", "expires_soon", "has_etf"];

/** A single scheduled bonus within a `MonthColumn`. Always an `<li>` — the timeline's
 * smoke tests locate cards by walking `li` elements. */
export function PlanCard({ item }: PlanCardProps) {
  const { bonus, ddDeadline, safeCloseDate, warnings } = item;
  const skip = useStore((state) => state.skip);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);

  // Moves focus into the popover as soon as it opens, regardless of whether it was
  // opened by mouse or keyboard — standard menu-button behaviour.
  useEffect(() => {
    if (menuOpen) itemRefs.current[0]?.focus();
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
    triggerRef.current?.focus();
  }

  function focusItem(index: number) {
    const count = itemRefs.current.length;
    const wrapped = ((index % count) + count) % count;
    itemRefs.current[wrapped]?.focus();
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLUListElement>) {
    const currentIndex = itemRefs.current.findIndex((el) => el === document.activeElement);
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
        focusItem(itemRefs.current.length - 1);
        break;
      default:
        break;
    }
  }

  const feeAvoidable =
    bonus.monthly_fee === null ||
    bonus.monthly_fee.amount === 0 ||
    bonus.monthly_fee.avoidable === true;

  function handleSkip() {
    skip(bonus.id);
    closeMenu();
  }

  const needsDD = bonus.dd.required !== false;
  const inlineWarnings = warnings.filter((warning) => INLINE_WARNINGS.includes(warning));

  return (
    <Card as="li" className="relative flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <BankAvatar name={bonus.bank} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 font-heading text-sm font-semibold text-ink">
            {bonus.title}
          </h3>
          <MoneyText value={bonus.bonus_max} range={[bonus.bonus_min, bonus.bonus_max]} size="md" />
        </div>
        <div ref={menuRef} className="relative shrink-0">
          <button
            ref={triggerRef}
            type="button"
            aria-label={t.plan.moreActions}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="rounded-control p-1.5 text-muted transition-colors duration-200 ease-out hover:bg-mint/60 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <MoreHorizontal size={18} aria-hidden="true" />
          </button>
          {menuOpen ? (
            <ul
              role="menu"
              onKeyDown={handleMenuKeyDown}
              className="absolute right-0 top-full z-10 mt-1 w-40 rounded-control bg-surface p-1 shadow-card"
            >
              <li role="none">
                <Link
                  ref={(el) => {
                    itemRefs.current[0] = el;
                  }}
                  role="menuitem"
                  to={`/bonuses?bonus=${bonus.id}`}
                  onClick={closeMenu}
                  className="block rounded-control px-3 py-2 text-sm text-ink transition-colors duration-200 ease-out hover:bg-mint/60"
                >
                  {t.plan.details}
                </Link>
              </li>
              <li role="none">
                <button
                  ref={(el) => {
                    itemRefs.current[1] = el;
                  }}
                  type="button"
                  role="menuitem"
                  onClick={handleSkip}
                  className="block w-full rounded-control px-3 py-2 text-left text-sm text-ink transition-colors duration-200 ease-out hover:bg-mint/60"
                >
                  {t.plan.skip}
                </button>
              </li>
            </ul>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {bonus.pull === "soft" ? <Badge tone="mint">{t.plan.badges.softPull}</Badge> : null}
        {bonus.pull === "hard" ? <Badge tone="coral">{t.plan.badges.hardPull}</Badge> : null}
        {!needsDD ? (
          <Badge tone="gold">{t.plan.badges.noDD}</Badge>
        ) : bonus.dd.amount != null ? (
          <Badge tone="neutral">{t.plan.badges.dd(money(bonus.dd.amount))}</Badge>
        ) : (
          // The scheduler budgeted the assumed amount, so the badge says so rather than
          // going silent; the `dd_unknown` line below spells out that it's a guess.
          <Badge tone="neutral">{t.plan.badges.ddAssumed(money(ASSUMED_DD_AMOUNT))}</Badge>
        )}
        {feeAvoidable ? <Badge tone="mint">{t.plan.badges.noFee}</Badge> : null}
        {!bonus.enriched ? (
          <Badge tone="neutral">
            <a
              href={bonus.doc_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              {t.plan.badges.unverified}
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-col gap-0.5 text-xs text-muted">
        {/* A no-DD bonus has no direct-deposit deadline to miss, so showing one would be
         * a deadline the user invents for themselves. */}
        {needsDD ? (
          <p>
            {t.plan.ddBy} {dateLabel(ddDeadline)}
          </p>
        ) : null}
        {safeCloseDate ? (
          <p>
            {t.plan.safeClose} {dateLabel(safeCloseDate)}
          </p>
        ) : null}
      </div>

      {inlineWarnings.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {inlineWarnings.map((warning) => (
            <li key={warning} className="text-xs text-coral-dark">
              {warningToText(warning)}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
