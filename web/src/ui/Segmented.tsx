import clsx from "clsx";

export interface SegmentedOption {
  value: string;
  label: string;
}

export interface SegmentedProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function Segmented({ options, value, onChange, className }: SegmentedProps) {
  return (
    <div
      role="radiogroup"
      className={clsx("inline-flex gap-1 rounded-control bg-mint/40 p-1", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={clsx(
              "rounded-control px-3 py-1.5 text-sm font-medium transition-colors duration-200 ease-out",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
              active ? "bg-surface text-primary shadow-card" : "text-muted hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
