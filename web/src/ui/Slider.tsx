import { useState } from "react";

import { cn } from "./cn";

export interface SliderProps {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  label?: string;
  /** A short unit shown inside the numeric field, before the number (e.g. "$"). Purely
   * visual — it's `aria-hidden`, since the field's own label already carries the unit. */
  prefix?: string;
  className?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function Slider({
  min,
  max,
  step,
  value,
  onChange,
  format,
  label,
  prefix,
  className,
}: SliderProps) {
  const accessibleLabel = label ?? "Value";
  const valueText = format ? format(value) : String(value);

  const [text, setText] = useState(String(value));
  const [syncedValue, setSyncedValue] = useState(value);

  // Keep the numeric field's draft text aligned with `value` when it changes
  // from outside (e.g. the range input, or a parent resetting the field)
  // without clobbering an in-progress edit on every render. This mirrors
  // React's "adjust state during render" pattern rather than a
  // setState-in-effect.
  if (value !== syncedValue) {
    setSyncedValue(value);
    setText(String(value));
  }

  function commit(raw: string) {
    const parsed = Number(raw);
    if (raw.trim() === "" || Number.isNaN(parsed)) {
      // Ignore invalid/empty drafts: fall back to the last committed value.
      setText(String(value));
      return;
    }
    const clamped = clamp(parsed, min, max);
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={accessibleLabel}
        aria-valuetext={valueText}
        onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
        className="accent-primary h-2 w-full flex-1 cursor-pointer"
      />
      <span className="relative inline-flex items-center">
        {prefix ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-2 text-sm text-muted"
          >
            {prefix}
          </span>
        ) : null}
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={text}
          aria-label={accessibleLabel}
          onChange={(event) => setText(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(event.currentTarget.value);
            }
          }}
          className={cn(
            "w-24 rounded-control border border-muted/25 bg-surface px-2 py-1.5 text-sm tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            prefix && "pl-5",
          )}
        />
      </span>
    </div>
  );
}
