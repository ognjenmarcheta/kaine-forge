---
"@repo/mobile": minor
---

Mobile keeps synced Todos in an `expo-sqlite` database per User and Organization, so a cold start
with no network shows them. Signing out deletes the User's databases, and starting sync deletes
other Users'. New todo stays disabled until sync starts. This adds a native module: rebuild the
dev client (`expo run:android` / `expo run:ios`).
