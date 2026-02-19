import { createServerAuth } from "@repo/auth";
import { db, usersTable } from "@repo/db";
import { t } from "@repo/translation";
import { and, eq } from "drizzle-orm";

export interface ApiContextUser {
  id: string;
  email: string;
  name: string;
}

export interface ApiContext {
  db: typeof db;
  t: typeof t;
  user: ApiContextUser | null;
}

async function resolveUserByEmail(email: string): Promise<ApiContextUser | null> {
  const users = await db
    .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(and(eq(usersTable.email, email)))
    .limit(1);

  return users[0] ?? null;
}

export async function createContext(request: Request): Promise<ApiContext> {
  const auth = createServerAuth();
  const session = await auth.getSessionFromHeaders(request.headers);
  const seededUser = await resolveUserByEmail("test@test.test");
  const sessionUser = session?.user ?? null;

  const userFromSessionEmail = sessionUser?.email
    ? await resolveUserByEmail(sessionUser.email)
    : null;

  const user = userFromSessionEmail ??
    sessionUser ??
    seededUser ?? {
      id: "dev-user",
      email: "test@test.test",
      name: "Test User"
    };

  return {
    db,
    t,
    user
  };
}
