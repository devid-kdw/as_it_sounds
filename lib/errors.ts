export class AISUserSafeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AISUserSafeError";
  }
}

export function toUserSafeMessage(error: unknown) {
  if (error instanceof AISUserSafeError) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}
