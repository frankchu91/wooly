import { Link } from "react-router-dom";

import { t } from "../../i18n/en";
import { DOC_URL, GITHUB_URL } from "../../links";

export function Footer() {
  return (
    <footer className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 pb-28 pt-10 text-center text-xs text-muted md:pb-10">
      <span className="text-base" aria-hidden="true">
        🐑
      </span>
      <p className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {/* The long-form introduction lives on its own page now; it is not in the main
         * nav, so this is the only way to it. */}
        <Link to="/about" className="hover:underline">
          {t.footer.about}
        </Link>
        <a href={DOC_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">
          {t.footer.source}
        </a>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">
          {t.footer.github}
        </a>
      </p>
      <p className="max-w-md">{t.footer.disclaimer}</p>
    </footer>
  );
}
