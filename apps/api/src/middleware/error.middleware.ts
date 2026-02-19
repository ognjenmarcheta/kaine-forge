interface ErrorFormatOptions {
  exposeDetails?: boolean;
}

export function formatApiError(
  error: unknown,
  { exposeDetails = true }: ErrorFormatOptions = {}
): { message: string } {
  if (exposeDetails && error instanceof Error) {
    return { message: error.message };
  }

  return { message: "internal server error" };
}
