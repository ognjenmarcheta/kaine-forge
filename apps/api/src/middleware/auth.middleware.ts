export function requireUser(ctx: { user: { id: string } | null }): { id: string } {
  if (!ctx.user) {
    throw new Error("authentication required");
  }

  return ctx.user;
}
