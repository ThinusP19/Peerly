# Peerly API reference

This reference covers requirement OR-27 (API documentation). It lists every HTTP endpoint the Express API in `server/` exposes. It was written from `server/src/app.ts`, `server/src/routes/*.ts`, `server/src/middleware/*.ts` and the services those routes call, and it describes the code as it stands. If a route and this page disagree, the route is right, so fix this page.

**58 endpoints**: 57 under `/api` plus `GET /health`.

| Area | Mounted at | Endpoints | Who may call |
| --- | --- | --- | --- |
| [Health](#health) | `/health` | 1 | Anyone |
| [Authentication](#authentication-apiauth) | `/api/auth` | 11 | Mostly public. `me` and `change-password` need a session |
| [Staff accounts](#staff-accounts-apiaccounts) | `/api/accounts` | 5 | `admin` |
| [Audit log](#audit-log-apiaudit) | `/api/audit` | 1 | `lecturer`, `admin` |
| [Classes, class lists, groups](#classes-apiclasses) | `/api/classes` | 17 | `lecturer`, and only for classes they own |
| [Assessments, marks, results, export](#assessments-apiassessments) | `/api/assessments` | 18 | `lecturer`, and only for assessments they own. `rating-options` accepts any signed-in role |
| [Student portal](#student-portal-apistudent) | `/api/student` | 5 | `student` |

---

## Conventions

### Transport and format

- Every request body is JSON (`content-type: application/json`, 1 MB limit). The exception is the three class-list import endpoints, which take `multipart/form-data`.
- Every response is JSON except `GET /api/assessments/:assessmentId/export`, which returns an `.xlsx` file.
- Timestamps are ISO-8601 strings in UTC (`2026-09-22T08:03:32.585Z`). Where a request takes a timestamp, the format is noted.
- Identifiers are UUIDs. The one exception is audit entry ids, which are numeric strings. A path parameter that is not a valid UUID fails validation with `400 validation_failed` before any query runs.
- Marks and factors are JSON numbers. PostgreSQL returns `numeric` columns as strings, and the services convert them to numbers deliberately (`server/src/db/pool.ts`).

### Authentication

A session is an opaque random token in the `peerly_session` cookie (`HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when `NODE_ENV=production`). The database stores only the token's SHA-256 hash (`sessions.token_hash`). There are no bearer tokens or API keys.

- **`requireAuth`** (`server/src/middleware/auth.ts`) looks the cookie up. The session must be unrevoked, inside its absolute lifetime (`SESSION_ABSOLUTE_MINUTES`, default 720) and inside its idle window (`SESSION_IDLE_MINUTES`, default 30), and the account must be `active`. If any check fails, the cookie is cleared and the request gets `401 unauthorized`.
- **`requireRole(...roles)`** runs after `requireAuth`. It returns `403 forbidden` when the role is wrong. Administrators are not superusers: an `admin` cannot call lecturer or student routes (SR-16).
- **Ownership** is checked in the services on every request. A class or assessment the caller does not own gets the same `404 not_found` as one that does not exist (SR-07).

Clients must send the cookie (`credentials: "include"`) and must be same-site with the API. In development, Vite proxies `/api`. In production, the reverse proxy serves both on one origin. See [technical-handover.md](./technical-handover.md#54-tls-termination-and-the-reverse-proxy).

### CORS and origins

Every request that carries an `Origin` header is checked against `CORS_ORIGINS`. Browsers send `Origin` on every `POST`, `PUT`, `PATCH` and `DELETE`, including same-origin ones. **An origin missing from the list gets `403 forbidden`** with the message *"Origin … is not allowed to call this API."* In production, `CORS_ORIGINS` must therefore contain the public URL, for example `https://peerly.nwu.ac.za`, or every write fails.

### Rate limits

| Limit | Scope | Production value | Outside production |
| --- | --- | --- | --- |
| Global | Every route, per client IP | 300 requests per minute | Same |
| `signInLimit` | `/verify`, `/login`, `/reset-password`, `/activate`, per IP | 20 per 15 minutes | 1,000,000 (effectively off) |
| `emailLimit` | `/register`, `/register/resend`, `/forgot-password`, per IP | 8 per 60 minutes | 1,000,000 |
| Account lock-out (SR-04) | `/login`, per e-mail address | 5 consecutive failures lock the address for 15 minutes | Same |
| Source lock-out | `/login`, per IP | 30 failures in 15 minutes | Same |
| Verification code | `/verify`, per code | 5 wrong guesses spend the code | Same |

A client that goes over a rate limit gets `429 rate_limited`. A lock-out does not return 429. It gives the same `401` as a wrong password, so the response does not reveal that the account is locked (SR-06). Rate-limit state lives in process memory. If you run more than one API process, each one counts separately. The API trusts exactly one proxy hop (`app.set("trust proxy", 1)`) when it takes the client IP from `X-Forwarded-For`.

Responses carry the `RateLimit-Policy` and `RateLimit` headers (IETF draft-7).

### Errors

Every error has the same shape:

```json
{ "error": { "code": "conflict", "message": "Only a draft assessment can be opened.", "fields": { "closesAt": "..." } } }
```

`message` is plain language written for the end user. `fields`, when present, maps a request field to the message for that field.

| Status | `code` | Raised when |
| --- | --- | --- |
| 400 | `validation_failed` | The request failed its zod schema. `fields` is keyed by the zod path joined with `.`, for example `email`, `groups.0.memberStudentIds.2` or `entries.1.comment`. A top-level problem uses the key `_`. |
| 400 | `bad_request` | A service refused the input, such as a wrong current password, an empty file, or a mark out of range. `fields` is present when the problem belongs to one field. |
| 401 | `unauthorized` | No session, an expired or revoked session, or failed sign-in, verification or activation |
| 403 | `forbidden` | Signed in, but this portal belongs to a different role, or the request came from an origin not in `CORS_ORIGINS` |
| 403 | `wrong_sign_in` | `POST /api/auth/login` only: the password is right, but the sign-in form (`as`) is not the account's role. No session is created. |
| 404 | `not_found` | Unknown route (`"No such endpoint."`), or a resource that does not exist or is not yours (`"We couldn't find that, or you don't have access to it."`) |
| 409 | `conflict` | The request is valid but the resource's current state forbids it, such as a wrong status transition, a closed assessment, or groups that already exist |
| 409 | `rule_violation` | A database constraint refused the write (unique `23505`, foreign key `23503`, check `23514`). The constraint name is logged on the server and never returned. |
| 429 | `rate_limited` | Over a rate limit |
| 400 | `malformed_request` | The body, or a JSON field inside an upload, is not valid JSON. |
| 500 | `internal_error` | Anything else. The stack trace goes to the server log and never to the client. |

A body that is not valid JSON, and a `mapping` form field on the class-list preview or commit that is not valid JSON, both return `400 malformed_request`. An `.xlsx` upload that exceljs cannot open returns `400 bad_request`. An `Origin` missing from `CORS_ORIGINS` returns `403 forbidden`.

**Known case that returns 500 instead of a 4xx** (the client sees the generic message): a JSON body larger than 1 MB. `express.json()` raises a `413` error that the error handler does not recognise.

---

## Shared response shapes

These shapes appear in more than one response. `?` marks a key that is left out, not set to `null`, when it has no value.

```ts
// Returned by the auth routes. The account's own details, never a password hash.
PublicUser = { id, role: "admin"|"lecturer"|"student", name, surname, email,
               studentNumber?: string, status: "active"|"inactive"|"unverified", createdAt }

ClassRecord = { id, moduleCode, name, lecturerId, academicPeriod }

AssessmentRecord = { id, classId, name, description, groupIds: string[],
                     status: "draft"|"open"|"closed", opensAt, closesAt, maxMark: number,
                     closedAt?,   // when the lecturer actually closed it; only while closed
                     calculatedAt?, calculationRunId?, exportedAt? }

// A student as their own lecturer sees them.
Person = { id, role: "student", name, surname, email, studentNumber: string|null,
           status, createdAt }

StaffAccount = { id, role: "admin"|"lecturer", name, surname, email, status, createdAt }

DeletionImpact = { unexportedAssessments: string[], submissions, ratings,
                   assessments, enrolments, groups }   // all numbers except the first
```

---

## Health

### `GET /health`

- **Auth:** none. The route sits outside `/api`, so decide at the reverse proxy whether to expose it publicly.
- **200:** `{ "status": "ok", "database": "up" }`
- **503:** `{ "status": "degraded", "database": "down" }` when `SELECT 1` against PostgreSQL fails.

Use this route for load-balancer and uptime checks.

---

## Authentication (`/api/auth`)

Source: `server/src/routes/auth.ts`, plus `services/registration.ts`, `services/authentication.ts`, `services/recovery.ts` and `services/sessions.ts`.

Where a route below takes a password, the schema only checks that it is not empty (`min(1)`). The password policy (SR-02, `server/src/lib/password.ts`: at least 8 characters, not a common password, and not containing the e-mail address, its local part or the student number) is enforced in `/register`, `/activate`, `/reset-password` and `/change-password`. A failure returns `400 bad_request` with the reason in `fields.password`.

### `POST /api/auth/register`

This is student self-registration (FR-02). It creates an `unverified` student account, or updates one that is still unverified, and e-mails a 6-digit code.

- **Auth:** none. Rate limit: `emailLimit`.
- **Body:**

  | Field | Type | Rule |
  | --- | --- | --- |
  | `name` | string | trimmed, non-empty, at most 120 characters |
  | `surname` | string | trimmed, non-empty |
  | `email` | string | valid e-mail whose domain is in `STUDENT_EMAIL_DOMAINS` |
  | `studentNumber` | string | exactly 8 digits, and the same as the e-mail address's local part (`12345678` goes with `12345678@mynwu.ac.za`) |
  | `password` | string | non-empty |
  | `noticeAccepted` | `true` | must be the literal `true` (the POPIA notice, OR-13) |

- **202:** `{ "ok": true }`. No account id is returned.
- **Errors:** `400 validation_failed`. `400 bad_request` with `fields.studentNumber` when the student number is not the one in the e-mail address ("Your student number and student email don't match..."): an NWU student address is the student number, so this stops anyone registering under a classmate's number. `400 bad_request` with `fields.password` when the password breaks the policy. `400 bad_request` with `fields.email` or `fields.studentNumber` when an active or inactive account already holds the address or number. Naming the field is a deliberate departure from SR-06 at the Sponsor's request. `429`.

### `POST /api/auth/register/resend`

Sends a new verification code and makes any earlier code unusable.

- **Auth:** none. Rate limit: `emailLimit`.
- **Body:** `{ "email": string }`
- **202:** `{ "ok": true }`. The response is the same whether or not an unverified account exists for the address.
- **Errors:** `400 validation_failed`, `429`.

### `POST /api/auth/verify`

Checks the 6-digit code, activates the account and signs the student in.

- **Auth:** none. Rate limit: `signInLimit`.
- **Body:** `{ "email": string, "code": string }`. `code` must be exactly 6 digits.
- **200:** `{ "user": PublicUser }` and a `Set-Cookie: peerly_session=...` header.
- **Errors:** `400 bad_request` with `fields.code` covers every failure: unknown address, wrong code, expired code (`EMAIL_CODE_MINUTES`) and a code spent after 5 wrong guesses. `400 validation_failed`, `429`.

### `POST /api/auth/login`

- **Auth:** none. Rate limit: `signInLimit`, plus the account and source lock-outs.
- **Body:** `{ "email": string, "password": string, "as"?: "student" | "lecturer" | "admin" }`. Email and password are non-empty. The e-mail format is not checked. `as` names the sign-in form; the web app always sends it. Without it, any role signs in.
- **200:** `{ "user": PublicUser }` and `Set-Cookie`.
- **Errors:** `401 unauthorized` with one message ("We couldn't sign you in...") for every cause: unknown address, wrong password, an account that is not `active`, or a locked account. `403 wrong_sign_in` when the password is right but `as` is not the account's role: each sign-in form admits only its own role, enforced here rather than only in the web app. The message says which form to use ("This is a lecturer account. Use the lecturer sign-in."), `fields.as` names the right form, and no session is created. It is only sent after the password has been checked, so it reveals nothing to someone without it. `400 validation_failed`, `429`.

Every attempt is written to `login_attempts`.

### `POST /api/auth/logout`

- **Auth:** none, so that signing out works even after the session has expired.
- **Body:** none.
- **200:** `{ "ok": true }`. If the cookie holds a live session, that session is revoked. The cookie is always cleared.

### `GET /api/auth/me`

- **Auth:** `requireAuth`, any role.
- **200:** `{ "user": PublicUser }`
- **Errors:** `401`.

### `POST /api/auth/forgot-password`

E-mails a reset link (`APP_URL/reset-password?token=...`) if an `active` account holds the address.

- **Auth:** none. Rate limit: `emailLimit`.
- **Body:** `{ "email": string }` (must be a valid e-mail address)
- **202:** `{ "ok": true }`. The response is the same whether or not the account exists (SR-06).
- **Errors:** `400 validation_failed`, `429`.

### `POST /api/auth/reset-password`

- **Auth:** none. Rate limit: `signInLimit`.
- **Body:** `{ "token": string, "password": string }`
- **200:** `{ "ok": true }`. The password is changed, the token is consumed and **every** session the account holds is revoked. The user then signs in again.
- **Errors:** `400 bad_request` with `fields.token` when the token is unknown, already used or expired (`RECOVERY_TOKEN_MINUTES`). `400 bad_request` with `fields.password` when the password breaks the policy. `400 validation_failed`, `429`.

### `POST /api/auth/change-password`

- **Auth:** `requireAuth`, any role. There is no dedicated rate limit, only the global one.
- **Body:** `{ "current": string, "newPassword": string }`
- **200:** `{ "ok": true }`. Every other session the account holds is revoked, and the session that made the change stays signed in.
- **Errors:** `400 bad_request` with `fields.current` ("That isn't your current password."). `400 bad_request` with `fields.newPassword` when the new password equals the current one or breaks the policy. `401`, `400 validation_failed`.

### `GET /api/auth/activation?token=...`

The activation page calls this before it shows its form.

- **Auth:** none. Only the global rate limit applies.
- **Query:** `token` (non-empty string)
- **200:** `{ "account": { "name", "email", "role" } }`, or `{ "account": null }` when the token is unknown, used or expired. A `null` account is not an error.
- **Errors:** `400 validation_failed` when `token` is missing.

### `POST /api/auth/activation/resend`

"Send me a new link" on the page for an activation link that no longer works.

- **Auth:** none. Rate limit: `emailLimit`.
- **Body:** `{ "email": string }`
- **202:** `{ "ok": true }`, whatever the address. A new link is sent (and the account's earlier links stop working) only when the address belongs to an `unverified` lecturer or administrator account; it goes to the address on the account. The request is written to the audit log as `account.activation_resent`. An active account needs `forgot-password` instead, and gets nothing here (SR-06).
- **Errors:** `400 validation_failed`, `429`.

### `POST /api/auth/activate`

A staff member sets their first password from the e-mailed link (FR-01, FR-03). The same flow bootstraps the initial administrator (AS-06). See [technical-handover.md](./technical-handover.md#59-the-initial-administrator-account-as-06).

- **Auth:** none. Rate limit: `signInLimit`.
- **Body:** `{ "token": string, "password": string }`
- **200:** `{ "user": PublicUser }` and `Set-Cookie`. The account becomes `active` and the token is consumed.
- **Errors:** `400 bad_request` with `fields.token` when the link has expired or been used, or the account is `inactive`. `400 bad_request` with `fields.password` when the policy fails. `400 validation_failed`, `429`.

---

## Staff accounts (`/api/accounts`)

Source: `server/src/routes/accounts.ts` and `services/accounts.ts`. **Every route requires `requireAuth` and `requireRole("admin")`.** These routes manage `admin` and `lecturer` accounts only. A student account id gets `404` (SR-16). Nobody can set another user's password. A new account receives an activation link by e-mail.

### `GET /api/accounts`

- **200:** `{ "accounts": StaffAccount[], "activeAdmins": number }`, sorted by surname and then name.

### `POST /api/accounts`

Creates an `unverified` staff account with no password and e-mails its activation link (`APP_URL/activate?token=...&email=...`, valid for `ACTIVATION_TOKEN_MINUTES`).

- **Body:** `{ "role": "admin"|"lecturer", "name": string, "surname": string, "email": string }`. `name` and `surname` are 1 to 100 characters after trimming. The e-mail domain must be in `STAFF_EMAIL_DOMAINS`.
- **201:** `{ "account": StaffAccount }`
- **Errors:** `400 validation_failed`. `400 bad_request` with `fields.email` for a domain that is not a staff domain. `409 conflict` with `fields.email` ("An account already uses that email address.") when the e-mail address is already in use.

### `POST /api/accounts/:userId/activation`

Sends the activation link again, for an account that has never been activated (FR-01, FR-03).

- **Params:** `userId` (uuid)
- **Body:** none.
- **200:** `{ "account": StaffAccount }`. A new link is e-mailed, valid for `ACTIVATION_TOKEN_MINUTES`, and every earlier unused activation link for the account stops working. An `account.activation_resent` audit entry is written.
- **Errors:** `409 conflict` when the account is `active` ("This account is already active. Ask its holder to use \"Forgot password\" instead.") or `inactive` ("This account is deactivated. Reactivate it first."). An active account's holder resets their own password; the administrator cannot issue a link that would take it over (SR-16). `404` for an unknown id or a student id.

### `PATCH /api/accounts/:userId`

- **Params:** `userId` (uuid)
- **Body:** any of `{ "name", "surname", "email", "role": "admin"|"lecturer" }`, each optional. `name` and `surname` are 1 to 100 characters. `email` must be a staff-domain address.
- **200:** `{ "account": StaffAccount }`. Every change to the name, surname, e-mail address or role is written to the audit log as `account.updated`, with the old and new values. Correcting the e-mail address of an `unverified` account also e-mails a new activation link to the new address, and the link sent to the old one stops working.
- **Errors:** `409 conflict` when the e-mail address of an account that has been activated (status `active` or `inactive`) would change. Password resets go to that address, so whoever held a new one could take the account over; create a new account for the new address instead. `409 conflict` when the change would demote the last active administrator. `409 conflict` with `fields.email` when the e-mail address is already in use. `404` for an unknown id or a student id. `400`.

### `POST /api/accounts/:userId/status`

- **Params:** `userId` (uuid)
- **Body:** `{ "status": "active"|"inactive" }`
- **200:** `{ "account": StaffAccount }`. Deactivating an account revokes all of its sessions immediately. No record is deleted (BR-14). Activating an `inactive` account that never had a password returns it to `unverified`, not `active`.
- **Errors:** `409 conflict` when the change would deactivate the last active administrator, or when it would activate an account that is still `unverified` (the holder has to use their link). `404`, `400`.

---

## Audit log (`/api/audit`)

Source: `server/src/routes/audit.ts` and `services/audit.ts`. **`requireAuth` and `requireRole("lecturer", "admin")`.** The log is read-only. No route writes to it or deletes from it, and database triggers refuse `UPDATE` and `DELETE`.

### `GET /api/audit`

- **Query (all optional):**

  | Param | Type |
  | --- | --- |
  | `eventType` | one of the event types below. The value is not checked, so an unknown type returns an empty list. |
  | `eventPrefix` | every event type starting with this, e.g. `account.`. |
  | `from`, `to` | ISO-8601 datetime **in UTC with a `Z` suffix** (`2026-09-01T00:00:00Z`). An offset such as `+02:00` is rejected with 400. |
  | `fromDate`, `toDate` | `YYYY-MM-DD`, inclusive, read as a **South African (Africa/Johannesburg) calendar day**, the day the web app shows beside each entry. An entry at 01:30 SAST on the 26th is under the 26th, although its UTC date is the 25th. |
  | `classId` | uuid. Narrows to one class. For a lecturer it is intersected with their own classes, so another lecturer's class returns nothing. |
  | `limit` | 1 to 500, default 500. |
  | `cursor` | the `nextCursor` of the previous page. Anything else is rejected with 400. |

- **Scope:** an `admin` sees every entry. A `lecturer` sees only entries whose `class_id` belongs to a class they own. Account and password events carry no class, so lecturers never see them.
- **200:** `{ "entries": AuditEntry[], "total": number, "nextCursor"?: string }`, newest first. `total` counts every entry that matches the filters, not only this page. `nextCursor` is present when there are more; pass it back as `cursor` to get them. Paging is by (time, id), so entries written between two requests never shift or repeat a page.

  ```ts
  AuditEntry = { id: string, timestamp, actorName, actorRole: Role|null, eventType,
                 objectDescription, detail, classId? }
  ```

- **Event types:** `account.created`, `account.updated`, `account.activated`, `account.deactivated`, `account.activation_resent`, `password.changed`, `class.created`, `class.imported`, `class.deleted`, `enrolment.matched`, `enrolment.conflict`, `enrolment.resolved`, `groups.confirmed`, `assessment.created`, `assessment.updated`, `assessment.opened`, `assessment.closed`, `assessment.reopened`, `assessment.deleted`, `evaluation.submitted`, `evaluation.amended`, `reminders.sent`, `marks.entered`, `marks.calculated`, `mark.overridden`, `results.exported`.
- `evaluation.submitted` and `evaluation.amended` record who submitted, for which assessment and class, and how many ratings. They never record a rating, its value or a comment. Saving a draft is not audited: it changes nothing a mark is calculated from.
- `enrolment.matched` and `enrolment.conflict` are written by automatic class-list matching (FR-04), one per enrolment, with the student who activated or the lecturer who imported as the actor.

The `before_state` and `after_state` columns are stored but not returned by the API. Read them in SQL when you investigate an incident.

---

## Classes (`/api/classes`)

Source: `server/src/routes/classes.ts`, plus `services/classes.ts`, `import.ts`, `class-list.ts`, `groups.ts`, `enrolments.ts`, `monitoring.ts`, `assessments.ts` and `deletion.ts`. **Every route requires `requireAuth` and `requireRole("lecturer")`.** Every route that names a class or enrolment checks that the caller owns it. If they don't, the response is `404`.

`:classId` and `:enrolmentId` must be UUIDs. Otherwise the response is `400 validation_failed`.

### Reading

| Method and path | 200 response |
| --- | --- |
| `GET /api/classes` | `{ "classes": ClassSummary[] }`: the caller's classes, sorted by module code |
| `GET /api/classes/:classId` | `{ "klass": ClassRecord }` |
| `GET /api/classes/:classId/enrolments` | `{ "enrolments": EnrolmentRow[] }`, sorted by student number |
| `GET /api/classes/:classId/groups` | `{ "groups": { id, classId, groupNumber, memberStudentIds: string[] }[] }` |
| `GET /api/classes/:classId/assessments` | `{ "assessments": { assessment: AssessmentRecord, groupCount, submitted, expected }[] }`, newest `opensAt` first |
| `GET /api/classes/:classId/roster` | `{ "students": Person[] }`. Only students who are **in a group** appear. |
| `GET /api/classes/:classId/groups/editable` | `{ "editable": boolean, "reason": string\|null }`. `reason` is set when a non-draft assessment already has submissions (FR-11). The current web app does not call this endpoint. |
| `GET /api/classes/:classId/impact` | `{ "impact": DeletionImpact }`: what deleting the class would destroy |

```ts
ClassSummary = { klass: ClassRecord, studentCount, matchedCount, unmatchedCount, conflictCount,
                 groupCount, assessmentCount,
                 activeAssessment?: { id, name, status, closesAt } }  // an open assessment first, otherwise the next draft

EnrolmentRow = { id, classId, studentNumber, importedName, importedSurname,
                 matchStatus: "matched"|"unmatched"|"conflict",
                 userId?, matchNote?, account?: { id, name, surname, email }, groupNumber? }
```

Errors: `401`, `403` (role other than lecturer), `404`.

### `POST /api/classes`

Creates a class. The owner is always the caller (BR-11).

- **Body:** `{ "moduleCode": string, "name": string, "academicPeriod": string }`, each trimmed and non-empty. `moduleCode` is upper-cased.
- **201:** `{ "klass": ClassRecord }`
- **Errors:** `409 conflict` when that module code already exists for that academic period. Any other insert failure also comes back as this conflict. `400 validation_failed`.

### Class-list import (FR-08, FR-09)

All three import routes take `multipart/form-data`:

| Part | Required by | Content |
| --- | --- | --- |
| `file` | all three | one `.csv` or `.xlsx` file, at most 5 MB and 2,000 data rows. `.xls` is refused with instructions. The file is kept in memory and never written to disk. |
| `mapping` | preview, commit | a JSON **string**: `{ "studentNumber": "<header>", "name": "<header>", "surname": "<header>", "email"?: "<header>" }` naming the file's column headers |
| `mode` | commit | `"extend"` (the default, and what any invalid value becomes) or `"replace"` |

At most 12 non-file fields are accepted. Upload errors come back as `400 bad_request`: "larger than 5 MB", "couldn't read that upload", "Choose a file to upload.", "That file is empty.", "more than 2000 rows", "no column headings", "Upload a .csv or .xlsx file.", and `The file has no column called "<x>"` for a mapping that names a missing header.

#### `POST /api/classes/:classId/import/inspect`

- **200:** `{ "headers": string[], "rowCount": number, "suggested": Partial<Mapping>, "sample": string[][] }`. `sample` holds the first 5 data rows.

#### `POST /api/classes/:classId/import/preview`

Validates every row using the same function the commit uses.

- **200:**
  ```ts
  { preview: { headers: string[],
               valid: { row, studentNumber, name, surname, email? }[],
               errors: { row, field: "studentNumber"|"name"|"surname"|"email", message,
                         values: { studentNumber, name, surname, email } }[],  // what the row held
               duplicatesInFile: number,   // valid rows already on this class list
               totalRows: number } }
  ```
  `row` counts from 1 and includes the header row, so it matches the row number a spreadsheet program shows. Blank rows are skipped but still counted. A CSV may be UTF-8 or Windows-1252 (Excel's plain "CSV" format), and separated by commas or semicolons.

#### `POST /api/classes/:classId/import/commit`

Runs in one transaction. Each row is upserted on `(class_id, student_number)` and matched to a registered student account with the same student number (FR-04). A row in `conflict` is matched again, so a corrected name settles it; a match, and an entry a lecturer left unmatched, are kept. `replace` also deletes enrolments that are not in the file.

- **200:** `{ "result": { imported, updated, removed, matched, unmatched, conflicts } }`. `matched`, `unmatched` and `conflicts` count the whole class list after the import.
- **Errors:** `400 bad_request` when there are no valid rows to import. `409 conflict` for `replace` when the class already has groups (BR-09).

### Groups (FR-10, FR-11)

#### `POST /api/classes/:classId/groups/propose`

Proposes an allocation and writes nothing. Matched students are dealt round-robin in student-number order, so the same input always gives the same proposal.

- **Body:** `{ "mode": "count"|"size", "value": integer }`, where `value` is from 1 to 500. `count` is the number of groups. `size` is the target number of students per group.
- **200:** `{ "groups": { groupNumber, memberStudentIds }[], "warnings": string[], "eligibleCount": number }`. A warning names any group with fewer than 2 members.
- **Errors:** `400 bad_request` when the class has no matched students.

#### `PUT /api/classes/:classId/groups`

Confirms an allocation and **replaces** all of the class's groups in one transaction.

- **Body:** `{ "groups": [ { "groupNumber": positive int, "memberStudentIds": uuid[] } ] }`. At least one group is required.
- **200:** `{ "result": { groupCount, memberCount, replaced } }`
- **Errors:** `409 conflict` when a non-draft assessment already has submissions. `400 bad_request` when a student appears in two groups, or a member is not a matched student on this class list. `409 rule_violation` for a duplicate `groupNumber`. Another `409 rule_violation` case: the current groups are referenced by stored calculation results, which can happen when an assessment was calculated with no submissions.

### Match conflicts (FR-04)

#### `GET /api/classes/enrolments/:enrolmentId/candidates`

- **200:** `{ "candidates": { id, name, surname, email, studentNumber, status: "active"|"inactive"|"unverified" }[] }`: student accounts whose student number equals the enrolment's.

#### `POST /api/classes/enrolments/:enrolmentId/resolve`

- **Body:** either `{ "kind": "link", "userId": uuid }` or `{ "kind": "leave-unmatched" }`
- **200:** `{ "ok": true }`
- **Errors:** `409 conflict` when the enrolment is not in `conflict` status, or the account does not hold the entry's student number (only the accounts `/candidates` offers can be linked). `409 rule_violation` when the account is already on this class list. `404`.

### `DELETE /api/classes/:classId`

Permanently deletes the class. This cascades to its enrolments, groups, assessments, submissions, ratings, marks and results (FR-28). The audit entry recording the deletion is kept. The web app asks for confirmation using `GET .../impact`, but the API itself does not require confirmation.

- **200:** `{ "ok": true }`
- **Errors:** `404`.

---

## Assessments (`/api/assessments`)

Source: `server/src/routes/assessments.ts`, plus `services/assessments.ts`, `assessment-writes.ts`, `monitoring.ts`, `results.ts`, `export.ts` and `deletion.ts`. **Every route requires `requireAuth`. Every route except `rating-options` also requires `requireRole("lecturer")`**, and the service checks that the caller owns the class the assessment belongs to. If not, the response is `404`.

### `GET /api/assessments/rating-options`

- **Auth:** any signed-in role.
- **200:** `{ "options": { id, label, description, order, hiddenValue? }[] }`: active options in display order. **`hiddenValue` is removed on the server for students** (SR-08, BR-15). Lecturers and admins receive it.

### Reading an assessment

| Method and path | 200 response |
| --- | --- |
| `GET /api/assessments/:assessmentId` | `{ "assessment": AssessmentRecord }` |
| `GET /api/assessments/:assessmentId/progress` | `{ "progress": { group: { id, groupNumber }, members: Person[], submittedIds: string[], draftIds: string[], outstanding: Person[] }[] }`. `outstanding` means members without a *submitted* evaluation, so it includes students who only have a draft. |
| `GET /api/assessments/:assessmentId/submissions` | `{ "submissions": { id, assessmentId, evaluatorStudentId, status: "draft"\|"submitted", submittedAt?, updatedAt }[] }` |
| `GET /api/assessments/:assessmentId/ratings` | `{ "ratings": { submissionId, evaluatedStudentId, ratingOptionId, comment? }[] }`: raw ratings for the matrix, from **submitted** evaluations only. Ratings held in unsubmitted drafts are not returned. |
| `GET /api/assessments/:assessmentId/marks` | `{ "marks": { assessmentId, groupId, baseMark: number\|null }[] }`: one entry per participating group. `null` means no mark entered, which is not the same as 0. |
| `GET /api/assessments/:assessmentId/impact` | `{ "impact": DeletionImpact }`. `assessments` is always 1, and `enrolments` and `groups` are always 0. |

### `POST /api/assessments/:assessmentId/reminders`

E-mails a reminder to every student in the assessment who has not submitted, including those with only a draft (FR-18). There is no confirmation step on the server, and the web app sends it with one click.

- **Body:** none.
- **200:** `{ "sent": number }`: how many students were e-mailed. A `reminders.sent` audit entry records the count.
- **Errors:** `409 conflict` when the assessment is not open, when its opening time has not arrived yet (#13), when its closing time has passed, or when everyone has submitted. `404`.

### `POST /api/assessments`

Creates an assessment. It always starts as a `draft` (FR-12).

- **Body:**

  | Field | Type | Rule |
  | --- | --- | --- |
  | `classId` | uuid | a class the caller owns |
  | `name` | string | trimmed, non-empty |
  | `description` | string? | at most 2,000 characters |
  | `groupIds` | uuid[] | at least 1. Every group must belong to `classId`, which a composite foreign key enforces. |
  | `opensAt`, `closesAt` | string | ISO-8601 datetime. An offset is allowed (`2026-10-01T08:00:00+02:00`). `closesAt` must be after `opensAt`. |
  | `maxMark` | number? | more than 0 and at most 1,000, with at most two decimal places. The default is 100. |

- **201:** `{ "assessment": AssessmentRecord }`
- **Errors:** `400 bad_request` with `fields.closesAt`. `409 rule_violation` for a group from another class. `404` for a class the caller doesn't own.

### `PATCH /api/assessments/:assessmentId`

- **Body:** any subset of the create fields except `classId`. Every field is optional.
- **200:** `{ "assessment": AssessmentRecord }`. A change to `closesAt`, for example an extension, is written to the audit log with the old and new times.
- **Errors:** `409 conflict` when `groupIds` names a different set of groups for an assessment that is no longer a draft (the same set, in any order, is accepted). `400 bad_request` with `fields.closesAt`, or with `fields.maxMark` when the new maximum is below a base mark, calculated mark or override already recorded (BR-07).
- **Note:** changing `maxMark` on a calculated assessment clears `calculatedAt` and `calculationRunId`, because the marks were capped at the old maximum.

### `POST /api/assessments/:assessmentId/status`

A named state transition (FR-13).

- **Body:** `{ "transition": "open"|"close"|"reopen", "closesAt"?: datetime }`. The legal moves are `draft → open`, `open → closed` and `closed → open`. `closesAt` sets a new closing time in the same step, for `open` and `reopen` only.
- **200:** `{ "assessment": AssessmentRecord, "invalidatedCalculation": boolean }`. Re-opening a calculated assessment clears `calculatedAt` and `calculationRunId`, and the response returns `true`. Closing records `closedAt`; re-opening clears it.
- **Errors:** `409 conflict` for an illegal move. `400 bad_request` with `fields.closesAt` when opening or re-opening while the closing time has already passed (students could not submit, BR-05): send a later `closesAt`.

### `PUT /api/assessments/:assessmentId/marks/:groupId`

Sets or clears a group's base mark (FR-21).

- **Params:** `assessmentId`, `groupId` (uuids)
- **Body:** `{ "baseMark": number|null }`. `null` clears the mark.
- **200:** `{ "ok": true, "invalidatedCalculation": boolean }`. A mark that changes on a calculated assessment clears `calculatedAt` and `calculationRunId` (as re-opening does) and returns `true`: results and export then wait for a recalculation. Sending the value already stored changes nothing and writes no audit entry.
- **Errors:** `400 bad_request` with `fields.baseMark` when the mark is outside `0..maxMark` or has more than one decimal place (IS-06). `404` when the group does not take part in this assessment.

### `POST /api/assessments/:assessmentId/calculate`

Runs the Felder calculation (FR-22) with the current `DEFAULT_CONFIG` in `server/src/lib/felder.ts`. It stores a new `calculation_runs` row, which freezes the config used, and replaces the assessment's `calculated_results`.

- **Body:** `{ "overrides"?: "keep" | "withdraw" }`. Required once any student in the assessment has an override (FR-24): `keep` leaves each override in force and updates its stored calculated mark to the new run's, and `withdraw` deletes them. Each is audited individually. An override for a student with no mark in the new run is withdrawn either way.
- **200:** `{ "run": { runId, calculatedAt, students: number, flagged: number } }`
- **Errors:** `409 conflict` unless the assessment is **closed** (BR-06): a draft gets "This assessment hasn't opened yet...", and an open one gets "Close this assessment before calculating. While it is open, more students may still submit and every mark would change." Also `409 conflict` when any participating group has no base mark ("N group(s) still have no mark..."), or when overrides exist and `overrides` was not given. `400 bad_request` when the assessment has no groups.
- **Note:** only *submitted* ratings count towards the calculation. Drafts are ignored.

### `GET /api/assessments/:assessmentId/results`

The results table and its drill-down (FR-26). Only lecturers can call this, and no student-facing equivalent exists.

- **200:** `{ "results": ResultRow[] }`, sorted by group number, then surname, then name. The array is empty before a calculation has run, and whenever `calculatedAt` has been cleared since (re-opened, a base mark or the maximum changed).

  ```ts
  ResultRow = { studentId, groupId, groupNumber,
                student: { id, name, surname, studentNumber: string|null },
                ratingsReceived: number,
                meanReceived: number|null, groupMean: number|null,
                rawFactor: number|null, adjustmentFactor: number,
                baseMark: number|null, finalMark: number|null,
                flags: ResultFlag[],
                override?: { mark, reason, by: string /* "Name Surname" */, at },
                received: { evaluator: { id, name, surname }, ratingOptionId, comment: string|null }[] }

  ResultFlag = "uniform-rating" | "reciprocal-extreme" | "isolated-outlier" | "incomplete-group"
             | "low-contribution" | "no-submission" | "group-of-two" | "group-of-one"
             | "unmatched" | "not-peer-assessed" | "zero-base-mark" | "zero-group-mean"
             | "capped-at-maximum"
  ```

  `received` lists the ratings the student received in **submitted** evaluations, the same ratings the calculation used. Ratings in drafts that were never submitted are left out.

### `POST /api/assessments/:assessmentId/override`

Overrides one student's calculated mark (FR-24, BR-08). The calculated mark is kept alongside the override. Posting again replaces the previous override.

- **Body:** `{ "studentId": uuid, "mark": number, "reason": string }`. `reason` must be non-empty after trimming.
- **200:** `{ "ok": true }`
- **Errors:** `400 bad_request` with `fields.mark` (outside `0..maxMark`, or more than one decimal place) or `fields.reason`. `404` when the student has no calculated result. `409 conflict` when the calculated mark is `null` because the group had no base mark, or when the marks are out of date and need calculating again.

### `DELETE /api/assessments/:assessmentId/override/:studentId`

Removes one student's override so their calculated mark stands again (FR-24). Other overrides are untouched. Audited as `mark.overridden` with the reason.

- **Body:** `{ "reason": string }`, non-empty after trimming.
- **200:** `{ "ok": true }`
- **Errors:** `400` without a reason. `409 conflict` when the student has no override.

### `GET /api/assessments/:assessmentId/overrides`

Every override on the assessment, whether or not its results are current: the ones a recalculation will ask to keep or withdraw.

- **200:** `{ "overrides": { studentId, name, surname, mark: number, reason }[] }`

### `GET /api/assessments/:assessmentId/export`

Downloads the results workbook (FR-25, CI-04).

- **200:** a binary body with `content-type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `content-disposition: attachment; filename="peerly-<modulecode>-<assessment-slug>-<YYYY-MM-DD>.xlsx"`.
  - The **Results** sheet has a header block (class, period, assessment, generation time, calculation run id, calculation time, number of overrides, number of flagged students) followed by one row per student: student number, surname, name, group, ratings received, mean received, group mean, adjustment factor, group base mark, final mark, override mark, override reason, overridden by, flags.
  - The **Raw Ratings** sheet has one row per rating from a **submitted** evaluation: group, evaluator number and name, evaluated number and name, rating label, **scale value**, comment, submitted at. As with `/results`, ratings in unsubmitted drafts are left out.
- **Side effect:** this is a GET that writes. It sets `assessments.exported_at` and adds a `results.exported` audit entry.
- **Errors:** JSON, with `409 conflict` when the assessment has not been calculated yet.

### `POST /api/assessments/:assessmentId/exported`

Records an export without producing a file. The current web app downloads through `/export` and does not need this endpoint, but still calls it.

- **200:** `{ "exportedAt": string }`

### `DELETE /api/assessments/:assessmentId`

Permanently deletes the assessment and cascades to its submissions, ratings, marks, runs, results and overrides (FR-28). The audit entry is kept. The web app asks for confirmation first using `/impact`.

- **200:** `{ "ok": true }`

---

## Student portal (`/api/student`)

Source: `server/src/routes/student.ts`, `services/student.ts` and `services/evaluations.ts`. **Every route requires `requireAuth` and `requireRole("student")`.** No route takes a student id. The student is always the account on the session.

### `GET /api/student/enrolments`

- **200:** `{ "enrolments": Array<{ id, classId, moduleCode, className, studentNumber, importedName, importedSurname, matchStatus }> }`, oldest first, empty for a number on no class list. The lookup matches on student number, which lets an unmatched or conflicting row still reach the student. **Every** class list that contains the number is returned, so a problem on one list never hides another. The lecturer's `matchNote` is not included: it is written for the lecturer and reads as false to the student.

### `GET /api/student/assessments`

- **200:** `{ "assessments": StudentAssessmentView[] }`: every open or closed assessment one of the student's groups takes part in. Drafts are left out until the lecturer opens them. Open assessments come first, then closed ones, and within each set the soonest closing time comes first.

  ```ts
  StudentAssessmentView = {
    assessment: { id, name, description, status, opensAt, closesAt, closedAt? },
    klass: { id, moduleCode, name },
    group: { id, groupNumber },
    members: { id, name, surname }[],        // the rest of the group, without the student (BR-02)
    submission?: { id, status: "draft"|"submitted", submittedAt? } }
  ```

  The response contains no marks, factors, rating values or e-mail addresses (SR-08).

### `GET /api/student/evaluations/:assessmentId`

- **200:** `{ "context": { assessmentId, groupId, peerIds: string[], status, submission?: { id, status, submittedAt? } }, "entries": RatingEntry[] }`. `entries` holds the student's own saved or submitted ratings and nothing about anybody else's (SR-08). The evaluation form loads from it, so a draft follows the student to another device (CI-10).
- **Errors:** `404` when the assessment does not exist, or the student's group does not take part in it.

### Rating payload

The draft and submit endpoints both take this body:

```json
{ "entries": [ { "evaluatedStudentId": "<uuid>", "ratingOptionId": "<uuid>", "comment": "optional, at most 500 characters, null allowed" } ] }
```

`entries` can hold at most 50 items. Each call **replaces** the student's previous ratings for the assessment.

### `PUT /api/student/evaluations/:assessmentId/draft`

This is autosave (CI-10). A partial draft is allowed.

- **200:** `{ "ok": true }`
- **Errors:** `409 conflict` when the assessment is not open ("hasn't opened yet" or "has closed"), when its closing time has passed even though the lecturer has not closed it yet ("The closing time for this assessment has passed.", BR-05), when its opening time has not arrived even though the lecturer has opened it ("This assessment opens on ...", #13), or when the student has already submitted. After submitting, amendments go through `/submit`. `400 bad_request` when a rated student is not in the group or is rated twice, or a comment is over 500 characters (the key is `fields["comment.<id>"]`). `409 rule_violation` for an unknown `ratingOptionId`. `404`.

### `POST /api/student/evaluations/:assessmentId/submit`

Submits the evaluation, or amends a submitted one while the assessment is still open (FR-16). Every peer must be rated.

- **200:** `{ "submission": { id, status: "submitted", submittedAt, ratingCount } }`. When an evaluation is amended, the original `submittedAt` is kept.
- **Errors:** `400 bad_request` with `fields.missing` holding a comma-separated list of the unrated peer ids (BR-04). `409 conflict` when the assessment is closed (OR-08), when its closing time has passed (BR-05: the closing time ends submissions, whether or not the lecturer has closed the assessment yet), when it is not yet open, or when the student is in a group of one. The remaining errors are the same as for the draft endpoint.

---

## Known issues

These were found while writing this reference and are still open. Four more found at the same time have since been fixed: registration now enforces the password policy, a conflict can only be linked to an account holding the entry's student number, lecturers see submitted ratings only, and malformed requests, unknown origins and unreadable uploads return 400 or 403 rather than 500.

1. **`GET /export` changes state.** It sets `exported_at` and writes an audit entry. A link prefetcher or security scanner that follows GET links while signed in as the lecturer would record a false export.
2. **`change-password` has no dedicated rate limit.** It still needs the current password and a live session, and the global limit of 300 per minute applies.
3. **One endpoint is unused by the web app:** `GET /api/classes/:classId/groups/editable`. It is harmless and documented above.
