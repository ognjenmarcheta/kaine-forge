import { db, sessionsTable, usersTable } from "@repo/db";
import { and, eq, gt } from "drizzle-orm";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { AUTH_DEFINITIONS } from "./auth.definition";
import type { AuthSession, AuthSessionResult, LoginInput, SignupInput } from "./auth.type";

const SCRYPT_PREFIX = "scrypt";
const SCRYPT_KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString("hex");
  return `${SCRYPT_PREFIX}$${salt}$${hash}`;
}

function constantTimeEquals(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [prefix, salt, hash] = storedHash.split("$");

  if (prefix === SCRYPT_PREFIX && salt && hash) {
    return constantTimeEquals(
      scryptSync(password, salt, SCRYPT_KEY_LENGTH),
      Buffer.from(hash, "hex")
    );
  }

  // legacy unsalted sha256 hashes, rehashed on next successful login
  return constantTimeEquals(
    Buffer.from(createHash("sha256").update(password).digest("hex")),
    Buffer.from(storedHash)
  );
}

export function needsPasswordRehash(storedHash: string): boolean {
  return !storedHash.startsWith(`${SCRYPT_PREFIX}$`);
}

export async function updateUserPasswordHash(userId: string, passwordHash: string): Promise<void> {
  await db
    .update(usersTable)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));
}

export async function resolveUserByEmail(email: string) {
  const users = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  return users[0] ?? null;
}

export async function resolveUserById(id: string) {
  const users = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  return users[0] ?? null;
}

export function assertLoginInput(input: LoginInput): void {
  if (!input.email || !input.password) {
    throw new Error("email and password are required");
  }
}

export function assertSignupInput(input: SignupInput): void {
  if (!input.email || !input.password || !input.name) {
    throw new Error("name, email and password are required");
  }
}

export function toAuthSession(params: {
  activeOrganizationId: string;
  expiresAt: Date;
  user: { email: string; id: string; name: string };
}): AuthSession {
  return {
    user: {
      id: params.user.id,
      email: params.user.email,
      name: params.user.name
    },
    expiresAt: params.expiresAt.toISOString(),
    activeOrganizationId: params.activeOrganizationId
  };
}

export async function createSession(params: {
  activeOrganizationId: string;
  user: { email: string; id: string; name: string };
}): Promise<AuthSessionResult> {
  const sessionToken = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + AUTH_DEFINITIONS.SESSION_MAX_AGE_SECONDS * 1000);

  await db.insert(sessionsTable).values({
    userId: params.user.id,
    token: sessionToken,
    expiresAt,
    activeOrganizationId: params.activeOrganizationId
  });

  return {
    sessionToken,
    session: toAuthSession({
      user: params.user,
      activeOrganizationId: params.activeOrganizationId,
      expiresAt
    })
  };
}

export async function sessionFromToken(token: string): Promise<{
  activeOrganizationId: string | null;
  expiresAt: Date;
  userId: string;
} | null> {
  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.token, token), gt(sessionsTable.expiresAt, new Date())))
    .limit(1);

  return sessions[0] ?? null;
}

export async function deleteSession(sessionToken: string | null): Promise<void> {
  if (!sessionToken) {
    return;
  }

  await db.delete(sessionsTable).where(eq(sessionsTable.token, sessionToken));
}

export async function updateSessionActiveOrganization(params: {
  activeOrganizationId: string;
  sessionToken: string;
}): Promise<void> {
  await db
    .update(sessionsTable)
    .set({
      activeOrganizationId: params.activeOrganizationId,
      updatedAt: new Date()
    })
    .where(eq(sessionsTable.token, params.sessionToken));
}
