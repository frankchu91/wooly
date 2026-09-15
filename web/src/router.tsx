import { createBrowserRouter } from "react-router-dom";
import type { NonIndexRouteObject, RouteObject } from "react-router-dom";

import { AboutPage } from "./features/about/AboutPage";
import { BonusesPage } from "./features/bonuses/BonusesPage";
import { Landing } from "./features/landing/Landing";
import { ErrorPage } from "./features/layout/ErrorPage";
import { Layout } from "./features/layout/Layout";
import { Onboarding } from "./features/onboarding/Onboarding";
import { PlanPage } from "./features/plan/PlanPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { LedgerPage } from "./features/tracker/LedgerPage";
import { TrackerPage } from "./features/tracker/TrackerPage";
import { t } from "./i18n/en";
import { Button, EmptyState } from "./ui";

function NotFound() {
  return <EmptyState title={t.errors.notFound} action={<Button to="/">{t.errors.home}</Button>} />;
}

/**
 * The shared error boundary, attached to every route rather than just the root.
 *
 * React Router renders a route's `errorElement` in place of *that* route's element, so
 * attaching one per child keeps the persistent shell (header, nav, footer) around the
 * error — the user can navigate away from a broken page instead of being stranded. The
 * root keeps one too, as the last resort if the shell itself throws.
 */
export const errorElement = <ErrorPage />;

export const rootRoute: NonIndexRouteObject = {
  path: "/",
  element: <Layout />,
  errorElement,
  children: [
    { index: true, element: <Landing />, errorElement },
    { path: "about", element: <AboutPage />, errorElement },
    { path: "start", element: <Onboarding />, errorElement },
    { path: "plan", element: <PlanPage />, errorElement },
    { path: "tracker", element: <TrackerPage />, errorElement },
    { path: "ledger", element: <LedgerPage />, errorElement },
    { path: "bonuses", element: <BonusesPage />, errorElement },
    { path: "settings", element: <SettingsPage />, errorElement },
    { path: "*", element: <NotFound />, errorElement },
  ],
};

export const routes: RouteObject[] = [rootRoute];

// `BASE_URL` is "/" in dev and tests and "/<repo>/" on GitHub Pages, so every `to="/plan"`
// in the app stays written as an app path and resolves under the mount point.
export const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL });
