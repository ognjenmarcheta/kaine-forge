import { pool } from "../client";
import { seedUsers } from "./users.seed";

async function run(): Promise<void> {
  await seedUsers();
  await pool.end();
}

run().catch(async (error) => {
  console.error("db seed failed", error);
  await pool.end();
  process.exitCode = 1;
});
