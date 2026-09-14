# Woolly — web

Vite + React + TypeScript + Tailwind CSS 3 frontend for Woolly, the bank-bonus planner.

## Scripts

- `pnpm dev` — start the dev server (copies `../data/bonuses.json` into `public/` first)
- `pnpm build` — typecheck and build for production
- `pnpm test` — run unit tests (Vitest + Testing Library)
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint` — ESLint + Prettier check
- `pnpm e2e` — Playwright end-to-end tests

All UI copy lives in `src/i18n/en.ts`.
