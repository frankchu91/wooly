import type { ReactNode } from "react";

export interface FieldProps {
  label: string;
  help?: string;
  error?: string;
  htmlFor: string;
  children: ReactNode;
}

export function Field({ label, help, error, htmlFor, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-coral">
          {error}
        </p>
      ) : help ? (
        <p className="text-xs text-muted">{help}</p>
      ) : null}
    </div>
  );
}
