import type { MouseEvent, ReactNode } from "react";

import { cn } from "./cn";

export interface CardProps {
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "li";
  /** Set `false` for a card whose child supplies its own padding (e.g. a full-bleed
   * button filling the card), so the two don't stack. */
  padded?: boolean;
  /** Surface colour. `ink` is the dark hero treatment (and brings its own text colour);
   * `mint` is the quiet notice treatment. */
  tone?: "surface" | "ink" | "mint";
  /** Makes the whole card a mouse target (the tracker's pipeline cards open their drawer
   * this way). Keyboard users still reach the real control inside it — a card is never
   * the only way in. */
  onClick?: (event: MouseEvent<HTMLElement>) => void;
}

const toneClasses: Record<NonNullable<CardProps["tone"]>, string> = {
  surface: "bg-surface",
  ink: "bg-ink text-cream",
  mint: "bg-mint",
};

export function Card({
  className,
  children,
  as = "div",
  padded = true,
  tone = "surface",
  onClick,
}: CardProps) {
  const Tag = as;
  return (
    <Tag
      onClick={onClick}
      className={cn("rounded-card shadow-card", toneClasses[tone], padded && "p-5", className)}
    >
      {children}
    </Tag>
  );
}
