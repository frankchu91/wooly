import { renderHook, waitFor } from "@testing-library/react";
import { useBonuses, resetBonusesCache } from "./useBonuses";
import { fixture } from "./fixture";

const dataset = { generated_at: "2026-09-13T00:00:00Z", source: "s", bonuses: fixture };

const okFetch = (calls: { count: number }) =>
  (async () => {
    calls.count += 1;
    return { ok: true, json: async () => dataset };
  }) as unknown as typeof fetch;

beforeEach(() => {
  resetBonusesCache();
});

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

test("a fresh mount with its own fetchImpl calls that fetch exactly once, even when another fetchImpl's entry is already cached", async () => {
  const otherCalls = { count: 0 };
  const other = okFetch(otherCalls);
  const first = renderHook(() => useBonuses(other));
  await waitFor(() => expect(first.result.current.data).not.toBeNull());
  expect(otherCalls.count).toBe(1);

  const calls = { count: 0 };
  const fetchImpl = okFetch(calls);
  const { result } = renderHook(() => useBonuses(fetchImpl));

  await waitFor(() => expect(result.current.data).not.toBeNull());

  expect(calls.count).toBe(1);
  // the other fetchImpl's cache entry was untouched by this mount
  expect(otherCalls.count).toBe(1);
});

test("the same fetchImpl is cached across two mounts (one fetch call total)", async () => {
  const calls = { count: 0 };
  const fetchImpl = okFetch(calls);

  const first = renderHook(() => useBonuses(fetchImpl));
  await waitFor(() => expect(first.result.current.data).not.toBeNull());

  const second = renderHook(() => useBonuses(fetchImpl));
  await waitFor(() => expect(second.result.current.data).not.toBeNull());

  expect(calls.count).toBe(1);
});
