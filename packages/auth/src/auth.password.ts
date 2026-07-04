import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_PREFIX = "scrypt";
const SCRYPT_KEY_LENGTH = 64;
// Cost parameters are embedded in each stored hash (scrypt$N$r$p$salt$hash) so
// they can be raised later; needsPasswordRehash flags old-cost hashes and login
// transparently rehashes them. Raising N requires maxmem >= 128 * N * r bytes.
// Keep the recipe in sync with hashSeedPassword in packages/db/src/seed/users.seed.ts.
// Bumping these parameters also requires regenerating DUMMY_PASSWORD_HASH below
// so unknown-email logins keep costing the same as real ones.
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
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
  "scrypt$16384$8$1$0215aa0f0ed4305abf7ccc34d7945f64$586bdfb09cd3afc6aaf63b6696fef76b97466baa67323164eeb3b3ed33f0ad9e5aa0c816d8f5c880d2f6517cd1cb1bdc9e6546aaa336e2ed813e8acd96298b89";

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
