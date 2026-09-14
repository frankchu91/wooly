import { useEffect, useState } from "react";
import type { Dataset } from "../engine/types";
import { loadBonuses } from "./loadBonuses";

const cache = new Map<typeof fetch, Promise<Dataset>>();

/** Test helper: clears every cached dataset promise, regardless of which fetchImpl created it. */
export function resetBonusesCache(): void {
  cache.clear();
}

export function useBonuses(fetchImpl: typeof fetch = fetch): {
  data: Dataset | null;
  error: string | null;
  retry: () => void;
} {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let promise = cache.get(fetchImpl);
    if (!promise) {
      promise = loadBonuses(fetchImpl);
      cache.set(fetchImpl, promise);
    }
    promise.then(
      (ds) => {
        if (!cancelled) {
          setData(ds);
          setError(null);
        }
      },
      (err: unknown) => {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : "bad dataset");
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // fetchImpl is intentionally excluded: it's captured per `attempt`, not re-run on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const retry = () => {
    cache.delete(fetchImpl);
    setAttempt((n) => n + 1);
  };

  return { data, error, retry };
}
