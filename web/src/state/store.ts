import { format } from "date-fns";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultProfile } from "../engine/types";
import type { HistoryEntry, PlanItem, Profile } from "../engine/types";

/** The current calendar month as `YYYY-MM`.
 *
 * Declared before the store, not after it: `persist`'s `merge` runs while the store is
 * being created, and it reaches this through `normalizeProfile`. A `const` arrow
 * function down at the bottom of the file would still be in its temporal dead zone at
 * that moment, and the resulting throw is swallowed by persist's hydration — leaving a
 * returning user's profile silently unloaded. */
export function currentMonth(): string {
  return format(new Date(), "yyyy-MM");
}

export type TrackStatus = "planned" | "opened" | "dd_sent" | "received" | "closed";

export interface TrackedItem {
  id: string;
  bonusId: string;
  status: TrackStatus;
  dates: Partial<Record<TrackStatus, string>>;
  openMonth: string;
}

// The order `advance` walks through; `closed` has no successor, so advancing there is a
// no-op. Exported so the tracker UI orders its groups the same way instead of keeping a
// second copy of the list.
export const STATUS_ORDER: TrackStatus[] = ["planned", "opened", "dd_sent", "received", "closed"];

// The shape actually written to localStorage (see `partialize` below) — the plan itself
// is derived from these plus the loaded bonus dataset, and is never persisted.
interface PersistedSlice {
  profile: Profile | null;
  skippedIds: string[];
  tracker: TrackedItem[];
}

interface State extends PersistedSlice {
  setProfile(p: Profile): void;
  updateProfile(patch: Partial<Profile>): void;
  skip(id: string): void;
  restore(id: string): void;
  trackPlan(items: PlanItem[]): void;
  advance(id: string, date: string): void;
  untrack(id: string): void;
  clearAll(): void;
  exportJSON(): string;
  importJSON(json: string): void;
}

const isPersistedSlice = (value: unknown): value is PersistedSlice => {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;

  const profileOk =
    v.profile === null ||
    (typeof v.profile === "object" &&
      v.profile !== null &&
      typeof (v.profile as Record<string, unknown>).state === "string" &&
      typeof (v.profile as Record<string, unknown>).monthlyDD === "number");

  const skippedIdsOk =
    Array.isArray(v.skippedIds) && v.skippedIds.every((id) => typeof id === "string");

  const trackerOk =
    Array.isArray(v.tracker) &&
    v.tracker.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).bonusId === "string",
    );

  return profileOk && skippedIdsOk && trackerOk;
};

// `imported`'s numeric fields may be missing, non-numeric, or non-finite (e.g. from a
// hand-edited or older export) — fall back to `fallback` whenever coercion doesn't
// yield a finite number.
const toFiniteNumber = (value: unknown, fallback: number): number => {
  if (value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

// An imported *or rehydrated* profile can be missing any `Profile` field, or carry the
// wrong type in it (an older export, a hand-edited file, a half-written localStorage
// blob). Every field is rebuilt here — strings validated as strings, numbers coerced to
// finite numbers — so the result always satisfies the full `Profile` shape `buildPlan`
// expects, rather than exploding somewhere deep in the engine.
const normalizeProfile = (imported: unknown): Profile | null => {
  if (typeof imported !== "object" || imported === null) return null;
  const defaults = defaultProfile(currentMonth());
  const raw = imported as Record<string, unknown>;

  const history: HistoryEntry[] = Array.isArray(raw.history)
    ? raw.history.filter(
        (h): h is HistoryEntry =>
          typeof h === "object" &&
          h !== null &&
          typeof (h as Record<string, unknown>).bank === "string",
      )
    : [];
  const prefsInput =
    typeof raw.prefs === "object" && raw.prefs !== null
      ? (raw.prefs as Record<string, unknown>)
      : {};

  return {
    state: typeof raw.state === "string" ? raw.state : defaults.state,
    startMonth: typeof raw.startMonth === "string" ? raw.startMonth : defaults.startMonth,
    monthlyDD: toFiniteNumber(raw.monthlyDD, defaults.monthlyDD),
    maxSplits: toFiniteNumber(raw.maxSplits, defaults.maxSplits),
    horizonMonths: toFiniteNumber(raw.horizonMonths, defaults.horizonMonths),
    achPushCountsAsDD:
      typeof raw.achPushCountsAsDD === "boolean"
        ? raw.achPushCountsAsDD
        : defaults.achPushCountsAsDD,
    history,
    prefs: { ...defaults.prefs, ...prefsInput },
  };
};

// Filters/repairs each imported tracked item so `status` is always a known
// `TrackStatus` (defaulting to "planned") and `dates` is always an object (defaulting
// to `{}`) — an older or hand-edited export may be missing either.
const normalizeTracker = (imported: unknown[]): TrackedItem[] =>
  imported
    .filter(
      (raw): raw is Record<string, unknown> =>
        typeof raw === "object" &&
        raw !== null &&
        typeof (raw as Record<string, unknown>).bonusId === "string",
    )
    .map((item) => {
      const bonusId = item.bonusId as string;
      const status: TrackStatus = STATUS_ORDER.includes(item.status as TrackStatus)
        ? (item.status as TrackStatus)
        : "planned";
      const dates: Partial<Record<TrackStatus, string>> =
        typeof item.dates === "object" && item.dates !== null
          ? (item.dates as Partial<Record<TrackStatus, string>>)
          : {};
      const openMonth = typeof item.openMonth === "string" ? item.openMonth : "";
      const id = typeof item.id === "string" ? item.id : bonusId;
      return { id, bonusId, status, dates, openMonth };
    });

/**
 * Repairs whatever came back out of localStorage into a valid `PersistedSlice`.
 *
 * Used both as persist's `merge` (so a corrupt or partial blob hydrates into a usable
 * state instead of crashing the first render that touches it) and as its `migrate` (so
 * a blob written by an older `version` is upgraded rather than silently dropped, taking
 * the user's profile and tracker with it).
 */
const normalizePersisted = (persisted: unknown): PersistedSlice => {
  const raw = (typeof persisted === "object" && persisted !== null ? persisted : {}) as Record<
    string,
    unknown
  >;
  return {
    profile: normalizeProfile(raw.profile),
    skippedIds: Array.isArray(raw.skippedIds)
      ? raw.skippedIds.filter((id): id is string => typeof id === "string")
      : [],
    tracker: Array.isArray(raw.tracker) ? normalizeTracker(raw.tracker) : [],
  };
};

/** The single localStorage key everything the user owns is written to. */
export const STORAGE_KEY = "woolly.v1";

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      profile: null,
      skippedIds: [],
      tracker: [],

      setProfile: (p) => set({ profile: p }),

      updateProfile: (patch) =>
        set((state) => ({
          profile: state.profile ? { ...state.profile, ...patch } : state.profile,
        })),

      skip: (id) =>
        set((state) => ({
          skippedIds: state.skippedIds.includes(id) ? state.skippedIds : [...state.skippedIds, id],
        })),

      restore: (id) => set((state) => ({ skippedIds: state.skippedIds.filter((i) => i !== id) })),

      trackPlan: (items) =>
        set((state) => {
          const tracked = new Set(state.tracker.map((t) => t.bonusId));
          const additions: TrackedItem[] = items
            .filter((item) => !tracked.has(item.bonus.id))
            .map((item) => ({
              id: item.bonus.id,
              bonusId: item.bonus.id,
              status: "planned",
              dates: {},
              openMonth: item.openMonth,
            }));
          return additions.length === 0 ? state : { tracker: [...state.tracker, ...additions] };
        }),

      advance: (id, date) =>
        set((state) => ({
          tracker: state.tracker.map((item) => {
            if (item.id !== id) return item;
            const nextIndex = STATUS_ORDER.indexOf(item.status) + 1;
            if (nextIndex >= STATUS_ORDER.length) return item;
            const nextStatus = STATUS_ORDER[nextIndex];
            return { ...item, status: nextStatus, dates: { ...item.dates, [nextStatus]: date } };
          }),
        })),

      untrack: (id) => set((state) => ({ tracker: state.tracker.filter((t) => t.id !== id) })),

      clearAll: () => set({ profile: null, skippedIds: [], tracker: [] }),

      exportJSON: () => {
        const { profile, skippedIds, tracker } = get();
        return JSON.stringify({ profile, skippedIds, tracker }, null, 2);
      },

      importJSON: (json) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(json);
        } catch {
          throw new Error("bad import");
        }
        if (!isPersistedSlice(parsed)) throw new Error("bad import");
        set({
          profile: normalizeProfile(parsed.profile),
          skippedIds: parsed.skippedIds,
          tracker: normalizeTracker(parsed.tracker),
        });
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (state) => ({
        profile: state.profile,
        skippedIds: state.skippedIds,
        tracker: state.tracker,
      }),
      // A blob written by an older version is repaired and kept, not discarded.
      migrate: (persisted) => normalizePersisted(persisted),
      merge: (persisted, current) => ({ ...current, ...normalizePersisted(persisted) }),
    },
  ),
);
