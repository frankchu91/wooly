import { Minus, Plus } from "lucide-react";
import { useId, useState } from "react";

import { STATUS_ORDER } from "../../engine/types";
import type { Bonus, TrackedItem, TrackStatus } from "../../engine/types";
import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { Button, Drawer, Field, MoneyText, dateLabel, monthLabel } from "../../ui";
import { ConditionList } from "../conditions/ConditionList";
import { depositsNeeded, splitConditions } from "../conditions/visibleConditions";
import { safeCloseFor } from "./trackerModel";

export interface ItemDrawerProps {
  item: TrackedItem | null;
  bonus: Bonus | undefined;
  open: boolean;
  onClose: () => void;
  today: Date;
}

const INPUT_CLASS =
  "w-full rounded-control border border-mint bg-surface px-3 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const toISO = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const SECTION_HEADING_CLASS = "font-heading text-sm font-semibold text-ink";

interface DraftFieldProps {
  id: string;
  initial: string;
  onCommit: (value: string) => void;
}

/**
 * A text control whose draft lives locally and is written to the store on blur — a
 * write per keystroke would re-render the whole page under the drawer.
 *
 * Both of these are mounted with a `key` derived from the item (and, for the amount,
 * from the stored value), so switching items — or the store clearing the amount when the
 * item moves back past `received` — reseeds the draft by remounting, rather than by an
 * effect racing the user's typing.
 */
function AmountField({
  id,
  initial,
  onCommit,
  placeholder,
}: DraftFieldProps & { placeholder: string }) {
  const [value, setValue] = useState(initial);
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(value)}
      className={INPUT_CLASS}
    />
  );
}

function ApplicantField({ id, initial, onCommit }: DraftFieldProps) {
  const [value, setValue] = useState(initial);
  return (
    <input
      id={id}
      type="text"
      value={value}
      placeholder={t.tracker.applicantHint}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(value)}
      className={INPUT_CLASS}
    />
  );
}

function NotesField({ id, initial, onCommit }: DraftFieldProps) {
  const [value, setValue] = useState(initial);
  return (
    <textarea
      id={id}
      rows={3}
      value={value}
      placeholder={t.tracker.notesPlaceholder}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(value)}
      className={INPUT_CLASS}
    />
  );
}

/**
 * Everything the user can record about one tracked offer (spec §4.3.4): the conditions
 * checklist, the date of each stage they've reached, what actually posted, when it's
 * safe to close, and free-text notes. Opened from a ledger row or a pipeline card, and
 * selected by the page's `?item=<id>` URL param so a single item is linkable.
 *
 * Text inputs autosave on blur rather than on every keystroke — a store write per
 * character would re-render the whole page under the drawer.
 */
export function ItemDrawer({ item, bonus, open, onClose, today }: ItemDrawerProps) {
  const setStatus = useStore((state) => state.setStatus);
  const setDate = useStore((state) => state.setDate);
  const toggleCondition = useStore((state) => state.toggleCondition);
  const setDepositsSent = useStore((state) => state.setDepositsSent);
  const setBonusReceived = useStore((state) => state.setBonusReceived);
  const setNotes = useStore((state) => state.setNotes);
  const setApplicant = useStore((state) => state.setApplicant);
  const untrack = useStore((state) => state.untrack);

  const baseId = useId();

  if (!item) {
    return (
      <Drawer open={false} onClose={onClose} title="">
        {null}
      </Drawer>
    );
  }

  const title = bonus?.title ?? item.bonusId;
  // A tracked item whose bonus has left the dataset keeps its dates, notes and Remove —
  // there is simply nothing to tick off.
  const { checklist, notes } = bonus ? splitConditions(bonus) : { checklist: [], notes: [] };
  const done = new Set(item.conditionsDone);
  const allConditionsDone =
    checklist.length > 0 && checklist.every((condition) => done.has(condition.id));
  const needed = bonus ? depositsNeeded(bonus) : 0;
  const sent = item.depositsSent ?? 0;
  const currentIndex = STATUS_ORDER.indexOf(item.status);
  const reachedStages = STATUS_ORDER.slice(0, currentIndex + 1);
  const showAmount = currentIndex >= STATUS_ORDER.indexOf("received");
  const safeClose = safeCloseFor(item, bonus);
  // The number field starts on the headline amount so the common case ("it paid what it
  // said") is one blur away, without writing a figure the user never confirmed.
  const amountPlaceholder = bonus?.bonus_max != null ? String(bonus.bonus_max) : "";

  function handleDateChange(stage: TrackStatus, value: string) {
    if (!item || !value) return;
    // Editing the date of the stage the item is *on* is a restatement of the move that
    // put it there, so it goes through the action that owns the pointer; every earlier
    // stage is just a correction to a recorded fact.
    if (stage === item.status) setStatus(item.id, stage, value);
    else setDate(item.id, stage, value);
  }

  /** Records the new count and keeps the checklist honest about it: the direct-deposit
   * items tick themselves once every required deposit has gone out, and untick if the
   * count comes back down. */
  function changeDeposits(next: number) {
    if (!item) return;
    const clamped = Math.max(0, next);
    setDepositsSent(item.id, clamped);
    const complete = clamped >= needed;
    for (const condition of checklist) {
      if (condition.kind !== "direct_deposit") continue;
      if (done.has(condition.id) !== complete) toggleCondition(item.id, condition.id);
    }
  }

  function commitAmount(raw: string) {
    if (!item) return;
    const trimmed = raw.trim();
    if (trimmed === "") {
      setBonusReceived(item.id, undefined);
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) setBonusReceived(item.id, parsed);
  }

  function handleUntrack() {
    if (!item) return;
    untrack(item.id);
    onClose();
  }

  return (
    <Drawer open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-6">
        {/* Wrapped so the `xl` money chip hugs its own text — as a bare flex child it
         * would stretch into a full-width black bar. */}
        {bonus ? (
          <div className="flex flex-wrap items-center gap-2">
            <MoneyText
              value={bonus.bonus_max}
              range={[bonus.bonus_min, bonus.bonus_max]}
              size="xl"
            />
          </div>
        ) : null}

        <section className="flex flex-col gap-2">
          <h3 className={SECTION_HEADING_CLASS}>{t.tracker.conditionsTitle}</h3>
          <ConditionList
            conditions={checklist}
            notes={notes}
            done={done}
            onToggle={(conditionId) => toggleCondition(item.id, conditionId)}
          />
          {needed > 0 ? (
            <div
              className="mt-1 flex items-center justify-between gap-3 rounded-control bg-mint/30 px-3 py-2"
              role="group"
              aria-label={t.tracker.deposits.label}
            >
              <span className="text-sm font-medium text-ink">{t.tracker.deposits.label}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={t.tracker.deposits.fewer}
                  disabled={sent === 0}
                  onClick={() => changeDeposits(sent - 1)}
                  className="rounded-full p-1 text-ink transition-colors hover:bg-mint disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <Minus size={16} aria-hidden="true" />
                </button>
                <span className="min-w-[4.5rem] text-center text-sm tabular-nums text-ink">
                  {t.tracker.deposits.progress(sent, needed)}
                </span>
                <button
                  type="button"
                  aria-label={t.tracker.deposits.more}
                  onClick={() => changeDeposits(sent + 1)}
                  className="rounded-full p-1 text-ink transition-colors hover:bg-mint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : null}
          {allConditionsDone && item.status === "opened" ? (
            <div className="mt-1">
              <Button
                size="sm"
                onClick={() => setStatus(item.id, "requirements_met", toISO(today))}
              >
                {t.tracker.markRequirementsDone}
              </Button>
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className={SECTION_HEADING_CLASS}>{t.tracker.dates}</h3>
          {reachedStages.map((stage) =>
            stage === "planned" ? (
              // The plan schedules a month, not a day — there's no date here to edit.
              <div key={stage} className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-ink">{t.tracker.plannedMonth}</span>
                <span className="text-sm text-muted">
                  {item.openMonth ? monthLabel(item.openMonth) : t.bonuses.unknown}
                </span>
              </div>
            ) : (
              <Field key={stage} label={t.tracker.statuses[stage]} htmlFor={`${baseId}-${stage}`}>
                <input
                  id={`${baseId}-${stage}`}
                  type="date"
                  value={item.dates[stage] ?? ""}
                  onChange={(event) => handleDateChange(stage, event.target.value)}
                  className={INPUT_CLASS}
                />
              </Field>
            ),
          )}
        </section>

        {/* P3: nothing has posted before `received`, so asking what posted invites a
         * number the user is guessing at. The field appears the moment the stage does,
         * and stays editable afterwards — including once the account is closed, which is
         * often when the figure is finally confirmed. */}
        {showAmount ? (
          <section className="flex flex-col gap-2">
            <Field
              label={t.tracker.amount}
              help={t.tracker.amountHelp}
              htmlFor={`${baseId}-amount`}
            >
              <AmountField
                key={`${item.id}:${item.bonusReceived ?? ""}`}
                id={`${baseId}-amount`}
                initial={item.bonusReceived != null ? String(item.bonusReceived) : ""}
                placeholder={amountPlaceholder}
                onCommit={commitAmount}
              />
            </Field>
          </section>
        ) : null}

        <section className="flex flex-col gap-1">
          <h3 className={SECTION_HEADING_CLASS}>{t.tracker.safeClose.title}</h3>
          {safeClose ? (
            <>
              <p className="text-sm text-ink">
                {t.tracker.safeClose.line(dateLabel(safeClose.date))}
              </p>
              <p className="text-xs text-muted">{safeClose.reason}</p>
            </>
          ) : (
            <p className="text-sm text-muted">{t.tracker.safeClose.needsOpened}</p>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <Field label={t.tracker.notes} htmlFor={`${baseId}-notes`}>
            <NotesField
              key={item.id}
              id={`${baseId}-notes`}
              initial={item.notes ?? ""}
              onCommit={(value) => setNotes(item.id, value)}
            />
          </Field>
          <Field label={t.tracker.applicant} htmlFor={`${baseId}-applicant`}>
            <ApplicantField
              key={`${item.id}:${item.applicant ?? ""}`}
              id={`${baseId}-applicant`}
              initial={item.applicant ?? ""}
              onCommit={(value) => setApplicant(item.id, value)}
            />
          </Field>
        </section>

        {bonus ? (
          <div className="flex flex-col gap-2">
            <a
              href={bonus.doc_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-primary hover:underline"
            >
              {t.bonuses.openDoc}
            </a>
            {/* X5: the link is to the bank's own offer page, which the user can open
             * whether or not *we* managed to read it. Gating it on `terms.status === "ok"`
             * hid the most useful link on the drawer from every offer our scraper was
             * blocked from. */}
            {bonus.offer_url ? (
              <a
                href={bonus.offer_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary hover:underline"
              >
                {t.bonuses.terms.bankPage}
              </a>
            ) : null}
          </div>
        ) : null}

        <div>
          <Button variant="danger" size="sm" onClick={handleUntrack}>
            {t.tracker.untrack}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
