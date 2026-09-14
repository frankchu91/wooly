import { Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
