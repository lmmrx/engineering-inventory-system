# Disaster-recovery test & recovery log

Record every restore drill and every real recovery here: date, who, what was
restored, result, recovery time, data-loss window, and issues found.
Automated drill reports are also kept as artifacts on each *Restore drill*
run (GitHub → Actions).

---

## 2026-10-25 — Initial implementation test (local, isolated)

**Who:** set up during implementation, before the GitHub schedules were
switched on.
**Environment:** isolated Docker containers on a developer machine —
PostgreSQL 16 standing in for production, a scratch database, and empty
restore targets. Production (Neon) was not touched.

**Data:** the app's real schema (all 9 migrations) and starter data, plus
realistic records: an Admin, a Supervisor, a Staff member with a manager and
a granted permission (`approve_requests`), an inventory item, a stock
movement, a work order, a purchase request with a line, and a PNG profile
photo — 88 rows across 12 tables.

| Test | Result |
|---|---|
| Backup as the read-only `backup_reader` account | ✅ |
| Test-restore into scratch database + integrity checks | ✅ passed |
| Backup row counts consistent with the live database | ✅ |
| Encryption: no names/emails readable in the file; no unencrypted copy left | ✅ |
| Restore into an empty database; checksum, integrity checks, row counts | ✅ 88 rows, 12 tables, identical |
| Refuses to restore over a database that has data | ✅ refused, nothing changed |
| Detects a tampered backup (checksum) | ✅ refused |
| Detects a tampered backup with no manifest (authenticated encryption) | ✅ refused, nothing written |
| Wrong private key | ✅ refused |
| Real API on the restored copy: sign-in, password change, user's manager & extra permission, items, work orders, purchase requests | ✅ |
| Profile photo restored byte-for-byte identical | ✅ 70 bytes |
| Smoke test (`ops/backup/smoke-test.cjs`) across all 4 departments | ✅ 27/27 checks |
| Workflows validated with actionlint; scripts with shellcheck | ✅ |

**Recovery time:** backup + verification ≈ 1 s; empty database → restored,
verified, working app ≈ 3 s (small data set; human steps dominate a real
recovery — see the runbook).
**Data-loss window:** n/a (test).
**Issues found:** none in the backup/restore path.

**Still to do in production:** complete the one-time setup in
`backup-and-disaster-recovery.md` §5, run *Database backup* and *Restore
drill* once on GitHub against Neon, and record that drill below.

---

<!-- Template for the next entry:

## YYYY-MM-DD — Quarterly drill / Real recovery (what happened)

**Who:**  **Approved by:**
**Backup / point in time restored:**
**Result:**
**Recovery time (RTO):**     **Data-loss window (RPO):**
**Validation:** smoke test result, manual spot checks
**Issues found and actions:**
-->
