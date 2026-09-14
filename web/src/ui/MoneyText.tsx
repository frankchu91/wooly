import { cn } from "./cn";
import { money } from "./format";

export interface MoneyTextProps {
  value: number | null;
  /** A `[min, max]` pair for a tiered offer. When the two differ the component renders
   * `$1,500–$7,000` instead of `value`, so an "up to" headline never reads as a promise.
   * When they match (or either is missing) `value` is rendered as usual. */
  range?: [number | null, number | null];
  size?: "sm" | "md" | "xl";
  className?: string;
}

const sizeClasses: Record<NonNullable<MoneyTextProps["size"]>, string> = {
  sm: "text-sm",
  md: "text-base font-medium",
  xl: "text-2xl font-heading font-bold",
};

/** Formats `range` as `$1,500–$7,000`, or `null` when there's no genuine range to show. */
export function rangeText(range: [number | null, number | null] | undefined): string | null {
  if (!range) return null;
  const [min, max] = range;
  if (min == null || max == null || min === max) return null;
  return `${money(min)}–${money(max)}`;
}

export function MoneyText({ value, range, size = "md", className }: MoneyTextProps) {
  const text = rangeText(range) ?? money(value);

  if (size === "xl") {
    return (
      <span
        className={cn(
          "inline-flex items-baseline rounded-control bg-ink px-3 py-1 text-gold tabular-nums",
          sizeClasses.xl,
          className,
        )}
      >
        {text}
      </span>
    );
  }

  return <span className={cn("tabular-nums", sizeClasses[size], className)}>{text}</span>;
}
