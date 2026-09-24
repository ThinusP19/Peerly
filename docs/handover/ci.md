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

## Branching and releases - how to work on this from here

**Read this before starting.** As of 24 September 2026 the whole system lives on
the **`backend`** branch, and `main` is 27 commits behind it. That is not a
difference of detail: `main` has **no API at all** - no routes, no services, no
migrations past the first, no browser tests, no CI workflow and none of these
handover documents. It is the frontend prototype with mock data, from before the
backend existed. Nothing can be deployed from it.

### Step one: merge `backend` into `main`

Do this before anything else, and before the next person starts work.

The reasoning matters, because the instinct is the opposite - to leave `main`
alone until the system is proven in production:

- `main` is the default branch. Anyone who clones this repository and does
  nothing else gets a version that **cannot work**, and none of the
  documentation that would tell them so.
- Nothing can be deployed from `main`, and
  [deployment.md](./deployment.md) checks out a tag of it.
- Branch protection protects `main`. While the work sits elsewhere, turning it on
  guards a branch nobody uses and leaves the real work ungated. `main` has no
  workflow file, so there are no checks there to require.
- The divergence only grows. Merging 27 commits now is easier than merging 60
  later.
- Everything on `backend` is tested: 473 API tests, 33 web tests, 82 browser
  tests, and every screen driven by hand on 23 September.

```sh
git checkout main && git pull
git merge --no-ff backend
git push origin main
git tag -a v1.0.0-rc.1 -m "Handover baseline: full system, verified by hand 2026-09-23"
git push origin v1.0.0-rc.1
```

Then delete the stale branches - `backend` and `feat/portals-and-backend` - so
nobody picks one up by mistake.

### Connecting Mailgun and the server is not development work

This is the part most likely to be misread. **Neither needs a code change, so
neither needs a branch.**

| | |
| --- | --- |
| Mailgun | An account, DNS records, and five values in `server/.env`. The sending code is built and tested. See [deployment.md §4.1](./deployment.md#41-mailgun). |
| The server | A host, a DNS name, a certificate, a PostgreSQL database, and `server/.env`. See [deployment.md](./deployment.md). |

`.env` is not in the repository (SR-13), so configuring either changes nothing
that could be committed. There is nothing to hold back from `main` while it is
tested - the testing happens on the deployed server, against the code that is
already written.

### Step two onwards: short-lived branches off `main`

Once the merge and the tag are in:

1. Branch from `main` for one piece of work: `git checkout -b fix/reminder-copy`.
2. Push it and open a pull request into `main`.
3. CI runs the four checks below. A red `calculation` check means a mark may have
   moved - never merge past it.
4. One approval, then merge. Delete the branch.
5. **Tag `main` for anything you deploy**, and deploy the tag rather than a
   branch, so what is running is a name you can go back to. `deployment.md`
   section 5 expects this.

Keep branches short. A branch that lives for weeks becomes the problem this
section exists to describe.

### Where the deployment itself is recorded

Deployment is configuration, so it leaves no commits. Record it where the next
person will look instead: fill in the values left as **TODO (deploying party)**
in [technical-handover.md](./technical-handover.md), and tick the items off in
[TODO.md](../../TODO.md).

---

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
