# Peerly - to do

Everything still outstanding, grouped by **who has to do it**. Current as of
**23 September 2026**.

**Nothing on this list is code.** Every FSD requirement is built and the
automated suite is green: 473 API tests, 33 web tests, 82 browser tests,
0 TypeScript errors, 0 lint errors, Felder calculation at 100% statement and
96.72% branch coverage. What remains is a deployment, decisions other people
own, and testing that needs humans.

**Every screen has now been driven by a person**, on 23 September: all three
portals, the full lecturer cycle from class list to export, and the Felder
calculation checked by hand against an independent derivation for two groups.
It matched exactly.

That day found **eleven defects the automated suite passed clean**, all now
fixed and covered by tests:

| | |
| --- | --- |
| Four helpers written against the mock data and never revisited | a blank class-list name, a twenty-one digit reference code, dead mock imports, a stubbed field |
| A session that died silently | every panel rendered empty with no way to tell why |
| A deadline that enforced nothing | a student could submit weeks late |
| An audit trail with a hole | four editable fields changed with no entry, including who is assessed |
| A reminder button that lied | reported "sent to 6 students" having sent nothing |
| The class switcher, and three other navigations | a stale closure reverted every change |
| The marks screen showing another assessment's marks | and offering to calculate on them |
| Flags firing on 27 of 28 students | thresholds set for a scale the system no longer uses |
| No way to resend an activation link | recreate the account, or run SQL |
| No door for administrators | the welcome screen offered only student and lecturer |

Not one of those was caught by 500-odd automated tests, because each piece
worked correctly in isolation. **Assume more of the same kind remain, and that
only use will find them.**

Detail for any item is in [scope.md](./scope.md), which tracks all 142
requirement IDs.

---

## The three that block everything else

Start here. Each one has a long lead time and nothing below moves without them.

- [ ] **Connect Mailgun.** The sending side is **built and wired** - Peerly uses
      plain authenticated SMTP, `nodemailer` is already a dependency, the
      templates exist and every message already sends on the development
      transport. Nobody needs to write any code. What is missing is an account:
      add a domain (a subdomain such as `mg.peerly.nwu.ac.za`), **choose the EU
      region** for POPIA, add the DNS records, wait for Verified, then copy the
      SMTP credentials into five variables in `server/.env`. Step by step, with
      the four things that commonly waste an afternoon, in
      [deployment.md §4.1](./docs/handover/deployment.md#41-mailgun).
      **The API will not start in production until this is done** - deliberately,
      because the fallback transport prints reset tokens to the log. *(CI-05, AS-07)*
- [ ] **A server, a DNS name and a TLS certificate.** HTTPS is not optional: the
      session cookie is `Secure` in production, so over plain HTTP nobody can
      sign in. *(IS-10)*
- [ ] **A de-identified historical cycle with its spreadsheet marks**, from the
      Sponsor. This is the only check that proves Peerly agrees with the existing
      spreadsheet on real data, and the FSD calls anything short of exact
      reconciliation *a failed acceptance test, not a tolerance*. *(AS-09)*

---

## Deployment - the deploying party

Full instructions: [docs/handover/deployment.md](./docs/handover/deployment.md).
It has a worksheet of every value needed, collected up front.

- [ ] Linux host: 2 vCPU, 4 GB RAM, 20 GB disk *(HI-03)*
- [ ] DNS name and TLS certificate for it
- [ ] PostgreSQL 17 instance; create the `peerly` role and database. **The role
      must not be a superuser** - the append-only audit trail only holds against
      a non-superuser
- [ ] Mailgun connected: domain added and **Verified**, EU region, account off
      sandbox, and the five SMTP variables in `server/.env` with
      `MAIL_TRANSPORT=smtp`. See [deployment.md §4.1](./docs/handover/deployment.md#41-mailgun)
- [ ] Backup destination, encryption key custodian and retention period
- [ ] Name and institutional e-mail of the **first administrator**. There is no
      default admin account and no built-in password *(AS-06)*
- [ ] Deploy, then run the post-deployment checks in section 9 of the guide
- [ ] **Test e-mail delivery to both `@mynwu.ac.za` and `@nwu.ac.za`** before
      go-live. Institutional filters treat them differently
- [ ] Take the first backup and **do a restore test** - tested, not just
      configured
- [ ] Reboot once and confirm both services come back up

---

## Decisions - Sponsor and client

None of these block the deployment. The first two are the only ones that touch
a mark, and neither changes the number a student receives.

- [ ] **AS-08 - sign the Felder Calculation Specification as a document.**
      Everything that decides the number is already agreed: the banded scale,
      the 0.6-1.1 limits and self-rating exclusion (22 Sep), and the rounding
      rule, one decimal place (23 Sep). Runs stay stamped
      `felder-2026.3-provisional` until it is signed
- [ ] **IS-04 - free-rider and outlier thresholds.** Currently 79 and 10,
      retuned for the banded scale. Advisory only: they decide who gets flagged
      for the lecturer, never anybody's mark
- [ ] **IS-02 - does not submitting carry an academic penalty?** Currently no
      penalty; the case is flagged. This is academic policy, not a system choice
- [ ] **Confirm the 1.1 ceiling.** Worth a second look: on the banded scale it
      **binds in real data** (a seeded student hits exactly 1.1000), while the
      0.6 floor is unreachable. The ceiling is doing real work
- [ ] **IS-01 - the definitive list of accepted e-mail domains.** Currently
      assuming `mynwu.ac.za` for students and `nwu.ac.za` for staff
- [ ] **IS-07 - retention period for class and assessment data.** Blocks full
      FR-28 compliance
- [ ] **IS-05 - are comments mandatory for the highest and lowest options?**
      Would be built as per-assessment configuration
- [ ] **IS-03 - remainder rule for group generation.** Currently round-robin,
      sizes differing by at most one

---

## Testing

Two scripts are written and ready to use.

**Solo, before the team:**
- [ ] Run [docs/handover/test-walkthrough.md](./docs/handover/test-walkthrough.md) -
      every page and every function once, roughly 90 minutes, ending in a
      coverage check of all 34 screens

**With the team:**
- [ ] Run [docs/handover/test-plan.md](./docs/handover/test-plan.md) - the
      shorter scripted pass, four rounds, several testers at once
- [ ] **Measure UR-01**: an untrained student submits a full evaluation in under
      **five minutes**
- [ ] **Measure UR-06**: a lecturer completes a full cycle in under **thirty
      minutes**

Both are requirements with numbers on them and neither has ever been measured.

**Not yet done at all:**
- [ ] **Cross-browser** - only Chromium has been tested. Edge, Firefox, Safari,
      plus default Android and iOS browsers *(UI-03)*
- [ ] **Screen-reader pass.** Automated axe checks for WCAG 2.1 AA and
      keyboard-only navigation are in the browser suite and green; no pass with
      actual assistive technology *(UI-04, UR-09)*
- [ ] **Load sanity test** at 150 concurrent submitters *(PR-02)*
- [ ] **Parallel run** - reconcile a historical cycle student by student against
      the spreadsheet. *Blocked on AS-09 above*
- [ ] **Dependency vulnerability scan** and an OWASP Top Ten review

---

## Repository and process

- [ ] **Merge `backend` into `main`, and tag it. Do this first, before anyone
      starts new work.** `main` has **no API at all** - no routes, no services, no
      browser tests, no CI workflow and none of the handover documents. It is the
      frontend prototype from before the backend existed, so anyone who clones
      this repository and does nothing else gets a version that cannot work.
      Nothing can be deployed from it either. **Connecting Mailgun and the server
      needs no code change**, so there is nothing to hold back from `main` while
      it is tested. Full reasoning and the commands are in
      [ci.md → Branching and releases](./docs/handover/ci.md#branching-and-releases---how-to-work-on-this-from-here)
- [ ] **Turn on branch protection for `main`** in GitHub: require a pull request
      with 1 approval, and require the four CI checks (`calculation`, `server`,
      `frontend`, `e2e`). Until someone does this, CI runs but **blocks nothing**,
      so "a failing calculation test blocks the merge" is not yet true. Steps are
      in [docs/handover/ci.md](./docs/handover/ci.md). Do it **after** the merge
      above - `main` has no workflow file yet, so there are no checks to require
      *(OR-24, SI-08)*
- [ ] **Delete the stale branches** `backend` and `feat/portals-and-backend` once
      merged, so nobody picks one up by mistake

---

## Licensing and ownership

- [ ] **`buffers@0.1.1`** - a transitive `exceljs` dependency that declares no
      licence. Needs an accepted-risk note or a legal decision *(OR-17)*
- [ ] **Confirm provenance of `public/students-on-campus.jpg`** and permission to
      use the NWU logo
- [ ] **Add a licence and ownership statement** for Peerly's own source. It
      currently has neither

---

## Documentation

- [ ] **Requirements Traceability Matrix** mapping every requirement ID to a
      design element, a test case and a UAT result. `scope.md` is its first
      draft *(OR-28)*
- [ ] **IS-08** - FR-17 and FR-24 are agreed and built, but missing from FSD
      §2.1.2 and the user stories. The FSD needs updating to match
- [ ] **IS-09** - hosting documentation still describes cloud hosting; it should
      describe an NWU or self-managed server
- [ ] Fill in the deployment-specific values left as TODO in the technical
      handover once they exist: server URL, certificate, SMTP, backup destination

---

## Done, for reference

So nobody redoes it:

- The whole application - 34 screens, 57 API endpoints, all on the real API with
  no mock data anywhere
- **E-mail sending, end to end.** Verification codes, activation links, password
  resets and submission reminders are all built and all send. The only thing
  outstanding is an account to send them through - no code
- The Felder calculation, with every setting that decides a mark now agreed
- Append-only audit trail, enforced by database triggers
- Real `.xlsx` export
- CI with four jobs, the calculation isolated as its own status check
- Handover documentation: deployment guide, technical handover, API reference,
  ERD, CI guide, licence register, three user guides, and two test scripts
