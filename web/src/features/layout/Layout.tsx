import { Outlet } from "react-router-dom";

import { DataContext } from "../../data/DataContext";
import { useBonuses } from "../../data/useBonuses";
import { t } from "../../i18n/en";
import { Button, Card, Toaster } from "../../ui";
import { Footer } from "./Footer";
import { Header } from "./Header";

function LoadingSkeleton() {
  return (
    <div
      className="mx-auto max-w-6xl px-4 py-8"
      role="status"
      aria-live="polite"
      aria-label={t.common.loading}
    >
      <span className="sr-only">{t.common.loading}</span>
      <div className="animate-pulse space-y-4" aria-hidden="true">
        <div className="h-8 w-2/3 rounded-control bg-mint/60" />
        <div className="h-4 w-full rounded-control bg-mint/40" />
        <div className="h-4 w-5/6 rounded-control bg-mint/40" />
        <div className="h-40 rounded-card bg-mint/30" />
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto flex max-w-6xl px-4 py-16">
      <Card className="mx-auto flex max-w-sm flex-col items-center gap-4 text-center">
        <p className="text-ink">{t.common.error}</p>
        <Button onClick={onRetry}>{t.common.retry}</Button>
      </Card>
    </div>
  );
}

export function Layout() {
  const { data, error, retry } = useBonuses();

  if (error) {
    return (
      <div className="min-h-screen bg-cream text-ink">
        <ErrorState onRetry={retry} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-cream text-ink">
        <LoadingSkeleton />
      </div>
    );
  }

  return (
    <DataContext.Provider value={data}>
      <div className="min-h-screen bg-cream text-ink">
        <Header dataset={data} />
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 md:pb-12">
          <Outlet />
        </main>
        <Footer />
        <Toaster />
      </div>
    </DataContext.Provider>
  );
}
