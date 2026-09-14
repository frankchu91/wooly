import { cn } from "./cn";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
}

/** A switch with its label as part of the same hit target — wrapping both in a `<label>`
 * means a tap on the words toggles it, which is what people try first on a phone. The
 * visible text stays `aria-hidden` so the switch announces its `aria-label` once, not
 * twice. */
export function Toggle({ checked, onChange, label, className }: ToggleProps) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ease-out",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          checked ? "bg-primary" : "bg-muted/30",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-card transition-transform duration-200 ease-out",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
      <span className="text-sm text-ink" aria-hidden="true">
        {label}
      </span>
    </label>
  );
}
