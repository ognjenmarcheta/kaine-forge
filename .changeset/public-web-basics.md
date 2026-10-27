---
"@repo/web": minor
"@repo/ui": minor
"@repo/translation": minor
---

The web app now names each browser tab `<route title> · <app name>` and updates it when the language changes. `index.html` carries the product name, a meta description, and Open Graph tags that template adoption rewrites. The app serves a permissive `robots.txt` and adds public `/terms` and `/privacy` stub pages, linked from a new auth page footer. `AuthLayout` takes an optional `footer` slot.
