import { motion, useReducedMotion } from "framer-motion";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { useData } from "../../data/DataContext";
import type { Bonus } from "../../engine/types";
import { t } from "../../i18n/en";
import { DOC_URL } from "../../links";
import { useStore } from "../../state/store";
import { Badge, BankAvatar, Button, Card, MoneyText, dateLabel } from "../../ui";

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

// Sample rows for the decorative plan-preview illustration. Purely cosmetic —
// not tied to the real dataset.
const previewRows = [
  { bank: "Chase", amount: 400 },
  { bank: "SoFi", amount: 675 },
  { bank: "Ally Bank", amount: 300 },
];

export function Landing() {
  const profile = useStore((state) => state.profile);
  const data = useData();
  const reduceMotion = useReducedMotion();

  const heading = profile ? t.landing.welcomeBack : t.landing.h1;
  const primaryCta = profile
    ? { label: t.landing.viewPlan, to: "/plan" }
    : { label: t.landing.cta, to: "/start" };
  const latest = latestUpdated(data.bonuses);

  const hidden = reduceMotion ? {} : { opacity: 0, y: 12 };

  return (
    <div className="flex flex-col gap-16">
      <section className="grid gap-10 md:grid-cols-2 md:items-center md:gap-8">
        <motion.div
          initial={hidden}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col gap-6"
        >
          <h1 className="font-heading text-4xl font-extrabold tracking-tight text-ink md:text-6xl">
            {heading}
          </h1>
          <p className="max-w-xl text-lg text-muted">{t.landing.sub}</p>
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
        </motion.div>

        <motion.div
          initial={hidden}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: reduceMotion ? 0 : 0.05 }}
          aria-hidden="true"
          className="rounded-card bg-mint p-6"
        >
          <div className="flex flex-col gap-3">
            {previewRows.map((row) => (
              <Card key={row.bank} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <BankAvatar name={row.bank} />
                  <span className="font-medium text-ink">{row.bank}</span>
                </div>
                <MoneyText value={row.amount} />
              </Card>
            ))}
          </div>
        </motion.div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {t.landing.how.map((step, index) => (
          <Card key={step.title} className="flex flex-col gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-mint font-heading font-bold text-primary-dark">
              {index + 1}
            </span>
            <h3 className="font-heading text-lg font-semibold text-ink">{step.title}</h3>
            <p className="text-sm text-muted">{step.body}</p>
          </Card>
        ))}
      </section>

      {/* Hidden outright when nothing in the dataset carries a `post_modified` — a
       * "latest" section with no dates on it is just a second offer grid. */}
      {latest.length > 0 ? (
        <section aria-labelledby="latest-heading" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="latest-heading" className="font-heading text-xl font-bold text-ink md:text-2xl">
              {t.landing.latest.title}
            </h2>
            <p className="text-sm text-muted">{t.landing.latest.sub}</p>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {latest.map((bonus) => (
              <Card key={bonus.id} as="li" className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <BankAvatar name={bonus.bank} size={28} />
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 font-heading text-sm font-semibold text-ink">
                      {bonus.title}
                    </h3>
                    <MoneyText
                      value={bonus.bonus_max}
                      range={[bonus.bonus_min, bonus.bonus_max]}
                      size="md"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="mint">
                    {t.landing.latest.updated(dateLabel(bonus.post_modified))}
                  </Badge>
                  {bonus.availability.nationwide ? (
                    <Badge tone="neutral">{t.bonuses.nationwide}</Badge>
                  ) : bonus.availability.states.length > 0 ? (
                    <Badge tone="neutral">{bonus.availability.states.join(", ")}</Badge>
                  ) : null}
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm font-semibold">
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
              </Card>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm font-semibold">
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

      <section className="flex items-center justify-center gap-2 text-center text-sm text-muted">
        <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
        <p>{t.landing.trust}</p>
      </section>
    </div>
  );
}
