# Backup and restore

This runbook protects the two stores that hold customer data: Postgres and object storage. It also gives a restore drill that you can run on your laptop.

The numbers in this document are **template defaults**. Each adopter must adapt them to the product, the contract, and the budget. Change them here when you do.

## What holds data

| Store                                | What it holds                                  | Variable           |
| ------------------------------------ | ---------------------------------------------- | ------------------ |
| Postgres 17                          | Users, organizations, Attachment rows, notes   | `DATABASE_URL`     |
| Private bucket                       | Attachment objects and `staging/` uploads      | `S3_BUCKET`        |
| Public bucket (`S3_PUBLIC_BASE_URL`) | Avatars and organization logos (Public Assets) | `S3_PUBLIC_BUCKET` |

The Attachment row in Postgres points at an object in the private bucket. A backup of one store without the other can leave a row with no object, or an object with no row. Plan both together.

## Recovery targets (template defaults)

RPO is the most data you accept to lose. RTO is the longest time you accept to be down.

| Store                   | RPO                                       | RTO     | Source of the restore                  |
| ----------------------- | ----------------------------------------- | ------- | -------------------------------------- |
| Postgres, point-in-time | 15 minutes                                | 4 hours | Provider PITR (WAL archiving)          |
| Postgres, logical dump  | 24 hours                                  | 8 hours | Latest `pg_dump` file                  |
| Object storage          | 0 for deletes and overwrites, 30 days max | 8 hours | Noncurrent object versions or 2nd copy |

Read the object storage row with care. A deleted or overwritten object is recoverable for as long as you keep noncurrent versions (30 days by default). After that it is gone.

## Postgres

Use two copies. The first copy is fast and precise. The second copy is portable and independent of the provider.

### Copy 1: point-in-time recovery

Use a managed Postgres provider that archives the write-ahead log (WAL). Turn on these settings:

- Continuous backup, also called point-in-time recovery (PITR).
- A recovery window of **14 days** or more. Most providers allow 7 to 35 days.
- Backups in a different failure domain from the primary (a different zone at least).
- Encryption at rest, with the provider's default key or your own.
- A restore alert or reminder on the provider, so an expired plan does not silently stop archiving.

To recover, restore to a **new** instance at a chosen time. Do not restore over the live instance. Check the new instance, then switch `DATABASE_URL`.

### Copy 2: scheduled logical dump

A logical dump protects you when the provider account, the region, or the PITR chain fails. Run it daily from a scheduler that you own (for example a CI scheduled workflow or a job on a separate host). The template does not ship a scheduler.

Use the custom format. It is compressed, and `pg_restore` can restore it in parallel or in part:

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner \
  | gpg --encrypt --recipient "$BACKUP_KEY_ID" \
  | aws s3 cp - "s3://$BACKUP_BUCKET/postgres/monorepo-$(date -u +%Y%m%dT%H%M%SZ).dump.gpg"
```

Rules for the dump:

- Use a `pg_dump` client of major version 17 or newer. An older client cannot dump a Postgres 17 server.
- Store dumps in a bucket in a **different account** from production. A stolen production credential must not reach the backups.
- Give the dump job a credential that can write new objects but not delete or overwrite them.
- Encrypt before the file leaves the host (the example uses `gpg` with a public key). Keep the private key offline and outside the backup account.
- Expire dumps with a bucket lifecycle rule. The default is **30 days**.
- Test every dump by restoring it (see the restore drill below). An untested dump is not a backup.

To restore a production dump, decrypt it and restore it into a new, empty database:

```bash
gpg --decrypt monorepo.dump.gpg \
  | pg_restore --dbname "$NEW_DATABASE_URL" --no-owner --exit-on-error
```

The dump includes the Drizzle migration history (the `drizzle` schema). Migrations are forward-only. Start the API of the **same release** as the dump first, or a newer one. A newer release applies the missing migrations when `API_RUN_MIGRATIONS` is true. Never run an older release against a newer schema.

## Object storage

The API stores Attachment objects in `S3_BUCKET` and Public Assets in `S3_PUBLIC_BUCKET`. Keep them as two buckets. Never point both variables at one bucket.

### The storage sweeper deletes objects

The API runs a storage sweeper in the background (`STORAGE_SWEEP_ENABLED`, `STORAGE_SWEEP_INTERVAL_MS`). The sweeper deletes the stored object of every Attachment with status `deleted`. It also deletes the objects of `pending` Attachments that were never confirmed, and stale uploads under `staging/`. Then it marks the row as purged.

This has one effect on restores. Suppose you restore the database to an earlier time. The restored rows can show Attachments as `ready`, but the sweeper may have deleted their objects after that time. The rows then point at objects that are gone.

**Bucket versioning with noncurrent versions kept for at least the database recovery window prevents this.** Use this rule:

> Keep noncurrent versions for at least as long as the oldest database restore point you keep. The template default is 30 days (the dump retention).

Do not set the noncurrent retention shorter than the PITR window or the dump retention. If you raise one, raise the other.

### Amazon S3

Turn on versioning, then add a lifecycle rule, on **both** buckets. Replace the bucket names with yours.

```bash
aws s3api put-bucket-versioning \
  --bucket "$S3_BUCKET" \
  --versioning-configuration Status=Enabled
```

Save this as `lifecycle.json`:

```json
{
  "Rules": [
    {
      "ID": "expire-noncurrent-versions",
      "Status": "Enabled",
      "Filter": {},
      "NoncurrentVersionExpiration": { "NoncurrentDays": 30 },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    },
    {
      "ID": "remove-expired-delete-markers",
      "Status": "Enabled",
      "Filter": {},
      "Expiration": { "ExpiredObjectDeleteMarker": true }
    }
  ]
}
```

Apply it:

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket "$S3_BUCKET" \
  --lifecycle-configuration file://lifecycle.json
```

Repeat both commands for `$S3_PUBLIC_BUCKET`.

Notes:

- With versioning on, a delete keeps the object as a noncurrent version and adds a delete marker. The sweeper's delete is therefore reversible for 30 days.
- Noncurrent versions cost storage. Set the retention to what you need, not more.
- Public readers of the public bucket need `s3:GetObject` only. Do not grant `s3:GetObjectVersion` to the public. Noncurrent versions must stay private.
- Also turn on default bucket encryption on both buckets, and keep the private bucket private (`SECURITY.md`).

To recover a deleted object, find the version, then copy it back as the current version:

```bash
aws s3api list-object-versions --bucket "$S3_BUCKET" --prefix "<organization-id>/<object-key>"
aws s3api copy-object --bucket "$S3_BUCKET" --key "<organization-id>/<object-key>" \
  --copy-source "$S3_BUCKET/<organization-id>/<object-key>?versionId=<version-id>"
```

### Cloudflare R2

Cloudflare documents `PutBucketVersioning` and `GetBucketVersioning` as **not implemented** in the R2 S3 API (checked 2026-10-27; check again before you rely on this). Without versioning, a sweeper delete on R2 is final. Protect R2 buckets in this way:

1. Keep a **second copy** of both buckets in another account or provider, at least daily. Use a copy command that never deletes at the destination (for example `rclone copy`, not `rclone sync`).
2. Turn on versioning at the second copy if its provider supports it. Keep noncurrent versions for 30 days.
3. Keep the second copy for at least as long as the oldest database restore point you keep. Do not expire its objects sooner.
4. Add R2 lifecycle rules in the Cloudflare dashboard (**R2 → bucket → Settings → Object lifecycle rules**): abort incomplete multipart uploads after 7 days. R2 lifecycle rules do not manage versions.
5. Use credentials for the second copy that cannot delete from the source, and the reverse.

If you cannot keep a second copy, set `STORAGE_SWEEP_ENABLED=false`. The API then never deletes the objects of deleted Attachments, so a restored database never points at a missing object. The cost is storage for data that users deleted. Choose this on purpose, and delete old objects with a reviewed manual job.

### Other S3-compatible providers

Wasabi, Backblaze B2, and Hetzner each have their own versioning and lifecycle settings. Use the same rule: noncurrent versions kept for at least the oldest database restore point. If the provider has no versioning, follow the R2 steps.

## Restoring after an incident

Use this order. It is the same for a managed PITR restore and for a dump restore.

1. Stop writes. Scale the API to zero, or put the product in maintenance mode.
2. Set `STORAGE_SWEEP_ENABLED=false` on the API that will use the restored database. This stops the sweeper from deleting objects while you check the restore.
3. Restore Postgres to a **new** database. Use PITR to the last good time, or the latest good dump.
4. Restore missing objects. List the Attachment rows that are `ready` and have no object. Recover each object from its noncurrent version (S3) or from the second copy (R2).
5. Point `DATABASE_URL` at the restored database. Start **one** API replica first. Check `GET /ready` and sign in.
6. Check a real Attachment download and a Public Asset (an avatar) in the product.
7. Scale the API back up. Set `STORAGE_SWEEP_ENABLED` back to its normal value.
8. Write a postmortem (`docs/incident-response.md`).

Objects uploaded after the restore point have no row. They are harmless, and the sweeper does not delete them. Remove them later if you need the space.

## Restore drill

A backup that you never restored is a guess. Run this drill to prove the dump and restore steps work. The drill uses the local `docker compose` stack. It dumps the `monorepo_dev` database, restores it into a new empty database, and points the API at the copy.

**Template default interval: every 3 months (quarterly).** Also run it after a major Postgres upgrade or a change of backup provider. For production, run the same steps with your real dump and a scratch instance.

### Before you start

- Docker is running, and `.env` exists (`pnpm quick-setup` creates it).
- The local database has the seed user: run `pnpm db:prepare:local` (needs `ALLOW_LOCAL_DB_PUSH=true`), or run `pnpm db:migrate` and then `pnpm db:seed`.
- Port 4000 is free.

### Steps

Run these commands from the repository root.

1. Start Postgres and wait for the health check:

   ```bash
   docker compose up -d --wait postgres
   ```

2. Note the start time, then dump the database in custom format:

   ```bash
   date -u +%FT%TZ
   docker compose exec -T postgres pg_dump -U postgres -d monorepo_dev --format=custom --no-owner > /tmp/monorepo_dev.dump
   ls -l /tmp/monorepo_dev.dump
   ```

3. Create a new empty database and restore the dump into it:

   ```bash
   docker compose exec -T postgres createdb -U postgres monorepo_restore_drill
   docker compose exec -T postgres pg_restore -U postgres -d monorepo_restore_drill --no-owner --exit-on-error < /tmp/monorepo_dev.dump
   ```

4. Compare the copy with the source. Both counts must match for `users` and for `sessions`. Write down the `sessions` count:

   ```bash
   docker compose exec -T postgres psql -U postgres -d monorepo_dev -tAc 'select count(*) from users'
   docker compose exec -T postgres psql -U postgres -d monorepo_restore_drill -tAc 'select count(*) from users'
   docker compose exec -T postgres psql -U postgres -d monorepo_dev -tAc 'select count(*) from sessions'
   docker compose exec -T postgres psql -U postgres -d monorepo_restore_drill -tAc 'select count(*) from sessions'
   ```

5. Start the API against the copy. Keep this terminal open. The environment variables override `.env` for this process only:

   ```bash
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/monorepo_restore_drill \
   API_RUN_MIGRATIONS=false STORAGE_SWEEP_ENABLED=false \
   pnpm --filter @repo/api dev
   ```

6. In a second terminal, check readiness. The API must answer `200` with `{"status":"ready"}`:

   ```bash
   curl -i http://localhost:4000/ready
   ```

7. Sign in as the seed user. Read the email and password from `packages/db/src/seed/users.seed.ts`, and set them in your shell as `SEED_EMAIL` and `SEED_PASSWORD`. The `origin` header must be an origin in `API_CORS_ORIGINS` (the default is `http://localhost:3000`). The API must answer `200` and set a `kaine.session_token` cookie:

   ```bash
   curl -i -X POST http://localhost:4000/api/auth/sign-in/email \
     -H 'content-type: application/json' -H 'origin: http://localhost:3000' \
     -d "{\"email\":\"$SEED_EMAIL\",\"password\":\"$SEED_PASSWORD\"}"
   ```

8. Prove that the API used the copy and not the source. The sign-in wrote a new session row. Read the two `sessions` counts again:

   ```bash
   docker compose exec -T postgres psql -U postgres -d monorepo_restore_drill -tAc 'select count(*) from sessions'
   docker compose exec -T postgres psql -U postgres -d monorepo_dev -tAc 'select count(*) from sessions'
   ```

   The count in the copy is one higher than in step 4. The count in the source did not change.

9. Stop the API with `Ctrl+C`, note the end time, and clean up:

   ```bash
   docker compose exec -T postgres dropdb -U postgres monorepo_restore_drill
   rm /tmp/monorepo_dev.dump
   ```

The drill **passes** when steps 3 to 8 finish without an error, `/ready` answers `200`, the sign-in answers `200`, and the new session row exists only in the copy.

### Drill log template

Copy one row per drill into your own operations record. Do not edit this table in the template.

| Date (UTC) | Operator | Dump size | Dump time | Restore time | `/ready` | Sign-in  | Total time | Result    | Follow-up issues |
| ---------- | -------- | --------- | --------- | ------------ | -------- | -------- | ---------- | --------- | ---------------- |
| YYYY-MM-DD | name     | MB        | mm:ss     | mm:ss        | 200/fail | 200/fail | mm:ss      | pass/fail | #issue           |

Compare the total time with the RTO. If the drill time grows toward the RTO, act before a real incident does it for you.

## Related

- [`incident-response.md`](incident-response.md): severity levels, roles, and postmortems.
- [`troubleshooting.md`](troubleshooting.md): local Docker and database failures.
- [`../SECURITY.md`](../SECURITY.md): bucket privacy rules and vulnerability reports.
