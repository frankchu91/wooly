import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { cn } from "./cn";

export interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  as?: "button" | "link";
  to?: string;
  icon?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

// Exported so other components that render a button-styled element that isn't a real
// `<button>` (e.g. a `<label>` triggering a hidden file input) can match these classes
// instead of duplicating them.
export const buttonVariantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-primary text-white hover:bg-primary-dark",
  secondary: "bg-mint text-primary-dark hover:bg-mint/80",
  ghost: "text-primary hover:bg-mint/60",
  danger: "bg-coral-dark text-white hover:bg-coral-dark/90",
};

export const buttonSizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  // `sm` is for actions that sit inside a compact card (the tracker's pipeline cards),
  // where a full-size button would dominate the card it belongs to.
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-3 text-sm",
  lg: "px-6 py-3.5 text-base",
};

// The structural classes shared by every variant/size, also exported for the same
// reason as the maps above.
export const buttonBaseClasses =
  // `active:scale` is the press: the button gives a little under the pointer, the way a
  // physical one does, so a click reads as a click even before its effect shows up.
  "inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-[background-color,color,transform] duration-200 ease-out active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const variantClasses = buttonVariantClasses;
const sizeClasses = buttonSizeClasses;

export function Button({
  variant = "primary",
  size = "md",
  as,
  to,
  icon,
  disabled,
  onClick,
  children,
  className,
}: ButtonProps) {
  const classes = cn(
    buttonBaseClasses,
    "disabled:cursor-not-allowed disabled:opacity-50",
    variantClasses[variant],
    sizeClasses[size],
    className,
  );

  if (as === "link" || to !== undefined) {
    return (
      <Link to={to ?? "#"} className={classes} aria-disabled={disabled}>
        {icon}
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} disabled={disabled} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}
