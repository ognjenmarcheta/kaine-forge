---
"@repo/desk": patch
---

Docker isolation works on a Windows host: the container policy accepts the absolute Windows path of
the staging folder and still refuses a drive root, the Docker pipe, and network shares. In Docker
mode the ship checks run in containers, through the same isolation port as the loop checks, so a
Windows host runs every check on Linux.
