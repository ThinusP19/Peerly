# Carrying on with Peerly

Written for the next developer, working with an AI coding assistant. Read this
before your first change.

**Contents**

1. [Where the work stands](#1-where-the-work-stands)
2. [Get it running](#2-get-it-running)
3. [Which branch, and why](#3-which-branch-and-why)
4. [How to work](#4-how-to-work)
5. [What is outstanding](#5-what-is-outstanding)
6. [Things that will waste your time](#6-things-that-will-waste-your-time)
7. [Merging to `main` when you are done](#7-merging-to-main-when-you-are-done)

---

## 1. Where the work stands

The system is **complete and verified**. Every requirement in the specification
is built, and on 23-24 September 2026 every screen was driven by hand through all
three portals - the full lecturer cycle from class-list import to `.xlsx` export,
and the mark calculation checked against an independent derivation for two
groups, which matched exactly.

| | |
| --- | --- |
| API tests | 478 |
| Web tests | 33 |
| Browser tests | 82, including WCAG 2.1 AA over every page |
| Calculation coverage | 100% statements, 96.72% branches |
| TypeScript / ESLint | clean |

**What has never happened:** it has not run anywhere but a laptop. No mail
server is connected, no deployment exists, and no real student has used it.

That hand-testing found **thirteen defects the automated suites passed clean**.
They are listed in [`TODO.md`](../../TODO.md), and the pattern is worth knowing
before you start: every one of them was a piece that worked correctly in
isolation. A helper written against data that no longer existed. A guard on the
screen with nothing behind it on the server. A button that reported success
without acting. **Assume more remain, and that only using the system will find
them.**

---

## 2. Get it running

You need Node 24 and PostgreSQL 17. From a clean checkout:

```sh
createdb peerly_dev
createdb peerly_test

npm ci                                   # web app
cp .env.example .env                     # leave VITE_API_URL empty

cd server
npm ci
cp .env.example .env                     # defaults are fine locally
npm run migrate
npm run seed
npm run dev                              # API on :4000

# second terminal, repository root
npm run dev                              # web app on :7331
```

Open <http://127.0.0.1:7331>. Every seeded account's password is
`peerly-dev-password`; the accounts are listed in
[`test-walkthrough.md`](./test-walkthrough.md).

**E-mail prints to the API terminal** rather than being sent
(`MAIL_TRANSPORT=log`), so you can test registration, activation and password
reset without a mail server. Watch for `--- mail ---`.

Longer version, including a clean-machine setup:
[`technical-handover.md` §2](./technical-handover.md#2-local-setup-from-a-clean-machine).

---

## 3. Which branch, and why

**Work on `backend`.** It is the trunk in everything but name.

`main` is 30 commits behind and has **no API at all** - no routes, no services,
no browser tests, no CI workflow and none of these documents. It is the frontend
prototype with mock data, from before the backend existed. Do not branch from
it, and do not be reassured by it.

There is also **`fix/frontend-audit-marks-sync`**, pushed by a colleague on
23 September. It fixed eleven issues against that old prototype. Two of them were
real gaps that `backend` also had - calculation running on a still-open
assessment (BR-06), and regrouping not checking calculated marks - and both are
now fixed here with credit in the commit message. The other nine were already
solved differently by the API work. **That branch cannot usefully be merged**; it
would reintroduce mock-data code this branch deliberately removed.

### Settling that branch with its author

Do this once you have tested and are confident, not before - you may yet find
that something of theirs matters more than it looks. Then send them something
like this, adjusted to how you actually talk to each other:

> Hi - about `fix/frontend-audit-marks-sync`.
>
> Two of the eleven were real gaps we also had, and they are now fixed on
> `backend` with your branch credited in the commit:
>
> - **Calculation ran on a still-open assessment.** You were right that it should
>   require a closed one (BR-06). We had it recorded as a known gap and had not
>   acted on it. It is now enforced in the API, not just the button, with tests.
> - **Regrouping did not check calculated marks.** Our guard only asked about
>   submissions - but an assessment can be closed and calculated with none, and
>   those marks still name a group. Your status-based lock caught a case ours
>   missed.
>
> The other nine had already been fixed on `backend`, though differently. Your
> branch was cut from `main`, which is the frontend prototype from before the API
> existed, so those fixes were to the mock-data layer. On `backend` the same
> defects were fixed in the API, where the rule actually has to hold - a screen
> that refuses is a courtesy, and the endpoint is reachable without it.
>
> That also means the branch itself cannot be merged: it would pull back
> mock-data code that `backend` removes on purpose. Nothing is lost - the two
> findings are in - but the branch should be closed rather than landed.
>
> Worth saying plainly: two people testing the same system independently found
> overlapping defects, and two of the ones that survived review were yours.
>
> Going forward, branch from `main` once it has been merged. `AGENTS.md` and
> `docs/handover/continuing-development.md` explain the layout.

If they disagree, or think one of the other nine is still live, check it against
the current code before dismissing it. Two of the thirteen defects found here
came from exactly that kind of second look.

---

## 4. How to work

Read [`AGENTS.md`](../../AGENTS.md) first - it is short, and it is what an AI
assistant in this repository will pick up automatically.

The rules that matter most:

- **Enforce on the server, not in the screen.** A disabled button is a courtesy;
  the endpoint is reachable without it. Several of the thirteen defects were
  exactly this shape.
- **Anything touching the calculation needs a test before it needs a commit.**
  Marks end up on an academic record.
- **Every write leaves an audit entry** (FR-27). One of the defects was an
  editable screen where four fields changed with no record at all.
- **Check your tests have teeth.** Remove the fix, confirm the test fails, put it
  back. Several tests in this repository were written that way and say so.
- **Business rules belong in the database** where they can be, as constraints and
  triggers - not only in application code.

Before committing:

```sh
npm test && npm run lint && npx tsc --noEmit          # repository root
cd server && npm test && npx tsc --noEmit
npx playwright test                                    # both servers running
```

---

## 5. What is outstanding

[`TODO.md`](../../TODO.md) is the list, grouped by who has to do it. The short
version:

**Nothing on it is code.** What remains is a deployment, decisions the Sponsor
owns, and testing that needs people.

The three that block everything else:

1. **Connect Mailgun** - an account and five environment variables. The sending
   code is built and tested. [deployment.md §4.1](./deployment.md#41-mailgun).
2. **A server, a DNS name and a TLS certificate.** HTTPS is not optional: the
   session cookie is `Secure` in production, so over plain HTTP nobody can sign
   in at all.
3. **A historical cycle from the Sponsor** (AS-09). Tonight proved the
   calculation agrees with an independent derivation. Only this proves it agrees
   with what the university actually does, and the specification calls anything
   short of exact reconciliation a failed acceptance test.

---

## 6. Things that will waste your time

| | |
| --- | --- |
| **Back-to-back browser test runs** | The API allows 300 requests a minute per IP and everything local shares one bucket. A second run started too soon fails with stuck preloaders and `429`s that look exactly like regressions - and Playwright exits **0** alongside "4 failed", so a piped run can read as green. Leave a minute. [ci.md](./ci.md) |
| **`npm run seed` signs everyone out** | It truncates `users`, which cascades to sessions. Your browser then renders empty panels rather than saying anything. Sign in again. |
| **Don't seed while someone is testing** | Same reason, and it rebuilds their data underneath them. |
| **`main` looks fine and is not** | See [section 3](#3-which-branch-and-why). |
| **`src/mocks/` is types only** | `mocks/types.ts` is live shared types. `mocks/data.ts` is unused by the application. The folder name is a leftover. |
| **Migrations are immutable** | Once applied, add a new file. The runner records checksums and refuses to continue if one changed. |

---

## 7. Merging to `main` when you are done

Do this once the system is deployed and tested, or sooner if you would rather
`main` stopped being a trap. `main` is a strict ancestor of `backend`, so the
merge only adds commits and nothing can be lost.

**Check first** that nothing else has landed:

```sh
git fetch --all --prune

# should print nothing except fix/frontend-audit-marks-sync
for b in $(git branch -r --format='%(refname:short)' | grep -v HEAD); do
  n=$(git rev-list --count backend..$b); [ "$n" -gt 0 ] && echo "$b: $n unique"
done

# must say it is an ancestor - if not, stop and look
git merge-base --is-ancestor origin/main backend && echo "fast-forward, safe"
```

**Then, with a green test run behind you:**

```sh
git checkout main && git pull
git merge --ff-only backend
git push origin main

git tag -a v1.0.0 -m "Peerly 1.0.0"
git push origin v1.0.0
```

**Afterwards:**

1. **Turn on branch protection for `main`** - require a pull request with one
   approval and the four CI checks. Until this is done CI reports but blocks
   nothing. Steps in [ci.md](./ci.md).
2. **Delete the stale branches** - `backend` and `feat/portals-and-backend` -
   once you are sure, so nobody picks one up by mistake. Settle
   `fix/frontend-audit-marks-sync` with its author rather than deleting it.
3. **Work in short-lived branches off `main` from then on.** Deploy tags, never
   branches, so what is running is a name you can return to.
4. **Record the deployment** by filling in the values marked
   **TODO (deploying party)** in [technical-handover.md](./technical-handover.md)
   and ticking the items in [`TODO.md`](../../TODO.md). Deployment is
   configuration, so it leaves no commits of its own.
