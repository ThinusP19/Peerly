# Peerly - deployment guide

Everything needed to put Peerly on a server, in the order you need it.

This is the **short path**: one pass, start to finish, with every value you have
to supply collected in [section 1](#1-what-you-must-obtain-first) so you can
gather them before you begin rather than discovering them one at a time.

[`technical-handover.md`](./technical-handover.md) is the reference behind this
document. Where the two differ, the handover is correct and this is stale -
please fix it. It is also where backup and restore, maintenance, upgrades and
troubleshooting live, and this guide links to those sections rather than
repeating them.

**Contents**

1. [What you must obtain first](#1-what-you-must-obtain-first)
2. [What runs where](#2-what-runs-where)
3. [The database](#3-the-database)
4. [The environment files](#4-the-environment-files)
5. [Install and build](#5-install-and-build)
6. [The reverse proxy and TLS](#6-the-reverse-proxy-and-tls)
7. [Run as services](#7-run-as-services)
8. [Create the first administrator](#8-create-the-first-administrator)
9. [Check it worked](#9-check-it-worked)
10. [Before you hand it over](#10-before-you-hand-it-over)

---

## 1. What you must obtain first

Peerly ships with **no credentials of any kind**. There is no default
administrator, no built-in password and no bundled database. Every value below
comes from you or from the university. Fill this in before you start.

### Infrastructure

| # | What | Where it is used | Your value |
| --- | --- | --- | --- |
| 1 | Linux host, 2 vCPU / 4 GB RAM / 20 GB disk | the whole thing | |
| 2 | DNS name, e.g. `peerly.nwu.ac.za` | proxy, `APP_URL`, `CORS_ORIGINS` | |
| 3 | TLS certificate + key for that name | the proxy. **Not optional** - see the warning below | |
| 4 | PostgreSQL 17 host and port | `DATABASE_URL` | |
| 5 | Node.js 24 LTS on the host | both services | |

> **HTTPS is mandatory, not a hardening step.** In production the session cookie
> is `Secure`, so a browser will not store it over plain HTTP. Sign-in appears
> to fail with no error that explains why. Do not try to test over `http://`.

### Credentials to create or request

| # | What | Who gives it to you | Goes into | Your value |
| --- | --- | --- | --- | --- |
| 6 | PostgreSQL role name + password for Peerly | you create it ([section 3](#3-the-database)) | `DATABASE_URL` | |
| 7 | SMTP host, port, username, password | the university mail team | `SMTP_*` | |
| 8 | An approved sender address, SPF/DKIM authorised | the university mail team | `MAIL_FROM_ADDRESS` | |
| 9 | Name + institutional e-mail of the **first administrator** | the university | [section 8](#8-create-the-first-administrator) | |
| 10 | Backup destination, encryption key custodian, retention | the university | [handover §6](./technical-handover.md#6-backup-and-recovery) | |

> **The API will not start in production without SMTP** (item 7 and 8). This is
> deliberate: the fallback transport prints activation links and password-reset
> tokens to the log, which must never happen on a server. If SMTP is not ready,
> the deployment is not ready.

### Decisions still open

| # | What | Default if nobody decides | Tracked as |
| --- | --- | --- | --- |
| 11 | Which e-mail domains are accepted at registration | `mynwu.ac.za` for students, `nwu.ac.za` for staff | IS-01 |
| 12 | The Felder free-rider and outlier flagging thresholds | provisional values in `server/src/lib/felder.ts`. The scale, factor limits, self-rating rule and rounding are all agreed | AS-08, IS-04 |

Item 12 does not block deployment, and does not change anybody's mark - those
thresholds only decide which students get flagged for the lecturer's attention.
Calculated marks are stamped `felder-2026.3-provisional` and **should not be
presented to students as final** until the Sponsor signs the calculation
specification as a document. See
[handover §7.6](./technical-handover.md#76-changing-the-felder-calculation-configuration)
for how to change those values afterwards - it is a configuration edit, not a
code change, and old runs keep the rules they were calculated under.

---

## 2. What runs where

Two Node processes, both bound to loopback, with a proxy in front. Only 443 is
exposed.

| Process | Listens on | Started by |
| --- | --- | --- |
| Reverse proxy | `:443` public, `:80` redirect only | OS service |
| Peerly web app | `127.0.0.1:3000` | systemd `peerly-web.service` |
| Peerly API | `127.0.0.1:4000` | systemd `peerly-api.service` |
| PostgreSQL 17 | `127.0.0.1:5432`, or a managed host | OS service or managed |

The proxy sends `/api/` to the API and everything else to the web app, so the
browser only ever sees **one origin**. The session cookie is `SameSite=Lax` and
depends on that. Splitting the two across different hostnames breaks sign-in.

**Prerequisites on the host:** Node.js 24 LTS (22.12 is the floor), PostgreSQL
17 (13 is the technical floor), git. Run everything as a dedicated
unprivileged user - `peerly` below - never as root.

---

## 3. The database

### Where it is

Peerly stores everything in **one PostgreSQL database**. There is no other
persistent store - no file store, no cache, no external service. Uploaded class
lists are parsed in memory and never written to disk. Backing up that one
database backs up the whole system.

The API finds it through **one** setting, `DATABASE_URL` in `server/.env`.
Nothing else in the codebase knows where the database is.

### Create it

```sql
-- As a PostgreSQL administrator:
CREATE ROLE peerly LOGIN PASSWORD '<generate a strong one>';
CREATE DATABASE peerly OWNER peerly;
```

Store that password in the university's password vault. It is the credential in
item 6 of the worksheet.

**The role must not be a superuser.** The audit trail (FR-27) is enforced by
database triggers that refuse `UPDATE` and `DELETE` on `audit_entries`. A
superuser can disable those triggers, so the append-only guarantee only holds
against a non-superuser role.

### Connection string

```
DATABASE_URL=postgres://peerly:<password>@<host>:5432/peerly?sslmode=require
```

Use `?sslmode=require` - or `verify-full` with `sslrootcert=...` - whenever the
database is **not** on the same host. On the same host over the loopback
interface you may omit it.

### Create the schema

The migration runner builds all 20 tables. Run it from `/opt/peerly/server`
with `DATABASE_URL` set:

```sh
node --experimental-strip-types src/db/migrate.ts status   # lists what is pending
node --experimental-strip-types src/db/migrate.ts up       # applies them
```

Use `node --experimental-strip-types` rather than `npm run migrate` on a
production host: the npm script uses `tsx`, which is a devDependency and is not
installed by `npm ci --omit=dev`.

Each migration runs in its own transaction and its checksum is recorded. If
`status` ever reports `CHANGED SINCE APPLIED`, someone edited a migration that
had already run; the runner stops rather than guessing. Restore the file and add
a new migration instead.

The migrations also insert the **rating scale**, which is the only reference
data Peerly needs. There is nothing else to load.

### Never seed production

`npm run seed` and `npm run reset` create 33 demo accounts that all share one
password. They refuse to run when `NODE_ENV=production`, and refuse any database
whose name does not end in `_dev` or `_test`. Do not work around either guard.

If you want a **separate test server** with demo data, that is legitimate: name
its database `peerly_dev`, run the seed with a strong `SEED_PASSWORD` set, and
treat that host as untrusted. It must never hold real student data.

---

## 4. The environment files

Two files. Neither is in git, and neither is created for you.

### `server/.env` - the API. **This holds every secret.**

Copy `server/.env.example` and edit it. `chmod 600` it, owned by the `peerly`
user. Full reference:
[handover §3.1](./technical-handover.md#31-api-serverenv).

The values that **must** change from the example:

```sh
NODE_ENV=production
PORT=4000
DATABASE_URL=postgres://peerly:<password>@<host>:5432/peerly?sslmode=require

# The public URL, twice. CORS_ORIGINS is what the browser is allowed to call
# the API from; APP_URL is what goes into links inside e-mails.
CORS_ORIGINS=https://peerly.nwu.ac.za
APP_URL=https://peerly.nwu.ac.za

# Production refuses to start unless this is smtp and the four below are set.
MAIL_TRANSPORT=smtp
SMTP_HOST=<from the mail team>
SMTP_PORT=587            # 587 with SMTP_SECURE=false (STARTTLS), or 465 with true
SMTP_SECURE=false
SMTP_USER=<from the mail team>
SMTP_PASSWORD=<from the mail team>
MAIL_FROM_ADDRESS=<an address SPF/DKIM authorises you to send as>

# Confirm with the Sponsor before go-live (IS-01).
STUDENT_EMAIL_DOMAINS=mynwu.ac.za
STAFF_EMAIL_DOMAINS=nwu.ac.za
```

Everything else in the example has a working default: session lifetimes, token
lifetimes and the rate limits. `SEED_PASSWORD` is unused in production.

**There is no session signing secret, and you do not need to invent one.**
Sessions are rows in the database - the cookie carries a random token and the
database stores only its hash. So there is no `SESSION_SECRET`, `JWT_SECRET` or
equivalent to generate, protect or rotate. The two secrets in this file are the
database password and the SMTP password, and that is all. A useful consequence:
deactivating an account or changing its password revokes its sessions
immediately, everywhere.

### `.env` at the repository root - the web app. **No secrets, ever.**

Vite compiles anything starting with `VITE_` **into the JavaScript the browser
downloads**. Never put a credential here.

```sh
VITE_API_URL=
```

Leave it **empty**. The proxy puts the API and the web app on one origin, so a
relative path is correct. Setting it to a different host makes the browser treat
the API as a third party and silently drop the session cookie on every request -
sign-in appears to succeed, and then nothing is signed in.

This value is baked in **at build time**. If you ever change it, rebuild.

---

## 5. Install and build

As the `peerly` user:

```sh
node -v                                  # expect v24.x

git clone <repository-url> /opt/peerly && cd /opt/peerly
git checkout <release-tag>

# Web app. The build needs devDependencies; the result does not.
npm ci
npm run build                            # writes .output/, self-contained

# API. Runtime dependencies only.
cd server
npm ci --omit=dev
cp .env.example .env && chmod 600 .env
$EDITOR .env                             # section 4
```

`.output/` needs nothing but Node at runtime, so you may build it on another
machine and copy only that directory across.

Now create the schema - [section 3](#create-the-schema) - before starting
anything.

---

## 6. The reverse proxy and TLS

The proxy must:

1. **Terminate TLS** (1.2 and 1.3 only) and redirect HTTP to HTTPS.
2. Send `/api/` to `127.0.0.1:4000`, everything else to `127.0.0.1:3000`.
3. Set `X-Forwarded-For` to the real client address.
4. Allow request bodies of at least **6 MB** - class-list uploads are capped at 5 MB.
5. Send `Strict-Transport-Security`. The API already does; the web app does not.

```nginx
server {
    listen 80;
    server_name peerly.nwu.ac.za;                        # your DNS name
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name peerly.nwu.ac.za;                        # your DNS name

    ssl_certificate     /etc/ssl/peerly/fullchain.pem;   # your certificate
    ssl_certificate_key /etc/ssl/peerly/privkey.pem;     # your key
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    client_max_body_size 6m;

    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    location /api/ { proxy_pass http://127.0.0.1:4000; }
    location /     { proxy_pass http://127.0.0.1:3000; }
}
```

> **If another load balancer sits in front of this proxy, read this.** The API
> trusts exactly **one** proxy hop (`app.set("trust proxy", 1)` in
> `server/src/app.ts`). With two hops, Express sees the load balancer's address
> as every user's address, so everyone shares one rate-limit bucket - and 30
> failed sign-ins from anyone would lock out sign-in for **everybody** for 15
> minutes. Change that number to the real hop count.

Adapt the rest to the university's standard proxy configuration.

---

## 7. Run as services

`/etc/systemd/system/peerly-api.service`:

```ini
[Unit]
Description=Peerly API
After=network.target postgresql.service

[Service]
User=peerly
WorkingDirectory=/opt/peerly/server
Environment=NODE_ENV=production
Environment=DOTENV_CONFIG_QUIET=true
ExecStart=/usr/bin/node --experimental-strip-types src/index.ts
Restart=on-failure
# index.ts drains in-flight requests on SIGTERM (at most 10 seconds)
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/peerly-web.service`:

```ini
[Unit]
Description=Peerly web app
After=network.target

[Service]
User=peerly
WorkingDirectory=/opt/peerly
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=3000
ExecStart=/usr/bin/node .output/server/index.mjs
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now peerly-api peerly-web
journalctl -u peerly-api -f
# expect: Peerly API listening on http://localhost:4000 (production)
```

If the API exits immediately, it is almost always configuration. It validates
every setting at start-up and refuses to run on a bad one rather than defaulting
silently, and it prints exactly which setting is wrong.

> **Run exactly one API process.** Do not put the API behind a process manager
> that forks workers, and do not scale it to a second instance. The sign-in
> rate limits and the account lock-out (SR-04) count in process memory, so two
> processes would each keep their own tally and a brute-force attempt would get
> double the attempts. One process handles the load this system is specified for
> (PR-02: 150 concurrent submitters). If it ever must be scaled out, those
> counters have to move into the database first.

Both services are `enable`d above, so they come back after a reboot. Reboot once
and confirm that they actually do.

---

## 8. Create the first administrator

**There is no default administrator account and no built-in password.** The
first one is created once, here, and creates everyone else from the Admin
Portal afterwards.

The procedure makes an `unverified` admin with **no password**, plus a one-time
activation link. The person opens it and chooses their own password.

Run on the API host from `/opt/peerly/server`, with `DATABASE_URL` exported:

```sh
ADMIN_EMAIL='firstname.surname@nwu.ac.za'     # worksheet item 9
ADMIN_NAME='Firstname'
ADMIN_SURNAME='Surname'
PUBLIC_URL='https://peerly.nwu.ac.za'         # same as APP_URL

TOKEN=$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))')
TOKEN_HASH=$(node -e 'console.log(require("node:crypto").createHash("sha256").update(process.argv[1]).digest("hex"))' "$TOKEN")

psql -X -v ON_ERROR_STOP=1 "$DATABASE_URL" \
  -v email="$ADMIN_EMAIL" -v name="$ADMIN_NAME" -v surname="$ADMIN_SURNAME" -v token_hash="$TOKEN_HASH" <<'SQL'
BEGIN;
WITH admin AS (
  INSERT INTO users (role, name, surname, email, status)
  VALUES ('admin', :'name', :'surname', :'email', 'unverified')
  RETURNING id, name, surname, email
), token AS (
  INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
  SELECT id, 'activation', :'token_hash', now() + interval '24 hours' FROM admin
)
INSERT INTO audit_entries (actor_name, event_type, object_description, detail)
SELECT 'System', 'account.created', name || ' ' || surname || ' · ' || email,
       'Initial administrator created at deployment (AS-06); activation link issued out of band.'
  FROM admin;
COMMIT;
SQL

echo "$PUBLIC_URL/activate?token=$TOKEN&email=$ADMIN_EMAIL"
unset TOKEN TOKEN_HASH
```

Give the printed link to that person over a trusted channel. It works once and
expires in 24 hours. Only the database stores a hash of it, so if it is lost,
run the procedure again for a new one.

---

## 9. Check it worked

```sh
curl -s https://peerly.nwu.ac.za/api/auth/me   # {"error":{"code":"unauthorized",...}} - proves /api routing
curl -s http://127.0.0.1:4000/health           # {"status":"ok","database":"up"}
node --experimental-strip-types src/db/migrate.ts status   # every migration "applied"
```

Then in a browser, in this order. Each step tests something the one before it
cannot:

1. Open the public URL. Confirm HTTPS, the redirect from `http://`, and a valid
   certificate. *(TLS, proxy)*
2. Activate the first administrator and sign in. *(the account, sessions)*
3. Create a test lecturer account, confirm the activation e-mail **arrives**,
   then deactivate it. *(SMTP)*
4. Use **Forgot password** on the administrator's address. Confirm the e-mail
   arrives and its link points at the public URL. *(`APP_URL`)*
5. Register a test student with an institutional address. Confirm the 6-digit
   code arrives. *(`STUDENT_EMAIL_DOMAINS`, SMTP to student addresses)*
6. Take the first backup and do a restore test.
   *([handover §6.4](./technical-handover.md#64-restore-test-before-handover-then-quarterly))*

Test delivery to **both** `@mynwu.ac.za` and `@nwu.ac.za` addresses. Institutional
filters treat them differently, and a verification code that is quarantined
looks to a student exactly like a system that does not work.

---

## 10. Before you hand it over

- [ ] Both services `enabled`, so they start after a reboot. Reboot and confirm.
- [ ] Backups running and a restore **tested**, not just configured
      ([handover §6](./technical-handover.md#6-backup-and-recovery))
- [ ] Certificate renewal automated, with the expiry date recorded somewhere a
      person will see it
- [ ] `server/.env` is `chmod 600` and owned by the service user
- [ ] Database password and SMTP password in the university vault, not in a
      chat message or a ticket
- [ ] If **you** hold the first administrator account, rotate it: the university's
      own administrators are created in the Admin Portal, then your account is
      deactivated. Peerly refuses to deactivate the last active administrator, so
      that order matters.
      ([handover §5.9](./technical-handover.md#59-the-initial-administrator-account-as-06))
- [ ] The Sponsor knows marks are provisional until the Felder specification is
      approved (AS-08)

**Upgrades, rollback, backup and restore, changing the rating scale, adding
lecturers, troubleshooting:** all in
[`technical-handover.md`](./technical-handover.md) sections 5.11, 6 and 7.
