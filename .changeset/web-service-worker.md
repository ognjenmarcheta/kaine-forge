---
"@repo/web": minor
---

The web app keeps its shell in a service worker, so it starts with no network and shows the data
stored on the device. A new version waits until the user chooses Reload in a toast. The desktop
shell never registers the worker. nginx sends `no-cache` for `sw.js` and compresses WebAssembly.
