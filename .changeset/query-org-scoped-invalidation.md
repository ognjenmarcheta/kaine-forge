---
"@repo/query": major
---

The Query Runtime is now the only path that invalidates org-scoped queries: `queryRuntime.invalidateOrgScopedQueries(queryClient)` invalidates the organization members scope and every registered operation key. Breaking: `OrgScopedQueryRegistry.invalidateOrgScopedQueries` and `QueryRuntime.getOrgScopedQueryKeys` are removed; no code in this repository called them.
