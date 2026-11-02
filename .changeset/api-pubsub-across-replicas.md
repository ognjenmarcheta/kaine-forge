---
"@repo/api": minor
---

Realtime events now reach every API replica (issue #802). The pubsub sends each event over
Postgres LISTEN/NOTIFY on the `api_pubsub` channel, so a subscriber on one replica hears about a
Todo, Note, Notification, or assistant reply written on another. Subscribers on the publishing
replica still get the event in-process, and webhooks still go out once, from that replica.
