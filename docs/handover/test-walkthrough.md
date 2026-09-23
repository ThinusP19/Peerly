# Peerly - full walkthrough

Every page and every function, once, in one sitting. Work top to bottom and
tick as you go; at the end, [section 6](#6-coverage-check) lists all 34 screens
so you can confirm nothing was skipped.

This is the **exhaustive** pass, for you, before the team tests. It is a
different thing from [`test-plan.md`](./test-plan.md), which is the shorter
scripted version to hand to several testers at once. Order here is
**administrator → student → lecturer**, because the administrator creates the
accounts the other two use.

Allow about 90 minutes.

---

## 0. Before you start

**Both servers must be running.** Two terminals, from the project root:

```sh
cd server && npm run dev      # API on :4000
npm run dev                   # web app on :7331
```

Then open **http://127.0.0.1:7331**.

**Reset to a known state** at any point - this is safe and takes a second:

```sh
cd server && npm run seed
```

You get 33 accounts, 2 classes, 30 students, 6 groups, one open assessment and
one closed one. Every account's password is `peerly-dev-password`.

### How to read e-mails

Locally `MAIL_TRANSPORT=log`, so **nothing is actually sent**. Every e-mail is
printed in the **API terminal** instead, like this:

```
--- mail ---
to:      41200456@mynwu.ac.za
subject: Your Peerly verification code
...
--- end ---
```

Verification codes, activation links and password-reset links all appear there.
Copy them straight out of the terminal. Keep that terminal visible - you will
need it in sections 2 and 3.

> This is why you can test registration, activation and password reset locally
> even though no mail server is connected. On a deployed server this is
> deliberately blocked, and real SMTP is required.

### The accounts

| Role | Sign in as |
| --- | --- |
| Administrator | `riaan.botha@nwu.ac.za` |
| Lecturer (owns both classes) | `anneke.vdmerwe@nwu.ac.za` |
| Lecturer (owns nothing) | `sipho.dlamini@nwu.ac.za` |
| Student, matched, has **not** submitted | `41200456@mynwu.ac.za` |
| Student, **unmatched** | `41201381@mynwu.ac.za` |
| Student, **conflict** | `41201418@mynwu.ac.za` |

Sign-in asks **which kind of user you are first**, then for the address.

---

## 1. Administrator

Sign in as `riaan.botha@nwu.ac.za`, choosing **Administrator**.

### 1.1 Dashboard — `/admin`

- [ ] It loads with figures, not blanks
- [ ] The counts look plausible against the seed (33 users, 2 classes)
- [ ] Every navigation item in the sidebar goes somewhere that loads

### 1.2 Accounts — `/admin/accounts`

- [ ] All staff accounts are listed with role and status
- [ ] Search by name works
- [ ] Filter by role works
- [ ] Filter by status works

**Create a lecturer:**

- [ ] **Create account** opens a dialog
- [ ] It refuses a non-institutional address (try `someone@gmail.com`)
- [ ] It refuses an address already in use (try `anneke.vdmerwe@nwu.ac.za`)
- [ ] Creating `test.lecturer@nwu.ac.za` succeeds
- [ ] **An activation e-mail appears in the API terminal** with a link
- [ ] The new account shows as **unverified** until that link is used

**Activate it** — open the link from the terminal in a private window:

- [ ] The activation page loads and asks for a password
- [ ] It refuses a weak password
- [ ] Setting a good password signs you in as that lecturer
- [ ] Back in the admin list, the account now shows **active**

**Edit and deactivate:**

- [ ] Editing the account's name saves and shows immediately
- [ ] Deactivating it works and is visibly marked
- [ ] Reactivating it works
- [ ] Try to deactivate **every** administrator - it must refuse to remove the
      last active one

### 1.3 Audit log — `/admin/audit`

- [ ] Everything you just did appears, with who and when
- [ ] It spans **all** lecturers, not just one
- [ ] Filter by event type works
- [ ] Filter by date works
- [ ] There is no way to edit or delete an entry

### 1.4 Settings — `/admin/settings`

- [ ] Changing your own name saves
- [ ] Changing your password refuses a wrong current password
- [ ] Changing your password refuses a weak new one
- [ ] A successful change works, and **the new password is what signs you back in**

Sign out.

---

## 2. Student

### 2.1 Register a brand-new student — `/register`

Three steps: your details, your sign-in, then a 6-digit code.

- [ ] Step 1 refuses a student number that is not 8 digits
- [ ] Step 1 refuses a student number already registered (try `41200345`)
- [ ] Step 2 refuses a non-institutional address (`someone@gmail.com`)
- [ ] Step 2 refuses a weak password
- [ ] You can go **back** from any step without losing what you typed
- [ ] Step 3 sends a code - **check the API terminal**
- [ ] A wrong code is refused
- [ ] **Resend code** produces a new one in the terminal
- [ ] The correct code creates the account and signs you in

Use a made-up number such as `42199999`, so you do not collide with the seed.

- [ ] Because that number is on no class list, you land on the **unmatched**
      explanation, not a broken page

### 2.2 Forgot and reset password — `/forgot-password`, `/reset-password`

Sign out first.

- [ ] **Forgot password** accepts an address and says the same thing whether or
      not the account exists
- [ ] A reset link appears in the API terminal
- [ ] The link opens the reset page
- [ ] It refuses a weak new password
- [ ] A good one works, and signs you in
- [ ] Using the **same link twice** is refused
- [ ] `/reset-password?token=expired` explains itself rather than crashing
- [ ] **Back to sign in** returns you to the student sign-in form, not staff

### 2.3 The seeded student — `/student`

Sign in as `41200456@mynwu.ac.za`, choosing **Student**.

- [ ] The dashboard shows the open assessment and its closing date
- [ ] It is obvious what to do next
- [ ] A closed assessment is shown as closed, not actionable

### 2.4 My group — `/student/group`

- [ ] Your group and its members are listed
- [ ] You can see who your group-mates are, and no marks or ratings

### 2.5 How rating works — `/student/guide`

- [ ] The rating options are explained in words
- [ ] **No hidden numbers are shown anywhere** — this is BR-15 and matters

### 2.6 Complete an evaluation — `/student/evaluate/:id`

*Time yourself. The target is under five minutes (UR-01).*

- [ ] You are shown your group-mates and **never yourself**
- [ ] Options are descriptive words, not numbers
- [ ] You can add a comment per person
- [ ] Leave the page half-finished, come back — **your draft is still there**
- [ ] The dashboard shows it as **in progress**, not "not started"
- [ ] It will not let you continue with someone unrated

### 2.7 Review and submit — `/student/evaluate/:id/review`

- [ ] The review screen shows exactly what you chose
- [ ] You can go back and change an answer, and the change sticks
- [ ] Submitting gives a clear confirmation — `/student/evaluate/:id/submitted`

### 2.8 After submitting

- [ ] Reopening the evaluation shows it as submitted and **read-only**
- [ ] The dashboard shows it as submitted

### 2.9 Settings — `/student/settings`

- [ ] Name change saves
- [ ] Password change works, and the new one signs you back in

### 2.10 The two broken states

Sign out and sign in as each:

- [ ] `41201381@mynwu.ac.za` (**unmatched**) — explained in plain language, with
      what to do about it
- [ ] `41201418@mynwu.ac.za` (**conflict**) — explained, and **different** from
      the unmatched message

### 2.11 On a phone

Open the same URL on your phone, on the same wi-fi, using your machine's LAN
address instead of `127.0.0.1`.

- [ ] Readable and tappable without zooming
- [ ] Nothing runs off the side
- [ ] You could complete an evaluation this way

---

## 3. Lecturer

Sign in as `anneke.vdmerwe@nwu.ac.za`, choosing **Lecturer**.

*Time the whole of this section. The target is under thirty minutes (UR-06).*

### 3.1 Dashboard — `/lecturer`

- [ ] Both classes appear with their state
- [ ] The figures match what you have seen as a student
- [ ] Every sidebar item loads

### 3.2 Classes — `/lecturer/classes`

- [ ] CMPG323 lists its 30 students
- [ ] **Unmatched** and **conflict** students look different from the rest
- [ ] Search and filter work
- [ ] Switching the active class at the top changes every screen beneath it

**Create a class:**

- [ ] **Create class** refuses a duplicate module code
- [ ] Creating `CMPG999` works and it becomes selectable

**Resolve the conflict:**

- [ ] Find **Carien du Toit**, open the conflict
- [ ] It shows what clashes and what each choice would do
- [ ] Resolving changes her status, and the list updates

### 3.3 Import a class list — `/lecturer/classes/import`

Use `docs/handover/sample-data/cmpg315-class-list.csv` — 27 rows, 3 wrong on purpose.

- [ ] Upload the file; it detects the four columns and lets you correct them
- [ ] The preview shows rows from **your** file
- [ ] It finds all three bad rows with row numbers and reasons
- [ ] The row numbers match what you see opening the file yourself
- [ ] Nothing is saved until you confirm
- [ ] After committing, **24** rows are on the list
- [ ] Try a `.xls` file or a `.txt` — it refuses with an explanation

### 3.4 Groups — `/lecturer/groups`, `/lecturer/groups/generate`

- [ ] Existing CMPG323 groups are shown with their members
- [ ] Generate groups for CMPG315: you choose the size
- [ ] You see the proposal **before** it is saved
- [ ] Sizes differ by at most one
- [ ] Nobody is in two groups; nobody matched is left out
- [ ] You can move someone between groups before confirming
- [ ] Confirming saves them
- [ ] Try to regroup a class whose assessment is already open — it must **refuse
      or warn**, not silently rearrange people mid-assessment

### 3.5 Assessments — `/lecturer/assessments`

- [ ] Both seeded assessments are listed with status
- [ ] **New assessment**: it refuses a closing date before the opening date
- [ ] It refuses an empty name
- [ ] Creating one works, and it starts as **draft**
- [ ] Opening it changes the status
- [ ] **Edit** an assessment and the change saves
- [ ] Open the detail page — dates, description and groups are all shown
- [ ] **Extend** the closing date: a later date is accepted
- [ ] An **earlier** closing date is refused — that is not an extension
- [ ] **Close** it, then **reopen** it
- [ ] **Delete** it — it must show what will be lost before you confirm

### 3.6 Monitor — `/lecturer/monitor`

- [ ] The student you submitted as in section 2 now shows submitted
- [ ] It is clear who has not submitted
- [ ] Progress per group is shown
- [ ] **Send reminder** targets only the outstanding students

### 3.7 Matrix — `/lecturer/matrix`

- [ ] Rows and columns clearly show who rated whom
- [ ] Hidden values are visible **to you** (the lecturer)
- [ ] Unusual ratings are highlighted
- [ ] Switching groups is quick and does not reload the page
- [ ] Students' comments are visible

### 3.8 Marks — `/lecturer/marks`

Use the **closed** assessment, Project Phase 1.

- [ ] Every group has a base-mark field
- [ ] It refuses a mark above the maximum, and a negative one
- [ ] It accepts one decimal place
- [ ] Each row saves on its own and says so
- [ ] Clear a mark: **Calculate marks** becomes disabled
- [ ] Put it back: it becomes available again

### 3.9 Calculate and results — `/lecturer/results`

- [ ] Calculating produces a mark for every student
- [ ] You can see **how** each was reached: the student's mean, the group mean,
      the factor and the base mark
- [ ] **Check one by hand.** Mark = base × (student mean ÷ group mean), limited
      to 0.6–1.1, rounded to **one decimal**. It should match **exactly**
- [ ] Flagged students are marked, with a reason
- [ ] A flag does **not** change the mark — compare a flagged and unflagged
      student in the same group

**Override:**

- [ ] An override requires a reason
- [ ] The overridden mark is shown as overridden, with the original still visible
- [ ] Recalculate: it **asks what to do with the override** rather than
      discarding it
- [ ] Choose to keep it — it survives
- [ ] Recalculate again and choose to withdraw it — the calculated mark returns

### 3.10 Export — `/lecturer/export`

- [ ] The export downloads a real `.xlsx` that opens in Excel
- [ ] Student numbers, names, group marks and final marks are all correct
- [ ] Overridden marks are marked as overridden
- [ ] The marks in the file match the screen exactly
- [ ] The assessment is recorded as exported afterwards

### 3.11 Audit — `/lecturer/audit`

- [ ] Everything you did in this section is listed
- [ ] You see **your own** classes only, unlike the administrator
- [ ] Filters work

### 3.12 Settings — `/lecturer/settings`

- [ ] Name change saves
- [ ] Password change works

---

## 4. Things that must **not** work

The most important section. A system that behaves when used properly and
misbehaves when it is not, is not finished.

- [ ] As a **student**, put `/lecturer` in the address bar → refused
- [ ] As a **student**, put `/admin` in the address bar → refused
- [ ] As a **lecturer**, put `/admin` in the address bar → refused
- [ ] Sign in as `sipho.dlamini@nwu.ac.za` (owns nothing) → he sees no classes,
      and cannot reach CMPG323 by any route you can find
- [ ] Sign in with an address that does not exist, then with a real address and
      a wrong password → **both say the same thing**
- [ ] Get a password wrong five times → locked out, and told so clearly
- [ ] Sign out, then press the browser **back** button → you are not signed in
- [ ] Leave a session idle past 30 minutes → you are signed out

---

## 5. What is *not* connected yet

Do not treat these as defects.

| | |
| --- | --- |
| **Real e-mail** | Not connected. Locally everything prints to the API terminal, which is why section 2 works. A deployed server needs real SMTP credentials and will not start without them. |
| **Deployment** | Never run anywhere but a laptop. See [deployment.md](./deployment.md). |
| Free-rider / outlier thresholds | Provisional values (IS-04). Advisory only — they never change a mark. |
| Non-submission penalty | None applied, by design. The case is flagged for you (IS-02). |
| Cross-browser | Only Chromium has been tested. If you use Safari or Firefox, note anything odd. |

---

## 6. Coverage check

All 34 screens. Tick each once you have actually seen it.

**Public / auth (7)**
- [ ] `/` landing
- [ ] `/login`
- [ ] `/register`
- [ ] `/activate`
- [ ] `/forgot-password`
- [ ] `/reset-password`
- [ ] `/dev` (prototype jump-off page)

**Administrator (4)**
- [ ] `/admin`
- [ ] `/admin/accounts`
- [ ] `/admin/audit`
- [ ] `/admin/settings`

**Student (7)**
- [ ] `/student`
- [ ] `/student/group`
- [ ] `/student/guide`
- [ ] `/student/settings`
- [ ] `/student/evaluate/:id`
- [ ] `/student/evaluate/:id/review`
- [ ] `/student/evaluate/:id/submitted`

**Lecturer (16)**
- [ ] `/lecturer`
- [ ] `/lecturer/classes`
- [ ] `/lecturer/classes/import`
- [ ] `/lecturer/groups`
- [ ] `/lecturer/groups/generate`
- [ ] `/lecturer/assessments`
- [ ] `/lecturer/assessments/new`
- [ ] `/lecturer/assessments/:id`
- [ ] `/lecturer/assessments/:id/edit`
- [ ] `/lecturer/monitor`
- [ ] `/lecturer/matrix`
- [ ] `/lecturer/marks`
- [ ] `/lecturer/results`
- [ ] `/lecturer/export`
- [ ] `/lecturer/audit`
- [ ] `/lecturer/settings`

---

## 7. Reporting what you find

```
[Section]  What you did  ->  What happened  ->  What you expected
3.9  Overrode a mark then recalculated
     -> the override vanished with no warning
     -> expected to be asked whether to keep it
```

Record your times for **2.6** (target: under 5 minutes) and **section 3**
(target: under 30 minutes). Those two are requirements with numbers on them
(UR-01, UR-06) and have never been measured.
