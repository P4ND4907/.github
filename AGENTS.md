# AGENTS.md

## Cursor Cloud specific instructions

This repo is primarily a community-health template repo, but the actual application is **FRAGLINE**, a React + TypeScript + Vite idle esports manager located in the `fragline/` subdirectory. All app commands must be run from `fragline/`, not the repo root.

### Services

There is a single service: the Vite dev server for `fragline/`.

- Run dev server: `cd fragline && npm run dev` (serves at `http://localhost:5173`).
- Lint: `cd fragline && npm run lint` (oxlint). Note: a pre-existing `no-unused-vars` warning in `scripts/stuck-feed.mts` is expected and not an error.
- Build: `cd fragline && npm run build` (runs `tsc -b` then `vite build`).
- Preview production build: `cd fragline && npm run preview`.

### Notes

- Node 20.19+ / 22+ is required (Vite 8). The VM's default Node (v22) works; do not force an older nvm-managed version.
- The app has no backend, database, or environment variables. State persists client-side via `localStorage`, so testing a fresh state may require clearing site data / localStorage in the browser.
- Dependencies live only in `fragline/package.json`; there is no root-level `package.json`.
