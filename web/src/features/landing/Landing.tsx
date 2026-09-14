import { motion, useReducedMotion } from "framer-motion";
import { ShieldCheck } from "lucide-react";

import { t } from "../../i18n/en";
import { useStore } from "../../state/store";
import { BankAvatar, Button, Card, MoneyText } from "../../ui";

// Sample rows for the decorative plan-preview illustration. Purely cosmetic —
// not tied to the real dataset.
const previewRows = [
  { bank: "Chase", amount: 400 },
  { bank: "SoFi", amount: 675 },
  { bank: "Ally Bank", amount: 300 },
];

export function Landing() {
  const profile = useStore((state) => state.profile);
  const reduceMotion = useReducedMotion();

  const heading = profile ? t.landing.welcomeBack : t.landing.h1;
  const primaryCta = profile
    ? { label: t.landing.viewPlan, to: "/plan" }
    : { label: t.landing.cta, to: "/start" };

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
            <Button to="/bonuses" variant="secondary" size="lg">
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

      <section className="flex items-center justify-center gap-2 text-center text-sm text-muted">
        <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
        <p>{t.landing.trust}</p>
      </section>
    </div>
  );
}
