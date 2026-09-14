export interface SliderProps {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  className?: string;
}

export function Slider({ min, max, step, value, onChange, format, className }: SliderProps) {
  const display = format ? format(value) : String(value);

  return (
    <div className={className ? `flex items-center gap-3 ${className}` : "flex items-center gap-3"}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={display}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-primary h-2 w-full flex-1 cursor-pointer"
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label="Value"
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-20 rounded-control border border-muted/25 bg-surface px-2 py-1.5 text-sm tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      />
    </div>
  );
}
