import { ChevronDown } from "lucide-react";

import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { Button, Card } from "../../ui";

/** The eyebrow above a section heading, matching the landing page's. */
function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted">{children}</p>
  );
}

/** The long-form introduction to bank bonuses — everything the landing page no longer
 * says, laid out as an article rather than a grid of cards. */
export function AboutPage() {
  const profile = useStore((state) => state.profile);
  const primaryCta = profile
    ? { label: t.landing.viewPlan, to: "/plan" }
    : { label: t.landing.cta, to: "/start" };

  return (
    <article className="space-y-16 md:space-y-24">
      <header>
        <h1 className="text-balance font-heading text-4xl font-extrabold tracking-[-0.03em] text-ink md:text-6xl">
          {t.about.title}
        </h1>
        <p className="mt-4 max-w-md text-lg text-muted">{t.about.standfirst}</p>
      </header>

      <section aria-labelledby="what-heading">
        <SectionLabel>{t.about.labels.what}</SectionLabel>
        <h2 id="what-heading" className="font-heading text-2xl font-bold text-ink md:text-3xl">
          {t.about.what.title}
        </h2>

        <div className="mt-6 max-w-prose space-y-4 text-base leading-relaxed text-ink">
          {t.about.what.paras.map((para) => (
            <p key={para}>{para}</p>
          ))}
        </div>

        {/* The one card on the page: a worked example is a data object, so a panel is
         * the honest shape for it. */}
        <Card tone="mint" className="mt-8 flex max-w-md flex-col gap-4">
          <h3 className="font-heading text-lg font-semibold text-ink">
            {t.about.what.example.title}
          </h3>
          <dl className="flex flex-col gap-2 text-sm">
            {t.about.what.example.rows.map(([label, value]) => (
              <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-4">
                <dt className="text-muted">{label}</dt>
                <dd className="font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted">{t.about.what.example.note}</p>
        </Card>
      </section>

      <section aria-labelledby="need-heading">
        <SectionLabel>{t.about.labels.need}</SectionLabel>
        <h2 id="need-heading" className="font-heading text-2xl font-bold text-ink md:text-3xl">
          {t.about.need.title}
        </h2>
        <p className="mt-1 text-sm text-muted">{t.about.need.sub}</p>

        <dl className="mt-6">
          {t.about.need.items.map((item) => (
            <div
              key={item.title}
              className="grid gap-x-8 gap-y-1 border-t border-ink/10 py-5 md:grid-cols-[16rem_1fr] md:items-baseline"
            >
              <dt className="font-semibold text-ink">{item.title}</dt>
              <dd className="max-w-prose text-muted">{item.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="faq-heading">
        <SectionLabel>{t.about.labels.faq}</SectionLabel>
        <h2 id="faq-heading" className="font-heading text-2xl font-bold text-ink md:text-3xl">
          {t.about.faq.title}
        </h2>

        <div className="mt-6 divide-y divide-ink/10 border-t border-ink/10">
          {t.about.faq.items.map((item) => (
            <details key={item.q} className="group [&[open]>summary>svg]:rotate-180">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-control py-4 font-heading font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                {item.q}
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-muted transition-transform"
                  aria-hidden="true"
                />
              </summary>
              <p className="max-w-prose pb-4 text-sm text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <div>
        <Button to={primaryCta.to} size="lg">
          {primaryCta.label}
        </Button>
      </div>
    </article>
  );
}
