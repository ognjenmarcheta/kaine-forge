export const benchmarkFixtures = {
  "query-key": {
    target: "packages/query/src/query.util.ts",
    workspace: "packages/query",
    tests: ["src/index.test.ts"],
    from: 'return [...queryKey, activeOrganizationId ?? "inactive"];',
    to: 'void activeOrganizationId; return [...queryKey, "inactive"];',
    prompt:
      "Organization switching reuses stale cached data. Find and fix the shared query-key defect. Trace callers. Prove Organization separation, inactive behavior, parameter preservation and input immutability. Keep the repair in the shared helper."
  },
  "notes-deletion": {
    target: "apps/api/src/features/notes/notes.adapter.ts",
    workspace: "apps/api",
    tests: ["src/features/assistant/assistant.eval.fixture.test.ts"],
    from: ".delete(notesTable)\n    .where(and(eq(notesTable.id, id), eq(notesTable.organizationId, scope.organizationId)))",
    to: ".delete(notesTable)\n    .where(eq(notesTable.id, id))",
    prompt:
      "Note deletion can remove another Organization's Note. Trace the real deletion path and repair its shared adapter. Prove owner deletion succeeds and a foreign deletion leaves the entire foreign row unchanged with disposable PGlite data."
  }
} as const;

export function seedBenchmark(source: string, name: keyof typeof benchmarkFixtures): string {
  const fixture = benchmarkFixtures[name];
  const normalized = source.replaceAll("\r\n", "\n");
  if (normalized.split(fixture.from).length !== 2)
    throw new Error(
      `Fixture ${name} no longer matches exactly once; review the fixture before running`
    );
  return normalized.replace(fixture.from, fixture.to);
}
