import { Outlet } from "react-router-dom";

import { DataContext } from "../../data/DataContext";
import { useBonuses } from "../../data/useBonuses";
import { t } from "../../i18n/en";
import { Button, Card, Toaster } from "../../ui";
import { Footer } from "./Footer";
import { Header } from "./Header";

function LoadingSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label={t.common.loading}>
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
    <div className="flex py-8">
      <Card className="mx-auto flex max-w-sm flex-col items-center gap-4 text-center">
        <p className="text-ink">{t.common.error}</p>
        <Button onClick={onRetry}>{t.common.retry}</Button>
      </Card>
    </div>
  );
}

export function Layout() {
  const { data, error, retry } = useBonuses();

  // One persistent shell (Header/Footer/Toaster) regardless of load state, so a
  // fetch error or a slow load never leaves the user without navigation.
  return (
    <DataContext.Provider value={data}>
      <div className="min-h-screen bg-cream text-ink">
        <Header dataset={data} />
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 md:pb-12">
          {error ? <ErrorState onRetry={retry} /> : data ? <Outlet /> : <LoadingSkeleton />}
        </main>
        <Footer />
        <Toaster />
      </div>
    </DataContext.Provider>
  );
}
