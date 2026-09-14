import clsx from "clsx";
import type { ReactNode } from "react";

export interface BadgeProps {
  tone?: "neutral" | "mint" | "coral" | "gold";
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const toneClasses: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral: "bg-cream text-muted",
  mint: "bg-mint text-primary-dark",
  coral: "bg-coral/15 text-coral",
  gold: "bg-gold/25 text-ink",
};

export function Badge({ tone = "neutral", icon, children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
