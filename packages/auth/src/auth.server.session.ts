import { db, sessionsTable, usersTable } from "@repo/db";
import { and, eq, gt } from "drizzle-orm";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

import { AUTH_DEFINITIONS } from "./auth.definition";
import type { AuthSession, AuthSessionResult, LoginInput, SignupInput } from "./auth.type";

const SCRYPT_PREFIX = "scrypt";
const SCRYPT_KEY_LENGTH = 64;
// Cost parameters are embedded in each stored hash (scrypt$N$r$p$salt$hash) so
// they can be raised later; needsPasswordRehash flags old-cost hashes and login
// transparently rehashes them. Raising N requires maxmem >= 128 * N * r bytes.
// Keep the recipe in sync with hashSeedPassword in packages/db/src/seed/users.seed.ts.
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
// Upper bounds for cost parameters read from stored hashes, so a corrupted or
// hostile stored hash cannot make verification attempt an enormous allocation.
const SCRYPT_MAX_COST = 2 ** 20;
const SCRYPT_MAX_BLOCK_SIZE = 32;
const SCRYPT_MAX_PARALLELIZATION = 16;

interface ScryptCost {
  N: number;
  r: number;
  p: number;
}

function deriveScryptKey(password: string, salt: string, cost: ScryptCost): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      { N: cost.N, r: cost.r, p: cost.p, maxmem: 256 * cost.N * cost.r },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      }
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (
    await deriveScryptKey(password, salt, {
      N: SCRYPT_COST,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELIZATION
    })
  ).toString("hex");
  return `${SCRYPT_PREFIX}$${String(SCRYPT_COST)}$${String(SCRYPT_BLOCK_SIZE)}$${String(SCRYPT_PARALLELIZATION)}$${salt}$${hash}`;
}

function constantTimeEquals(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split("$");

  if (parts[0] === SCRYPT_PREFIX && parts.length === 6) {
    const [, rawN, rawR, rawP, salt, hash] = parts;
    const N = Number(rawN);
    const r = Number(rawR);
    const p = Number(rawP);

    if (
      !Number.isInteger(N) ||
      N <= 0 ||
      N > SCRYPT_MAX_COST ||
      !Number.isInteger(r) ||
      r <= 0 ||
      r > SCRYPT_MAX_BLOCK_SIZE ||
      !Number.isInteger(p) ||
      p <= 0 ||
      p > SCRYPT_MAX_PARALLELIZATION ||
      !salt ||
      !hash
    ) {
      return false;
    }

    try {
      const derived = await deriveScryptKey(password, salt, { N, r, p });
      return constantTimeEquals(derived, Buffer.from(hash, "hex"));
    } catch {
      return false;
    }
  }

  // legacy unsalted sha256 hashes, rehashed on next successful login
  return constantTimeEquals(
    Buffer.from(createHash("sha256").update(password).digest("hex")),
    Buffer.from(storedHash)
  );
}

export function needsPasswordRehash(storedHash: string): boolean {
  const parts = storedHash.split("$");
  return !(
    parts[0] === SCRYPT_PREFIX &&
    parts.length === 6 &&
    Number(parts[1]) === SCRYPT_COST &&
    Number(parts[2]) === SCRYPT_BLOCK_SIZE &&
    Number(parts[3]) === SCRYPT_PARALLELIZATION
  );
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
