# Peerly Assessment Hub

1. What we're building

Peerly is a web app that automates student peer assessments for group projects. Right now this project needs is a UI-only prototype - no real backend, no real auth, no real database. Build it as a polished, fully-clickable React app with realistic mock data so it can later be lifted into VS Code and wired to a real Node.js/Express + PostgreSQL backend. Structure everything (types, mock data, "service" functions) so swapping mock data for real API calls later is a small change, not a rewrite.

Peerly has two portals:

Admin Portal - shared by two roles: System Administrator (manages lecturer/admin accounts only) and Lecturer (manages classes, groups, assessments, marks, exports). Desktop-first, usable down to tablet width.

Student Portal - students register, log in, and evaluate their group members using word-based (not numeric) ratings. Must work perfectly on mobile from 360px width up.

Since this is a prototype, add a small role switcher (e.g. a dropdown in a dev-only corner widget or a /dev route) that lets me jump between "logged in as Admin / Lecturer / Student" without a real login, so all screens are reachable for review. Still build the actual Login/Register/Forgot-password screens as real UI - they just don't need working auth logic.

2. Tech & build rules

React + Vite + TypeScript + Tailwind CSS. Use shadcn/ui components as the base component library, extended/themed for this app - don't hand-roll basics like buttons, dialogs, dropdowns, toasts, tabs, tables from scratch.

React Router for navigation, with a distinct layout/shell per portal.

All data comes from typed mock data modules (e.g. src/mocks/*.ts) that mirror the data model in Section 8. Simulate loading states with a short artificial delay so loading/skeleton states are visible.

No real backend calls, no Supabase wiring, no real email sending. Where an action would call an API (submit form, confirm import, calculate marks), just update local/mock state and show the right UI feedback (toast, redirect, status change).

lucide-react for icons.

Keep components small and reusable; this app has a LOT of screens that share patterns (tables with filters, confirmation dialogs, status badges, stat cards) - build the shared pieces once.

3. Design system

Tone: professional, academic, calm, trustworthy - this app touches students' marks, so it should never feel flashy or "startup-y." Think clean university admin tooling, not a marketing site.

Font: Inter (or system-ui fallback).

Colour: A single indigo/blue primary (e.g. #4F46E5 range) for actions and active states, a neutral slate/gray scale for structure, and clear semantic colours used consistently everywhere: green = submitted/success/matched, amber/yellow = outstanding/pending/warning, red = flagged/conflict/error/overdue, gray = not started/inactive. Every semantic colour must also carry an icon or text label - never colour alone (accessibility requirement).

Layout: rounded-lg cards with soft shadows, generous whitespace, 8px spacing scale. Sidebar navigation for the Admin Portal (desktop), simple top nav + bottom-safe layout for the Student Portal (mobile-first).

Accessibility: visible focus states, sufficient contrast (WCAG AA), all form controls keyboard-operable with real labels (not placeholder-only labels).

Feedback patterns (use everywhere, build once as shared components):

Toasts for success/error confirmations.

Inline field errors in plain language under the field, not just red borders.

A ConfirmDialog component for irreversible actions (confirming an import, confirming groups, closing an assessment, calculating marks, deactivating an account) that names the exact object being acted on and requires an explicit confirm click.

A busy/disabled state on any button that triggers a longer action, so it can't be double-clicked.

Empty states with a short explanation + next action, not blank screens.

Status badges: Draft / Open / Closed, Submitted / Outstanding / Not started, Matched / Unmatched / Conflict, Active / Deactivated.

4. Global navigation

Admin Portal shell (sidebar, shown after "login" as Lecturer or Admin):

Header: app logo/name, current user name + role badge, current class/assessment context selector (a lecturer can manage multiple classes - always show which one is active), sign out.

Sidebar (Lecturer): Dashboard, Classes, Groups, Assessments, Submission Monitor, Evaluation Matrix, Marks & Calculation, Results & Export, Audit Log.

Sidebar (System Administrator): Dashboard, Lecturer & Admin Accounts, Audit Log.

Student Portal shell (simple top bar, mobile-first):

Header: app name, student name, sign out.

Single-column flow: Dashboard → Evaluation Form → Review → Confirmation.

Shared auth screens (outside both shells, centered card layout): Login, Student Register, Account Activation (link-landing state: verifying / success / expired-with-resend), Forgot Password, Reset Password.

5. Screens to build

For every screen below, populate it generously with realistic mock data (fake student names, module codes like CMPG323, realistic dates) so it looks like a real class, not an empty demo.

5.1 Shared / Auth

Login - email + password, "forgot password" link, error state (generic "invalid credentials" message - don't reveal which field was wrong), link to student registration.

Student Register - student number, name, surname, institutional email, password + confirm, a POPIA-style data-notice checkbox ("I understand what data is collected and why") that must be ticked to submit.

Account Activation - landing page for an emailed activation link; show three states (verifying spinner → success with "go to login" → expired/invalid with a "resend link" button).

Forgot / Reset Password - request screen (email input, generic confirmation message regardless of whether the email exists), then a reset screen (new password + confirm) reached via a mock token link.

5.2 System Administrator

Admin Dashboard - simple overview: total lecturer accounts, active vs deactivated count, recent account-related audit events.

Lecturer & Admin Accounts - a table (name, email, role, status, date created) with search/filter by role/status, a "Create account" button opening a form dialog (name, surname, institutional email, role), row actions to view/edit details and to Activate/Deactivate (behind a ConfirmDialog naming the person). Deactivating the last active admin should show a blocking error state, not silently succeed.

5.3 Lecturer - Classes & Groups

Lecturer Dashboard - cards per class the lecturer owns (module code, class name, student count, group count, active assessment status), quick links into each.

Class List Import - step flow: (1) drag-and-drop / browse .csv or .xlsx upload with a note on accepted formats and 5MB limit, (2) column-mapping confirmation if headers are ambiguous, (3) a preview table of parsed rows with a validation summary banner (X valid, Y errors) and every error row highlighted with row number + field + plain-language reason, (4) a Confirm/Cancel step behind a ConfirmDialog. Show a realistic example: ~30 rows, a couple with deliberate errors (missing email, duplicate student number) to demonstrate the validation UI.

Group Generation & Review - form to choose "number of groups" OR "target group size" (radio toggle, mutually exclusive), a "Generate" action producing a proposed allocation shown as group cards/columns with drag-or-dropdown-based member reassignment, warnings for groups under 2 members, and a Confirm step.

Groups Overview - read view of confirmed groups per class/assessment with member lists and an "Edit" entry point back into the review UI (disabled/explained once an assessment is open and has submissions, per business rules).

5.4 Lecturer - Assessments

Assessment List - table of assessments per class: name, dates, status badge (Draft/Open/Closed), submission progress mini-bar, actions.

Assessment Setup (Create/Edit) - form: name, description, class (locked to current), group multi-select (checkboxes per group), opening/closing date-time pickers, rating-scale display (read-only preview of the 9 descriptive options, see Section 6), Save as Draft.

Assessment Detail / Status - shows current status prominently, Activate/Close/Extend/Re-open actions each behind a ConfirmDialog with consequence text (e.g. re-opening after calculation warns that results will be invalidated), and quick links to Monitor / Matrix / Marks for this assessment.

5.5 Lecturer - Monitoring & Matrix

Submission Monitor - per-assessment view: overall submitted/outstanding/total stat row, a per-group breakdown table, an "Outstanding students" list (name, student number), badges for Unmatched / Conflict enrolments needing resolution, and a "Send reminder" action (disabled/mocked) limited to outstanding students.

Evaluation Matrix - the centerpiece screen. A group-selector, then a square grid: rows = evaluators, columns = evaluated, cells show the descriptive rating label (lecturer view may also show the numeric value in small text since this view is lecturer-only). Diagonal cells marked "-" (self, n/a). Row and column means, group mean. Non-submitting evaluators shown as a visually distinct "outstanding" row (not blank cells that could read as zero). Highlight cells materially above/below the group mean with both colour AND an icon (up/down arrow). Include free-rider / anomaly badges on affected students (uniform-rating, reciprocal-extremes, isolated-outlier, incomplete-group, low-mean flags) with a tooltip/popover explaining the reason. Matrix scrolls horizontally on small screens without breaking layout.

Audit Log - filterable table (date range, event type) of audit entries for the lecturer's classes: timestamp, actor, event type, object, brief before/after.

5.6 Lecturer - Marks & Results

Group Mark Entry - table of groups in an assessment with an editable base-mark input per group (validated numeric, 0–max, correct decimal places), a clear "outstanding" indicator for groups without a mark yet, save-as-you-go behaviour, and a "Calculate marks" button that's disabled until every group has a mark.

Results Summary - one row per student: group, mean received rating, adjustment factor, group base mark, final individual mark, flags, override indicator. Sortable columns, filters (flagged only / overridden only / by group), summary stat cards at top (submission rate, mean adjustment factor, mean final mark). Clicking a row opens a drill-down panel/drawer showing the ratings that produced that student's mark.

Mark Override dialog - from the drill-down, an "Override mark" action: shows calculated mark (read-only), new mark input, mandatory reason textarea, Save disabled until reason is filled.

Export - a simple screen summarising what will be exported (student count, two-worksheet explanation: Results + Raw Ratings), a header-info preview (class, assessment, timestamp, calculation run id), and an "Export to .xlsx" button (mock the download trigger with a toast: "peerly_CMPG323_export.xlsx downloaded").

5.7 Student Portal

Student Dashboard - card(s) per assessment showing class, group, status (Not yet open / Not started / In progress / Submitted / Closed – not submitted), closing date/time prominently, and a primary CTA into the evaluation form. If the student's enrolment is Unmatched or Conflict, show a friendly full-page explanation state instead of an empty dashboard ("We couldn't match your account to a class list yet - here's why, here's what to do").

Peer Evaluation Form - one rating block per group member (excluding self): member name, then the 9 descriptive options shown as selectable cards/radio buttons each with its label + behavioural description visible inline (no tooltip, no hidden legend - see Section 6). No numbers shown anywhere. Optional short comment field per member (character-limited, e.g. 500). A sticky progress indicator ("3 of 5 rated"). Autosaves as a draft (show a subtle "saved" indicator).

Review Screen - read-only restatement of every selection using the exact same wording as the form, with an "Edit" link back to each block, and a "Submit evaluation" primary action. Block submission with a clear message if anything is unrated.

Submission Confirmation - unambiguous success state: what was submitted, exact timestamp, whether it can still be amended before the assessment closes, and a link back to the dashboard.

6. The rating scale (exact copy - use verbatim in the student-facing UI)

Show these as the selectable options on the evaluation form, in this order, label + description together, no numbers visible to students:

LabelDescription shown to studentExcellentConsistently went above and beyond what was asked, took the lead, carried more than their share.Very goodConsistently did everything they were asked to do, and did it well.SatisfactoryUsually did what they were asked to do, at an acceptable standard.OrdinaryOften did what they were asked to do, but needed reminding.MarginalSometimes failed to attend meetings or to complete what was asked.DeficientOften failed to attend meetings or to complete what was asked.UnsatisfactoryConsistently failed to attend meetings or to complete what was asked.SuperficialContributed practically nothing to the work of the group.No contributionNever attended and contributed nothing at all.

Hidden numeric values (100, 87.5, 75, 62.5, 50, 37.5, 25, 12.5, 0) may appear ONLY in lecturer-facing views (matrix, drill-down) - never in any student-facing screen or mock "API response" shape a student role would see.

7. Non-negotiable UX rules (carry through every relevant screen)

Every screen shows who's logged in, their role, and the class/assessment context they're working in.

Irreversible actions always get a named ConfirmDialog (see Section 3).

Actions that take a moment show a busy/disabled button state.

Validation errors are inline, plain-language, next to the field - never a raw/technical message.

Consistent terminology throughout: "group" (never "team"), "class" (never "module" as a label for the thing itself, though module code is a field), "assessment" (never "survey" or "form").

Status is always shown as a badge with text, never colour-only.

8. Mock data model (build TypeScript types + seed data for these)

User: id, role (admin | lecturer | student), name, surname, email, studentNumber?, status (active|inactive|unverified)

Class: id, moduleCode, name, lecturerId, academicPeriod

Enrolment: id, classId, studentNumber, importedName, importedSurname, matchStatus (matched|unmatched|conflict), userId?

Group: id, classId, groupNumber, memberStudentIds[]

Assessment: id, classId, name, description, groupIds[], status (draft|open|closed), opensAt, closesAt

RatingOption: id, label, description, hiddenValue, order (seed the 9 fixed options from Section 6)

Submission: id, assessmentId, evaluatorStudentId, status (draft|submitted), submittedAt?

PeerRating: submissionId, evaluatedStudentId, ratingOptionId, comment?

GroupMark: assessmentId, groupId, baseMark

CalculatedResult: studentId, assessmentId, meanReceived, adjustmentFactor, finalMark, flags[] (uniform-rating|reciprocal-extreme|isolated-outlier|incomplete-group|low-contribution|no-submission|group-of-two|unmatched), override?: { mark, reason, by, at }

AuditEntry: id, timestamp, actorName, actorRole, eventType, objectDescription, detail

Seed at least: 1 lecturer with 2 classes, one class with ~30 students in 6 groups, one Open assessment with realistic partial submissions (including at least one Unmatched student, one Conflict student, one uniform-rating pattern, and one group with a missing base mark) so every UI state in this spec is actually visible without extra clicking through empty states.

9. Deliverable expectations

Every screen listed in Section 5 exists and is reachable (via the dev role-switcher + normal navigation).

Shared components (Button, Input, Select, Dialog, ConfirmDialog, Toast, Badge, DataTable, StatCard, ProgressBar, FileUpload, EmptyState, Matrix grid) are built once in a src/components/ui or src/components/shared folder and reused.

Responsive: Admin Portal usable at tablet width and up; Student Portal usable from 360px up with no horizontal scroll (except the matrix, which is lecturer/desktop-only anyway).

Realistic, generous mock data - this should look and feel like a real class's data, not three rows of "Test Student."

---

## Running the project

Requires **Node.js 22+** and a local **PostgreSQL 14+**.

### Frontend

```sh
npm install
npm run dev          # http://127.0.0.1:7331
```

The port is pinned in `vite.config.ts` with `strictPort`, so a clash with
another project fails loudly instead of silently serving the wrong app.

| Command          | Does                             |
| ---------------- | -------------------------------- |
| `npm run dev`    | Dev server with HMR              |
| `npm run build`  | Production build into `.output/` |
| `npm test`       | Unit tests (vitest)              |
| `npm run lint`   | ESLint                           |
| `npm run format` | Prettier                         |

### Backend

```sh
cd server
cp .env.example .env         # then set DATABASE_URL
createdb peerly_dev
npm install
npm run migrate
npm run dev                  # http://localhost:4000
```

| Command                  | Does                                                              |
| ------------------------ | ----------------------------------------------------------------- |
| `npm run migrate`        | Apply pending migrations                                          |
| `npm run migrate:status` | Show which migrations have run                                    |
| `npm run reset`          | Drop and rebuild the schema (refuses anything but `_dev`/`_test`) |

### Signing in

Sign-in is real: the API verifies the password, sets an `HttpOnly` session
cookie and enforces the session server-side. Create the accounts first with

```sh
cd server && npm run seed
```

Every seeded account uses the password **`peerly-dev-password`**.

| Email                      | Role                                |
| -------------------------- | ----------------------------------- |
| `riaan.botha@nwu.ac.za`    | System Administrator                |
| `anneke.vdmerwe@nwu.ac.za` | Lecturer - owns CMPG323 and CMPG315 |
| `sipho.dlamini@nwu.ac.za`  | Lecturer                            |
| `41200345@mynwu.ac.za`     | Student (Lerato Mokoena)            |

Thirty students are seeded, from `41200345` in steps of 37; each signs in with
`<studentnumber>@mynwu.ac.za`. Twenty-eight are matched to the CMPG323 class
list, one is left unmatched and one in conflict, so those two states are
reachable without engineering them. The role switcher in the corner of every screen
signs in through the API like anyone else, so what it shows you is what the
session actually permits.

**Both servers must be running.** The web app calls `/api`, which the dev server
proxies to the API on port 4000 - so the browser sees one origin and the session
cookie is sent. Running the web app alone leaves every sign-in failing at the
network.

### Optional groups in class-list imports

Include a `Group Number` column in a `.csv` or `.xlsx` class list to assign
students to groups during import. Headings such as `Group`, `Group No`, and
`GroupNumber` are also recognised; confirm or change the mapping before importing.
Use positive whole numbers. Blank cells leave new students unallocated, and
omitting the column keeps the existing import and group-generation workflow.

The preview shows the group numbers and reports invalid values. On confirmation,
groups are created or reused automatically. Assignments for students who have not
registered or have an account conflict are saved and shown in the group overview;
they join once their accounts are matched, provided the groups are still editable.
Existing group assignments are preserved: a different number is reported as a row
error. Imports cannot add allocations to groups locked by an assessment.

You can also include optional `Group Name` and `Group Lead` (or `Group Leader`)
columns. A name labels the numbered group; it does not replace the group number.
Mark one student's leader cell with `x` (uppercase `X` also works), and leave the
other cells blank. The designation is displayed in the lecturer and student group
views and grants no additional permissions.

Group names also appear beside group numbers in assessment selection, marks and
calculation, monitoring, the matrix, results and student evaluation screens.
The same small leader badge appears in the corresponding member lists.

For example:

```csv
Student Number,Surname,Name,Group Lead,Group Number,Group Name
41200345,Mokoena,Lerato,x,7,Query Queens
41200382,Nkosi,Thandi,,7,Query Queens
41200419,Pretorius,Johan,,12,Data Dealers
```

Names can be up to 120 characters. Supply the same name on each row of a group,
or supply it once and leave the others blank. Different names or multiple leaders
for one group are flagged in the preview, and that group's rows are skipped until
corrected. A name or leader marker requires a group number on that row. Supplied
values update the group's label or leader; blank cells and omitted columns keep
existing values. Locked groups cannot have their names or leaders changed by an
import. A leader awaiting registration or conflict resolution is retained and
shown to the lecturer; students see the designation once that account joins.
Regenerating class groups replaces the allocation and clears imported names and
leader designations.

### Brand assets

Favicons and the social share image are generated from the SVG sources in
`brand/`. After editing those, run:

```sh
node brand/generate.mjs
```

## Project status

See [`scope.md`](./scope.md) for every requirement in the specification with its
current status, the known gaps, and the recommended build order.
