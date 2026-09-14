import { createBrowserRouter } from "react-router-dom";
import { Layout } from "./features/layout/Layout";
const Placeholder = ({ name }: { name: string }) => <h1 className="text-2xl">{name}</h1>;
export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Placeholder name="Landing" /> },
      { path: "start", element: <Placeholder name="Start" /> },
      { path: "plan", element: <Placeholder name="Plan" /> },
      { path: "tracker", element: <Placeholder name="Tracker" /> },
      { path: "bonuses", element: <Placeholder name="Bonuses" /> },
      { path: "settings", element: <Placeholder name="Settings" /> },
    ],
  },
]);
