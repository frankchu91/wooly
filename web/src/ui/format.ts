import { format, parseISO } from "date-fns";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Formats a whole-dollar amount, e.g. `1500 -> "$1,500"`. `null` renders as an em dash. */
export function money(value: number | null): string {
  if (value === null) return "—";
  return currencyFormatter.format(value);
}

/** Formats a `YYYY-MM` month key as a short label, e.g. `"2026-09" -> "Sep 2026"`. */
export function monthLabel(month: string): string {
  return format(parseISO(`${month}-01`), "MMM yyyy");
}

/** Formats a `YYYY-MM-DD` date as a short label, e.g. `"2026-10-06" -> "Oct 6, 2026"`. */
export function dateLabel(date: string): string {
  return format(parseISO(date), "MMM d, yyyy");
}
