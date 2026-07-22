import { test } from "@playwright/test";

/**
 * Gaps documented intentionally (template CI constraints):
 *
 * - Invitation accept needs a real email delivery path or a seeded invitation
 *   row + matching signed-in user. Soft console email only logs tokens; there
 *   is no members invite UI in the template shell. Recipient binding is covered
 *   by packages/auth invitation security unit tests.
 *
 * - Todo attachment upload requires S3/MinIO in CI (e2e job only provides
 *   Postgres). Upload confirm lifecycle is covered by API storage unit tests.
 */
test.describe("invitation and attachment (documented gaps)", () => {
  test.skip(
    true,
    "Invitation happy path needs email adapter + invite UI; see packages/auth invitation-security tests"
  );

  test.skip(true, "Attachment upload requires MinIO in CI; see apps/api storage.lifecycle tests");
});
