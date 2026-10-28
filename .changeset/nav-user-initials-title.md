---
"@repo/ui": patch
---

`resolveNavUserInitials` skips a leading title, so "Dr. Adrian Hale" gives "AH", not "DA". A single-letter initial such as "J." still counts.
