import type { KeyboardEvent } from "react";
import { useRef } from "react";

import { cn } from "./cn";

export interface SegmentedOption {
  value: string;
  label: string;
  disabled?: boolean;
  title?: string;
}

export interface SegmentedProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Names the group for screen readers. Pass one or the other — an unlabelled
   * radiogroup announces only "radio group" with no hint of what it switches. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

export function Segmented({
  options,
  value,
  onChange,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: SegmentedProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);

  function focusAndSelect(index: number) {
    const option = options[index];
    if (!option) return;
    if (!option.disabled) onChange(option.value);
    buttonRefs.current[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusAndSelect((index + 1) % options.length);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusAndSelect((index - 1 + options.length) % options.length);
        break;
      case "Home":
        event.preventDefault();
        focusAndSelect(0);
        break;
      case "End":
        event.preventDefault();
        focusAndSelect(options.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={cn("inline-flex gap-1 rounded-control bg-mint/40 p-1", className)}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        // Roving tab stop: only the selected option (or the first, if
        // nothing matches `value` yet) is in the Tab order.
        const isTabStop = active || (selectedIndex === -1 && index === 0);
        return (
          <button
            key={option.value}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-disabled={option.disabled || undefined}
            title={option.title}
            tabIndex={isTabStop ? 0 : -1}
            onClick={() => {
              if (!option.disabled) onChange(option.value);
            }}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "rounded-control px-3 py-1.5 text-sm font-medium transition-colors duration-200 ease-out",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              active ? "bg-surface text-primary shadow-card" : "text-muted hover:text-ink",
              option.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
