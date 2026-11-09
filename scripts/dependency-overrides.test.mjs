import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parse, parseDocument } from "yaml";

// The pnpm overrides in pnpm-workspace.yaml hold the floors that keep
// vulnerable transitive versions out. `pnpm install --frozen-lockfile` checks
// only that the lockfile was written with the same override map. It does not
// check that a parent-scoped (`parent>pkg`) or major-scoped (`pkg@N`) override
// reached every copy: a dependent outside the selector keeps its own version.
// These tests read the resolutions themselves.

const workspace = parseDocument(readFileSync("pnpm-workspace.yaml", "utf8"));
const lockfile = parse(readFileSync("pnpm-lock.yaml", "utf8"));
const overrides = workspace.get("overrides", true);

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const RANGE = /^([\^~]?)(\d+)(?:\.(\d+)\.(\d+))?$/;

const parseVersion = (text) => {
  const match = VERSION.exec(text);
  return match ? match.slice(1).map(Number) : undefined;
};

const compare = (left, right) => {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
};

// Only the range forms the override map uses: `^x.y.z`, `~x.y.z`, `x.y.z`,
// and a bare major (`5`) in a `pkg@5` selector. Any other form fails the test
// instead of being read wrongly.
const rangeBounds = (range) => {
  const match = RANGE.exec(range);
  assert.ok(match, `unsupported range "${range}"; extend rangeBounds before using it`);
  const [, operator, majorText, minorText, patchText] = match;
  const major = Number(majorText);
  if (minorText === undefined) {
    assert.equal(operator, "", `unsupported range "${range}"`);
    return { lower: [major, 0, 0], upper: [major + 1, 0, 0] };
  }
  const lower = [major, Number(minorText), Number(patchText)];
  if (operator === "") return { lower, upper: [lower[0], lower[1], lower[2] + 1] };
  if (operator === "~") return { lower, upper: [lower[0], lower[1] + 1, 0] };
  if (lower[0] > 0) return { lower, upper: [lower[0] + 1, 0, 0] };
  if (lower[1] > 0) return { lower, upper: [0, lower[1] + 1, 0] };
  return { lower, upper: [0, 0, lower[2] + 1] };
};

const satisfies = (version, range) => {
  const parsed = parseVersion(version);
  assert.ok(parsed, `pnpm-lock.yaml version "${version}" is not plain x.y.z`);
  const { lower, upper } = rangeBounds(range);
  return compare(parsed, lower) >= 0 && compare(parsed, upper) < 0;
};

// `name@range` or `@scope/name@range`; the range is optional.
const splitSpec = (spec) => {
  const at = spec.lastIndexOf("@");
  return at > 0 ? { name: spec.slice(0, at), range: spec.slice(at + 1) } : { name: spec };
};

// Lockfile keys and dependency values carry peer suffixes: `pkg@1.2.3(react@19)`.
const stripPeers = (text) => text.replace(/\(.*$/, "");

const lockedVersions = new Map();
for (const key of Object.keys(lockfile.packages ?? {})) {
  const { name, range: version } = splitSpec(stripPeers(key));
  const versions = lockedVersions.get(name) ?? new Set();
  versions.add(version);
  lockedVersions.set(name, versions);
}

const snapshots = Object.entries(lockfile.snapshots ?? {}).map(([key, snapshot]) => ({
  ...splitSpec(stripPeers(key)),
  dependencies: { ...snapshot?.dependencies, ...snapshot?.optionalDependencies }
}));

// Every resolved version the override governs. A `parent>pkg` override governs
// the pkg that each matching parent snapshot depends on; a `pkg` or `pkg@N`
// override governs every locked pkg version that the selector matches.
const governedVersions = (selector) => {
  const parts = selector.split(">");
  assert.ok(parts.length <= 2, `unsupported override selector "${selector}"`);
  const target = splitSpec(parts.at(-1));
  if (parts.length === 1) {
    return [...(lockedVersions.get(target.name) ?? [])].filter(
      (version) => target.range === undefined || satisfies(version, target.range)
    );
  }
  const parent = splitSpec(parts[0]);
  return snapshots
    .filter(
      (snapshot) =>
        snapshot.name === parent.name &&
        (parent.range === undefined || satisfies(snapshot.range, parent.range)) &&
        snapshot.dependencies[target.name] !== undefined
    )
    .map((snapshot) => splitSpec(stripPeers(snapshot.dependencies[target.name])))
    .map((dependency) => dependency.range ?? dependency.name);
};

test("reads a non-empty override map from pnpm-workspace.yaml", () => {
  assert.ok(overrides?.items?.length > 0, "pnpm-workspace.yaml has no overrides map");
});

test("every resolution an override governs is inside the override range", () => {
  const problems = [];
  for (const pair of overrides.items) {
    const selector = String(pair.key.value);
    const range = String(pair.value.value);
    const versions = governedVersions(selector);
    const name = splitSpec(selector.split(">").at(-1)).name;
    // A `pkg@N` override that worked leaves no version inside N, so its proof of
    // use is a locked pkg inside the override range.
    const present = selector.includes(">") ? versions : [...(lockedVersions.get(name) ?? [])];
    if (!present.some((version) => satisfies(version, range))) {
      problems.push(
        `"${selector}": "${range}" applies to nothing in pnpm-lock.yaml (no ${name} inside the ` +
          `range). Fix the selector, or remove the override when nothing needs it.`
      );
    }
    for (const version of versions) {
      if (!satisfies(version, range)) {
        problems.push(
          `"${selector}": "${range}" did not reach ${name}@${version} in pnpm-lock.yaml. ` +
            `Widen the selector, or move the dependent that requests ${name}@${version}.`
        );
      }
    }
  }
  assert.deepEqual(problems, []);
});

test("every override states its reason in a comment", () => {
  // The map's leading comment belongs to its first entry.
  const missing = overrides.items
    .filter((pair, index) => {
      const before = pair.key.commentBefore ?? (index === 0 ? overrides.commentBefore : undefined);
      return !before?.trim() && !pair.value.comment?.trim();
    })
    .map((pair) => String(pair.key.value));
  assert.deepEqual(
    missing,
    [],
    "add an inline comment or a comment line directly above each override: the advisory " +
      "(GHSA id) or the compatibility reason, and when to remove it"
  );
});
