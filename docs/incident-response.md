# Incident response

This runbook tells your team what to do when the product is down, slow, or unsafe. Read it before an incident, not during one.

The severity levels, role names, and times are **template defaults**. Each adopter must adapt them to the team size and the contract.

## Vulnerability reports follow `SECURITY.md`

A report of a vulnerability in the template code is **not** handled here. It follows [`../SECURITY.md`](../SECURITY.md):

- Do not open a public issue with exploit details.
- Report it privately through GitHub private vulnerability reporting, or by the email address in `SECURITY.md`.

Use this runbook when something is **happening to your deployment**: an outage, data loss, a leak, or an attack in progress. If the cause is a vulnerability in the template code, do both. Run the incident here, and send a private report as `SECURITY.md` says. Do not put exploit details in a public ticket, a status page, or a chat channel with guests.

## Severity levels

Pick the level from the impact on customers, not from the cause. When you are unsure, choose the higher level. You can lower it later.

| Level    | Meaning                                                  | Examples                                                                                                                     | Response target                     |
| -------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **SEV1** | Product is down, data is lost, or data was exposed       | `GET /ready` fails for all users. A database is lost or corrupted. A leak of customer data. Cross-organization data visible. | Start now, 24 hours a day           |
| **SEV2** | A core feature is broken or very slow for many customers | Sign-in fails for many users. Uploads or downloads fail. Errors above normal after a release.                                | 30 minutes, business hours at least |
| **SEV3** | A feature is degraded, or one customer is blocked        | One organization cannot upload. Email delivery is late. A background job is stuck.                                           | 1 business day                      |
| **SEV4** | Small defect with a workaround                           | A wrong label. A slow screen. A failed sweep of a single object.                                                             | Normal backlog                      |

Treat these as SEV1 at once, even when the first signal looks small:

- Any sign that one organization can read another organization's data.
- A leaked secret, such as `BETTER_AUTH_SECRET`, a database password, or a storage key.
- A public or world-readable private bucket (`S3_BUCKET`).

## Roles

Name one person for each role at the start. In a small team, one person can hold two roles, but not **incident lead** and **scribe** together.

- **Incident lead.** Owns the incident. Decides the severity, assigns work, and decides when it ends. Does not debug. If the lead starts to debug, hand the lead role to someone else.
- **Communications.** Writes every update to customers and to the team. Is the only person who posts to the status page. Uses the status update template below.
- **Scribe.** Keeps a timeline in one shared place: each time, each action, who did it, and what happened. Writes down decisions and the reason for them.
- **Responders.** Investigate and fix. They report to the incident lead.

## First-hour checklist

Work in this order. Do not skip step 1.

1. **Declare.** Open one channel or thread for the incident. Name the incident lead, communications, and scribe. Write the start time.
2. **Set a severity.** Use the table above.
3. **Check the facts.** Check `GET /health` (the process is alive) and `GET /ready` (the database answers). Check the latest release, the latest migration, and the provider status pages. Write down what you see.
4. **Stop the damage.** Choose the smallest safe step: roll back the release, turn off the feature flag, block the abusive client, or scale the API to zero. For a leak, revoke the credential first.
5. **Preserve evidence.** Keep logs, the request IDs, and the database state as they are. Take a snapshot before you change data.
6. **Tell people.** Post the first status update within 30 minutes for SEV1 and SEV2.
7. **Rotate exposed secrets.** If a secret may be exposed, rotate it now. Do not wait for the cause. See the hardening rules in [`../SECURITY.md`](../SECURITY.md).
8. **Restore if data is lost.** Follow [`backup-and-restore.md`](backup-and-restore.md). Set `STORAGE_SWEEP_ENABLED=false` while you check the restored data.
9. **Check your legal duty.** If personal data may be exposed, find out the notice deadline that applies to you (for example from your contract or local law). Ask the person who owns legal matters. Do this in the first hour, even if the notice goes out later.
10. **Set the next check-in.** Say when the next update comes, and keep to it.
11. **Close.** When customers are no longer affected, post the last update. Book the postmortem within 5 working days.

## Status update template

Send an update at the interval you promised, even when nothing changed. Use short sentences. Do not guess a cause. Do not blame a person or a vendor.

```text
[SEV<level>] <short title> - update <number>
Time: <YYYY-MM-DD HH:MM UTC>
Status: Investigating | Identified | Fixing | Monitoring | Resolved

Impact: <who is affected and what they cannot do>
What we know: <facts only>
What we are doing: <current action>
What you can do: <workaround, or "Nothing">
Next update: <time UTC>
```

The first update can be short: the impact and the next update time. Add a final update with `Status: Resolved`, the end time, and a one-line summary.

## Blameless postmortem template

Hold the postmortem within 5 working days of a SEV1 or SEV2. A postmortem looks for gaps in the system. It never looks for a person to blame. People acted on the information they had.

Keep the written postmortem with your other operations records, for example `docs/postmortems/YYYY-MM-DD-<title>.md` in your own repository.

```markdown
# Postmortem: <title>

- Date: <YYYY-MM-DD>
- Severity: SEV<level>
- Incident lead: <name>
- Authors: <names>
- Status: Draft | Reviewed | Actions complete

## Summary

<Two or three sentences: what happened, who was affected, how long.>

## Impact

<Customers affected, features affected, data lost or exposed, duration.>

## Timeline (UTC)

| Time  | Event                                |
| ----- | ------------------------------------ |
| HH:MM | <Detected, declared, fixed, closed.> |

## Root cause

<The chain of causes. Ask "why" until you reach a gap in the system.>

## What went well

- <...>

## What went badly

- <...>

## Where we were lucky

- <...>

## Action items

| Action | Type (prevent, detect, mitigate) | Owner | Issue | Due date |
| ------ | -------------------------------- | ----- | ----- | -------- |
| <...>  | <...>                            | <...> | #<n>  | <date>   |
```

Every action item has one owner, one issue, and one due date. Review open actions at your regular planning meeting.

## Related

- [`backup-and-restore.md`](backup-and-restore.md): backups, recovery targets, and the restore drill.
- [`../SECURITY.md`](../SECURITY.md): vulnerability reports and hardening rules.
- [`troubleshooting.md`](troubleshooting.md): local setup failures.
