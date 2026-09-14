import clsx from "clsx";

export interface StepperProps {
  steps: string[];
  current: number;
  className?: string;
}

export function Stepper({ steps, current, className }: StepperProps) {
  return (
    <ol className={clsx("flex w-full items-start gap-2", className)}>
      {steps.map((step, index) => (
        <li key={step} className="flex flex-1 flex-col gap-1.5">
          <span
            aria-hidden="true"
            className={clsx(
              "h-1.5 w-full rounded-full",
              index <= current ? "bg-primary" : "bg-mint",
            )}
          />
          <span
            className={clsx("text-xs font-medium", index === current ? "text-ink" : "text-muted")}
            aria-current={index === current ? "step" : undefined}
          >
            {step}
          </span>
        </li>
      ))}
    </ol>
  );
}
