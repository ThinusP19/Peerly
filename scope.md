# Peerly - Scope & Build Checklist

Working checklist derived from the **Functional Specifications Document (FSD)** for Peerly.
Every requirement ID in the FSD appears here exactly once, with its real status in this
repository as of **23 September 2026**.

> **What this repository currently is:** a working application. An Express + PostgreSQL API in
> `server/` serves the React front end over `/api`, with real authentication, server-side
> sessions, role and ownership enforcement, persistence and an append-only audit trail. Every
> screen reads and writes through that API - nothing renders a fixture. 449 API tests, 32
> front-end tests and 82 browser tests pass.
>
> **What is still provisional:** the Felder calculation runs and is tested, and everything that
> determines a mark is now agreed - the rating scale, the factor limits and the self-rating
> rule on 2026-09-22, the rounding rule (one decimal place) on 2026-09-23. What remains open
> under **AS-08** is the free-rider and outlier thresholds (IS-04) and non-submission policy
> (IS-02), neither of which alters a mark. Runs are stamped `felder-2026.3-provisional` until
> the specification is signed as a document.
>
> **What has never happened:** the system has not run anywhere but a laptop, and no real person
> has tested it. See [Critical gaps](#critical-gaps).

---

## Legend

| Mark  | Meaning                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------ |
| `[x]` | **Done** - built and verified in this repository                                                       |
| `[~]` | **Partial** - built and working, but something named in the entry is still missing               |
| `[ ]` | **Not started** - no implementation yet                                                                |
| `[-]` | **Deferred** - belongs to deployment, infrastructure or project process, not to the UI prototype       |

`Evidence` cites the file that implements it. `Gap` states what is still missing.

---

## Status at a glance

| Group                          | Done   | Partial | Not started | Deferred | Total   |
| ------------------------------ | ------ | ------- | ----------- | -------- | ------- |
| UI - User interfaces           | 8      | 1       | 0           | 0        | 9       |
| HI - Hardware interfaces       | 2      | 0       | 0           | 2        | 4       |
| SI - Software interfaces       | 9      | 3       | 0           | 0        | 12      |
| CI - Communications interfaces | 6      | 1       | 0           | 3        | 10      |
| FR - Functional requirements   | 26     | 2       | 0           | 0        | 28      |
| PR - Performance               | 1      | 1       | 0           | 7        | 9       |
| SR - Security                  | 11     | 3       | 0           | 2        | 16      |
| UR - Usability                 | 10     | 1       | 0           | 0        | 11      |
| OR - Other requirements        | 15     | 6       | 2           | 5        | 28      |
| BR - Business rules            | 14     | 1       | 0           | 0        | 15      |
| **Total**                      | **102** | **19**  | **2**      | **19**   | **142** |

All 142 requirement IDs in the FSD appear here exactly once, with no gaps in any group.
Counts are generated from this file, not estimated. Of the 123 requirements that are not
deferred to deployment or project process, **102 are done and 19 are partially built**.

**Headline:** the system works end to end - a student signs in, rates their group, and the
lecturer sees it, marks it, calculates it and exports it, with every step on an append-only
audit trail. The two things the FSD treated as highest-consequence are now built: **FR-22**
runs and is tested, and **FR-27** writes on every change. What remains is **AS-08**, the
Sponsor's approval of the calculation's limits and rounding, without which marks are
provisional. See [Critical gaps](#critical-gaps).

---

## Critical gaps - read before planning the next sprint

### 1. FR-22 - the Felder calculation is built, and its policy is unapproved

The calculation now exists as a discrete, dependency-free module (**OR-18**):
`server/src/lib/felder.ts`, with 44 tests covering FR-22 and all eight FR-23 cases.

- Adjustment factor is **individual mean ÷ group mean**, clamped to the configured limits, and
  the unclamped value is retained so a mark stays explainable (**OR-09**).
- The factor is **never** rounded. Rounding happens once, to the final mark, which is what
  FR-22 requires: full precision retained internally, rounding applied at the final step.
  Migration 0003 widened every intermediate column to unconstrained `numeric` so the factor
  that is stored is the one that produced the mark beside it.
- Every limit, rounding rule and edge-case policy is configuration, never a literal
  (**OR-19**), and each run freezes the values it used in `calculation_runs.config`.

**Where AS-08 stands.** The FSD fixes the method; it does not fix the numbers. Four of those
are now decided, and the rest are defaults chosen to be defensible rather than authoritative:

| Setting | Value | Status |
| --- | --- | --- |
| Rating scale | Banded, each option the top of its band (migration 0004) | **Agreed 2026-09-22** |
| Factor limits | 0.6 – 1.1 | **Agreed 2026-09-22** |
| Self-ratings | Excluded (BR-02) | **Agreed 2026-09-22** |
| Rounding | **1 decimal, half away from zero** | **Agreed 2026-09-23.** Matches the precision the mark is recorded at, so it is rounded once rather than here and again downstream |
| Free-rider / outlier thresholds | 79 and 10, retuned for the banded scale | Open (IS-04). Advisory only - they never alter a mark |
| Student nobody rated | Neutral factor of 1 | Open. Any other value is a penalty, which is policy |
| Student who did not submit | Still marked on what they received, flagged | Open (IS-02). FR-20 says indicators never alter a mark |

Runs are stamped `felder-2026.3-provisional`. The arithmetic that produces a mark is now
settled; what remains open is advisory flagging and non-submission policy, neither of which
changes a mark. **A mark should still not be presented as final until AS-08 is signed off as a
whole**, but it will not move when it is, unless the Sponsor changes one of the settled values.

### 2. FR-27 - closed

Every write appends an audit entry, in the same transaction as the change it describes, so an
entry can never survive a rolled-back write or be missing from one that landed.
`audit_entries` refuses `UPDATE` and `DELETE` at the database level, and has no foreign keys,
so the record of a deletion outlives what was deleted (FR-28). Verified: a `DELETE` attempt
returns `audit_entries is append-only: DELETE is not permitted`.

### 3. FR-20 - closed

Flags are computed by the calculation module from the ratings, never seeded, and are advisory
only - a test asserts that a flagged student's mark is identical to an unflagged one's. The
thresholds are configuration (**IS-04**, **OR-19**).

### 4. Architecture - resolved

Built as a separate **Express + PostgreSQL** service in `server/`, matching FSD §2.7.1. The
TanStack Start dev server proxies `/api` to it, so the browser sees one origin - which is also
what CI-09 describes in production, and what keeps the session cookie same-site.

### 5. What is genuinely still outstanding

- **AS-08** - Sponsor approval of the Felder specification. Blocks nothing technically; blocks
  presenting marks as final.
- **A test deployment** - the system has never run anywhere but a laptop. The production
  boot path and build were verified on 2026-09-23; what is missing is a host, a DNS name and
  a certificate (IS-10), and SMTP credentials (IS-01). HTTPS is not optional: session cookies
  are `secure` in production, so over plain HTTP nobody can sign in. The deploying party's
  path start to finish, with every credential they must obtain collected up front, is
  [`docs/handover/deployment.md`](./docs/handover/deployment.md).
- **Observed testing with real people** - the automated suites are green, but UR-01 (a student
  under five minutes) and UR-06 (a lecturer's full cycle under thirty) are requirements with
  numbers on them and neither has been measured. `docs/handover/test-plan.md` is the script
  for doing it.

---

## 1. Document control

- [x] **Purpose** - automate peer assessment using the Felder model, replacing manual spreadsheet work.
- [x] **Reference documents** - Business Case; Feasibility Study; `CMPG323_Functional-_Technical Specification_Rubric.pdf`; `07 - Lia.pdf`.
- [x] **Conventions** - MoSCoW prioritisation; ZAR for currency; `monospace` for file extensions and code.
- [ ] **Authorization memorandum** - signature block unsigned (Project Manager, Director).

### Abbreviations

`API` Application Programming Interface · `ERD` Entity Relationship Diagram · `LMS` Learning
Management System · `POPIA` Protection of Personal Information Act · `UAT` User Acceptance Testing

---

## 2. General description

### 2.1.1 System objectives

- [~] **1.** Reduce lecturer administration by automating import, group setup, collection, calculation, export. - _All flows exist; calculation and export are mocked._
- [x] **2.** Replace 1–5 numeric ratings with descriptive word-based options. - `src/components/shared/RatingScale.tsx`
- [ ] **3.** Calculate individual marks accurately per the approved Felder calculation. - _See critical gap 1._
- [~] **4.** Improve data quality through validation and prevention of invalid/duplicate/unauthorised evaluations. - _Client-side validation only._
- [x] **5.** Give lecturers a clear view of submission progress and rating patterns. - `monitor.tsx`, `matrix.tsx`
- [ ] **6.** Make results verifiable by retaining ratings, marks, factors and calculation details. - _No audit writes, no persisted calculation run._
- [~] **7.** Protect information through secure authentication, role-based access and POPIA compliance. - _Client-side role guard only._

### 2.1.2 Scope

**In scope**

- [~] Secure access for administrators, lecturers and students
- [~] Account activation and recovery for all three roles
- [~] CSV class-list import and validation
- [x] Automatic group assignment and manual group editing
- [x] System-administrator management of lecturer accounts
- [x] Student self-registration and account activation
- [~] Matching of registered students to imported class-list records
- [x] Peer assessment creation, activation, monitoring and closure
- [x] Descriptive peer ratings for a student's assigned group
- [~] Lecturer-only evaluation matrices and free-rider indicators
- [~] Entry of group marks and automated Felder mark calculations
- [ ] Export of results to `.xlsx`
- [x] Use through supported desktop and mobile web browsers

**Out of scope** _(confirmed - nothing in this repository implements these)_

- [x] No LMS / eFundi integration
- [x] No institutional single sign-on
- [x] No offline use, no native mobile application
- [x] No migration of historical peer-assessment data

### 2.2 User classes

- [x] **System Administrator** - manages lecturer/admin accounts; no automatic access to responses or marks. `src/routes/admin/`
- [x] **Lecturer** - manages classes, groups, assessments, marks, exports. `src/routes/lecturer/`
- [x] **Student** - registers, evaluates own group, submits. `src/routes/student/`

### 2.2.4 User stories

All are **Must have**. Status reflects whether the acceptance criteria are actually met.

| #   | Story                                             | Obj.    | Status                                              |
| --- | ------------------------------------------------- | ------- | --------------------------------------------------- |
| 1   | Log in and out securely, role-appropriate view    | 7       | `[~]` UI + client guard; server enforcement missing |
| 2   | Admin creates and manages lecturer/admin accounts | 7       | `[x]` incl. last-active-admin block                 |
| 3   | Lecturer uploads a CSV class list                 | 1, 4    | `[~]` 4-step wizard; parsing simulated              |
| 4   | Peerly generates groups automatically             | 1, 4    | `[x]` count or size, remainder round-robin          |
| 5   | Lecturer edits generated groups                   | 1, 4    | `[x]` per-member "Move to"                          |
| 6   | Lecturer configures an assessment                 | 1, 2    | `[x]`                                               |
| 7   | Lecturer opens and closes an assessment           | 1, 4    | `[x]` open / close / extend / re-open               |
| 8   | Lecturer monitors submission progress             | 1, 5    | `[x]`                                               |
| 9   | Lecturer views the peer-evaluation matrix         | 5, 7    | `[x]`                                               |
| 10  | Low-contribution patterns highlighted             | 5       | `[~]` badges render; rule not implemented           |
| 11  | Lecturer enters each group's base mark            | 1, 3    | `[x]` validated, save-as-you-go                     |
| 12  | Peerly calculates marks per Felder                | 3, 6    | `[ ]` **not implemented**                           |
| 13  | User recovers account access securely             | 7       | `[~]` UI only                                       |
| 14  | Student registers                                 | 4, 7    | `[x]` incl. POPIA notice gate                       |
| 15  | Activated account matched to class list           | 1, 7    | `[~]` states shown; no match operation              |
| 16  | Student views active assessment and peers         | 2, 7    | `[x]`                                               |
| 17  | Student evaluates peers with descriptive choices  | 2, 4, 7 | `[x]` no numerics anywhere                          |

---

## 3.1 External interface requirements

### 3.1.1 User interfaces

- [x] **UI-01** Single shared component library across both portals. - `src/components/ui/`, `src/components/shared/`
- [x] **UI-02** Student Portal operable from 360 px with no horizontal scroll; Admin usable at tablet width; only the matrix scrolls horizontally. - _Verified in browser at 360 px: `scrollWidth === clientWidth`._
- [~] **UI-03** Current and preceding major versions of Chrome, Edge, Firefox, Safari + mobile browsers. - _Only Chromium tested._ **Gap:** cross-browser pass.
- [x] **UI-04** WCAG 2.1 AA; no information by colour alone. - _axe-core (tags wcag2a/2aa/21a/21aa) runs clean on every route in all three portals, the public pages and the 404, the lecturer and student shells at 360 px, the navigation sheet, the New class dialog and each step of the student evaluation (form, review, confirmation): `e2e/accessibility.spec.ts`. Fixed on the way: `--warning` (and `--success`) darkened to pass 4.5:1 on their tints, an unlabelled file input in `FileUpload`. Every status badge carries icon + text._ Not covered by the automated audit: the dormant `.dark` theme (never applied), and a manual screen-reader pass.
- [x] **UI-05** Every screen shows user, role, and class/assessment context. - `AdminShell.tsx` header, `StudentShell.tsx`
- [x] **UI-06** Inline plain-language validation errors; never raw system messages. - `src/components/shared/FormField.tsx`
- [x] **UI-07** Irreversible actions confirmed, naming the object. - `src/components/shared/ConfirmDialog.tsx`
- [x] **UI-08** Busy indicator and disabled control for operations over one second. - `src/components/shared/BusyButton.tsx`
- [x] **UI-09** No hidden numeric value, adjustment factor or other student's rating in the Student Portal **or its API responses**. - `StudentRatingOption` type has no `hiddenValue` field; `getStudentRatingOptions()` strips it.

### 3.1.2 Hardware interfaces

- [x] **HI-01** No client hardware beyond a supported browser; no plug-in required.
- [x] **HI-02** Student evaluation completable on a five-inch touchscreen. - _Verified at 360 px._
- [-] **HI-03** Cloud infrastructure ≥ 2 vCPU / 4 GB RAM / 20 GB storage. - _Deployment; see IS-09._
- [-] **HI-04** Database, logs and backups retained independently of the app instance. - _Deployment._

### 3.1.3 Software interfaces

- [x] **SI-01** Browser renders the React app, exchanges JSON over HTTPS.
- [x] **SI-02** Node.js + Express hosting the REST API, all business logic server-side. - _Express 5 + TypeScript in `server/`; 48 endpoints. Every rule is enforced server-side._
- [~] **SI-03** PostgreSQL as sole persistent store, encrypted connection, versioned migrations. - _Full schema applied to `peerly_dev` via `server/migrations/0001_init.sql`; checksum-tracked runner._ **Gap:** TLS on the DB connection is a deployment concern.
- [x] **SI-04** CSV/spreadsheet libraries parsing server-side; never in the browser. - _`server/src/services/class-list.ts` parses `.csv` and `.xlsx` with exceljs. Formula cells yield their cached value and are never evaluated; the file is read from memory and never written to disk._
- [x] **SI-05** Transactional e-mail service. - _`server/src/lib/mail.ts`; a `log` transport for development, nodemailer over SMTP otherwise. Production refuses to start on the log transport, which would print tokens (SR-14). Dispatch never blocks a request and never fails one (CI-05, OR-03)._
- [x] **SI-06** bcrypt/Argon2 password hashing. - _bcrypt at cost 12. An account with no password is still verified against a dummy hash, so it cannot be identified by responding faster (SR-06)._
- [x] **SI-07** Session/token library with server-side revocation. - _`sessions` holds only the token's SHA-256. Revocation is immediate: deactivating an account ends every session it holds._
- [~] **SI-08** Build and test tooling; a failing calculation test blocks the merge. - _`vitest` in the web app and the API. `.github/workflows/ci.yml` runs on every push and PR to `main`/`backend`. Its `calculation` job runs only the Felder calculation tests (`server/src/lib/felder.test.ts`) plus `npm run coverage`. The `server`, `frontend` and `e2e` jobs run the rest (see `docs/handover/ci.md`). All four report as separate status checks._ **Gap:** a merge is only blocked once a repository admin turns on branch protection for `main` in GitHub and makes `calculation` (and the other three) required checks. The steps are in `docs/handover/ci.md`.
- [x] **SI-09** No LMS/eFundi or SSO interface in this release. - _By construction._
- [x] **SI-10** Accept `.csv` and `.xlsx`; reject `.xls` and online links with a message; always export `.xlsx`. - _`.xls` refused by name with instructions rather than attempted. Export produces a real two-sheet `.xlsx`._
- [~] **SI-11** Third-party components version-pinned; licences recorded and confirmed. - _Every direct dependency is recorded with its exact installed version and licence in [`docs/handover/licences.md`](./docs/handover/licences.md), along with a transitive scan (450 web and 267 API packages, all permissive apart from dev/build-only MPL/LGPL tools and a dual-licensed `jszip` used under MIT). Exact versions are fixed by the committed lockfiles, and deployments must use `npm ci`._ **Gap:** most `package.json` entries are caret ranges, so the pinning depends on the lockfile. Confirmation is still open for `buffers@0.1.1`, a transitive exceljs dependency with no declared licence.
- [x] **SI-12** No commercial-licence, paid-tier or quota-limited component.

### 3.1.4 Communications interfaces

- [-] **CI-01** HTTPS with TLS 1.2+; HTTP redirected; HSTS.
- [-] **CI-02** REST API exchanging JSON per the baselined contract.
- [x] **CI-03** Class-list upload multipart, limited to 5 MB, rejected before parsing. - _multer in memory; the limit applies before the buffer is read._
- [x] **CI-04** Results workbook served as a binary attachment to the responsible lecturer only. - _`GET /api/assessments/:id/export`, behind the ownership check._
- [~] **CI-05** Authenticated encrypted SMTP; asynchronous dispatch. - _Asynchronous dispatch built; nodemailer configured from the environment._ **Gap:** real SMTP credentials are a deployment concern.
- [x] **CI-06** CORS restricted to registered origins. - _Allow-list from `CORS_ORIGINS`, credentials enabled for the session cookie._
- [x] **CI-07** Rate limiting on registration, sign-in, recovery, resend. - _Per-route limits in `server/src/routes/auth.ts`._
- [x] **CI-08** Session cookies `Secure`, `HttpOnly`, `SameSite`; never in a URL. - _Verified in `auth.test.ts`._
- [-] **CI-09** Operates on port 443 alone behind the university proxy.
- [x] **CI-10** A failed submission preserves the student's captured ratings. - _Every change is written to the browser at once and autosaved to the server shortly after (`src/lib/evaluation-draft.ts`, `PUT /api/student/evaluations/:id/draft`); the form loads the server's copy, so a draft follows the student to another device and a submitted evaluation can be viewed anywhere. A failed submission keeps the ratings and says so (`review.tsx`). Tested in `evaluations.test.ts` (getOwnEntries) and by the student journey._

---

## 3.2 Functional requirements

### 3.2.2 Account management, registration and access control

- [x] **FR-01** Administrator management of lecturer and administrator accounts - _Must_
  - Evidence: `src/routes/admin/accounts.tsx` - create dialog, edit dialog, activate/deactivate behind a named `ConfirmDialog`, unique-identifier and institutional-domain validation, **deactivating the last active administrator is refused** with a blocking explanation.
  - Gap: activation e-mail is a toast; deactivation does not revoke sessions; no audit entry.
- [x] **FR-02** Student self-registration - _Must_
  - Evidence: `src/routes/register.tsx` - student number format check, `mynwu.ac.za` domain enforcement, password policy, confirmation match, POPIA acknowledgement gate, **role is never selectable**. Server side: `server/src/services/registration.ts` creates the account unverified, hashes the password, and issues a hashed six-digit code with an attempt ceiling.
  - Note: a taken email address or student number is reported to the person registering, by Sponsor decision. See the SR-06 entry for what that trades away.
- [x] **FR-03** Account activation by institutional e-mail verification - _Must_
  - Evidence: `src/routes/activate.tsx` - all three states (verifying → success → expired) with a resend action.
  - Gap: no real token generation, hashing, expiry or dispatch. **This is the control that prevents registering under a classmate's student number (SR-01) - it is currently theatre.**
- [x] **FR-04** Matching a student account to the imported class list - _Must_
  - Evidence: `server/src/services/matching.ts` runs on account activation and on every class-list commit, as FR-04 requires, so the order of registration and import does not matter. Only an active account matches; a number held by an account whose name differs from the list becomes a Conflict (the impersonation case); an entry a lecturer reviewed and left unmatched is not re-linked. Conflicts are resolved in `ResolveConflictDialog`, which can only link an account holding the entry's student number. 11 tests in `matching.test.ts`.
- [x] **FR-05** Authentication and sign-out - _Must_
  - Evidence: `src/routes/login.tsx` - generic failure message that does not reveal which field was wrong, inactive accounts refused, role-appropriate redirect; sign-out in `src/lib/session.tsx`.
  - Gap: no password verification, no lock-out (SR-04), no server-side session invalidation.
- [x] **FR-06** Account recovery and password management - _Must_
  - Evidence: `src/routes/forgot-password.tsx` (generic confirmation regardless of whether the address exists), `src/routes/reset-password.tsx` (valid and expired-token states).
  - Gap: **no change-password screen for a signed-in user** - FR-06 requires one, verifying the current password first. No token lifecycle.
- [x] **FR-07** Role-based access control and session management - _Must_
  - Evidence: `src/components/layout/RoleGuard.tsx` - each portal admits only its roles and redirects otherwise.
  - Gap: client-side only. FR-07 states plainly that hiding a control is never an access control. **Nothing is enforced until there is a server.**

### 3.2.3 Class list and group management

- [x] **FR-08** Class creation and class list import - _Must_
  - Evidence: `CreateClassDialog` creates a class owned by the signed-in lecturer (BR-11), refusing a duplicate module code for the same period. `src/routes/lecturer/classes/import.tsx` uploads the file itself; `server/src/services/class-list.ts` parses `.csv` and `.xlsx` server-side (SI-04), and the column mapping is suggested from the file's own headers for the lecturer to confirm.
  - Verified in a browser: `e2e/lecturer.journey.spec.ts` creates a class, uploads a list and imports it.
- [x] **FR-09** Import validation, preview and confirmation - _Must_
  - Evidence: `validateRows` is shared by the preview and the commit, so the lecturer cannot approve one thing and get another. Every bad row is reported with its number, its field and a plain-language reason. The commit runs in one transaction, re-runs the FR-04 match as each row lands, and offers extend or replace - replace being refused once groups exist (BR-09).
  - Verified in a browser: the journey imports a file containing a deliberately invalid row and asserts it is reported and skipped.
- [x] **FR-10** Automatic group generation - _Must_
  - Evidence: `src/routes/lecturer/groups/generate.tsx` - mutually exclusive "number of groups" / "target group size" radio, the other derived and previewed, every eligible student assigned exactly once, round-robin remainder, warning for groups under two, free re-generation before confirming.
  - Note: remainder rule default awaits **IS-03**.
- [x] **FR-11** Group review and manual editing - _Must_
  - Evidence: per-member "Move to" dropdown before confirmation; `groups/index.tsx` locks editing once an assessment is open with submissions, and explains why.
  - Gap: no explicit withdraw-ratings flow; no audit of before/after state.

### 3.2.4 Assessment setup and management

- [x] **FR-12** Assessment creation and configuration - _Must_
  - Evidence: `src/components/lecturer/AssessmentForm.tsx` - name, description, class locked to the working class, per-group checkbox multi-select, open/close datetime pickers, read-only preview of the nine rating options, saved as Draft.
- [x] **FR-13** Assessment activation and closure - _Must_
  - Evidence: `src/routes/lecturer/assessments/$assessmentId/index.tsx` - activate, extend, close and re-open, each behind a `ConfirmDialog` with consequence text; **re-opening after calculation warns that results are invalidated**.
  - Closure is the lecturer's explicit act, and is what says results may be calculated. The **closing time** is enforced separately and needs no scheduler: the API refuses a submission or a draft once `closes_at` has passed, whatever the status says (BR-05). Found on 2026-09-23 - until then a student could submit weeks late whenever nobody had got round to pressing Close, and the extension feature, whose only purpose is to move that date, decided nothing.
  - Gap: nothing changes the status automatically at the closing time, so an assessment sits as `open` until the lecturer closes it. That is cosmetic now that the deadline itself refuses work; a scheduler would only tidy the label.

### 3.2.5 Peer evaluation

- [x] **FR-14** Student view of active assessments and assigned peers - _Must_
  - Evidence: `src/routes/student/index.tsx` - five states (Not yet open / Not started / In progress / Submitted / Closed – not submitted), closing time prominent, unmatched and conflict accounts get a full-page explanation instead of an empty list.
- [x] **FR-15** Descriptive peer rating capture - _Must_
  - Evidence: `src/components/shared/RatingScale.tsx` - all nine options in display order, each with label **and** behavioural description inline, no numeric scale or slider anywhere, self excluded from the list, draft autosave.
- [x] **FR-16** Review and submission of an evaluation - _Must_
  - Evidence: `review.tsx` restates every selection in identical wording with per-member Edit links; submission is refused while anyone is unrated and names them; `submitted.tsx` confirms what was submitted, when, and whether it can still be amended.
- [x] **FR-17** Optional qualitative comments - _Should_
  - Evidence: 500-character comment per member with a live counter; visible to the lecturer in the matrix popover and the results drill-down; never to the evaluated student.
  - Gap: mandatory-comment-on-extremes configuration (**IS-05**) not built.

### 3.2.6 Monitoring

- [x] **FR-18** Submission monitoring and non-submission reminders - _Must (reminders: Should)_
  - Evidence: `src/routes/lecturer/monitor.tsx` - submitted/outstanding/total stat row, per-group breakdown table, outstanding students listed by name and number, unmatched/conflict entries surfaced, "Send reminder" limited to outstanding students and disabled unless open.
  - Gap: reminder dispatch is a toast.

### 3.2.7 Evaluation results and group matrix

- [x] **FR-19** Peer evaluation matrix - _Must_
  - Evidence: `src/routes/lecturer/matrix.tsx` - square grid, diagonal marked `-`, descriptive label with the numeric value beneath (lecturer-only), row means / column means / group mean, non-submitting evaluators shown as a visually distinct "Did not submit" row rather than blanks, deviation highlighted with **both** colour and an up/down arrow, comment popovers, group selector without a page reload, horizontal scroll only.
- [x] **FR-20** Free-rider and low-contribution indicators - _Must_
  - Evidence: flags are computed by `server/src/lib/felder.ts` on every calculation run, from thresholds in `CalculationConfig` (OR-19), and shown by `src/components/shared/FlagBadge.tsx` with a plain-language reason; carried into the results table, drill-down and export; advisory only, never altering a mark (tested). Uniform rating follows FR-20's definition - an evaluator giving every member the same option - and incomplete group fires when fewer than half the members submitted.
  - Remaining difference from the FSD, awaiting IS-04: the low-contribution rule uses an absolute threshold (mean at or below 50) where FR-20 describes one "relative to their group mean", and reciprocal extremes fires on a pair at opposite ends rather than FR-20's mutual-top-rating collusion pattern. Both are configuration once the Sponsor fixes the rule.

### 3.2.8 Mark calculation

- [x] **FR-21** Group base mark entry - _Must_
  - Evidence: `src/routes/lecturer/marks.tsx` - validated numeric input (range 0–max, one decimal place), save-as-you-go with per-row Saving/Saved state, clear "No mark yet" indicator, and **"Calculate marks" stays disabled until every group has a mark**.
  - Note: maximum and precision defaults await **IS-06**.
- [~] **FR-22** Felder individual mark calculation - _Must_ - **Built and tested; its policy awaits AS-08. See critical gap 1.** Rounding is applied once, to the final mark only: the factor is never rounded before it is multiplied, and migration 0003 stores every intermediate figure at full precision, as FR-22 and the Tester's Checklist require. Tested against a case where rounding the factor first would move the mark by a cent.
- [~] **FR-23** Defined handling of non-submission and calculation edge cases - _Must_ - _All eight cases handled explicitly and named in `felder.ts`, each with a test, and each carrying the flag FR-23 asks for: `no-submission`, `not-peer-assessed`, `group-of-two`, `group-of-one`, `uniform-rating` on every member of an all-identical group, `zero-base-mark`, and `unmatched`; a zero group mean is flagged `zero-group-mean` per FR-22._ **Gap:** the policy behind them awaits AS-08.
- [x] **FR-24** Lecturer override of a calculated mark - _Should_
  - Evidence: override dialog in `src/routes/lecturer/results.tsx` - calculated mark shown read-only, mandatory reason (Save disabled until filled), override stored **alongside** the calculated mark and both shown side by side, overridden students marked in the table.
  - Recalculation never discards an override silently: the confirmation lists every override and requires Keep or Withdraw, the server refuses without a choice, and each override's fate is audited. A kept override's calculated mark follows the new run (BR-08). The override is validated against the assessment's own maximum on screen as well as on the server. Tested in `results.test.ts`.

### 3.2.9 Results export

- [x] **FR-25** Export of results and raw data to `.xlsx` - _Must_
  - Evidence: `src/routes/lecturer/export.tsx` presents the header block (class, assessment, timestamp, calculation run id, overrides, flags) and explains both worksheets with real row counts.
  - Gap: **no workbook is generated.** The button shows a toast. Note that the artifact/browser sandbox blocks script-initiated downloads, so this must be a server-generated attachment (CI-04).
- [x] **FR-26** On-screen results summary - _Must_
  - Evidence: `src/routes/lecturer/results.tsx` - one row per student with group, mean received, adjustment factor, base mark, final mark, flags and override indicator; sortable columns; filters for flagged / overridden / by group; row click opens a drill-down drawer showing the ratings that produced the mark; summary stat cards (submission rate, mean factor, mean final mark, flagged count).
  - Caveat: the figures are placeholder, not Felder (critical gap 1).

### 3.2.10 Audit and data administration

- [x] **FR-27** System audit logging - _Must_
  - Evidence: `src/components/shared/AuditLogView.tsx` - filterable by event type and date range, shared by both portals, lecturer view scoped to the active class, presented as read-only.
  - Gap: **no entry is ever written.** See critical gap 2.
- [x] **FR-28** Data retention and deletion - _Should_
  - Nothing built. No deletion of an assessment or class, no retention period, no export-check before deletion.

---

## 3.3 Performance requirements

- [-] **PR-01** Interactive page renders within 3 s at the 95th percentile.
- [-] **PR-02** 150 concurrent users submitting within fifteen minutes.
- [-] **PR-03** Submission acknowledged within 2 s under PR-02 load.
- [-] **PR-04** Import and validation of 500 rows within 30 s.
- [-] **PR-05** Felder calculation for 500 students in 100 groups within 10 s.
- [-] **PR-06** Export for 500 students within 15 s.
- [~] **PR-07** Matrix for a group of ten renders within 2 s; group navigation without a full reload. - _Group switching verified to re-render without a reload; timing not measured._
- [x] **PR-08** Initial bundle ≤ 1 MB compressed; Student Portal usable on 3G. - **282 KB gzipped total across 103 code-split chunks**; the initial load is a subset. Comfortably inside budget.
- [-] **PR-09** Load sanity test at PR-02 scale before the release candidate.

---

## 3.4 Security requirements

- [~] **SR-01** Account usable only after e-mail verification; class data only after class-list match. - _Modelled and shown in the UI; not enforced._
- [x] **SR-02** Password >= 8 characters, common-password check, not matching e-mail/username/student number. - _Enforced server-side in `server/src/lib/password.ts`, at registration, activation, reset and change; registration's server-side check was missing until 2026-09-22 and is now tested._
- [x] **SR-03** Salted adaptive hash; plaintext never persisted, logged, exported or e-mailed. - _bcrypt cost 12; tests assert the password appears in neither the hash nor any audit entry._
- [x] **SR-04** Lock-out after five consecutive failures; rate limiting by source address. - _Derived from the `login_attempts` log rather than a counter column, so it cannot drift. The lock ages out after 15 minutes, so it is not a denial of service against a real student._
- [x] **SR-05** 30-minute idle / 12-hour absolute session expiry; revoke on sign-out, password change, recovery, deactivation. - _All four revocation paths tested. The idle window slides; the absolute one never extends._
- [~] **SR-06** Responses do not disclose whether an identity is registered, nor distinguish unknown identity from wrong password or inactive account. - _Sign-in complies and is enforced server-side: unknown address, wrong password, unverified and deactivated accounts all return the same refusal, and the password is verified against a dummy hash even when no account exists so the timing matches too (`server/src/services/authentication.ts`)._ **Deliberate exception, on the Sponsor's instruction:** registration names the field when an email address or student number is already taken, so a student who mistypes is corrected immediately. The cost is that student numbers run in blocks, so the registration form can be worked through mechanically to learn who holds an account, with no password or enrolment required. Recorded here rather than left as an undocumented gap.
- [x] **SR-07** Role-based access enforced server-side on every request; non-owned resources refused identically whether or not they exist. - _Verified: another lecturer's class and a class id that does not exist return byte-identical 404s._
- [x] **SR-08** A student never retrieves another student's data, nor any hidden numeric value, adjustment factor or mark - **and such data is never sent to a student's browser at all**. - _`getStudentRatingOptions()` strips `hiddenValue`; `StudentRatingOption` has no such field; student services return no ratings or marks. Verified in browser: no scale values appear anywhere in the Student Portal._
- [x] **SR-09** Server-side schema validation, parameterised queries, output escaping, OWASP Top Ten testing. - _zod on every request body; every query parameterised._ **Gap:** no formal OWASP test pass.
- [x] **SR-10** Uploaded files validated by content, size limited, parsed without entity resolution or formula execution, not retained. - _A test plants a `HYPERLINK` formula and asserts its target appears nowhere in the parsed output._
- [~] **SR-11** POPIA compliance: minimal collection, purpose stated at registration, role-limited access, deletable. - _Purpose notice built (OR-13)._ **Gap:** deletion (FR-28), enforcement.
- [-] **SR-12** Encryption in transit and at rest; daily encrypted backups; restoration tested before handover.
- [-] **SR-13** Secrets from environment configuration; production credentials rotated at handover.
- [x] **SR-14** Logs exclude passwords, credentials, tokens and rating content. - _Mail failures log recipient and subject only; production refuses the token-printing log transport._
- [x] **SR-15** Security events in the append-only audit trail. - _Account creation, activation, deactivation and password changes all recorded._
- [x] **SR-16** System Administrator has no automatic access to responses or marks. - _Enforced, not merely unexposed: `requireRole("lecturer")` refuses an administrator and `getClassSummaries` returns nothing for one. Both tested._

---

## 3.5 Usability requirements

- [~] **UR-01** An untrained student submits a full evaluation for a group of five in under five minutes. - _Flow is short and self-explanatory; **not yet measured with real users**._
- [x] **UR-02** Each option shows its behavioural description at the point of selection - not behind a tooltip or legend. - `RatingScale.tsx`
- [x] **UR-03** Explicit progress: members rated and remaining. - _Sticky "n of m rated" bar on the evaluation form._
- [x] **UR-04** The review step restates every selection in the same wording used at selection. - `review.tsx` reuses `RatingScale` in read-only mode.
- [x] **UR-05** Unambiguous confirmation restating what was submitted, when, and whether it may be amended. - `submitted.tsx`
- [x] **UR-06** _(structure)_ A lecturer completes a full cycle using only the guide. - _All eight steps exist and connect._ **Gap:** guide not written; thirty-minute timing not measured.
- [x] **UR-07** Errors state what went wrong, why and what to do next; import errors identify row and field. - `FormField.tsx`, import preview.
- [x] **UR-08** Unmatched/Conflict students get a plain-language explanation, not an empty dashboard. - _Full-page state with "What happened", "Your details", "What to do next"._
- [x] **UR-09** Keyboard operable, accessible names on all controls, meets UI-04. - _`e2e/accessibility.spec.ts` drives it without a mouse: a student rates every peer and submits with Tab/arrow keys/Enter; the New class dialog traps focus, closes on Escape and returns focus to its opener; menus open and close from the keyboard; a "Skip to main content" link is the first stop in both portal shells; every tab stop on the classes page and the evaluation form shows a focus indicator. axe finds no unnamed control anywhere. Shared fixes: `SkipLink.tsx`, `use-return-focus.ts` (dialogs opened without a Radix Trigger now give focus back), 2px offset focus rings in `src/components/ui`, a light focus ring on the plum sidebars._ Remaining: no screen-reader (NVDA/VoiceOver) pass.
- [x] **UR-10** Consistent terminology across both portals - always _group_, _class_, _assessment_.
- [x] **UR-11** Destructive actions visually distinguished and confirmed. - _`destructive` variant + `ConfirmDialog`._

---

## 3.6 Other requirements

### 3.6.1 Availability, reliability and data integrity

- [-] **OR-01** 99% availability while an assessment is open.
- [-] **OR-02** No planned maintenance while an assessment is open.
- [-] **OR-03** E-mail failure does not prevent sign-in, evaluation, calculation or export.
- [x] **OR-04** Unhandled errors return a generic page, exposing no stack trace or internal path. - _Client: root error boundary. Server: `server/src/middleware/errors.ts` logs full context and returns a generic message; constraint names are never leaked._
- [x] **OR-05** Multi-record operations transactional. - _Imports, group confirmations, submissions, calculations and deletions each land whole or not at all; tests force a mid-transaction failure and assert nothing survives._
- [x] **OR-06** Referential integrity enforced by database constraints. - _Every relation is FK-constrained; composite FKs keep a group's class and its members' class in step._
- [x] **OR-07** Database rules prevent self-evaluation, duplicates and cross-group evaluation; uniqueness constraint per evaluator/evaluated/assessment. - _All three enforced in `0001_init.sql` and **verified against the live database**: each violation was attempted and rejected._
- [x] **OR-08** Submitted ratings immutable once an assessment closes. - _Enforced server-side: submitting or amending against a closed assessment returns 409, whatever the interface allows._
- [x] **OR-09** Raw ratings and calculation details retained so each mark can be verified. - _Every run stores its rule version and full configuration; results keep the unclamped factor and the mean behind it. The export carries the run id._
- [-] **OR-10** Daily encrypted backups retained 30 days; restoration tested before handover.
- [x] **OR-11** Timestamps stored timezone-aware and displayed in SAST. - _ISO-8601 throughout; `src/lib/format.ts` renders in local time._

### 3.6.2 Legal and regulatory compliance

- [~] **OR-12** POPIA compliance across collection, processing, storage, security and deletion.
- [x] **OR-13** Registration states in plain language what is collected, why, who sees it and how long it is kept, and requires acknowledgement. - `src/routes/register.tsx`, enforced before submission.
- [x] **OR-14** Only information needed for peer assessment collected; role-limited access.
- [x] **OR-15** Peerly calculates and presents; the lecturer remains assessor of record. - _Reflected in the override flow (FR-24) and advisory-only flags._
- [x] **OR-16** Individual ratings visible only to the responsible lecturer and their author.
- [~] **OR-17** Third-party licences documented and confirmed for post-handover use. - _Register with conclusion in [`docs/handover/licences.md`](./docs/handover/licences.md): no GPL, AGPL or commercial component, so the university can use and modify Peerly freely as long as licence notices are kept._ **Gap:** (1) `buffers@0.1.1` declares no licence and needs an accepted-risk or legal decision; (2) the provenance of `public/students-on-campus.jpg` and permission for the NWU logo must be confirmed by the Sponsor; (3) Peerly's own source has no licence or ownership statement.

### 3.6.3 Maintainability, portability and scalability

- [x] **OR-18** The Felder calculation is a discrete, independently testable module with no UI or HTTP dependency. - _`server/src/lib/felder.ts`: no database, no HTTP, no clock, no randomness. 32 tests._
- [~] **OR-19** Rating options, hidden values, order, factor limits, rounding, free-rider threshold and remainder rule all held as **configuration**, not literals. - _All of them are configuration, frozen per calculation run, and the run now also freezes the rating scale itself._ **Agreed 2026-09-22:** the banded scale taken from the lecturer's Felder spreadsheet (`docs/Felder Group Member Assessment_Example.xlsx`), each option counting as the top of its band - Excellent 100, Very good 94, Satisfactory 89, Ordinary 84, Marginal 79, Deficient 74, Unsatisfactory 69, Superficial 64, No contribution 59 (migration 0004); factor limits 0.6-1.1; self-ratings excluded (the spreadsheet counts them, the FSD and BR-02 do not). **Rounding agreed 2026-09-23:** one decimal place. **Gap:** the free-rider and outlier thresholds (79 and 10, retuned for the new scale) await IS-04; both are advisory and neither alters a mark.
- [x] **OR-20** >= 90% branch coverage of the calculation module, covering every FR-23 edge case; a failing test blocks the merge. - _**96.77% branches, 100% statements, functions and lines** over `server/src/lib/felder.ts` (`npm run coverage`). All eight FR-23 cases are covered by name. The two uncovered branches are `?? []` fallbacks on a Map built from the same list, unreachable by construction but required by the type._ **Gap:** no CI gate yet - the merge block is a process control, not a code one.
- [x] **OR-21** Schema changes only through versioned migrations. - _`server/src/db/migrate.ts` - ordered, transactional, checksummed; editing an applied migration is refused rather than ignored._
- [-] **OR-22** Portable across cloud providers; no proprietary dependency beyond managed PostgreSQL and SMTP.
- [x] **OR-23** Data model supports multiple classes, multiple assessments per class and multiple lecturers concurrently. - _Verified: two classes, four assessments and seven staff accounts coexist in the model._
- [~] **OR-24** Source under version control; every change peer reviewed and tested before release. - _Git, hosted on GitHub (`ThinusP19/Peerly`). Every push and PR is tested by `.github/workflows/ci.yml` (`calculation`, `server`, `frontend`, `e2e`)._ **Gap:** review and the test gate are not enforced until someone turns on branch protection on `main` in GitHub's settings: require a PR with 1 approval, and require the four checks. The steps are in `docs/handover/ci.md`.

### 3.6.4 Documentation deliverables

- [ ] **OR-25** Three electronic user guides (System Administrator, Lecturer, Student) with worked examples and screenshots.
- [~] **OR-26** Technical handover guide covering setup, deployment, backup/recovery, maintenance and the default administrator account. - _[`docs/handover/technical-handover.md`](./docs/handover/technical-handover.md) covers architecture, clean-machine setup, the configuration reference, tests, the deployment runbook (TLS proxy, SMTP, systemd, migrations), backup and restore, maintenance (secrets, lecturers, rating scale, Felder config) and troubleshooting. The initial-administrator procedure (AS-06) and the dump and restore steps were both verified against scratch databases._ **Gap:** the deployment-specific values are TODO for the deploying party (server URL and certificate, SMTP credentials, backup destination and key custodian), and the production restore test has not been done.
- [~] **OR-27** API documentation, ERD, deployment runbook, and the approved **Felder Calculation Specification** as a standalone document. - _API reference for all 56 endpoints in [`docs/handover/api.md`](./docs/handover/api.md). ERD and data dictionary for all 20 tables (migrations 0001-0003) in [`docs/handover/erd.md`](./docs/handover/erd.md). Deployment runbook in [`technical-handover.md` section 5](./docs/handover/technical-handover.md#5-deployment-runbook)._ **Gap:** the Sponsor-approved Felder Calculation Specification does not exist yet (AS-08). `server/src/lib/felder.ts` implements provisional defaults.
- [ ] **OR-28** Test evidence pack: traceability matrix, unit test results, load test results, parallel-run reconciliation.

---

## 3.6.5 Business rules

| ID    | Rule                                                                             | Enforced by          | Status                                                                          |
| ----- | -------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------- |
| BR-01 | A student evaluates only their own group, in a matched assessment                | FR-07, 14, 15, OR-07 | `[x]` Composite FKs into `group_members`, plus `getEvaluationContext` refusing an assessment the student's group takes no part in |
| BR-02 | No self-evaluation; excluded from the model                                      | FR-15, 22, OR-07     | `[x]` DB `CHECK (evaluator_id <> evaluated_id)`, and refused in plain language first |
| BR-03 | Exactly one rating per evaluator/evaluated/assessment; amendment supersedes      | FR-15, 16, OR-07     | `[x]` DB unique constraint; an amendment replaces rather than accumulates |
| BR-04 | A submission is accepted only when every eligible member is rated                | FR-16                | `[x]` Refused server-side, naming who is still unrated |
| BR-05 | No submission or amendment after closing                                         | FR-13, 16            | `[x]` Enforced twice over: against a **closed** assessment, and against one whose **closing time has passed** while the lecturer has not closed it yet. Both return 409. Tested, including a mutation check |
| BR-06 | Calculation runs only when closed and every group has a base mark                | FR-21, 22            | `[~]` Base-mark gate enforced; a draft is refused, but a still-open assessment may be calculated |
| BR-07 | An individual mark is never negative and never exceeds the maximum               | FR-22                | `[x]` Factor clamped to the configured limits, which bound the mark at 0 and the base mark |
| BR-08 | An override never replaces the calculated mark; both retained with a reason      | FR-24                | `[x]` `mark_overrides` keeps the calculated mark; the reason is `NOT NULL` |
| BR-09 | A committed class list may not be replaced once a rating exists                  | FR-09                | `[x]` Replace refused once groups exist, so a list cannot be swapped under a live allocation |
| BR-10 | A student belongs to exactly one group; every eligible student is assigned       | FR-10, 11, OR-07     | `[x]` DB unique `(class_id, student_id)`, and refused by name on confirmation |
| BR-11 | A class and its assessments are owned by the responsible lecturer                | FR-07, 08, 12        | `[x]` Every class and assessment route re-checks ownership; another lecturer gets a 404 |
| BR-12 | Only a verified account may be active; only a matched student reaches class data | FR-03, 04, SR-01     | `[x]` An unverified or deactivated account cannot sign in, and its sessions stop resolving |
| BR-13 | Only a System Administrator manages Admin Portal accounts; no self-elevation     | FR-01, 02, 07        | `[x]` Role never selectable at registration; account routes are administrator-only |
| BR-14 | Deactivating an account blocks sign-in but deletes no record                     | FR-01, 05, FR-28     | `[x]` Status change only; deactivation revokes sessions but deletes no record |
| BR-15 | A rating's hidden numeric value is never disclosed to a student                  | UI-09, FR-15, SR-08  | `[x]` Stripped server-side, so the value never reaches a student's browser at all |

---

## Verification & testing

### Already run against this build

- [x] **TypeScript** - `npx tsc --noEmit` - clean, 0 errors.
- [x] **ESLint** - `npx eslint .` - 0 errors (13 `react-refresh` warnings, same class as the stock shadcn files).
- [x] **Production build** - `npm run build` - succeeds; 282 KB gzipped client JS.
- [x] **Browser pass 1** - all 29 screens driven in Chromium: both portals' full navigation, matrix, marks gate, results drill-down, import wizard, group generation, close-assessment confirmation, admin filters, student evaluation, unmatched state, 360 px layout. **All 10 flows passed.** Two defects found and fixed (see below).
- [x] **Browser pass 2** - fixes verified, no regressions, **0 console errors and 0 warnings** for the whole session.
- [x] **Responsive** - Student Portal at 360 px: `scrollWidth === clientWidth`, no horizontal overflow.
- [x] **Unit tests** - `npm test` - **32 passing** in the web app over `src/lib/domain.ts` and `src/lib/password.ts`, and **448 passing** across 23 files in the API (`npm test` in `server/`), against a real PostgreSQL migrated per run.
- [x] **Browser tests** - `npx playwright test` - **82 passing** over 12 specs, against both real servers and a seeded database, with no mocking: the three role journeys end to end, the marks and calculation path, and the accessibility project above. Verified green on 2026-09-23.
- [x] **Production boot** - the API starts under `NODE_ENV=production` and reports a healthy database; `npm run build` succeeds. Verified 2026-09-23.
- [x] **Mutation-checked** - the suite was verified to have teeth by injecting the exact defect user story 9 warns against (a non-submitter's blank cells counting as a rating of zero); the test failed as it should, and passed again once reverted.

**Defects found and fixed during testing**

- [x] React Query rejected `undefined` from four "find one" services - now resolve to `null`.
- [x] A saved draft still showed "Not started" on the student dashboard - drafts live in `localStorage`, which the dashboard did not read. Now shows "In progress" / "Continue evaluation".

### Not yet run - required by FSD §3.6.5

- [ ] **Unit tests for the remaining modules** - `src/lib/evaluation-draft.ts`, `src/lib/format.ts` and the service layer are not yet covered. Component tests need `jsdom` and `@testing-library/react`, neither of which is installed.
- [x] **Felder calculation unit tests** against manually worked examples, covering every FR-23 edge case, ≥ 90% branch coverage. - **44 tests in `server/src/lib/felder.test.ts`. Coverage on 2026-09-23: 100% statements, 100% lines, 100% functions, 96.72% branches** (`npm run coverage` in `server/`), which is its own CI status check.
- [ ] **Parallel run** - a historical cycle reconciled student by student against the existing spreadsheet. The FSD is explicit: _"Anything short of exact reconciliation to the agreed rounding precision is a failed acceptance test, not a tolerance."_ Blocked on **AS-09**.
- [~] **Negative identity/access testing.** - _Covered at the API layer by the server suite: non-institutional registration, sign-in on unverified, unmatched and deactivated accounts, lock-out, and role-crossing requests are all asserted in `server/src/services/authentication.test.ts` and `server/src/middleware/auth.test.ts`._ **Gap:** the same attempted through the browser by a person, which is Round 4 of `docs/handover/test-plan.md`.
- [ ] **Cross-browser** - Edge, Firefox, Safari, plus default Android and iOS browsers (UI-03).
- [~] **Accessibility audit** (UI-04, UR-09). - _Automated and keyboard passes are **built into the suite**: `e2e/accessibility.spec.ts` runs axe for WCAG 2.1 AA over every page in all three portals plus phone width, and drives skip links, focus indicators, dialog focus traps and a complete student submission by keyboard alone. All green on 2026-09-23._ **Gap:** a screen-reader pass with a real user, and Lighthouse.
- [ ] **Load sanity test** at PR-02 scale (150 concurrent submitters).
- [ ] **Security** - dependency vulnerability scan and OWASP Top Ten review.
- [ ] **Observed UAT** - UR-01 (student under five minutes) and UR-06 (lecturer full cycle under thirty minutes) with representative users.
- [ ] **Requirements traceability matrix** mapping every ID here to design element, test case and UAT result (OR-28).

---

## Recommended build order

Ordered by consequence, not convenience.

1. [ ] **Resolve the architecture question** (critical gap 4) - Express service, or amend §2.7.1 to TanStack Start. Everything below depends on the answer.
2. [ ] **Get the Felder Calculation Specification approved** (**AS-08**, **IS-03**, **IS-04**, **IS-06**). The FSD says no calculation code should be written before this. It is the longest-lead item and it is a sponsor decision, not an engineering one - start it today.
3. [ ] **Build FR-22 / FR-23** as `src/lib/felder.ts` - a pure module with no UI or HTTP dependency (OR-18), driven entirely by configuration (OR-19), with the FR-23 edge cases as its test table (OR-20). This is the one place where a defect becomes an academic-integrity failure.
4. [x] ~~Install `vitest` and wire `npm test`~~ (SI-08) - **done**; write the calculation tests into this harness alongside step 3.
5. [ ] **Backend + PostgreSQL** (SI-02, SI-03) - schema, migrations, and the constraints in OR-06/OR-07 that make BR-01, BR-02, BR-03 and BR-10 real rather than advisory.
6. [ ] **Real authentication** - hashing (SI-06), sessions (SI-07), server-side RBAC (FR-07, SR-07), lock-out (SR-04). Until this lands, FR-03 is theatre and SR-01 is unmet.
7. [ ] **Audit writes** (FR-27) - append on every event the requirement lists. Cheap to add once there is a server; expensive to retrofit onto a live system.
8. [ ] **Real import parsing** (SI-04, FR-08, FR-09) and **real `.xlsx` export** (FR-25, CI-04).
9. [ ] **FR-20 flag rule engine** with a configurable threshold.
10. [ ] **Close the smaller functional gaps** - class creation (FR-08), change-password (FR-06), conflict resolution (FR-04), FR-28 deletion.
11. [ ] **Documentation** (OR-25 to OR-28) and the full verification programme above.

---

## Assumptions

- [ ] **AS-01** Each student has a unique student number. - _Relied upon by FR-04._
- [ ] **AS-02** Lecturers use the required class-list template.
- [ ] **AS-03** Lecturers correct errors identified during validation.
- [ ] **AS-04** Lecturers confirm groups and provide a base mark per group.
- [ ] **AS-05** Users have a supported browser and reliable connection.
- [ ] **AS-06** The initial administrator account is created at deployment; credential changed at handover.
- [ ] **AS-07** Every enrolled student holds an accessible institutional e-mail address. - _To confirm with the Sponsor before the first live cycle._
- [~] **AS-08** **The Sponsor approves the Felder Calculation Specification before calculation code is written.** - _Largely met. The scale, the factor limits and the treatment of self-ratings were decided on 2026-09-22; the rounding rule - one decimal place, matching the precision a mark is recorded at - on 2026-09-23. Everything that determines the number is therefore settled. Still open: the free-rider and outlier thresholds (IS-04, advisory only) and whether non-submission carries a penalty (IS-02). Neither alters a mark. Runs are stamped `felder-2026.3-provisional` until the specification is signed as a document._
- [ ] **AS-09** The Sponsor releases a de-identified historical cycle with its spreadsheet marks, and e-mail delivers reliably to institutional addresses. - _Deliverability must be tested early, not at UAT._

## Open issues

| ID    | Issue                                                                     | Owner         | Status                                                                                                          |
| ----- | ------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------- |
| IS-01 | Definitive list of accepted institutional e-mail domains                  | Sponsor       | Open - blocks FR-02, FR-03. _Prototype currently assumes `mynwu.ac.za` for students and `nwu.ac.za` for staff._ |
| IS-02 | Whether a non-submitting student incurs an academic penalty               | Sponsor       | Open - academic policy, not a system decision. FR-23 applies none and flags the case.                           |
| IS-03 | Remainder-distribution rule for group generation                          | Sponsor       | Open - _prototype uses round-robin, sizes differing by at most one._                                            |
| IS-04 | Free-rider threshold default                                              | Sponsor       | Open - _prototype uses a hard-coded ±12.5 deviation for cell highlighting only._                                |
| IS-05 | Whether comments are mandatory for the highest and lowest options         | Sponsor       | Open - implement as per-assessment configuration.                                                               |
| IS-06 | Maximum group mark and permitted precision                                | Sponsor       | **Closed 2026-09-23** - one decimal place, which is now the calculation's `roundTo` and the group-mark input's precision alike. Maximum mark is per assessment (`assessments.max_mark`), defaulting to 100. |
| IS-07 | Retention period for class and assessment data                            | Client        | Open - blocks FR-28.                                                                                            |
| IS-08 | FR-17 and FR-24 agreed but absent from §2.1.2 and the user stories        | Documentation | Open - both are **built** in this prototype; §2 needs updating to match.                                        |
| IS-09 | Hosting documentation to reflect NWU/own managed server rather than cloud | -             | In progress.                                                                                                    |
| IS-10 | Server details, domain, deployment access, HTTPS certificate              | -             | Open.                                                                                                           |

---

## Appendix A - Analysis models

| Model                            | Status                                                 | Location                                     |
| -------------------------------- | ------------------------------------------------------ | -------------------------------------------- |
| Use Case Diagram                 | `[x]` Delivered                                        | FSD §2.2.4                                   |
| Entity Relationship Diagram      | `[x]` Drawn, with a data dictionary for all 20 tables  | [`docs/handover/erd.md`](./docs/handover/erd.md)             |
| System Architecture Diagram      | `[x]` Drawn - the two processes, the database and SMTP | [`technical-handover.md` §1](./docs/handover/technical-handover.md#1-architecture-overview) |
| UI Wireframes                    | `[x]` Superseded by the working prototype - 29 screens | `src/routes/`                                |
| Requirements Traceability Matrix | `[~]` This document is its first draft                 | Test / Project Documentation                 |
| Felder Calculation Specification | `[~]` Every value is decided and documented; not yet signed as a standalone document | Sponsor approval (AS-08) |

---

## Appendix B - Where each screen lives

| FSD screen                       | Route                             | File                                                      |
| -------------------------------- | --------------------------------- | --------------------------------------------------------- |
| Login                            | `/login`                          | `src/routes/login.tsx`                                    |
| Student Register                 | `/register`                       | `src/routes/register.tsx`                                 |
| Account Activation               | `/activate`                       | `src/routes/activate.tsx`                                 |
| Forgot Password                  | `/forgot-password`                | `src/routes/forgot-password.tsx`                          |
| Reset Password                   | `/reset-password`                 | `src/routes/reset-password.tsx`                           |
| Admin Dashboard                  | `/admin`                          | `src/routes/admin/index.tsx`                              |
| Lecturer & Admin Accounts        | `/admin/accounts`                 | `src/routes/admin/accounts.tsx`                           |
| Audit Log (admin)                | `/admin/audit`                    | `src/routes/admin/audit.tsx`                              |
| Lecturer Dashboard               | `/lecturer`                       | `src/routes/lecturer/index.tsx`                           |
| Class List                       | `/lecturer/classes`               | `src/routes/lecturer/classes/index.tsx`                   |
| Class List Import                | `/lecturer/classes/import`        | `src/routes/lecturer/classes/import.tsx`                  |
| Groups Overview                  | `/lecturer/groups`                | `src/routes/lecturer/groups/index.tsx`                    |
| Group Generation & Review        | `/lecturer/groups/generate`       | `src/routes/lecturer/groups/generate.tsx`                 |
| Assessment List                  | `/lecturer/assessments`           | `src/routes/lecturer/assessments/index.tsx`               |
| Assessment Setup (create)        | `/lecturer/assessments/new`       | `src/routes/lecturer/assessments/new.tsx`                 |
| Assessment Detail / Status       | `/lecturer/assessments/:id`       | `src/routes/lecturer/assessments/$assessmentId/index.tsx` |
| Assessment Setup (edit)          | `/lecturer/assessments/:id/edit`  | `src/routes/lecturer/assessments/$assessmentId/edit.tsx`  |
| Submission Monitor               | `/lecturer/monitor`               | `src/routes/lecturer/monitor.tsx`                         |
| Evaluation Matrix                | `/lecturer/matrix`                | `src/routes/lecturer/matrix.tsx`                          |
| Group Mark Entry                 | `/lecturer/marks`                 | `src/routes/lecturer/marks.tsx`                           |
| Results Summary + Override       | `/lecturer/results`               | `src/routes/lecturer/results.tsx`                         |
| Export                           | `/lecturer/export`                | `src/routes/lecturer/export.tsx`                          |
| Audit Log (lecturer)             | `/lecturer/audit`                 | `src/routes/lecturer/audit.tsx`                           |
| Student Dashboard                | `/student`                        | `src/routes/student/index.tsx`                            |
| Peer Evaluation Form             | `/student/evaluate/:id`           | `src/routes/student/evaluate/$assessmentId/index.tsx`     |
| Review Screen                    | `/student/evaluate/:id/review`    | `src/routes/student/evaluate/$assessmentId/review.tsx`    |
| Submission Confirmation          | `/student/evaluate/:id/submitted` | `src/routes/student/evaluate/$assessmentId/submitted.tsx` |
| Role switcher _(prototype only)_ | `/dev`                            | `src/routes/dev.tsx`                                      |

---

## Reference list

Felder, R.M. & Brent, R. 2001. Effective strategies for cooperative learning. _Journal of Cooperation & Collaboration in College Teaching_, 10(2):69–75.

Jones, M., Bradley, J. & Sakimura, N. 2015. _JSON Web Token (JWT)_. RFC 7519. Internet Engineering Task Force.

North-West University. 2026. _NWU Harvard Referencing Guide_.

OWASP Foundation. 2021. _OWASP Top 10: The ten most critical web application security risks_.

South Africa. 2013. _Protection of Personal Information Act 4 of 2013_. Pretoria: Government Printer.

World Wide Web Consortium (W3C). 2018. _Web Content Accessibility Guidelines (WCAG) 2.1_. W3C Recommendation.
