# Backup & Disaster Recovery — ZS Holdings Inventory

Runbook for administrators: what is protected, how, and exactly what to do
when something goes wrong. Everything here runs on free tiers ($0).

| | Target | How it's met |
|---|---|---|
| **RPO** (data you can lose) | ≤ 15 minutes | Neon point-in-time restore (continuous) inside its history window; encrypted off-site copies every 4 hours beyond it |
| **RTO** (time to be back up) | ≤ 4 hours | Typically under 1 hour (see [Recovery times](#recovery-times)); measured every quarter by the restore drill |

---

## 1. What exists and what is protected

| Part | Where | Holds data? | Protected by |
|---|---|---|---|
| Database (PostgreSQL) | **Neon** | **Yes — everything**: hotels, departments, categories, inventory, stock history, work orders, purchase requests, users, roles, managers, extra permissions, preferences, audit log, and **profile photos** (stored in the `UserAvatar` table) | Neon point-in-time restore + encrypted off-site backups (this document) |
| API | **Render** | No (its disk is wiped on every deploy) | Rebuilt from GitHub on deploy |
| Web app | **Vercel** | No | Rebuilt from GitHub on deploy |
| Code, database schema (migrations), hosting config (`render.yaml`, `client/vercel.json`), backup tooling | **GitHub** `lmmrx/engineering-inventory-system` | No | Git history; every backup records the exact app version (commit) it came from |
| Secrets: `DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN`, `PASSWORD_MAX_AGE_DAYS`, `VITE_API_URL`, backup keys | Render / Vercel / GitHub settings | — | **Never in backups or Git.** Keep a copy in the administrators' password manager (§5) |

**Records and files can't drift apart:** photos live in the same database as
the records, so every backup is one consistent snapshot of both.

## 2. How backups work

```
                 continuous                         every 4 h (GitHub Actions)
  Neon database ───────────► Neon point-in-time ──► read-only dump ──► test-restore into scratch DB
        │                    restore (history                         ──► integrity checks (verify.sql)
        │                    window of your plan)                     ──► encrypt (age, public key)
        │                                                             ──► off-site: GitHub artifact
        │                                                             ──► optional: locked bucket copy
        └── hourly monitor (GitHub) checks age, success, size ──► email + optional chat alert
            quarterly drill restores the latest backup, starts the app on it, smoke-tests it
```

- **Layer 1 — Neon point-in-time restore.** Neon keeps a continuous change
  history, so the database can be restored to any second inside the history
  window (free plan: a short window of hours; paid plans: days). This is what
  meets the 15-minute RPO, without keeping the database awake.
- **Layer 2 — encrypted off-site backups** (`.github/workflows/backup.yml`).
  Every 4 hours GitHub's servers dump the database with a **read-only**
  account, restore the dump into a throwaway database and run integrity
  checks — a backup is only kept if it restores and passes — then encrypt it
  and store it off-site. More often than every 4 hours would keep a free Neon
  database awake around the clock and use up its monthly compute allowance.
- **Layer 3 (optional) — locked copies** in S3-compatible object storage with
  Object Lock (e.g. Backblaze B2's free 10 GB). Locked objects can't be
  changed or deleted by anyone — not even the account owner — until they
  expire. This is the ransomware-proof copy and allows retention past 90 days.

### Schedule and retention

| Kept as | When | GitHub copy | Locked bucket copy (optional) |
|---|---|---|---|
| 4-hourly | Every backup | 7 days | 7 days |
| Daily | First backup after 00:00 UTC | 35 days | 35 days |
| Weekly | Sunday's daily | 90 days (GitHub maximum) | 13 weeks |
| Monthly | The 1st's daily | 90 days (GitHub maximum) | 13 months |

Each backup is three files: `inventory-db-<time>.dump.age` (the encrypted
database), `.counts.json.age` (encrypted row counts, used to verify restores)
and `.manifest.json` (time, sizes, checksums, app version, migrations — no
data, no secrets).

## 3. Security controls

| Requirement | How it's done |
|---|---|
| Encryption | [age](https://age-encryption.org) (X25519 + ChaCha20-Poly1305) to a **public** key. The servers that make backups can't read them. Encryption is authenticated: any altered byte makes decryption fail. |
| Key protection | The **private** key exists only (a) in the administrators' password manager, (b) on paper in a safe, and (c) in the `restore-drill` GitHub environment, which only releases it after an administrator approves the run. |
| Least privilege | Backups connect as `backup_reader` (can read, can't change anything). The optional bucket upload key can write but not list or delete; the monitor key can list but not write or delete. |
| Separate credentials | Backup credentials are separate from the app's: the app's database account, `JWT_SECRET` and Render have no access to backups, and the backup workflow has no access to production write credentials. |
| Ordinary / compromised app accounts | Backups live outside the app entirely; no app role (not even Admin) can see, change or delete them. |
| Immutability | GitHub copies can only be deleted by repository admins (MFA-protected). Optional bucket copies use Object Lock in compliance mode: undeletable until expiry, even by the owner. |
| Off-site | Copies are on GitHub (and optionally Backblaze) — different companies and data centres from Neon. |
| Integrity | Every backup is test-restored and checked (`ops/backup/verify.sql`) before it's kept; SHA-256 checksums detect corruption; restores refuse a file whose checksum doesn't match. |
| No secrets in logs | Credentials are GitHub secrets (masked in logs); scripts never print connection strings; reports contain only sizes, times and pass/fail. |
| Public repository | The repo is public, so anyone signed in to GitHub can download the encrypted files. Without the private key they are useless; the manifest reveals only sizes, times and the app version. |
| MFA | Required on every account that can reach data or backups — see §5 step 1. |
| Never overwrite production | `restore.sh` refuses any database that already has tables. Production is only ever switched over deliberately (§7), after validation and sign-off. |

## 4. Monitoring and alerts

| Check | Where | Alerts when |
|---|---|---|
| Each backup run | `backup.yml` | The dump, test-restore, integrity checks, encryption or upload fails |
| Hourly health check | `backup-monitor.yml` | The last good backup is over 9 h old, its files are missing/empty, the latest attempt failed, or the bucket is over 8 GB |
| Quarterly drill | `restore-drill.yml` | The latest backup can't be decrypted, restored, verified or used by the app |
| Dead man's switch (optional) | Healthchecks.io (free) | Backups **stop arriving** for any reason — including GitHub pausing scheduled runs |

How you're told: GitHub emails the repository owner when a scheduled run
fails (keep notifications on: GitHub → Settings → Notifications → Actions);
optionally also a chat message (Slack, Discord, Teams, ntfy) via
`BACKUP_ALERT_WEBHOOK`. All of this runs on GitHub — **monitoring keeps
working when Render or Neon is down.**

Logs: every backup, monitor and drill run is logged in GitHub → Actions
(kept 90 days); drill reports are saved as artifacts; record each drill and
real recovery in [`dr-test-log.md`](dr-test-log.md).

## 5. One-time setup (all free, about 30 minutes)

Only an administrator should do this. Nothing here costs money.

**1. Turn on two-factor authentication** (an authenticator app, not SMS) on
every account below. They control the data and backups:
GitHub · Neon · Render · Vercel · Backblaze (if used) · Healthchecks.io (if used)
· the password manager itself.

**2. Check Neon's restore window.** Neon console → your project → **Backup &
Restore** (or Settings → Storage → history retention). Note the window your
plan allows; on the free plan, set it to the maximum offered.

**3. Create the read-only backup account.** Neon console → SQL Editor, on the
production database (use a long random password):

```sql
CREATE ROLE backup_reader WITH LOGIN PASSWORD 'paste-a-long-random-password';
GRANT pg_read_all_data TO backup_reader;
```

Build its connection string from the **direct** (non-pooled) host — the one
*without* `-pooler` in its name — e.g.
`postgresql://backup_reader:PASSWORD@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`.

**4. Create the encryption key pair** on an administrator's computer
(Windows: `winget install FiloSottile.age`; macOS: `brew install age`):

```
age-keygen -o zs-inventory-backup-key.txt
```

It prints the **public key** (`age1…`). The file holds the **private key**
(`AGE-SECRET-KEY-…`). Store the file in the password manager (two
administrators should have access), print one copy for the office safe, then
delete the file from the computer. **Losing every copy of the private key
means the backups can never be read.**

**5. Configure GitHub** (repository → Settings). With the GitHub CLI:

```
# Environment for making backups — restrict it to the master branch in the web UI
gh secret set BACKUP_DATABASE_URL --env backup            # paste the step-3 connection string
gh variable set BACKUP_AGE_RECIPIENT --body "age1..."     # the PUBLIC key from step 4

# Environment for restore drills — in the web UI add Required reviewers (administrators)
gh secret set BACKUP_AGE_IDENTITY --env restore-drill < zs-inventory-backup-key.txt

# Optional alerts
gh secret set BACKUP_ALERT_WEBHOOK      # e.g. a Discord/Slack webhook or https://ntfy.sh/<random-topic>
gh secret set BACKUP_HEARTBEAT_URL      # a Healthchecks.io check URL, period 4 h, grace 2 h

# Turn on the schedules
gh variable set BACKUP_ENABLED --body true
```

In the web UI: Settings → Environments → `backup` → *Deployment branches:
Selected → master*; `restore-drill` → *Required reviewers*: the
administrators, and the same branch rule.

**6. Run a backup and a drill now.** Actions → *Database backup* → Run
workflow. When it's green, Actions → *Restore drill* → Run workflow
(approve it). Record the result in [`dr-test-log.md`](dr-test-log.md).

**7. (Optional) Locked, longer-term copies — Backblaze B2, free 10 GB.**
1. Sign up at backblaze.com (B2 Cloud Storage). In *Caps & Alerts* set every
   daily cap to **$0**, so it can never bill.
2. Create a **private** bucket with **Object Lock enabled**. Add lifecycle
   rule *"Keep only the last version"* so expired copies are cleaned up.
3. Create two application keys, both restricted to that bucket:
   *upload* — capabilities `writeFiles` only; *monitor* — `listFiles` only.
4. In GitHub:
   ```
   gh secret set BACKUP_S3_ACCESS_KEY_ID --env backup       # upload key ID
   gh secret set BACKUP_S3_SECRET_ACCESS_KEY --env backup   # upload key
   gh secret set BACKUP_S3_MONITOR_KEY_ID                   # monitor key ID
   gh secret set BACKUP_S3_MONITOR_SECRET                   # monitor key
   gh variable set BACKUP_S3_BUCKET --body "your-bucket"
   gh variable set BACKUP_S3_ENDPOINT --body "https://s3.<region>.backblazeb2.com"
   gh variable set BACKUP_S3_REGION --body "<region>"
   ```

**8. Keep the app's secrets safe.** Copy the values of `DATABASE_URL`,
`JWT_SECRET`, `CLIENT_ORIGIN` (Render) and `VITE_API_URL` (Vercel) into the
password manager, so a rebuilt environment can be configured.

## 6. Recovery procedures

**Golden rules:** restore into a **new, empty** database first; validate it
(§7) before anything points at it; get sign-off from a second administrator
before switching production; write everything down in the recovery log
(below). Never restore over the live database.

### A. Someone deleted or changed data by mistake (within Neon's window)
1. Note when it happened (the audit log shows who and when: Settings → Audit log).
2. Neon console → **Branches → Create branch**, *from a point in time* just
   before the mistake. This copies the past; production is untouched.
3. Validate the branch (§7). Then either copy the lost records back (Neon SQL
   Editor, `INSERT … SELECT` from the branch), or, if the damage is wide,
   switch production to the branch (§8).
4. Delete the branch when done.

### B. Mistake older than Neon's window, or the database is corrupted
1. Pick the last backup from before the problem (Actions → *Database backup*
   → a run from that time → download the artifact).
2. Create an **empty** database: Neon → *New project* (or a new branch with
   no data), or a local PostgreSQL.
3. Restore and verify (needs the private key; Linux/macOS/WSL or Git Bash
   with `psql`, `pg_restore` and `age` installed):
   ```
   TARGET_DATABASE_URL="postgresql://…empty-db…" \
     ops/backup/restore.sh inventory-db-<time>.dump.age zs-inventory-backup-key.txt
   ```
   It refuses a non-empty target, checks the checksum, decrypts, restores,
   runs the integrity checks and confirms every table's row count.
4. Validate (§7), get sign-off, switch production (§8).

### C. Render (API) or Vercel (web app) is down or broken
No data is lost — both are rebuilt from GitHub.
- Render: dashboard → the service → *Manual Deploy → Deploy latest commit*
  (or *Rollback* to a previous deploy). If Render itself is unavailable,
  create a new Web Service from the repo using `render.yaml` and the secrets
  from the password manager; then update `VITE_API_URL` in Vercel and the CSP
  `connect-src` in `client/vercel.json`.
- Vercel: dashboard → project → *Deployments* → promote/redeploy a working
  one.

### D. Neon (database host) is down or the project is gone
1. If Neon is merely down, wait for its status page; nothing is lost.
2. If the project is lost: create a new database (a new Neon project, or any
   PostgreSQL), restore the latest backup into it (B, steps 2–3), validate
   (§7), switch production (§8). Data since that backup is lost (≤ 4 h) —
   compare with the audit log and staff paper records.

### E. Ransomware, hacking, or a compromised account
1. **Contain:** change the passwords of and sign out every session on
   GitHub, Neon, Render, Vercel (and Backblaze); review their access lists
   and remove anyone unknown. Check that MFA is still on.
2. **Rotate the app's secrets:** new Neon password (Neon → Roles → reset) →
   new `DATABASE_URL` on Render; new `JWT_SECRET` (`openssl rand -hex 32`) on
   Render — this signs everyone out.
3. **Find the last clean point** from the audit log and Render logs. Restore
   a backup (or Neon point-in-time) from **before** the compromise into a
   **new** database (B or A) — never trust the compromised one.
4. Deploy the code from a commit you know is clean (check GitHub's history
   for unexpected changes).
5. Validate (§7), switch (§8), then force every user to choose a new password
   (Neon SQL Editor, on the new production database):
   ```sql
   UPDATE "User" SET "mustChangePassword" = true, "tokenVersion" = "tokenVersion" + 1;
   ```
6. Backups themselves are safe: they're encrypted, off-site, and (with the
   optional bucket) locked.

### F. Data breach (data may have been seen by outsiders)
1. Contain as in E (steps 1–2) and preserve evidence: export the audit log
   (Settings → Audit log → Export CSV) and Render logs before changing more.
2. Force password changes (E, step 5).
3. Work out what was exposed and from when (audit log, sign-in history).
4. Notify as required by law and policy (e.g. Canada's PIPEDA and Alberta's
   PIPA require reporting breaches with a real risk of significant harm) —
   involve management and legal counsel.

### Recovery log
Record in [`dr-test-log.md`](dr-test-log.md): what happened, when it was
noticed, who decided, which backup or point in time was restored, the
validation results, who signed off, when production was switched, and the
data-loss window.

## 7. Validate a restored copy before using it

`restore.sh` and the drill already check: checksum, decryption, every foreign
key (managers, hotels, departments, categories, transactions, photos),
migrations complete, an active Admin exists, permissions are valid, no
negative stock, photos intact, and row counts identical to the backup's
record. Then, by hand:

1. Point a **non-production** copy of the API at it and run the smoke test
   (it signs in as an Admin and reads every area, including a photo):
   ```
   DATABASE_URL=… JWT_SECRET=$(openssl rand -hex 32) PORT=4000 npm run dev --workspace server
   API_URL=http://localhost:4000 JWT_SECRET=<same> ADMIN_ID=<admin user id> AVATAR_USER_ID=<id> \
     node ops/backup/smoke-test.cjs
   ```
2. Spot-check with a manager: a few recent items, stock movements, work
   orders, purchase requests, users and their roles, managers and extra
   permissions, and a profile photo.
3. Confirm the data's last activity time matches the chosen recovery point.

## 8. Switch production to the restored database

Only after §7 passes and a second administrator agrees.

1. Render → service → Environment → set `DATABASE_URL` to the restored
   database (the app's normal account, not `backup_reader`) → Save (it
   redeploys and applies any newer migrations).
2. Check the live site: sign in, open each page.
3. Update the backup account (§5 step 3) and `BACKUP_DATABASE_URL` to point
   at the new database, then run *Database backup* manually.
4. Keep the old database untouched until you're sure — it's evidence.

## 9. Testing

| Test | When | How |
|---|---|---|
| Backup verification | Every backup (6×/day) | Automatic test-restore + integrity checks |
| Backup monitoring | Hourly | `backup-monitor.yml` |
| Full restoration drill | Quarterly (2nd of Jan/Apr/Jul/Oct) + after major changes | `restore-drill.yml` — approve the run, then record the report in `dr-test-log.md` |
| Manual recovery rehearsal | Yearly | Follow §6B by hand into a new Neon project, so more than one person has done it |

The drill restores into a clean throwaway environment on GitHub, applies any
newer migrations, starts the real API, smoke-tests it and reports the
recovery time and data-loss window. It uses the current code and fresh
secrets, so a restore never reintroduces old configuration.

### Recovery times
Measured in the first drill (25 Oct 2026, see [`dr-test-log.md`](dr-test-log.md)):
backup + test-restore + verification ≈ 1 s; from an empty database to a
restored, verified, working app ≈ 3 s — at today's small data size. These
grow with the data; the quarterly drill re-measures them. A real recovery is dominated by human steps: deciding what to
restore, creating a Neon project (~5 min), Render redeploy (~5–10 min on the
free plan), and validation (~30 min). Expect **under 1 hour**; the target
is 4 hours.

## 10. Responsible administrators

| Role | Name | Holds private key? | Can approve drills / switch production? |
|---|---|---|---|
| Primary backup administrator | _fill in_ | Yes | Yes |
| Secondary backup administrator | _fill in_ | Yes | Yes |
| Management sign-off for production switch | _fill in_ | No | Approves |

## 11. Known limits

- **Free tiers.** Neon's free restore window is short (hours), so mistakes
  noticed later rely on the 4-hourly backups (data-loss window up to 4 h).
  Neon's paid plans extend the window to days.
- **GitHub keeps artifacts at most 90 days.** Longer retention (13 weeks /
  13 months) needs the optional locked bucket (§5 step 7).
- **GitHub copies aren't strictly immutable** — a repository admin could
  delete them. The optional Object Lock bucket closes this gap.
- **Scheduled runs pause after 60 days without any repository activity**
  (a GitHub rule for public repositories). The Healthchecks.io heartbeat
  catches this; re-enable under Actions if it happens.
- **App sign-in has no two-factor authentication.** Backup and
  infrastructure access is protected by MFA on GitHub/Neon/Render/Vercel; app
  Admin accounts are protected by strong passwords, lockout and expiry.
