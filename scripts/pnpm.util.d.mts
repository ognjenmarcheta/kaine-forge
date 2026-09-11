export function pnpmInvocation(
  args: readonly string[],
  executable?: string,
  platform?: string
): { command: string; args: string[] };
