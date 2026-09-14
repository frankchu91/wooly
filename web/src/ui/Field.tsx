import type { ReactNode } from "react";
import { cloneElement, isValidElement } from "react";

export interface FieldProps {
  label: string;
  help?: string;
  error?: string;
  htmlFor: string;
  children: ReactNode;
}

export function Field({ label, help, error, htmlFor, children }: FieldProps) {
  const helpId = help ? `${htmlFor}-help` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(" ") || undefined;

  const control =
    describedBy && isValidElement<Record<string, unknown>>(children)
      ? cloneElement(children, { "aria-describedby": describedBy })
      : children;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {control}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-coral-dark">
          {error}
        </p>
      ) : help ? (
        <p id={helpId} className="text-xs text-muted">
          {help}
        </p>
      ) : null}
    </div>
  );
}
