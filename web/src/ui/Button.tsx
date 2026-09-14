import clsx from "clsx";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "lg";
  as?: "button" | "link";
  to?: string;
  icon?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-primary text-white hover:bg-primary-dark",
  secondary: "bg-mint text-primary hover:bg-mint/80",
  ghost: "text-primary hover:bg-mint/60",
  danger: "bg-coral text-white hover:bg-coral/90",
};

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  md: "px-5 py-3 text-sm",
  lg: "px-6 py-3.5 text-base",
};

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
  const classes = clsx(
    "inline-flex items-center justify-center gap-2 rounded-control font-semibold",
    "transition-colors duration-200 ease-out",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
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
