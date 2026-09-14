import { BookOpenText, CalendarDays, Landmark, ListChecks, Settings } from "lucide-react";
import type { ComponentType } from "react";
import { NavLink } from "react-router-dom";

import type { Dataset } from "../../engine/types";
import { t } from "../../i18n/en";
import { Badge, dateLabel } from "../../ui";

export interface HeaderProps {
  dataset: Dataset | null;
}

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { to: "/plan", label: t.nav.plan, icon: CalendarDays },
  { to: "/tracker", label: t.nav.tracker, icon: ListChecks },
  { to: "/ledger", label: t.nav.ledger, icon: BookOpenText },
  { to: "/bonuses", label: t.nav.bonuses, icon: Landmark },
];

const tabItems: NavItem[] = [
  ...navItems,
  { to: "/settings", label: t.nav.settings, icon: Settings },
];

const navLinkClass = ({ isActive }: { isActive: boolean }): string =>
  isActive ? "text-primary font-semibold" : "text-muted hover:text-ink";

export function Header({ dataset }: HeaderProps) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-ink/5 bg-cream/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <NavLink
            to="/"
            className="flex items-center gap-2 font-heading text-lg font-bold text-ink"
          >
            <span aria-hidden="true">🐑</span>
            {t.brand}
          </NavLink>

          <nav className="hidden items-center gap-6 text-sm md:flex" aria-label={t.nav.primary}>
            {navItems.map(({ to, label }) => (
              <NavLink key={to} to={to} className={navLinkClass}>
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            {dataset?.generated_at ? (
              <Badge tone="mint">
                {t.updated(dateLabel(dataset.generated_at), dataset.bonuses.length)}
              </Badge>
            ) : null}
            <NavLink
              to="/settings"
              aria-label={t.nav.settings}
              className="text-muted hover:text-ink"
            >
              <Settings className="h-5 w-5" />
            </NavLink>
          </div>
        </div>
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-between border-t border-ink/5 bg-surface md:hidden"
        aria-label={t.nav.mobile}
      >
        {tabItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2 text-xs ${
                isActive ? "text-primary font-semibold" : "text-muted"
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
