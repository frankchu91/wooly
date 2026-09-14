import { useEffect, useState } from "react";
import type { Dataset } from "../engine/types";
import { loadBonuses } from "./loadBonuses";

let cached: Promise<Dataset> | null = null;

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
    if (!cached) cached = loadBonuses(fetchImpl);
    cached.then(
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const retry = () => {
    cached = null;
    setAttempt((n) => n + 1);
  };

  return { data, error, retry };
}
