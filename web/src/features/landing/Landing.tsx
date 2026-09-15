import { motion, useReducedMotion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { useData } from "../../data/DataContext";
import type { Bonus } from "../../engine/types";
import { t } from "../../i18n/en";
import { DOC_URL } from "../../links";
import { useStore } from "../../state/store";
import { BankAvatar, Button, MoneyText, dateLabel, money } from "../../ui";
import { SamplePlan } from "./SamplePlan";

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

const inlineLink =
  "rounded-control font-semibold text-primary-dark hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** A section that fades up once as it scrolls into view. The motion is the page's only
 * choreography: it sequences the sections in reading order and nothing else. */
function Reveal({
  as: Tag = "section",
  className,
  children,
  ...rest
}: {
  as?: "section" | "div";
  className?: string;
  children: ReactNode;
  "aria-labelledby"?: string;
  "aria-label"?: string;
}) {
  const reduceMotion = useReducedMotion();
  const MotionTag = motion[Tag];
  return (
    <MotionTag
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={className}
      {...rest}
    >
      {children}
    </MotionTag>
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

  const hidden = reduceMotion ? {} : { opacity: 0, y: 12 };

  return (
    <div className="space-y-20 md:space-y-28">
      {/* Hero: the claim on the left, the product's real output on the right. Copy on the
       * left is capped at headline + one sentence + CTAs so the sample plan gets the eye. */}
      <motion.section
        aria-labelledby="hero-heading"
        initial={hidden}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="grid gap-10 md:grid-cols-12 md:items-center md:gap-12 md:pt-6"
      >
        <div className="flex flex-col gap-6 md:col-span-6">
          <h1
            id="hero-heading"
            className="text-balance font-heading text-4xl font-extrabold leading-[1.02] tracking-[-0.03em] text-ink sm:text-5xl lg:text-6xl"
          >
            {heading}
          </h1>
          <p className="max-w-[40ch] text-lg leading-relaxed text-muted">{t.landing.sub}</p>
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

        <div className="md:col-span-6 lg:col-span-5 lg:col-start-8">
          <SamplePlan bonuses={data.bonuses} />
        </div>
      </motion.section>

      {/* Live figures from the dataset, as a strip under the hero. This is the page's
       * proof, so it sits where a logo wall would. */}
      <Reveal
        aria-label={t.landing.stats.label}
        className="grid gap-6 border-y border-ink/10 py-8 sm:grid-cols-3 sm:gap-10"
      >
        <Stat label={t.landing.stats.offers} value={String(data.bonuses.length)} />
        {data.generated_at !== null ? (
          <Stat label={t.landing.stats.updated} value={dateLabel(data.generated_at)} />
        ) : null}
        {biggest !== null ? <Stat label={t.landing.stats.biggest} value={money(biggest)} /> : null}
      </Reveal>

      {/* How it works: the headline holds one column, the three steps run down the other. */}
      <Reveal aria-labelledby="how-heading" className="grid gap-8 md:grid-cols-12 md:gap-12">
        <h2
          id="how-heading"
          className="text-balance font-heading text-3xl font-bold leading-tight text-ink md:col-span-5 md:text-4xl"
        >
          {t.landing.howTitle}
        </h2>
        <ol className="flex flex-col md:col-span-6 md:col-start-7">
          {t.landing.how.map((step) => (
            <li
              key={step.title}
              className="flex flex-col gap-1.5 border-t border-ink/10 py-6 first:border-t-0 first:pt-0 last:pb-0"
            >
              <h3 className="font-heading text-xl font-bold text-ink">{step.title}</h3>
              <p className="max-w-[55ch] leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </Reveal>

      {/* Hidden outright when nothing in the dataset carries a `post_modified` — a
       * "latest" section with no dates on it is just a second offer grid. */}
      {latest.length > 0 ? (
        <Reveal aria-labelledby="latest-heading" className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h2
              id="latest-heading"
              className="font-heading text-3xl font-bold leading-tight text-ink md:text-4xl"
            >
              {t.landing.latest.title}
            </h2>
            <p className="text-muted">{t.landing.latest.sub}</p>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {latest.map((bonus) => (
              <li
                key={bonus.id}
                className="flex flex-col gap-4 rounded-card border border-ink/10 bg-surface p-5"
              >
                <div className="flex items-start gap-3">
                  <BankAvatar name={bonus.bank} size={32} />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-heading text-sm font-semibold leading-snug text-ink">
                      {bonus.title}
                    </h3>
                    <p className="mt-1 text-xs text-muted">
                      {t.landing.latest.updated(dateLabel(bonus.post_modified))}
                    </p>
                  </div>
                  <MoneyText
                    value={bonus.bonus_max}
                    range={[bonus.bonus_min, bonus.bonus_max]}
                    size="md"
                    className="shrink-0"
                  />
                </div>
                <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <a
                    href={bonus.doc_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 ${inlineLink}`}
                  >
                    {t.bonuses.openDoc}
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                  <Link to={`/bonuses?bonus=${bonus.id}`} className={inlineLink}>
                    {t.landing.latest.details}
                  </Link>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
            <Link to="/bonuses" className={inlineLink}>
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
        </Reveal>
      ) : null}

      {/* Closing band: the privacy line that used to sit under the hero CTAs, the guide
       * link, and one repeat of the primary CTA. */}
      <Reveal className="grid gap-6 rounded-card bg-mint/40 p-6 md:grid-cols-12 md:items-center md:p-10">
        <div className="flex flex-col gap-2 md:col-span-8">
          <p className="font-heading text-xl font-bold text-ink md:text-2xl">{t.landing.trust}</p>
          <p className="text-muted">
            {t.landing.learn}{" "}
            <Link to="/about" className={inlineLink}>
              {t.landing.learnCta}
            </Link>
          </p>
        </div>
        <div className="md:col-span-4 md:justify-self-end">
          <Button to={primaryCta.to} size="lg">
            {primaryCta.label}
          </Button>
        </div>
      </Reveal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-heading text-3xl font-extrabold tabular-nums leading-none text-ink md:text-4xl">
        {value}
      </span>
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}
