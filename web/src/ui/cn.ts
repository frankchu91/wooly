import clsx from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Conditional class names, with later Tailwind utilities winning over earlier ones in
 * the same group.
 *
 * `clsx` alone only concatenates, so a component's own `bg-surface` and a caller's
 * `bg-ink` both end up in `class` and the winner is decided by the order Tailwind
 * happens to emit them in the stylesheet — not by the order they were passed. `twMerge`
 * resolves the conflict in favour of the last one, which is what every caller expects.
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(...inputs));
