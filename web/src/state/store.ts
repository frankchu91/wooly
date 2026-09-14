import { format } from "date-fns";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PlanItem, Profile } from "../engine/types";

export type TrackStatus = "planned" | "opened" | "dd_sent" | "received" | "closed";

export interface TrackedItem {
  id: string;
  bonusId: string;
  status: TrackStatus;
  dates: Partial<Record<TrackStatus, string>>;
  openMonth: string;
}

// The order `advance` walks through; `closed` has no successor, so advancing there is a
// no-op.
const STATUS_ORDER: TrackStatus[] = ["planned", "opened", "dd_sent", "received", "closed"];

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
        set({ profile: parsed.profile, skippedIds: parsed.skippedIds, tracker: parsed.tracker });
      },
    }),
    {
      name: "woolly.v1",
      version: 1,
      partialize: (state) => ({
        profile: state.profile,
        skippedIds: state.skippedIds,
        tracker: state.tracker,
      }),
    },
  ),
);

export const currentMonth = (): string => format(new Date(), "yyyy-MM");
