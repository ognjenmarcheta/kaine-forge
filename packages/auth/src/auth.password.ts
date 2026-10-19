import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_PREFIX = "scrypt";
const SCRYPT_KEY_LENGTH = 64;
// Cost parameters are embedded in each stored hash (scrypt$N$r$p$salt$hash) so
// they can be raised later; needsPasswordRehash flags old-cost hashes and login
// transparently rehashes them. Raising N requires maxmem >= 128 * N * r bytes.
// Keep the recipe in sync with hashSeedPassword in packages/db/src/seed/users.seed.ts.
// Bumping these parameters also requires regenerating DUMMY_PASSWORD_HASH below
// so unknown-email logins keep costing the same as real ones.
// N=2^14, r=8, p=5 is the 16 MiB variant of the OWASP Password Storage Cheat Sheet
// minimum, equal in strength to N=2^17, r=8, p=1 at 128 MiB. It keeps memory per
// concurrent login low on small API containers (ADR 0005).
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 5;
// Upper bounds for cost parameters read from stored hashes, so a corrupted or
// hostile stored hash cannot make verification attempt an enormous allocation.
const SCRYPT_MAX_COST = 2 ** 20;
const SCRYPT_MAX_BLOCK_SIZE = 32;
const SCRYPT_MAX_PARALLELIZATION = 16;

// Real scrypt hash of a throwaway password, generated offline with the current
// recipe (scrypt$N$r$p$salt$hash, matching hashPassword). Login verifies the
// submitted password against this hash when the email is unknown so the
// unknown-email path costs the same scrypt work as the known-email path and
// response timing does not reveal whether an account exists. A static constant
// (not computed at import time) keeps startup cheap and deterministic.
export const DUMMY_PASSWORD_HASH =
  "scrypt$16384$8$5$67ddc6e1b17cd0ba3498bfa60e76d167$ae3c484b8f417194b064a2169a3e77851b9c4859ad0b2316d77cfd2378f1785aaeab066310f46cf8fef24df567980c5c792798d235ca0af9ac3cb49f53a5d46b";

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

  // Legacy unsalted sha256 hashes from before the 2026-07-04 migration, rehashed
  // on next successful login. Removal and its trigger are tracked in issue #499.
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
