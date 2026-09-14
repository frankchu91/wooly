import clsx from "clsx";
import type { ReactNode } from "react";

export interface CardProps {
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "li";
}

export function Card({ className, children, as = "div" }: CardProps) {
  const Tag = as;
  return (
    <Tag className={clsx("bg-surface rounded-card shadow-card p-5", className)}>{children}</Tag>
  );
}
