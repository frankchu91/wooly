import clsx from "clsx";

import { money } from "./format";

export interface MoneyTextProps {
  value: number | null;
  size?: "sm" | "md" | "xl";
  className?: string;
}

const sizeClasses: Record<NonNullable<MoneyTextProps["size"]>, string> = {
  sm: "text-sm",
  md: "text-base font-medium",
  xl: "text-2xl font-heading font-bold",
};

export function MoneyText({ value, size = "md", className }: MoneyTextProps) {
  const text = money(value);

  if (size === "xl") {
    return (
      <span
        className={clsx(
          "inline-flex items-baseline rounded-control bg-ink px-3 py-1 text-gold tabular-nums",
          sizeClasses.xl,
          className,
        )}
      >
        {text}
      </span>
    );
  }

  return <span className={clsx("tabular-nums", sizeClasses[size], className)}>{text}</span>;
}
