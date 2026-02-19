import { pool } from "../client";
import { ensureOwnerMembership, ensurePersonalOrganization } from "./organizations.seed";
import { getSeedUser } from "./users.seed";
import { seedUsers } from "./users.seed";

async function run(): Promise<void> {
  await seedUsers();
  const user = await getSeedUser();
  const organization = await ensurePersonalOrganization(user.id);
  await ensureOwnerMembership({ organizationId: organization.id, userId: user.id });
  await pool.end();
}

run().catch(async (error) => {
  console.error("db seed failed", error);
  await pool.end();
  process.exitCode = 1;
});
