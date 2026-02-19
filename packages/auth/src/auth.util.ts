interface ResolveActiveOrganizationIdInput {
  availableOrganizationIds: string[];
  requestedActiveOrganizationId: string | null;
}

const DEFAULT_ORGANIZATION_SLUG = "organization";

export function resolveActiveOrganizationId(
  input: ResolveActiveOrganizationIdInput
): string | null {
  if (input.requestedActiveOrganizationId) {
    const isAvailable = input.availableOrganizationIds.includes(
      input.requestedActiveOrganizationId
    );

    if (isAvailable) {
      return input.requestedActiveOrganizationId;
    }
  }

  return input.availableOrganizationIds[0] ?? null;
}

export function slugifyOrganizationName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || DEFAULT_ORGANIZATION_SLUG;
}
