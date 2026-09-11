import { URL } from "node:url";

/**
 * @param {{ ALLOW_LOCAL_DB_PUSH?: string, NODE_ENV?: string, DATABASE_URL?: string }} env
 * @returns {string}
 */
export function validateLocalDatabase(env) {
  if (env.ALLOW_LOCAL_DB_PUSH !== "true") {
    throw new Error(
      "Set ALLOW_LOCAL_DB_PUSH=true in your local environment to enable local schema push."
    );
  }
  if (env.NODE_ENV?.trim().toLowerCase() === "production") {
    throw new Error("Local database commands cannot run in production mode.");
  }
  let url;
  let database;
  try {
    if (!env.DATABASE_URL || /\s/.test(env.DATABASE_URL)) throw new Error();
    url = new URL(env.DATABASE_URL);
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error("DATABASE_URL must be a valid local PostgreSQL URL.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase()) ||
    env.DATABASE_URL.includes("?") ||
    env.DATABASE_URL.includes("#") ||
    (url.port && (!/^\d+$/.test(url.port) || Number(url.port) < 1 || Number(url.port) > 65535)) ||
    !database ||
    /[\s/\\\0]/.test(database) ||
    ["postgres", "template0", "template1"].includes(database.toLowerCase())
  ) {
    throw new Error(
      "Local schema push requires a named, non-system PostgreSQL database on localhost, 127.0.0.1, or ::1, without URL query overrides."
    );
  }
  return env.DATABASE_URL;
}

/**
 * Validate before even creating a database or rewriting seed credentials.
 * @param {string[]} args
 * @param {{ ALLOW_LOCAL_DB_PUSH?: string, NODE_ENV?: string, DATABASE_URL?: string }} env
 * @param {(script: string, databaseUrl: string) => void} run
 */
export function runLocalDatabase(args, env, run) {
  if (args.length !== 1 || !["push", "prepare"].includes(args[0])) {
    throw new Error("Use pnpm db:push:local or pnpm db:prepare:local without extra arguments.");
  }
  const databaseUrl = validateLocalDatabase(env);
  const scripts = args[0] === "prepare" ? ["db:ensure", "db:push", "db:seed"] : ["db:push"];
  for (const script of scripts) run(script, databaseUrl);
}
