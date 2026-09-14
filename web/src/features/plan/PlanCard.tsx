import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { PlanItem } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { Badge, BankAvatar, Card, MoneyText, dateLabel, money } from "../../ui";
import { warningToText } from "./reasonText";

export interface PlanCardProps {
  item: PlanItem;
}

/** A single scheduled bonus within a `MonthColumn`. Always an `<li>` — the timeline's
 * smoke tests locate cards by walking `li` elements. */
export function PlanCard({ item }: PlanCardProps) {
  const { bonus, ddDeadline, safeCloseDate, warnings } = item;
  const skip = useStore((state) => state.skip);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const feeAvoidable =
    bonus.monthly_fee === null ||
    bonus.monthly_fee.amount === 0 ||
    bonus.monthly_fee.avoidable === true;

  function handleSkip() {
    skip(bonus.id);
    setMenuOpen(false);
  }

  return (
    <Card as="li" className="relative flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <BankAvatar name={bonus.bank} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 font-heading text-sm font-semibold text-ink">
            {bonus.title}
          </h3>
          <MoneyText value={bonus.bonus_max} size="md" />
        </div>
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            aria-label={t.plan.details}
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
              className="absolute right-0 top-full z-10 mt-1 w-40 rounded-control bg-surface p-1 shadow-card"
            >
              <li role="none">
                <a
                  role="menuitem"
                  href={bonus.doc_url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-control px-3 py-2 text-sm text-ink transition-colors duration-200 ease-out hover:bg-mint/60"
                >
                  {t.plan.details}
                </a>
              </li>
              <li role="none">
                <button
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
        {bonus.dd.required === false ? (
          <Badge tone="gold">{t.plan.badges.noDD}</Badge>
        ) : bonus.dd.amount != null ? (
          <Badge tone="neutral">{t.plan.badges.dd(money(bonus.dd.amount))}</Badge>
        ) : null}
        {feeAvoidable ? <Badge tone="mint">{t.plan.badges.noFee}</Badge> : null}
      </div>

      <div className="flex flex-col gap-0.5 text-xs text-muted">
        <p>
          {t.plan.ddBy} {dateLabel(ddDeadline)}
        </p>
        {safeCloseDate ? (
          <p>
            {t.plan.safeClose} {dateLabel(safeCloseDate)}
          </p>
        ) : null}
      </div>

      {warnings.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {warnings.map((warning) => (
            <li key={warning} className="text-xs text-coral">
              {warningToText(warning)}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
