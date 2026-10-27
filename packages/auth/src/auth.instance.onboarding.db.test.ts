import { usersTable } from "@repo/db";
import type { TestDatabase } from "@repo/db/testing";
import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

// The real auth instance on an in-process Postgres with every migration
// applied, so onboarding completion runs through better-auth's own routes.
vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-1234");
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:4000");
vi.stubEnv("AUTH_PASSWORD_BREACH_CHECK", "false");

const { database } = vi.hoisted(() => ({ database: { current: null as TestDatabase | null } }));

// Only the schema, never the real `@repo/db` index: its client throws without
// DATABASE_URL, which a fresh checkout or worktree does not have.
vi.mock("@repo/db", async () => {
  const schema = await import("@repo/db/schema");
  const { createTestDatabase: create } = await import("@repo/db/testing");
  database.current = await create();
  return { ...schema, db: database.current.db };
});

vi.mock("@repo/jobs/client", () => ({ jobQueue: { enqueue: vi.fn().mockResolvedValue("job-1") } }));

const { createAuthInstance } = await import("./auth.instance");

const auth = createAuthInstance();

function testDatabase(): TestDatabase {
  if (!database.current) {
    throw new Error("test database not created");
  }
  return database.current;
}

function cookieHeaders(headers: Headers): Headers {
  return new Headers({
    cookie: headers
      .getSetCookie()
      .map((entry) => entry.split(";")[0])
      .join("; ")
  });
}

async function signUp(label: string) {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const { headers, response } = await auth.api.signUpEmail({
    body: { email, password: "Secret123!Secret", name: label },
    returnHeaders: true
  });
  return { email, headers: cookieHeaders(headers), userId: response.user.id };
}

// The request cookies after a browser applies the response's Set-Cookie headers.
function applyCookies(headers: Headers, response: Response): Headers {
  const cookies = new Map(
    (headers.get("cookie") ?? "").split("; ").map((entry) => [entry.split("=")[0], entry])
  );
  for (const entry of cookieHeaders(response.headers).get("cookie")?.split("; ") ?? []) {
    cookies.set(entry.split("=")[0], entry);
  }
  return new Headers({ cookie: [...cookies.values()].join("; ") });
}

function postAuth(path: string, headers: Headers, body: Record<string, unknown> = {}) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("content-type", "application/json");
  requestHeaders.set("origin", "http://localhost:4000");
  return auth.handler(
    new Request(`http://localhost:4000/api/auth${path}`, {
      body: JSON.stringify(body),
      headers: requestHeaders,
      method: "POST"
    })
  );
}

async function onboardingCompletedAt(headers: Headers): Promise<unknown> {
  const session = await auth.api.getSession({ headers });
  return session?.user.onboardingCompletedAt;
}

afterAll(async () => {
  await database.current?.close();
});

describe("first-run onboarding", () => {
  it("marks only the session user complete, and the cached session shows it", async () => {
    const user = await signUp("onboarding-user");
    const other = await signUp("onboarding-other");
    expect(await onboardingCompletedAt(user.headers)).toBeNull();

    const response = await postAuth("/onboarding/complete", user.headers);
    expect(response.status).toBe(200);

    // The refreshed session cookie carries the new value, so a cookie-cached
    // session read does not send the user back to onboarding.
    expect(await onboardingCompletedAt(applyCookies(user.headers, response))).toBeInstanceOf(Date);
    const rows = await testDatabase()
      .db.select({ email: usersTable.email, completedAt: usersTable.onboardingCompletedAt })
      .from(usersTable)
      .where(inArray(usersTable.id, [user.userId, other.userId]));
    expect(Object.fromEntries(rows.map((row) => [row.email, row.completedAt !== null]))).toEqual({
      [user.email]: true,
      [other.email]: false
    });
  });

  it("refuses a signed-out request and a client-set completion time", async () => {
    const user = await signUp("onboarding-input");

    expect((await postAuth("/onboarding/complete", new Headers())).status).toBe(401);
    const update = await postAuth("/update-user", user.headers, {
      onboardingCompletedAt: new Date().toISOString()
    });
    expect(update.status).toBe(400);
    expect(await onboardingCompletedAt(user.headers)).toBeNull();
  });
});
