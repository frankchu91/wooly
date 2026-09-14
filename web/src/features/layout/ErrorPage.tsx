import { useNavigate } from "react-router-dom";

import { t } from "../../i18n/en";
import { STORAGE_KEY, useStore } from "../../state/store";
import { Button, Card } from "../../ui";

/**
 * The router's `errorElement`: whatever threw, the user still gets a way out.
 *
 * The second way out matters more than it looks — every bit of the user's state lives in
 * one localStorage key, so a blob this build can't read would otherwise crash the app on
 * every load with no way back in.
 */
export function ErrorPage() {
  const navigate = useNavigate();
  const clearAll = useStore((state) => state.clearAll);

  function handleClear() {
    clearAll();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // A browser with storage blocked has nothing to clear; going home is still right.
    }
    navigate("/");
  }

  return (
    <div className="flex py-8">
      <Card className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
        <span className="text-4xl" aria-hidden="true">
          🐑
        </span>
        <h1 className="font-heading text-xl font-semibold text-ink">{t.errors.title}</h1>
        <p className="text-sm text-muted">{t.errors.body}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button to="/">{t.errors.home}</Button>
          <Button variant="secondary" onClick={handleClear}>
            {t.errors.clear}
          </Button>
        </div>
      </Card>
    </div>
  );
}
