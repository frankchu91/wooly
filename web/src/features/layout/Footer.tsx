import { t } from "../../i18n/en";
import { DOC_URL, GITHUB_URL } from "../../links";

export function Footer() {
  return (
    <footer className="mx-auto max-w-6xl px-4 pb-28 pt-4 text-xs text-muted md:pb-8">
      <p>
        <a
          href={DOC_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-ink"
        >
          {t.footer.source}
        </a>
      </p>
      <p>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-ink"
        >
          {t.footer.github}
        </a>
      </p>
      <p>{t.footer.disclaimer}</p>
    </footer>
  );
}
