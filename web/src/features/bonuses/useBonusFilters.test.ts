import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { fixture } from "../../data/fixture";
import { compareByScore } from "../../engine";
import { defaultProfile } from "../../engine/types";
import { useBonusFilters } from "./useBonusFilters";

const maProfile = { ...defaultProfile("2026-09"), state: "MA" };

describe("useBonusFilters", () => {
  test("with no query or chips, returns every bonus sorted by bonus_max desc", () => {
    const { result } = renderHook(() => useBonusFilters(fixture, null));

    expect(result.current.count).toBe(fixture.length);
    const maxes = result.current.results.map((b) => b.bonus_max);
    expect(maxes).toEqual([...maxes].sort((a, b) => (b ?? -Infinity) - (a ?? -Infinity)));
  });

  test("search matches bank or title case-insensitively", () => {
    const { result } = renderHook(() => useBonusFilters(fixture, null));

    act(() => result.current.setQ("wells"));

    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0].id).toBe("wells-fargo-500");
  });

  test("noDD chip leaves only the bonus with dd.required === false", () => {
    const { result } = renderHook(() => useBonusFilters(fixture, null));

    act(() => result.current.toggleChip("noDD"));

    expect(result.current.results.map((b) => b.id)).toEqual(["fourfront-400"]);
  });

  test("softPull chip excludes hard-pull bonuses", () => {
    const { result } = renderHook(() => useBonusFilters(fixture, null));

    act(() => result.current.toggleChip("softPull"));

    expect(result.current.results.some((b) => b.id === "fourfront-400")).toBe(false);
  });

  test("chips combine with AND", () => {
    const { result } = renderHook(() => useBonusFilters(fixture, null));

    act(() => {
      result.current.toggleChip("nationwide");
      result.current.toggleChip("noFee");
    });

    for (const bonus of result.current.results) {
      expect(bonus.availability.nationwide).toBe(true);
      const feeAvoidable =
        bonus.monthly_fee === null ||
        bonus.monthly_fee.amount === 0 ||
        bonus.monthly_fee.avoidable === true;
      expect(feeAvoidable).toBe(true);
    }
  });

  test("section chips are mutually exclusive", () => {
    const { result } = renderHook(() => useBonusFilters(fixture, null));

    act(() => result.current.toggleChip("savings"));
    expect(Array.from(result.current.chips)).toEqual(["savings"]);

    act(() => result.current.toggleChip("business"));
    expect(Array.from(result.current.chips)).toEqual(["business"]);
  });

  test("the checking section chip also counts state/regional bonuses", () => {
    const { result } = renderHook(() => useBonusFilters(fixture, null));

    act(() => result.current.toggleChip("checking"));

    expect(result.current.results.some((b) => b.id === "eastern-750")).toBe(true);
    expect(result.current.results.some((b) => b.id === "fourfront-400")).toBe(true);
    expect(result.current.results.some((b) => b.id === "sofi-675")).toBe(false);
  });

  test("myState chip keeps bonuses available in the profile's state and excludes others", () => {
    const { result } = renderHook(() => useBonusFilters(fixture, maProfile));

    act(() => result.current.toggleChip("myState"));

    expect(result.current.results.some((b) => b.id === "eastern-750")).toBe(true);
    expect(result.current.results.some((b) => b.id === "fourfront-400")).toBe(false);
  });

  test("toggling a chip twice returns to the unfiltered result set", () => {
    const { result } = renderHook(() => useBonusFilters(fixture, null));

    act(() => result.current.toggleChip("noDD"));
    act(() => result.current.toggleChip("noDD"));

    expect(result.current.count).toBe(fixture.length);
    expect(result.current.chips.size).toBe(0);
  });

  test("sort by expiring orders by nearest expiration, nulls last", () => {
    const { result } = renderHook(() => useBonusFilters(fixture, null));

    act(() => result.current.setSort("expiring"));

    const ids = result.current.results.map((b) => b.id);
    expect(ids.indexOf("wells-fargo-500")).toBeLessThan(ids.indexOf("chase-400"));
    // Bonuses with no expiration (bmo-400, fourfront-400) sort after every dated one.
    expect(ids.indexOf("bmo-400")).toBeGreaterThan(ids.indexOf("chase-400"));
  });

  test("sort by score requires a profile and leaves results unsorted without one", () => {
    const { result } = renderHook(() => useBonusFilters(fixture, null));

    act(() => result.current.setSort("score"));

    // Falls through to the underlying (unsorted) bonus order rather than applying
    // `compareByScore`, since there's no profile to score against.
    expect(result.current.results.map((b) => b.id)).toEqual(fixture.map((b) => b.id));
  });

  test("sort by score orders by compareByScore when a profile exists", () => {
    const { result } = renderHook(() => useBonusFilters(fixture, maProfile));

    act(() => result.current.setSort("score"));

    const expected = [...fixture].sort(compareByScore).map((b) => b.id);
    expect(result.current.results.map((b) => b.id)).toEqual(expected);
  });
});
