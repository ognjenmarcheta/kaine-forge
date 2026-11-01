import { randomUUID } from "expo-crypto";

// Hermes has no crypto.randomUUID. expo-crypto supplies one from the native
// random source, in a dev build and in Expo Go alike.
const target: { crypto?: Partial<Crypto> } = globalThis;
target.crypto ??= {};
// SAFETY: expo-crypto's randomUUID returns an RFC 4122 version 4 UUID, which
// is exactly the dash-separated shape the Crypto type names.
target.crypto.randomUUID ??= () =>
  randomUUID() as `${string}-${string}-${string}-${string}-${string}`;
