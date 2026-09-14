import { createBrowserRouter } from "react-router-dom";
import { BonusesPage } from "./features/bonuses/BonusesPage";
import { Landing } from "./features/landing/Landing";
import { Layout } from "./features/layout/Layout";
import { Onboarding } from "./features/onboarding/Onboarding";
import { PlanPage } from "./features/plan/PlanPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { TrackerPage } from "./features/tracker/TrackerPage";
export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Landing /> },
      { path: "start", element: <Onboarding /> },
      { path: "plan", element: <PlanPage /> },
      { path: "tracker", element: <TrackerPage /> },
      { path: "bonuses", element: <BonusesPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
