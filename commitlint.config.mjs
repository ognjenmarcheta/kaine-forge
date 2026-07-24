// Enforces Conventional Commits. The allowed types match the type:* labels in
// .github/workflows/labeler.yml so commit/PR titles keep driving release notes
// and triage labels.
export default {
  extends: ["@commitlint/config-conventional"]
};
