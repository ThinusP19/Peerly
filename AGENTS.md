# Working in this repository

**Work on the `backend` branch.** It is the trunk in everything but name: `main`
is 30 commits behind and has no API at all. Read
[`docs/handover/continuing-development.md`](./docs/handover/continuing-development.md)
before your first change - it covers where the work stands, how to run it, and
how to merge to `main` when you are finished.

## Layout

| Path                     | What it is                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `src/`                   | React frontend (TanStack Start, Tailwind v4, shadcn/ui)                                               |
| `src/services/peerly.ts` | The API client. Every screen reads and writes through it - there is no mock data path any more        |
| `src/mocks/types.ts`     | Shared TypeScript types **only**. The folder name is a leftover; `mocks/data.ts` is unused by the app |
| `src/lib/`               | Framework-free domain logic, formatting, the API transport and the evaluation draft store             |
| `server/`                | Express + PostgreSQL API - all business logic lives here                                              |
| `server/src/lib/felder.ts` | The mark calculation. Pure, no database, no HTTP, all values configurable                           |
| `server/migrations/`     | Versioned SQL. Immutable once applied - add a new file, never edit an applied one                     |
| `e2e/`                   | Playwright tests against both real servers and a seeded database                                      |
| `docs/handover/`         | Deployment, technical handover, API, ERD, CI, user guides, test scripts                                |
| `scope.md`               | Every specification requirement with its real status                                                  |
| `TODO.md`                | Everything outstanding, grouped by who has to do it                                                    |

## Rules that matter here

- **Marks end up on an academic record.** Anything touching the calculation needs
  a test before it needs a commit. Use `numeric` in SQL, never a float.
- **Business rules belong in the database.** Self-evaluation, duplicate ratings,
  cross-group ratings and one-group-per-student are enforced by constraints, not
  only by the interface. Keep it that way - the API can be called directly.
- **Enforce rules on the server, not in the screen.** Disabling a button is a
  courtesy; the endpoint is reachable without it. Several defects found on
  2026-09-23 were exactly this - a UI that refused and an API that did not.
- **Students must never see a rating's numeric value.** Student-facing services
  return `StudentRatingOption`, which has no `hiddenValue` field at all.
- **The audit log is append-only.** Triggers refuse `UPDATE` and `DELETE`, and
  FR-27 means *every* write leaves an entry - not only the interesting ones.
- **Changing the calculation's config changes marks.** Bump `ruleVersion` in
  `DEFAULT_CONFIG` when you do, so old runs stay explainable.

## Commands

```sh
# two terminals, from the repository root
cd server && npm run dev        # API on :4000
npm run dev                     # web app on :7331

cd server && npm run seed       # rebuild the demo data (safe, deterministic)
```

Before committing: `npm test`, `npm run lint`, `npx tsc --noEmit` at the root,
and `npm test` plus `npx tsc --noEmit` in `server/`.

## Two traps that cost hours

- **Leave a minute between browser-test runs.** The API allows 300 requests a
  minute per IP and everything local shares one bucket, so back-to-back runs
  fail in ways that look like regressions - stuck preloaders, 429s, and an exit
  code of 0 next to "4 failed". See
  [`docs/handover/ci.md`](./docs/handover/ci.md).
- **`npm run seed` destroys every session**, because it truncates `users`. Anyone
  signed in is silently signed out, and their next page renders empty. Expected;
  sign in again.
