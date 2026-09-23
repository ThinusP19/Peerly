# Peerly - team test plan

A scripted pass over the whole system, for a group of testers working through it
together in one sitting. It assumes no knowledge of how Peerly is built.

Everything below runs against a **test deployment** holding invented data. There
are no real students in it and nothing you do can affect a real mark.

**Contents**

1. [Before you start](#1-before-you-start)
2. [The accounts](#2-the-accounts)
3. [Round 1 - the student](#3-round-1---the-student)
4. [Round 2 - the lecturer](#4-round-2---the-lecturer)
5. [Round 3 - the administrator](#5-round-3---the-administrator)
6. [Round 4 - things that should not work](#6-round-4---things-that-should-not-work)
7. [How to report what you find](#7-how-to-report-what-you-find)
8. [Known gaps - please do not raise these](#8-known-gaps---please-do-not-raise-these)

---

## 1. Before you start

**You need:** the test URL, and the shared password, both handed to you
separately. Use a normal browser. A private or incognito window per tester is
easiest, because it keeps your session separate from the person next to you.

**The scenario already loaded:**

| | |
| --- | --- |
| Classes | **CMPG323** Development of Information Systems III, **CMPG315** Computer Networks II, 2026 Semester 2 |
| Class list | 30 students - 28 matched cleanly, 1 unmatched, 1 in conflict |
| Groups | 6 confirmed groups in CMPG323, four of five and two of four |
| Open assessment | **Project Phase 2 - Peer Assessment**, 22 of 28 students have submitted |
| Closed assessment | **Project Phase 1 - Peer Assessment**, already has group marks entered |

Two assessments exist on purpose. The **open** one is where you test a student
submitting. The **closed** one already has marks, so the lecturer can go
straight to calculating and exporting without waiting for anybody.

**Work in this order.** Round 2 depends on Round 1 having happened - the
lecturer's monitor screen is more interesting once a few of you have submitted.

---

## 2. The accounts

Every account below uses the same shared password.

**Students** - each is in a different group and none of them has submitted yet,
so up to six of you can run Round 1 at the same time without colliding. **Take
one each and say which one you took.**

| Tester | Sign in as | Who they are | Group |
| --- | --- | --- | --- |
| 1 | `41200419@mynwu.ac.za` | Johan Pretorius | 1 |
| 2 | `41200604@mynwu.ac.za` | Nadia Fourie | 2 |
| 3 | `41200789@mynwu.ac.za` | Palesa Molefe | 3 |
| 4 | `41200974@mynwu.ac.za` | Karel Venter | 4 |
| 5 | `41201196@mynwu.ac.za` | Pieter Joubert | 5 |
| 6 | `41201344@mynwu.ac.za` | Anja Meyer | 6 |

**Two special students**, for scenario 1.4 only:

| Sign in as | Who they are | What is wrong with them |
| --- | --- | --- |
| `41201381@mynwu.ac.za` | Lwazi Gumede | On no class list - **unmatched** |
| `41201418@mynwu.ac.za` | Carien du Toit | Details clash with the class list - **conflict** |

**Staff:**

| Sign in as | Role | Notes |
| --- | --- | --- |
| `anneke.vdmerwe@nwu.ac.za` | Lecturer | Owns both classes. This is the Round 2 account. |
| `sipho.dlamini@nwu.ac.za` | Lecturer | Owns **nothing**. For scenario 4.2. |
| `riaan.botha@nwu.ac.za` | Administrator | Round 3. |

Sign-in asks which kind of user you are before it asks for the address. Pick the
one that matches the account you were given.

---

## 3. Round 1 - the student

*Roughly 15 minutes. One of the things being measured is whether an untrained
student can finish scenario 1.2 in under five minutes, so **note your start and
finish time** and do not read ahead before you begin.*

### 1.1 Sign in and look around

1. Open the test URL, choose **Student**, sign in with the account you took.
2. You should land on a dashboard showing what you owe and by when.

- [ ] The open assessment appears, with its closing date
- [ ] It is obvious what you are being asked to do next

### 1.2 Complete and submit an evaluation *(timed)*

**Note the time before you start.**

1. Start the evaluation for **Project Phase 2 - Peer Assessment**.
2. Rate every member of your group. You should see your group-mates and **not
   yourself** - a student never rates themselves.
3. Add a comment on at least one person.
4. Go through to the review screen, check it shows what you actually chose, and
   submit.

**Note the time when the confirmation appears.**

- [ ] You are never asked to rate yourself
- [ ] The rating options are words, not numbers
- [ ] The review screen matches what you chose
- [ ] You get a clear confirmation that it is submitted
- [ ] **Time taken: \_\_\_\_ min**

### 1.3 Change a submitted evaluation

You **are** allowed to change your answers until the assessment's closing time -
that is deliberate (BR-03). It is only final after the deadline.

1. Go back to the dashboard and open the same evaluation again.
2. Change one person's rating and submit again.

- [ ] The confirmation says you can still change your answers, and names the date
- [ ] Reopening shows what you actually chose, not a blank form
- [ ] After changing one rating, the confirmation shows the **new** one - and
      only one rating per person, not both
- [ ] The **submitted at** time is still the *first* time you submitted

### 1.4 The two broken accounts

*One tester only, after finishing 1.1-1.3 on their own account. Sign out first.*

1. Sign in as **Lwazi Gumede**. He is on no class list.
2. Read what the screen tells him.

- [ ] It explains the problem in plain language and says what to do about it
- [ ] He is not simply dumped on an empty or broken page

3. Sign out, sign in as **Carien du Toit**, whose details clash with the list.

- [ ] Her situation is explained too, and differs from Lwazi's

### 1.5 On a phone

1. Open the test URL on your actual phone and sign in as your student.

- [ ] Everything is readable and tappable without zooming
- [ ] Nothing runs off the side of the screen
- [ ] You could complete an evaluation this way

---

## 4. Round 2 - the lecturer

*Roughly 30 minutes. Sign in as **anneke.vdmerwe@nwu.ac.za**. One of the things
being measured is whether a lecturer can run a full cycle in under thirty
minutes, so **note your start and finish time for the whole round**.*

### 2.1 Dashboard and classes

- [ ] The dashboard shows both classes and what state each is in
- [ ] Opening **CMPG323** shows its 30 students
- [ ] The **unmatched** and **conflict** students are visibly different from the rest

### 2.2 Resolve the conflict

1. Find **Carien du Toit** on the class list and resolve her conflict.

- [ ] It is clear what clashes, and what each choice would do
- [ ] After resolving, her status changes and the list reflects it

### 2.3 Import a class list

1. Go to the class-list import for **CMPG315**.
2. Upload `docs/handover/sample-data/cmpg315-class-list.csv`, which will be sent
   to you with this plan. It holds 27 rows, **three of them deliberately wrong** -
   one student number that is not 8 digits, one duplicate, one missing surname.
3. Work through the column mapping, the preview and the confirmation.

- [ ] It tells you which columns it thinks are which, and lets you correct it
- [ ] The preview shows real rows from **your** file, not example data
- [ ] It finds all three bad rows, gives each a row number and says what is wrong
- [ ] The row numbers it quotes match what you see opening the file yourself
- [ ] Nothing is committed until you confirm
- [ ] After committing, the class list shows the **24** good rows

### 2.4 Generate groups

1. Go to group generation for **CMPG315** and generate groups.

- [ ] You choose the size, and see the result before it is saved
- [ ] Group sizes differ by at most one
- [ ] Nobody is in two groups, and nobody matched is left out
- [ ] You can adjust a group before confirming

### 2.5 Create an assessment

1. Create a new assessment on **CMPG315** - name, description, opening and
   closing dates - and open it.

- [ ] Dates are validated - it refuses to close before it opens
- [ ] Once open, it appears in the assessment list as open

### 2.6 Watch submissions come in

1. Go to the submission monitor for **Project Phase 2** on CMPG323.

- [ ] The students from Round 1 now show as submitted
- [ ] It is clear who has **not** submitted
- [ ] You can send a reminder to the students still outstanding

2. Now open the assessment itself - **Project Phase 2** in the assessment list -
   and grant an extension by moving its closing date later.

- [ ] It accepts a later closing date
- [ ] It refuses an **earlier** one - that would not be an extension

### 2.7 The evaluation matrix

1. Open the matrix for **Project Phase 2** and look at a group.

- [ ] Rows and columns are clearly who rated whom
- [ ] Unusual ratings are highlighted
- [ ] Switching between groups is quick
- [ ] Students' own comments are visible to you

### 2.8 Marks and the calculation

*Use the **closed** assessment, Project Phase 1, which already has marks.*

1. Open group mark entry and check each group has a base mark.
2. Run the calculation.
3. Open the results.

- [ ] It refuses to calculate if any group has no mark
- [ ] Every student gets an individual mark
- [ ] You can see **how** each mark was reached - the student's average, the
      group average, and the factor between them
- [ ] Students flagged for attention are marked, and it says why
- [ ] A flag does **not** change anybody's mark - it is a note to you

> **Do check these against your own spreadsheet.** As of 2026-09-23 the
> rounding rule is agreed - **one decimal place** - so the marks should now
> reconcile exactly, not approximately. A difference of any size is worth
> reporting. See [section 8](#8-known-gaps---please-do-not-raise-these) for the
> parts that are still provisional.

### 2.9 Override a mark

1. Override one student's mark, with a reason.
2. Then run the calculation **again**.

- [ ] An override needs a reason
- [ ] The overridden mark is shown as overridden, not silently replaced
- [ ] Recalculating does **not** quietly discard your override - it asks you
      first what to do with it

### 2.10 Export

1. Export the results and open the downloaded file.

- [ ] It is a real spreadsheet that opens in Excel
- [ ] Student numbers, names and marks are all correct
- [ ] Overridden marks are shown as overridden

### 2.11 The audit log

1. Open the audit log.

- [ ] Everything you did in this round is listed, with who and when
- [ ] Nothing can be edited or deleted from it

**Time for the whole of Round 2: \_\_\_\_ min**

---

## 5. Round 3 - the administrator

*Roughly 10 minutes. Sign in as **riaan.botha@nwu.ac.za**.*

### 3.1 Accounts

- [ ] All lecturer and administrator accounts are listed
- [ ] You can create a new lecturer account
- [ ] You can deactivate an account, and it is clear it is deactivated
- [ ] You can filter and search the list

### 3.2 The audit log

- [ ] The administrator sees activity across **all** lecturers, not just one
- [ ] It can be filtered by person and by date

### 3.3 Settings

- [ ] Changing your own name works
- [ ] Changing your own password works, and the new one is what signs you back in

---

## 6. Round 4 - things that should not work

*Roughly 10 minutes. These are the ones that matter most - a system that does
the right thing when you use it properly, and the wrong thing when you do not,
is not finished.*

### 4.1 A student cannot reach staff screens

1. Signed in as a student, put a lecturer address in the browser bar - add
   `/lecturer` to the end of the test URL. Try `/admin` too.

- [ ] You are refused, not shown the page

### 4.2 A lecturer cannot reach another lecturer's class

1. Sign in as **sipho.dlamini@nwu.ac.za**, who owns nothing.

- [ ] He sees no classes
- [ ] He cannot reach CMPG323 by any route you can find

### 4.3 Sign-in gives nothing away

1. Sign out. Try signing in with an address that does not exist, then with a
   real address and a wrong password.

- [ ] Both refusals say the **same** thing
- [ ] Nothing reveals whether an account exists

### 4.4 Repeated wrong passwords

1. Get the same account's password wrong five times in a row.

- [ ] It locks you out and says so clearly

### 4.5 Signing out

1. Sign out, then press the browser's back button.

- [ ] You cannot get back in without signing in again

---

## 7. How to report what you find

One line per finding, please, in whatever channel we agreed:

```
[Round/scenario]  What you did  ->  What happened  ->  What you expected
Example:
2.8  Ran the calculation with one group's mark blank
     -> it calculated anyway and showed a blank mark
     -> expected it to refuse and tell me which group
```

Add a screenshot for anything visual. If something is merely confusing rather
than broken, say so anyway and mark it **confusing** - that is what Round 1's
timing is for, and it is as useful as a defect.

Please also record:

- Which browser and device you used
- Your times for scenarios 1.2 and Round 2

---

## 8. Known gaps - please do not raise these

These are already known and tracked. Reporting them costs everybody time.

| Not a defect | Why |
| --- | --- |
| ~~Marks differ from the spreadsheet in the last decimal~~ | **No longer expected.** The rounding rule was agreed on 2026-09-23 as one decimal place, so marks should reconcile exactly. Please **do** report any difference. |
| Free-rider and outlier flags seem too sensitive, or not enough | The thresholds are provisional too, and are meant to be tuned. Do tell us if they feel wrong - just as an opinion, not a defect. |
| A student who submitted nothing still receives a mark | Deliberate. No academic penalty is applied by the system; the case is flagged for the lecturer to decide. |
| Registration, activation or password-reset emails do not arrive | Email is not connected on the test deployment yet. All accounts above are pre-activated. |
| It has only been tried in Chrome | Cross-browser testing has not been done - if you are on Edge, Firefox or Safari, please say so and note anything odd. |
| Data resets or looks different later | The test database is rebuilt when we redeploy. Say so if it happens mid-test. |
