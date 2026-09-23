# Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` or `backend`, and on every pull request into either. It covers SI-08 (a failing calculation test blocks the merge) and OR-24 (every change is reviewed and tested). A new push to the same branch or PR cancels the run still in progress. The workflow can only read the repository (`permissions: contents: read`) and uses no secrets. Each database is a throwaway Postgres 17 container that exists only for that job.

## Jobs

Each job is its own status check, so branch protection can require any of them.

| Check | What it runs |
| --- | --- |
| `calculation` | Only the Felder calculation tests (`server/src/lib/felder.test.ts`), then `npm run coverage` in `server/` to print coverage of `felder.ts`. It needs a Postgres because the API's vitest global setup migrates a test database before any test runs. |
| `server` | `npm ci`, `npm run typecheck` and the full API vitest suite in `server/`, against Postgres 17 (`TEST_DATABASE_URL`). |
| `frontend` | `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm test` (vitest) and `npm run build` at the repository root. |
| `e2e` | Migrates and seeds `peerly_dev`, installs Chromium and runs `npx playwright test`. When `CI` is set, `playwright.config.ts` starts the API (`npm start` in `server/`) and the web app (`npm run dev`) itself. Locally you still start both yourself. If the job fails, the HTML report and traces are uploaded as the `playwright-report` artifact. |

Node 24 is used everywhere, the same major as local development.

## Making the checks required (a repository admin does this once)

The workflow reports results, but a merge is only blocked once branch protection is switched on. On GitHub (`ThinusP19/Peerly`):

1. Merge or push the workflow to `main` and let it run once. GitHub only offers a check once it has seen it report.
2. Go to **Settings > Branches > Add branch protection rule**. On newer UIs this is **Settings > Rules > Rulesets > New branch ruleset**, targeting the default branch. The options have the same names.
3. **Branch name pattern:** `main`.
4. Tick **Require a pull request before merging**:
   - Tick **Require approvals** and set it to **1** (OR-24: every change is peer reviewed).
   - Tick **Dismiss stale pull request approvals when new commits are pushed**.
5. Tick **Require status checks to pass before merging**:
   - Tick **Require branches to be up to date before merging**.
   - In the search box, add each of `calculation`, `server`, `frontend` and `e2e`. They may be listed as `CI / calculation` and so on.
6. Tick **Do not allow bypassing the above settings**, so administrators follow the same rule.
7. Click **Create** (or **Save changes**).

To check it works, open a PR that breaks an assertion in `server/src/lib/felder.test.ts`. The `calculation` check should go red and the **Merge** button should be blocked.
