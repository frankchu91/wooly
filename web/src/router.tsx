import { createBrowserRouter } from "react-router-dom";
import { Landing } from "./features/landing/Landing";
import { Layout } from "./features/layout/Layout";
import { Onboarding } from "./features/onboarding/Onboarding";
import { PlanPage } from "./features/plan/PlanPage";
const Placeholder = ({ name }: { name: string }) => <h1 className="text-2xl">{name}</h1>;
export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Landing /> },
      { path: "start", element: <Onboarding /> },
      { path: "plan", element: <PlanPage /> },
      { path: "tracker", element: <Placeholder name="Tracker" /> },
      { path: "bonuses", element: <Placeholder name="Bonuses" /> },
      { path: "settings", element: <Placeholder name="Settings" /> },
    ],
  },
]);
