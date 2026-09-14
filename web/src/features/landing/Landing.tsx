import { motion, useReducedMotion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

import { useData } from "../../data/DataContext";
import type { Bonus } from "../../engine/types";
import { t } from "../../i18n/en";
import { DOC_URL } from "../../links";
import { useStore } from "../../state/store";
import { BankAvatar, Button, MoneyText, dateLabel, money } from "../../ui";

/** How many recently-updated offers the landing page shows. */
const LATEST_COUNT = 6;

/** A bonus the scraper has a modification date for — the only kind this section shows. */
type UpdatedBonus = Bonus & { post_modified: string };

/** The offers Doctor of Credit touched most recently, newest first.
 *
 * Offers with no `post_modified` are left out rather than sorted to the bottom: the
 * section's whole claim is "this changed recently", and a row that can't say when it
 * changed has no business making it. */
function latestUpdated(bonuses: Bonus[]): UpdatedBonus[] {
  return bonuses
    .filter((bonus): bonus is UpdatedBonus => bonus.post_modified !== null)
    .sort((a, b) => b.post_modified.localeCompare(a.post_modified))
    .slice(0, LATEST_COUNT);
}

/** The largest advertised bonus in the dataset, or `null` when none is priced. */
function biggestBonus(bonuses: Bonus[]): number | null {
  const amounts = bonuses
    .map((bonus) => bonus.bonus_max)
    .filter((amount): amount is number => amount !== null);
  return amounts.length > 0 ? Math.max(...amounts) : null;
}

/** The eyebrow above a section heading. The `h2` carries the sentence; this only says
 * which part of the page you are in. */
function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted">{children}</p>
  );
}

export function Landing() {
  const profile = useStore((state) => state.profile);
  const data = useData();
  const reduceMotion = useReducedMotion();

  const heading = profile ? t.landing.welcomeBack : t.landing.h1;
  const primaryCta = profile
    ? { label: t.landing.viewPlan, to: "/plan" }
    : { label: t.landing.cta, to: "/start" };
  const latest = latestUpdated(data.bonuses);
  const biggest = biggestBonus(data.bonuses);

  // One fade-up on the hero, nothing staggered down the page.
  const hidden = reduceMotion ? {} : { opacity: 0, y: 12 };

  return (
    <div className="space-y-16 md:space-y-24">
      <div>
        <motion.section
          aria-labelledby="hero-heading"
          initial={hidden}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="grid gap-10 md:grid-cols-12 md:items-center md:gap-12"
        >
          <div className="flex flex-col gap-6 md:col-span-7">
            <h1
              id="hero-heading"
              className="text-balance font-heading text-5xl font-extrabold leading-[0.95] tracking-[-0.03em] text-ink md:text-7xl"
            >
              {heading}
            </h1>
            <p className="max-w-md text-lg text-muted">{t.landing.sub}</p>
            <div className="flex flex-wrap gap-3">
              <Button to={primaryCta.to} size="lg">
                {primaryCta.label}
              </Button>
              {/* Only worth offering once there is a plan to rebuild — without a profile
               * the primary CTA already goes to the wizard. */}
              {profile ? (
                <Button to="/start" variant="secondary" size="lg">
                  {t.landing.replan}
                </Button>
              ) : null}
              <Button to="/bonuses" variant={profile ? "ghost" : "secondary"} size="lg">
                {t.landing.browse}
              </Button>
            </div>
          </div>

          {/* Live figures, not an illustration: a hairline rule ties them to the headline
           * so the hero reads as one composition rather than two boxes. */}
          <dl className="divide-y divide-ink/10 md:col-span-5 md:border-l md:border-ink/10 md:pl-10">
            <div className="flex flex-col gap-1 pb-5">
              <dt className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                {t.landing.stats.offers}
              </dt>
              <dd className="font-heading text-4xl font-extrabold tabular-nums text-ink">
                {data.bonuses.length}
              </dd>
            </div>
            {data.generated_at !== null ? (
              <div className="flex flex-col gap-1 py-5">
                <dt className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                  {t.landing.stats.updated}
                </dt>
                <dd className="font-heading text-2xl font-bold tabular-nums text-ink">
                  {dateLabel(data.generated_at)}
                </dd>
              </div>
            ) : null}
            {biggest !== null ? (
              <div className="flex flex-col gap-1 pt-5">
                <dt className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                  {t.landing.stats.biggest}
                </dt>
                <dd className="font-heading text-4xl font-extrabold tabular-nums text-ink">
                  {money(biggest)}
                </dd>
              </div>
            ) : null}
          </dl>
        </motion.section>

        <p className="mt-8 text-sm text-muted">{t.landing.trust}</p>
      </div>

      <section aria-labelledby="how-heading">
        <SectionLabel>{t.landing.labels.how}</SectionLabel>
        <h2 id="how-heading" className="font-heading text-2xl font-bold text-ink md:text-3xl">
          {t.landing.howTitle}
        </h2>

        <ol className="mt-6">
          {t.landing.how.map((step, index) => (
            <li
              key={step.title}
              className="grid gap-x-6 gap-y-1 border-t border-ink/10 py-5 md:grid-cols-[3rem_12rem_1fr] md:items-baseline"
            >
              <span className="text-xs tracking-[0.18em] text-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="font-heading text-lg text-ink">{step.title}</h3>
              <p className="text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Hidden outright when nothing in the dataset carries a `post_modified` — a
       * "latest" section with no dates on it is just a second offer grid. */}
      {latest.length > 0 ? (
        <section aria-labelledby="latest-heading">
          <SectionLabel>{t.landing.labels.latest}</SectionLabel>
          <h2 id="latest-heading" className="font-heading text-2xl font-bold text-ink md:text-3xl">
            {t.landing.latest.title}
          </h2>
          <p className="mt-1 text-sm text-muted">{t.landing.latest.sub}</p>

          <ul className="mt-6 divide-y divide-ink/10 lg:grid lg:grid-cols-2 lg:gap-x-10 lg:divide-y-0">
            {latest.map((bonus) => (
              <li
                key={bonus.id}
                className="flex flex-col gap-1.5 py-5 lg:border-t lg:border-ink/10"
              >
                <div className="flex items-start gap-3">
                  <BankAvatar name={bonus.bank} size={28} />
                  <h3 className="min-w-0 flex-1 font-heading text-sm font-semibold text-ink">
                    {bonus.title}
                  </h3>
                  <MoneyText
                    value={bonus.bonus_max}
                    range={[bonus.bonus_min, bonus.bonus_max]}
                    size="md"
                  />
                </div>
                <p className="text-xs text-muted">
                  {t.landing.latest.updated(dateLabel(bonus.post_modified))}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm font-semibold">
                  <a
                    href={bonus.doc_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-control text-primary-dark hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {t.bonuses.openDoc}
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                  <Link
                    to={`/bonuses?bonus=${bonus.id}`}
                    className="rounded-control text-primary-dark hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {t.landing.latest.details}
                  </Link>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm font-semibold">
            <Link
              to="/bonuses"
              className="rounded-control text-primary-dark hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {t.landing.latest.all(data.bonuses.length)}
            </Link>
            <a
              href={DOC_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-control text-muted hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {t.landing.latest.source}
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          </div>
        </section>
      ) : null}

      <section className="flex flex-col items-start gap-5">
        <p className="text-muted">
          {t.landing.learn}{" "}
          <Link
            to="/about"
            className="rounded-control font-semibold text-primary-dark hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {t.landing.learnCta}
          </Link>
        </p>
        <Button to={primaryCta.to} size="lg">
          {primaryCta.label}
        </Button>
      </section>
    </div>
  );
}
