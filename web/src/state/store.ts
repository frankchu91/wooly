import { format } from "date-fns";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultProfile, STATUS_ORDER } from "../engine/types";
import type { HistoryEntry, PlanItem, Profile, TrackedItem, TrackStatus } from "../engine/types";

// `TrackStatus`/`TrackedItem`/`STATUS_ORDER` are domain types owned by `engine/types.ts`
// (so the pure engine — `engine/conditions.ts` in particular — can use them without
// importing anything from the state layer); re-exported here so existing
// `import { … } from "../state/store"` call sites keep working unchanged.
export type { TrackedItem, TrackStatus };
export { STATUS_ORDER };

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

// v1 called this stage "dd_sent"; v2 renamed it "requirements_met" (it now covers every
// condition, not just direct deposit). Both a persisted item's `status` and its `dates`
// keys need this rename on the way in from an older blob.
const LEGACY_STATUS_MAP: Record<string, TrackStatus> = { dd_sent: "requirements_met" };

/** Resolves a persisted status-like string (a current `TrackStatus`, or a known legacy
 * name) to today's `TrackStatus` — or `null` when it's neither, so callers can drop the
 * value instead of guessing. */
const toKnownStatus = (value: unknown): TrackStatus | null => {
  if (typeof value !== "string") return null;
  if ((STATUS_ORDER as string[]).includes(value)) return value as TrackStatus;
  // `Object.hasOwn`, not `in`: a persisted blob can carry "constructor" or "toString" as
  // a `dates` key, and `in` would happily resolve those off the prototype chain.
  if (Object.hasOwn(LEGACY_STATUS_MAP, value)) return LEGACY_STATUS_MAP[value];
  return null;
};

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
  /** Moves a tracked item directly to `status`, recording `dateISO` under that stage —
   * unlike `advance`, this can move to any stage, not just the next one (e.g. the
   * tracker's "Move to…" menu, or the drawer's per-stage date inputs). */
  setStatus(id: string, status: TrackStatus, dateISO: string): void;
  /** Corrects the date recorded against one stage without moving the item there — the
   * drawer's per-stage date inputs use this for every stage the item has already passed
   * (the input for its *current* stage goes through `setStatus` instead, which is the
   * action that owns the stage pointer). */
  setDate(id: string, status: TrackStatus, dateISO: string): void;
  /** Ticks or unticks one condition (by id) on a tracked item's checklist. */
  toggleCondition(id: string, conditionId: string): void;
  /** Sets (or, passing `undefined`, clears) the amount the user says actually posted. */
  setBonusReceived(id: string, amount: number | undefined): void;
  setNotes(id: string, text: string): void;
  /** Sets who the account is for. Whitespace-only text clears the field rather than
   * storing a blank badge nobody can see but everything has to render. */
  setApplicant(id: string, text: string): void;
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
// `TrackStatus` (defaulting to "planned", mapping v1's "dd_sent" to
// "requirements_met"), `dates` is always an object with the same rename applied to its
// keys, and `conditionsDone` is always an array — an older, hand-edited, or v1 export
// may be missing any of these, or a v1 export's `dd_sent` never renamed.
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
      const status: TrackStatus = toKnownStatus(item.status) ?? "planned";
      const rawDates =
        typeof item.dates === "object" && item.dates !== null
          ? (item.dates as Record<string, unknown>)
          : {};
      const dates: Partial<Record<TrackStatus, string>> = {};
      for (const [key, value] of Object.entries(rawDates)) {
        if (typeof value !== "string") continue;
        const mappedKey = toKnownStatus(key);
        if (mappedKey) dates[mappedKey] = value;
      }
      const openMonth = typeof item.openMonth === "string" ? item.openMonth : "";
      const id = typeof item.id === "string" ? item.id : bonusId;
      const conditionsDone: string[] = Array.isArray(item.conditionsDone)
        ? item.conditionsDone.filter((c): c is string => typeof c === "string")
        : [];
      // Built conditionally, not `?? undefined`, so an item that never had a
      // `bonusReceived`/`notes` comes out with the key absent entirely — matching what
      // `setBonusReceived(id, undefined)` produces, so `"bonusReceived" in item` means
      // the same thing regardless of which path built the item.
      const result: TrackedItem = { id, bonusId, status, dates, openMonth, conditionsDone };
      if (typeof item.bonusReceived === "number" && Number.isFinite(item.bonusReceived)) {
        result.bonusReceived = item.bonusReceived;
      }
      if (typeof item.notes === "string") {
        result.notes = item.notes;
      }
      // Normalised on the way in, and dropped when it normalises to nothing, so a blob
      // written by hand (or by an older build) can't put a blank badge on every row.
      if (typeof item.applicant === "string" && item.applicant.trim() !== "") {
        result.applicant = item.applicant.trim();
      }
      return result;
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
              conditionsDone: [],
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

      setStatus: (id, status, dateISO) =>
        set((state) => ({
          tracker: state.tracker.map((item) => {
            if (item.id !== id) return item;
            const targetIndex = STATUS_ORDER.indexOf(status);
            const currentIndex = STATUS_ORDER.indexOf(item.status);

            // Moving forward just records the target date — every earlier date stays,
            // nothing is implied false by skipping ahead.
            if (targetIndex >= currentIndex) {
              return { ...item, status, dates: { ...item.dates, [status]: dateISO } };
            }

            // Moving to an earlier stage means every later stage no longer applies:
            // drop its date (dates for the target stage and everything before it are
            // kept), and drop `bonusReceived` too when the target is before `received`
            // — the bonus hasn't been received again just because the pointer moved
            // back past that stage.
            const dates: Partial<Record<TrackStatus, string>> = {};
            for (const [key, value] of Object.entries(item.dates)) {
              if (STATUS_ORDER.indexOf(key as TrackStatus) <= targetIndex) {
                dates[key as TrackStatus] = value;
              }
            }
            dates[status] = dateISO;

            const next: TrackedItem = { ...item, status, dates };
            if (targetIndex < STATUS_ORDER.indexOf("received")) {
              delete next.bonusReceived;
            }
            return next;
          }),
        })),

      setDate: (id, status, dateISO) =>
        set((state) => ({
          tracker: state.tracker.map((item) =>
            item.id === id ? { ...item, dates: { ...item.dates, [status]: dateISO } } : item,
          ),
        })),

      toggleCondition: (id, conditionId) =>
        set((state) => ({
          tracker: state.tracker.map((item) => {
            if (item.id !== id) return item;
            const done = item.conditionsDone.includes(conditionId);
            return {
              ...item,
              conditionsDone: done
                ? item.conditionsDone.filter((c) => c !== conditionId)
                : [...item.conditionsDone, conditionId],
            };
          }),
        })),

      setBonusReceived: (id, amount) =>
        set((state) => ({
          tracker: state.tracker.map((item) => {
            if (item.id !== id) return item;
            const next: TrackedItem = { ...item, bonusReceived: amount };
            if (amount === undefined) delete next.bonusReceived;
            return next;
          }),
        })),

      setNotes: (id, text) =>
        set((state) => ({
          tracker: state.tracker.map((item) => (item.id === id ? { ...item, notes: text } : item)),
        })),

      setApplicant: (id, text) =>
        set((state) => ({
          tracker: state.tracker.map((item) => {
            if (item.id !== id) return item;
            const trimmed = text.trim();
            const next: TrackedItem = { ...item, applicant: trimmed };
            if (trimmed === "") delete next.applicant;
            return next;
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
      version: 2,
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
