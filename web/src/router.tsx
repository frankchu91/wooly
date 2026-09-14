import { createBrowserRouter } from "react-router-dom";
import { BonusesPage } from "./features/bonuses/BonusesPage";
import { Landing } from "./features/landing/Landing";
import { Layout } from "./features/layout/Layout";
import { Onboarding } from "./features/onboarding/Onboarding";
import { PlanPage } from "./features/plan/PlanPage";
import { TrackerPage } from "./features/tracker/TrackerPage";
const Placeholder = ({ name }: { name: string }) => <h1 className="text-2xl">{name}</h1>;
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
      { path: "settings", element: <Placeholder name="Settings" /> },
    ],
  },
]);
