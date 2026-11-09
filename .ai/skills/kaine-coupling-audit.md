---
name: kaine-coupling-audit
description: Audit existing code in one workspace or feature folder for coupling — hidden links, needless links, surplus, and special cases — using git co-change and churn as evidence, and report a decision log that puts each structural fix above the problems it solves. Reads only. Not for a diff (kaine-review), a plan (kaine-architecture-review), or bloat alone (kaine-simplify).
argument-hint: workspace, feature folder, or path; optional concern to focus on
---

# Coupling Audit Workflow

Ask one question of the code in scope: **should these pieces change together?** Record each place where the code answers it wrong. Then find the few structural fixes that remove most of those problems.

## Goal and non-goals

- Goal: a decision log of structural fixes, each above the problems it removes, ranked by how many problems it removes.
- Read only. Do not edit code, tests, or comments. Do not open issues unless the user asks.
- One scope per run: a workspace, a feature folder, or a path. For "the whole repo", ask which workspace goes first.
- Do not hunt bugs. A fix that also removes a bug is fine; name it.
- Leave tests to `kaine-test-audit` and bloat alone to `kaine-simplify`.

## Read first

- `MONOREPO_GUIDE.md` (package boundaries, feature folders) and `CONTEXT.md` (template seams that downstream products use on purpose).
- For `apps/api`: `docs/adr/0025-api-bounded-contexts.md`. The `api/context-boundaries` lint rule already blocks cross-context imports, so report a gap in its map, not each import.
- When the Graphify CLI is installed, run `graphify query "<question>"` for the scope (`kaine-graph`). Treat its edges as leads.

## Steps

1. **Collect evidence.** Run the commands below for the scope. Co-change pairs with no import between them point to hidden links. High-churn files that stable files import point to a wrong dependency direction.
2. **List problems.** Do not design yet. Give each problem a `path:line` and one tag:
   - `hidden:` pieces that must change together, but the code does not show it: copied logic or values, a module that reads a global or file that another module sets, one feature split across folders, a call order that callers must know, lists kept in sync by hand.
   - `needless:` pieces tied together that change for different reasons: callers that use internals, stable code that imports more volatile code, a general function with a parameter that only one caller understands, a shallow module whose interface changes with its internals.
   - `surplus:` pieces with no reason of their own to change: pass-through wrappers, config or extension points that never vary, dead code. Apply the `kaine-simplify` checks before you tag a template seam.
   - `special:` code for one situation: an `if` for one value, a parameter for one caller, a swallowed exception, a retry or sleep, a skipped test, a lint or type suppression. A special case is a requirement that the design did not plan for.
3. **Check each problem.** Read `git log -L` or `git blame` for odd code. Remove a problem that a recorded reason (ADR, `CONTEXT.md`, a `// SAFETY:` comment, an issue link) explains.
4. **Design the fixes.** Design as if the system had known today's requirements from the start. Look for one fix behind several problems; it often looks nothing like them. Do not fix special cases one by one. Each fix must keep pieces that change together in one place, leave unrelated pieces untied, and make each piece depend only on code that changes less.
5. **Write the decision log.** Put each fix above the problems it removes, as in the example. A problem that no fix removes stays in a final `Unresolved` list.

## Report

- The scope, the evidence commands, and their date range.
- The decision log, fixes ranked by the number of problems each removes. For each fix, name the behavior that must not change and the test that proves it.
- The count of `special:` problems before and after the proposed fixes. This count measures how well the design fits its requirements.
- When the user asks to file the fixes: one issue for each fix, written with `kaine-write-issue`, delivered as one PR for each fix.

Example:

```md
- Make `Dialog` give focus back to the element that had it before it opened.
  Keeps: focus returns after close (`dialog.test.tsx`).
  - `special:` `ui/logout-dialog.tsx:30` waits 100ms after close for the input to take focus.
  - `hidden:` `ui/settings-dialog.tsx:61` sets a global `skipRefocus` flag for the dialog it opens.
- Unresolved
  - `needless:` `checkout/submit.ts:9` imports `payments/stripe.ts` directly.
```

## Canonical commands

```bash
# Pairs of files that changed together in at least 3 commits (commits of more than 15 files skipped)
git log --no-merges --since="6 months ago" --name-only --format=format:@@ -- <scope> \
  | awk 'function flush(){ if(n>1 && n<=15) for(i=1;i<n;i++) for(j=i+1;j<=n;j++){ k=(f[i]<f[j])?f[i]"  "f[j]:f[j]"  "f[i]; c[k]++ } n=0 }
         /^@@$/{flush(); next} NF{f[++n]=$0} END{flush(); for(k in c) if(c[k]>=3) print c[k], k}' \
  | sort -rn | head -40

# Churn: how often each file changed
git log --no-merges --since="6 months ago" --format= --name-only -- <scope> | sort | uniq -c | sort -rn | head -40

# Special-case leads; read each hit before you tag it
git grep -nE '\.(skip|todo)\(|setTimeout\(|sleep\(|retry|catch \{|eslint-disable|@ts-expect-error|@ts-ignore' -- <scope>
```
