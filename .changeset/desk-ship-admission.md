---
"@repo/desk": patch
---

The ship module owns ship admission: `shipAdmission(state, intent)`, a side-effect-free `prepareShip`, and `runShip(ticket)`. A ship refused at its gate changes nothing, and an admitted ship enters the ship stage before its first change.
