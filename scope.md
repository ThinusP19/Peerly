# Peerly - Scope & Build Checklist

Working checklist derived from the **Functional Specifications Document (FSD)** for Peerly.
Every requirement ID in the FSD appears here exactly once, with its real status in this
repository as of **29 August 2026**.

> **What this repository currently is:** a UI-only, fully-clickable prototype. All data comes
> from typed mock modules in `src/mocks/`, served through a mock "API" layer in
> `src/services/peerly.ts`. There is **no backend, no database, no real authentication and no
> real e-mail**. Statuses below are honest about that: a screen that looks finished but has no
> server behind it is marked partial, not done.

---

## Legend

| Mark  | Meaning                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------ |
| `[x]` | **Done** - built and verified in this repository                                                       |
| `[~]` | **Partial** - UI exists and behaves correctly, but needs a backend, a rule engine, or real enforcement |
| `[ ]` | **Not started** - no implementation yet                                                                |
| `[-]` | **Deferred** - belongs to deployment, infrastructure or project process, not to the UI prototype       |

`Evidence` cites the file that implements it. `Gap` states what is still missing.

---

## Status at a glance

| Group                          | Done   | Partial | Not started | Deferred | Total   |
| ------------------------------ | ------ | ------- | ----------- | -------- | ------- |
| UI - User interfaces           | 7      | 2       | 0           | 0        | 9       |
| HI - Hardware interfaces       | 2      | 0       | 0           | 2        | 4       |
| SI - Software interfaces       | 3      | 6       | 3           | 0        | 12      |
| CI - Communications interfaces | 1      | 2       | 0           | 7        | 10      |
| FR - Functional requirements   | 11     | 13      | 4           | 0        | 28      |
| PR - Performance               | 1      | 1       | 0           | 7        | 9       |
| SR - Security                  | 2      | 4       | 4           | 6        | 16      |
| UR - Usability                 | 9      | 2       | 0           | 0        | 11      |
| OR - Other requirements        | 10     | 5       | 8           | 5        | 28      |
| BR - Business rules            | 8      | 6       | 1           | 0        | 15      |
| **Total**                      | **54** | **41**  | **20**      | **27**   | **142** |

All 142 requirement IDs in the FSD appear here exactly once, with no gaps in any group.
Counts are generated from this file, not estimated. Of the 114 requirements that are not
deferred to deployment or project process, **54 are done and 41 are partially built**.

**Headline:** the screens are essentially complete. The two things that are _not_ built and that
the FSD treats as highest-consequence are **FR-22 (the Felder calculation)** and
**FR-27 (audit logging)**. See [Critical gaps](#critical-gaps).

---

## Critical gaps - read before planning the next sprint

### 1. FR-22 - the Felder calculation is not implemented

This is the single most important gap in the project. FSD §3.2.8 states that an error here
"is not a cosmetic defect but an academic-integrity failure".

- `calculateMarks()` in `src/services/peerly.ts:144` is a **stub**. It waits 1.2 seconds and
  returns a run identifier. It computes nothing.
- The adjustment factors shown on the Results screen come from `src/mocks/data.ts:507`, which
  uses an invented placeholder formula:
  ```ts
  0.7 + (meanReceived / 100) * 0.4; // clamped to 0.6 – 1.1
  ```
- The FSD (FR-22 step 3) requires **`individual mean ÷ group mean`**, with approved limits,
  the approved rounding rule, and the FR-23 edge cases.

The numbers currently on screen are **plausible-looking demo data, not Felder marks**. They must
not be presented to a sponsor as calculated results. Blocked on **AS-08** (Sponsor approval of the
Felder Calculation Specification), which the FSD itself calls "the highest-consequence assumption".

### 2. FR-27 - no audit entries are written

The audit log _screen_ is built and filterable, but every entry it displays is seeded in
`src/mocks/data.ts`. No action anywhere in the app appends an audit record - verified: zero
occurrences of `auditEntries.push` in `src/`. Objective 6 (verifiable results) is therefore not met.

### 3. FR-20 - free-rider flags are seeded, not computed

`FlagBadge` renders eight flag types with plain-language explanations, but the flags themselves are
hard-coded per student in `src/mocks/data.ts:511-517`. There is no threshold rule, and no
configurable threshold (**OR-19**, **IS-04**).

### 4. Architecture divergence - Express vs TanStack Start

FSD §2.7.1 specifies **Node.js with Express** for the backend. This scaffold is **TanStack Start**
(React 19 + Vite + Tailwind, with TanStack's own SSR/Nitro server). The frontend half matches the
specification exactly; the backend half does not exist yet. A decision is needed: build the Express
API as a separate service (matching the FSD), or amend §2.7.1 to record TanStack Start's server as
the chosen host. **This should be resolved before any backend work starts.**

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
- [~] **UI-04** WCAG 2.1 AA; no information by colour alone. - _Built to it: every status badge carries icon + text, focus rings, real labels._ **Gap:** no formal audit (axe/Lighthouse).
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
- [~] **SI-02** Node.js + Express hosting the REST API, all business logic server-side. - _Express 5 + TypeScript app in `server/`, running and health-checked against Postgres._ **Gap:** no domain routes yet.
- [~] **SI-03** PostgreSQL as sole persistent store, encrypted connection, versioned migrations. - _Full schema applied to `peerly_dev` via `server/migrations/0001_init.sql`; checksum-tracked runner._ **Gap:** TLS on the DB connection is a deployment concern.
- [ ] **SI-04** CSV/spreadsheet libraries parsing server-side; never in the browser.
- [ ] **SI-05** Transactional e-mail service. - _Currently a toast._
- [ ] **SI-06** bcrypt/Argon2 password hashing.
- [~] **SI-07** Session/token library with server-side revocation. - _`localStorage` session in `src/lib/session.tsx`; prototype only._
- [~] **SI-08** Build and test tooling; a failing calculation test blocks the merge. - _`vitest` installed; `npm test` runs 26 unit tests over `src/lib/domain.ts` (`src/lib/domain.test.ts`)._ **Gap:** no CI gate; the calculation module does not exist yet to be tested.
- [x] **SI-09** No LMS/eFundi or SSO interface in this release. - _By construction._
- [~] **SI-10** Accept `.csv` and `.xlsx`; reject `.xls` and online links with a message; always export `.xlsx`. - _`FileUpload` accepts `.csv,.xlsx` and rejects others with a plain-language message._ **Gap:** no real parsing; export not produced.
- [~] **SI-11** Third-party components version-pinned; licences recorded and confirmed. - _Pinned in `package.json`._ **Gap:** no licence register.
- [x] **SI-12** No commercial-licence, paid-tier or quota-limited component.

### 3.1.4 Communications interfaces

- [-] **CI-01** HTTPS with TLS 1.2+; HTTP redirected; HSTS.
- [-] **CI-02** REST API exchanging JSON per the baselined contract.
- [~] **CI-03** Class-list upload multipart, limited to 5 MB, rejected before parsing. - _5 MB limit enforced client-side in `FileUpload.tsx`._ **Gap:** server enforcement.
- [-] **CI-04** Results workbook served as a binary attachment to the responsible lecturer only.
- [-] **CI-05** Authenticated encrypted SMTP; asynchronous dispatch.
- [x] **CI-06** CORS restricted to registered origins. - _Allow-list from `CORS_ORIGINS`, credentials enabled for the session cookie._
- [-] **CI-07** Rate limiting on registration, sign-in, recovery, resend.
- [-] **CI-08** Session cookies `Secure`, `HttpOnly`, `SameSite`; never in a URL.
- [-] **CI-09** Operates on port 443 alone behind the university proxy.
- [~] **CI-10** A failed submission preserves the student's captured ratings. - _Drafts autosave to `localStorage` (`src/lib/evaluation-draft.ts`), so nothing is lost._ **Gap:** no submission-failure error path.

---

## 3.2 Functional requirements

### 3.2.2 Account management, registration and access control

- [~] **FR-01** Administrator management of lecturer and administrator accounts - _Must_
  - Evidence: `src/routes/admin/accounts.tsx` - create dialog, edit dialog, activate/deactivate behind a named `ConfirmDialog`, unique-identifier and institutional-domain validation, **deactivating the last active administrator is refused** with a blocking explanation.
  - Gap: activation e-mail is a toast; deactivation does not revoke sessions; no audit entry.
- [x] **FR-02** Student self-registration - _Must_
  - Evidence: `src/routes/register.tsx` - student number format check, `mynwu.ac.za` domain enforcement, password policy, confirmation match, POPIA acknowledgement gate, **role is never selectable**, non-disclosure of whether an identity already exists.
- [~] **FR-03** Account activation by institutional e-mail verification - _Must_
  - Evidence: `src/routes/activate.tsx` - all three states (verifying → success → expired) with a resend action.
  - Gap: no real token generation, hashing, expiry or dispatch. **This is the control that prevents registering under a classmate's student number (SR-01) - it is currently theatre.**
- [~] **FR-04** Matching a student account to the imported class list - _Must_
  - Evidence: `Matched` / `Unmatched` / `Conflict` modelled in `src/mocks/types.ts`; surfaced on the class list, the submission monitor, and as a full-page student explanation (`src/routes/student/index.tsx`).
  - Gap: no matching operation runs; no lecturer conflict-resolution action (the monitor links to the class list but nothing can be resolved there).
- [~] **FR-05** Authentication and sign-out - _Must_
  - Evidence: `src/routes/login.tsx` - generic failure message that does not reveal which field was wrong, inactive accounts refused, role-appropriate redirect; sign-out in `src/lib/session.tsx`.
  - Gap: no password verification, no lock-out (SR-04), no server-side session invalidation.
- [~] **FR-06** Account recovery and password management - _Must_
  - Evidence: `src/routes/forgot-password.tsx` (generic confirmation regardless of whether the address exists), `src/routes/reset-password.tsx` (valid and expired-token states).
  - Gap: **no change-password screen for a signed-in user** - FR-06 requires one, verifying the current password first. No token lifecycle.
- [~] **FR-07** Role-based access control and session management - _Must_
  - Evidence: `src/components/layout/RoleGuard.tsx` - each portal admits only its roles and redirects otherwise.
  - Gap: client-side only. FR-07 states plainly that hiding a control is never an access control. **Nothing is enforced until there is a server.**

### 3.2.3 Class list and group management

- [~] **FR-08** Class creation and class list import - _Must_
  - Evidence: `src/routes/lecturer/classes/import.tsx` - drag-and-drop with accepted formats and 5 MB note, column mapping with detected headers and duplicate-mapping detection.
  - Gap: **no class creation** (module code, name, academic period) - imports only into the already-selected class. No real file parsing; the preview is a fixture.
- [~] **FR-09** Import validation, preview and confirmation - _Must_
  - Evidence: preview table of 30 rows with a validation banner (valid/error counts), every error row highlighted with row number, field and plain-language reason, confirm behind a `ConfirmDialog`.
  - Gap: no transaction; no re-run of FR-04 on commit; no replace-vs-extend choice; BR-09 not enforced.
- [x] **FR-10** Automatic group generation - _Must_
  - Evidence: `src/routes/lecturer/groups/generate.tsx` - mutually exclusive "number of groups" / "target group size" radio, the other derived and previewed, every eligible student assigned exactly once, round-robin remainder, warning for groups under two, free re-generation before confirming.
  - Note: remainder rule default awaits **IS-03**.
- [~] **FR-11** Group review and manual editing - _Must_
  - Evidence: per-member "Move to" dropdown before confirmation; `groups/index.tsx` locks editing once an assessment is open with submissions, and explains why.
  - Gap: no explicit withdraw-ratings flow; no audit of before/after state.

### 3.2.4 Assessment setup and management

- [x] **FR-12** Assessment creation and configuration - _Must_
  - Evidence: `src/components/lecturer/AssessmentForm.tsx` - name, description, class locked to the working class, per-group checkbox multi-select, open/close datetime pickers, read-only preview of the nine rating options, saved as Draft.
- [x] **FR-13** Assessment activation and closure - _Must_
  - Evidence: `src/routes/lecturer/assessments/$assessmentId/index.tsx` - activate, extend, close and re-open, each behind a `ConfirmDialog` with consequence text; **re-opening after calculation warns that results are invalidated**.
  - Gap: no automatic closure at the closing time (needs a server clock).

### 3.2.5 Peer evaluation

- [x] **FR-14** Student view of active assessments and assigned peers - _Must_
  - Evidence: `src/routes/student/index.tsx` - five states (Not yet open / Not started / In progress / Submitted / Closed – not submitted), closing time prominent, unmatched and conflict accounts get a full-page explanation instead of an empty list.
- [x] **FR-15** Descriptive peer rating capture - _Must_
  - Evidence: `src/components/shared/RatingScale.tsx` - all nine options in display order, each with label **and** behavioural description inline, no numeric scale or slider anywhere, self excluded from the list, draft autosave.
- [x] **FR-16** Review and submission of an evaluation - _Must_
  - Evidence: `review.tsx` restates every selection in identical wording with per-member Edit links; submission is refused while anyone is unrated and names them; `submitted.tsx` confirms what was submitted, when, and whether it can still be amended.
- [~] **FR-17** Optional qualitative comments - _Should_
  - Evidence: 500-character comment per member with a live counter; visible to the lecturer in the matrix popover and the results drill-down; never to the evaluated student.
  - Gap: mandatory-comment-on-extremes configuration (**IS-05**) not built.

### 3.2.6 Monitoring

- [x] **FR-18** Submission monitoring and non-submission reminders - _Must (reminders: Should)_
  - Evidence: `src/routes/lecturer/monitor.tsx` - submitted/outstanding/total stat row, per-group breakdown table, outstanding students listed by name and number, unmatched/conflict entries surfaced, "Send reminder" limited to outstanding students and disabled unless open.
  - Gap: reminder dispatch is a toast.

### 3.2.7 Evaluation results and group matrix

- [x] **FR-19** Peer evaluation matrix - _Must_
  - Evidence: `src/routes/lecturer/matrix.tsx` - square grid, diagonal marked `-`, descriptive label with the numeric value beneath (lecturer-only), row means / column means / group mean, non-submitting evaluators shown as a visually distinct "Did not submit" row rather than blanks, deviation highlighted with **both** colour and an up/down arrow, comment popovers, group selector without a page reload, horizontal scroll only.
- [~] **FR-20** Free-rider and low-contribution indicators - _Must_
  - Evidence: `src/components/shared/FlagBadge.tsx` - all eight flag types with a plain-language popover explaining why each fired; carried into the results table and drill-down; advisory only, never altering a mark.
  - Gap: **flags are seeded in mock data, not computed.** No threshold rule, no configuration (**OR-19**, **IS-04**).

### 3.2.8 Mark calculation

- [x] **FR-21** Group base mark entry - _Must_
  - Evidence: `src/routes/lecturer/marks.tsx` - validated numeric input (range 0–max, one decimal place), save-as-you-go with per-row Saving/Saved state, clear "No mark yet" indicator, and **"Calculate marks" stays disabled until every group has a mark**.
  - Note: maximum and precision defaults await **IS-06**.
- [ ] **FR-22** Felder individual mark calculation - _Must_ - **NOT IMPLEMENTED. See critical gap 1.**
- [ ] **FR-23** Defined handling of non-submission and calculation edge cases - _Must_
  - The eight cases (submitted nothing, received nothing, group of two, group of one, all identical, zero base mark, unallocated, unmatched at closure) are **not implemented**. Several _flag types_ exist in the UI, but no calculation branches behind them.
- [~] **FR-24** Lecturer override of a calculated mark - _Should_
  - Evidence: override dialog in `src/routes/lecturer/results.tsx` - calculated mark shown read-only, mandatory reason (Save disabled until filled), override stored **alongside** the calculated mark and both shown side by side, overridden students marked in the table.
  - Gap: no recalculation-confirmation flow; no audit entry.

### 3.2.9 Results export

- [ ] **FR-25** Export of results and raw data to `.xlsx` - _Must_
  - Evidence: `src/routes/lecturer/export.tsx` presents the header block (class, assessment, timestamp, calculation run id, overrides, flags) and explains both worksheets with real row counts.
  - Gap: **no workbook is generated.** The button shows a toast. Note that the artifact/browser sandbox blocks script-initiated downloads, so this must be a server-generated attachment (CI-04).
- [x] **FR-26** On-screen results summary - _Must_
  - Evidence: `src/routes/lecturer/results.tsx` - one row per student with group, mean received, adjustment factor, base mark, final mark, flags and override indicator; sortable columns; filters for flagged / overridden / by group; row click opens a drill-down drawer showing the ratings that produced the mark; summary stat cards (submission rate, mean factor, mean final mark, flagged count).
  - Caveat: the figures are placeholder, not Felder (critical gap 1).

### 3.2.10 Audit and data administration

- [~] **FR-27** System audit logging - _Must_
  - Evidence: `src/components/shared/AuditLogView.tsx` - filterable by event type and date range, shared by both portals, lecturer view scoped to the active class, presented as read-only.
  - Gap: **no entry is ever written.** See critical gap 2.
- [ ] **FR-28** Data retention and deletion - _Should_
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
- [~] **SR-02** Password ≥ 8 characters, common-password check, not matching e-mail/username/student number. - _Length enforced in `register.tsx` and `reset-password.tsx`._ **Gap:** common-password list and identity comparison.
- [-] **SR-03** Salted adaptive hash; plaintext never persisted, logged, exported or e-mailed.
- [ ] **SR-04** Lock-out after five consecutive failures; rate limiting by source address.
- [-] **SR-05** 30-minute idle / 12-hour absolute session expiry; revoke on sign-out, password change, recovery, deactivation.
- [x] **SR-06** Responses do not disclose whether an identity is registered, nor distinguish unknown identity from wrong password or inactive account. - _Implemented in login, registration and recovery copy._
- [ ] **SR-07** Role-based access enforced server-side on every request; non-owned resources refused identically whether or not they exist.
- [x] **SR-08** A student never retrieves another student's data, nor any hidden numeric value, adjustment factor or mark - **and such data is never sent to a student's browser at all**. - _`getStudentRatingOptions()` strips `hiddenValue`; `StudentRatingOption` has no such field; student services return no ratings or marks. Verified in browser: no scale values appear anywhere in the Student Portal._
- [ ] **SR-09** Server-side schema validation, parameterised queries, output escaping, OWASP Top Ten testing.
- [ ] **SR-10** Uploaded files validated by content, size limited, parsed without entity resolution or formula execution, not retained.
- [~] **SR-11** POPIA compliance: minimal collection, purpose stated at registration, role-limited access, deletable. - _Purpose notice built (OR-13)._ **Gap:** deletion (FR-28), enforcement.
- [-] **SR-12** Encryption in transit and at rest; daily encrypted backups; restoration tested before handover.
- [-] **SR-13** Secrets from environment configuration; production credentials rotated at handover.
- [-] **SR-14** Logs exclude passwords, credentials, tokens and rating content.
- [-] **SR-15** Security events in the append-only audit trail.
- [~] **SR-16** System Administrator has no automatic access to responses or marks. - _The admin portal exposes only account management and the audit log - no marks screens exist for that role._

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
- [~] **UR-09** Keyboard operable, accessible names on all controls, meets UI-04. - _Built to it._ **Gap:** no assistive-technology testing.
- [x] **UR-10** Consistent terminology across both portals - always _group_, _class_, _assessment_.
- [x] **UR-11** Destructive actions visually distinguished and confirmed. - _`destructive` variant + `ConfirmDialog`._

---

## 3.6 Other requirements

### 3.6.1 Availability, reliability and data integrity

- [-] **OR-01** 99% availability while an assessment is open.
- [-] **OR-02** No planned maintenance while an assessment is open.
- [-] **OR-03** E-mail failure does not prevent sign-in, evaluation, calculation or export.
- [x] **OR-04** Unhandled errors return a generic page, exposing no stack trace or internal path. - _Client: root error boundary. Server: `server/src/middleware/errors.ts` logs full context and returns a generic message; constraint names are never leaked._
- [~] **OR-05** Multi-record operations transactional. - _`withTransaction()` helper in `server/src/db/pool.ts`; migrations already run inside one._ **Gap:** the domain operations that need it do not exist yet.
- [x] **OR-06** Referential integrity enforced by database constraints. - _Every relation is FK-constrained; composite FKs keep a group's class and its members' class in step._
- [x] **OR-07** Database rules prevent self-evaluation, duplicates and cross-group evaluation; uniqueness constraint per evaluator/evaluated/assessment. - _All three enforced in `0001_init.sql` and **verified against the live database**: each violation was attempted and rejected._
- [~] **OR-08** Submitted ratings immutable once an assessment closes. - _UI blocks amendment after closing._ **Gap:** not enforced.
- [ ] **OR-09** Raw ratings and calculation details retained so each mark can be verified.
- [-] **OR-10** Daily encrypted backups retained 30 days; restoration tested before handover.
- [x] **OR-11** Timestamps stored timezone-aware and displayed in SAST. - _ISO-8601 throughout; `src/lib/format.ts` renders in local time._

### 3.6.2 Legal and regulatory compliance

- [~] **OR-12** POPIA compliance across collection, processing, storage, security and deletion.
- [x] **OR-13** Registration states in plain language what is collected, why, who sees it and how long it is kept, and requires acknowledgement. - `src/routes/register.tsx`, enforced before submission.
- [x] **OR-14** Only information needed for peer assessment collected; role-limited access.
- [x] **OR-15** Peerly calculates and presents; the lecturer remains assessor of record. - _Reflected in the override flow (FR-24) and advisory-only flags._
- [x] **OR-16** Individual ratings visible only to the responsible lecturer and their author.
- [ ] **OR-17** Third-party licences documented and confirmed for post-handover use.

### 3.6.3 Maintainability, portability and scalability

- [ ] **OR-18** The Felder calculation is a discrete, independently testable module with no UI or HTTP dependency. - **Does not exist.** _When built, it belongs in `src/lib/` alongside `domain.ts`, which already follows this pattern._
- [~] **OR-19** Rating options, hidden values, order, factor limits, rounding, free-rider threshold and remainder rule all held as **configuration**, not literals. - _Rating options are data (`src/mocks/data.ts`)._ **Gap:** the deviation threshold is a hard-coded default (`src/lib/domain.ts:216`); limits, rounding and remainder rule do not exist yet.
- [ ] **OR-20** ≥ 90% branch coverage of the calculation module, covering every FR-23 edge case; a failing test blocks a merge. - _A test harness now exists (`npm test`), but the calculation module does not, so there is nothing to cover._
- [x] **OR-21** Schema changes only through versioned migrations. - _`server/src/db/migrate.ts` - ordered, transactional, checksummed; editing an applied migration is refused rather than ignored._
- [-] **OR-22** Portable across cloud providers; no proprietary dependency beyond managed PostgreSQL and SMTP.
- [x] **OR-23** Data model supports multiple classes, multiple assessments per class and multiple lecturers concurrently. - _Verified: two classes, four assessments and seven staff accounts coexist in the model._
- [~] **OR-24** Source under version control; every change peer reviewed and tested before release. - _Git in use._ **Gap:** no review or test gate.

### 3.6.4 Documentation deliverables

- [ ] **OR-25** Three electronic user guides (System Administrator, Lecturer, Student) with worked examples and screenshots.
- [ ] **OR-26** Technical handover guide covering setup, deployment, backup/recovery, maintenance and the default administrator account.
- [ ] **OR-27** API documentation, ERD, deployment runbook, and the approved **Felder Calculation Specification** as a standalone document.
- [ ] **OR-28** Test evidence pack: traceability matrix, unit test results, load test results, parallel-run reconciliation.

---

## 3.6.5 Business rules

| ID    | Rule                                                                             | Enforced by          | Status                                                                          |
| ----- | -------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------- |
| BR-01 | A student evaluates only their own group, in a matched assessment                | FR-07, 14, 15, OR-07 | `[~]` UI + composite FKs into `group_members`; enrolment match not yet enforced |
| BR-02 | No self-evaluation; excluded from the model                                      | FR-15, 22, OR-07     | `[x]` UI + DB `CHECK (evaluator_id <> evaluated_id)`                            |
| BR-03 | Exactly one rating per evaluator/evaluated/assessment; amendment supersedes      | FR-15, 16, OR-07     | `[x]` DB unique constraint                                                      |
| BR-04 | A submission is accepted only when every eligible member is rated                | FR-16                | `[x]` blocked and named                                                         |
| BR-05 | No submission or amendment after closing                                         | FR-13, 16            | `[~]` UI only                                                                   |
| BR-06 | Calculation runs only when closed and every group has a base mark                | FR-21, 22            | `[~]` base-mark gate built; closure gate not                                    |
| BR-07 | An individual mark is never negative and never exceeds the maximum               | FR-22                | `[~]` clamped in the placeholder formula                                        |
| BR-08 | An override never replaces the calculated mark; both retained with a reason      | FR-24                | `[x]`                                                                           |
| BR-09 | A committed class list may not be replaced once a rating exists                  | FR-09                | `[ ]`                                                                           |
| BR-10 | A student belongs to exactly one group; every eligible student is assigned       | FR-10, 11, OR-07     | `[x]` UI + DB unique `(class_id, student_id)`                                   |
| BR-11 | A class and its assessments are owned by the responsible lecturer                | FR-07, 08, 12        | `[~]` scoped in UI only                                                         |
| BR-12 | Only a verified account may be active; only a matched student reaches class data | FR-03, 04, SR-01     | `[~]` modelled, not enforced                                                    |
| BR-13 | Only a System Administrator manages Admin Portal accounts; no self-elevation     | FR-01, 02, 07        | `[x]` role never selectable at registration                                     |
| BR-14 | Deactivating an account blocks sign-in but deletes no record                     | FR-01, 05, FR-28     | `[x]` status change only                                                        |
| BR-15 | A rating's hidden numeric value is never disclosed to a student                  | UI-09, FR-15, SR-08  | `[x]` absent from the type itself                                               |

---

## Verification & testing

### Already run against this build

- [x] **TypeScript** - `npx tsc --noEmit` - clean, 0 errors.
- [x] **ESLint** - `npx eslint .` - 0 errors (13 `react-refresh` warnings, same class as the stock shadcn files).
- [x] **Production build** - `npm run build` - succeeds; 282 KB gzipped client JS.
- [x] **Browser pass 1** - all 29 screens driven in Chromium: both portals' full navigation, matrix, marks gate, results drill-down, import wizard, group generation, close-assessment confirmation, admin filters, student evaluation, unmatched state, 360 px layout. **All 10 flows passed.** Two defects found and fixed (see below).
- [x] **Browser pass 2** - fixes verified, no regressions, **0 console errors and 0 warnings** for the whole session.
- [x] **Responsive** - Student Portal at 360 px: `scrollWidth === clientWidth`, no horizontal overflow.
- [x] **Unit tests** - `npm test` - **26 passing** over `src/lib/domain.ts`: matrix construction (FR-19), deviation highlighting, submission progress (FR-18), student assessment state (FR-14), enrolment matching (FR-04) and group lookup (BR-10).
- [x] **Mutation-checked** - the suite was verified to have teeth by injecting the exact defect user story 9 warns against (a non-submitter's blank cells counting as a rating of zero); the test failed as it should, and passed again once reverted.

**Defects found and fixed during testing**

- [x] React Query rejected `undefined` from four "find one" services - now resolve to `null`.
- [x] A saved draft still showed "Not started" on the student dashboard - drafts live in `localStorage`, which the dashboard did not read. Now shows "In progress" / "Continue evaluation".

### Not yet run - required by FSD §3.6.5

- [ ] **Unit tests for the remaining modules** - `src/lib/evaluation-draft.ts`, `src/lib/format.ts` and the service layer are not yet covered. Component tests need `jsdom` and `@testing-library/react`, neither of which is installed.
- [ ] **Felder calculation unit tests** against manually worked examples, covering every FR-23 edge case, ≥ 90% branch coverage. _Blocked on FR-22 existing._
- [ ] **Parallel run** - a historical cycle reconciled student by student against the existing spreadsheet. The FSD is explicit: _"Anything short of exact reconciliation to the agreed rounding precision is a failed acceptance test, not a tolerance."_ Blocked on **AS-09**.
- [ ] **Negative identity/access testing** - non-institutional registration, sign-in on unverified/unmatched/deactivated accounts, direct API requests bypassing the interface. _Requires a server._
- [ ] **Cross-browser** - Edge, Firefox, Safari, plus default Android and iOS browsers (UI-03).
- [ ] **Accessibility audit** - automated (axe/Lighthouse) plus keyboard-only and screen-reader passes (UI-04, UR-09).
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
- [ ] **AS-08** **The Sponsor approves the Felder Calculation Specification before calculation code is written.** - _The FSD's own highest-consequence assumption. Currently unmet, and FR-22 is blocked on it._
- [ ] **AS-09** The Sponsor releases a de-identified historical cycle with its spreadsheet marks, and e-mail delivers reliably to institutional addresses. - _Deliverability must be tested early, not at UAT._

## Open issues

| ID    | Issue                                                                     | Owner         | Status                                                                                                          |
| ----- | ------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------- |
| IS-01 | Definitive list of accepted institutional e-mail domains                  | Sponsor       | Open - blocks FR-02, FR-03. _Prototype currently assumes `mynwu.ac.za` for students and `nwu.ac.za` for staff._ |
| IS-02 | Whether a non-submitting student incurs an academic penalty               | Sponsor       | Open - academic policy, not a system decision. FR-23 applies none and flags the case.                           |
| IS-03 | Remainder-distribution rule for group generation                          | Sponsor       | Open - _prototype uses round-robin, sizes differing by at most one._                                            |
| IS-04 | Free-rider threshold default                                              | Sponsor       | Open - _prototype uses a hard-coded ±12.5 deviation for cell highlighting only._                                |
| IS-05 | Whether comments are mandatory for the highest and lowest options         | Sponsor       | Open - implement as per-assessment configuration.                                                               |
| IS-06 | Maximum group mark and permitted precision                                | Sponsor       | Open - _prototype assumes out of 100, one decimal place._                                                       |
| IS-07 | Retention period for class and assessment data                            | Client        | Open - blocks FR-28.                                                                                            |
| IS-08 | FR-17 and FR-24 agreed but absent from §2.1.2 and the user stories        | Documentation | Open - both are **built** in this prototype; §2 needs updating to match.                                        |
| IS-09 | Hosting documentation to reflect NWU/own managed server rather than cloud | -             | In progress.                                                                                                    |
| IS-10 | Server details, domain, deployment access, HTTPS certificate              | -             | Open.                                                                                                           |

---

## Appendix A - Analysis models

| Model                            | Status                                                 | Location                                     |
| -------------------------------- | ------------------------------------------------------ | -------------------------------------------- |
| Use Case Diagram                 | `[x]` Delivered                                        | FSD §2.2.4                                   |
| Entity Relationship Diagram      | `[~]` Implicit in `src/mocks/types.ts` (19 types)      | Technical Specifications - **not yet drawn** |
| System Architecture Diagram      | `[ ]` Blocked on critical gap 4                        | Technical Specifications                     |
| UI Wireframes                    | `[x]` Superseded by the working prototype - 29 screens | `src/routes/`                                |
| Requirements Traceability Matrix | `[~]` This document is its first draft                 | Test / Project Documentation                 |
| Felder Calculation Specification | `[ ]` **Not written - blocks FR-22 (AS-08)**           | Separate document, Sponsor approval          |

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
