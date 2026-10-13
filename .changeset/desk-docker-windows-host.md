---
"@repo/desk": patch
---

Docker isolation works on a Windows host: the container policy accepts the absolute Windows path of
the staging folder and still refuses a drive root, the Docker pipe, and network shares. In Docker
mode the ship checks run in containers, through the same isolation port as the loop checks, so a
Windows host runs every check on Linux. On a host where git ignores the exec bit on disk, the
container patch's exec bits go into the index, and ship keeps index exec bits through its reset
and add, so the commit keeps them.
