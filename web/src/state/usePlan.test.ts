import { renderHook } from "@testing-library/react";
import { usePlan } from "./usePlan";
import { useStore } from "./store";
import { defaultProfile } from "../engine/types";
import { fixture } from "../data/fixture";

const initial = useStore.getState();

beforeEach(() => {
  useStore.setState(initial, true);
  localStorage.clear();
  vi.useFakeTimers().setSystemTime(new Date(2026, 8, 13));
});

afterEach(() => {
  vi.useRealTimers();
});

test("returns null when there is no profile", () => {
  const { result } = renderHook(() => usePlan(fixture));
  expect(result.current).toBeNull();
});

test("returns null when there are no bonuses", () => {
  useStore.getState().setProfile(defaultProfile("2026-09"));
  const { result } = renderHook(() => usePlan(undefined));
  expect(result.current).toBeNull();
});

test("returns a Plan derived from profile, bonuses, and skippedIds", () => {
  useStore.getState().setProfile(defaultProfile("2026-09"));
  const { result } = renderHook(() => usePlan(fixture));
  expect(result.current).not.toBeNull();
  expect(result.current?.months).toHaveLength(12);
});

test("skipping a bonus removes it from the plan's months and adds it to skipped", () => {
  useStore.getState().setProfile(defaultProfile("2026-09"));
  const { result, rerender } = renderHook(() => usePlan(fixture));
  const before = result.current;
  expect(before).not.toBeNull();

  useStore.getState().skip("wells-fargo-500");
  rerender();

  const after = result.current;
  expect(after).not.toBeNull();
  expect(after?.skipped.some((s) => s.bonus.id === "wells-fargo-500")).toBe(true);
  expect(after?.months.some((m) => m.items.some((i) => i.bonus.id === "wells-fargo-500"))).toBe(
    false,
  );
});
