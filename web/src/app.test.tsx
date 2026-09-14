import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { router } from "./router";

test("renders landing route", () => {
  const mem = createMemoryRouter(router.routes, { initialEntries: ["/"] });
  render(<RouterProvider router={mem} />);
  expect(screen.getByText("Landing")).toBeInTheDocument();
});
