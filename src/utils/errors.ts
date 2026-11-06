export type ErrorCode =
  | "INVALID_NAME"
  | "NAME_TAKEN"
  | "INBOX_NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_REQUEST"
  | "TOO_MANY_ATTEMPTS"
  | "PAYLOAD_TOO_LARGE"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR"
  | "CONFLICT";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly expose: boolean;

  constructor(code: ErrorCode, message: string, status: number, expose = true) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.expose = expose;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export const Errors = {
  invalidName: (msg = "Invalid inbox name") => new AppError("INVALID_NAME", msg, 400),
  nameTaken: (msg = "Name is already taken") => new AppError("NAME_TAKEN", msg, 409),
  inboxNotFound: (msg = "Inbox not found") => new AppError("INBOX_NOT_FOUND", msg, 404),
  unauthorized: (msg = "Unauthorized") => new AppError("UNAUTHORIZED", msg, 401),
  forbidden: (msg = "Forbidden") => new AppError("FORBIDDEN", msg, 403),
  notFound: (msg = "Not found") => new AppError("NOT_FOUND", msg, 404),
  invalidRequest: (msg = "Invalid request") => new AppError("INVALID_REQUEST", msg, 400),
  tooManyAttempts: (msg = "Too many attempts") => new AppError("TOO_MANY_ATTEMPTS", msg, 429),
  payloadTooLarge: (msg = "Payload too large") => new AppError("PAYLOAD_TOO_LARGE", msg, 413),
  serviceUnavailable: (msg = "Service unavailable") =>
    new AppError("SERVICE_UNAVAILABLE", msg, 503),
  internal: (msg = "Internal error") => new AppError("INTERNAL_ERROR", msg, 500, false),
  conflict: (msg = "Conflict") => new AppError("CONFLICT", msg, 409),
};
