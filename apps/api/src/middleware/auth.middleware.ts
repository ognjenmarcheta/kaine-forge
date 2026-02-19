export function requireUser(ctx: { user: { id: string } | null }): { id: string } {
  if (!ctx.user) {
    throw new Error("authentication required");
  }

  return ctx.user;
}

export function requireActiveOrganizationId(ctx: { activeOrganizationId: string | null }): string {
  if (!ctx.activeOrganizationId) {
    throw new Error("active organization required");
  }

  return ctx.activeOrganizationId;
}
