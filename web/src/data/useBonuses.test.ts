import { renderHook, waitFor } from "@testing-library/react";
import { useBonuses } from "./useBonuses";
import { fixture } from "./fixture";

const dataset = { generated_at: "2026-09-13T00:00:00Z", source: "s", bonuses: fixture };

const okFetch = (calls: { count: number }) =>
  (async () => {
    calls.count += 1;
    return { ok: true, json: async () => dataset };
  }) as unknown as typeof fetch;

test("loads data via the injected fetch", async () => {
  const calls = { count: 0 };
  const { result } = renderHook(() => useBonuses(okFetch(calls)));

  await waitFor(() => expect(result.current.data).not.toBeNull());

  expect(result.current.data?.bonuses).toHaveLength(8);
  expect(result.current.error).toBeNull();
});

test("retry clears the cache and refetches", async () => {
  const calls = { count: 0 };
  const fetchImpl = okFetch(calls);
  const { result } = renderHook(() => useBonuses(fetchImpl));

  await waitFor(() => expect(result.current.data).not.toBeNull());
  const callsAfterFirstLoad = calls.count;

  result.current.retry();

  await waitFor(() => expect(calls.count).toBeGreaterThan(callsAfterFirstLoad));
});
