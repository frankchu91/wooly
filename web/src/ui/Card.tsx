import type { CSSProperties, MouseEvent, ReactNode, Ref } from "react";

import { cn } from "./cn";

export interface CardProps {
  /** The rendered element, for callers that need to hand it to something else — the
   * tracker's pipeline cards give theirs to dnd-kit as the draggable node. */
  ref?: Ref<HTMLElement>;
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
  /** Inline styles a utility class can't express — dnd-kit's live drag transform. */
  style?: CSSProperties;
}

const toneClasses: Record<NonNullable<CardProps["tone"]>, string> = {
  surface: "bg-surface",
  ink: "bg-ink text-cream",
  mint: "bg-mint",
};

export function Card({
  ref,
  className,
  children,
  as = "div",
  padded = true,
  tone = "surface",
  onClick,
  style,
}: CardProps) {
  const Tag = as;
  return (
    <Tag
      ref={ref as Ref<never>}
      style={style}
      onClick={onClick}
      className={cn("rounded-card shadow-card", toneClasses[tone], padded && "p-5", className)}
    >
      {children}
    </Tag>
  );
}
