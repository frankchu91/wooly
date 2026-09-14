import type { ReactNode } from "react";

export interface EmptyStateProps {
  emoji?: string;
  title: string;
  /** Optional — some empty states (a 404, say) say everything in the title. */
  body?: string;
  action?: ReactNode;
}

export function EmptyState({ emoji = "🐑", title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <span className="text-4xl" aria-hidden="true">
        {emoji}
      </span>
      <h3 className="font-heading text-lg font-semibold text-ink">{title}</h3>
      {body ? <p className="max-w-sm text-sm text-muted">{body}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
