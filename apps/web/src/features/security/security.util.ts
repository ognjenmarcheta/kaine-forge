/** Reads the base32 secret from an otpauth:// URI so users can type it in manually. */
export function getTotpSetupKey(totpUri: string): string | null {
  try {
    return new URL(totpUri).searchParams.get("secret");
  } catch {
    return null;
  }
}
