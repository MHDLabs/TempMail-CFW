type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, string | number | boolean | null | undefined>;

/**
 * Structured logging without secrets or email bodies.
 * Keep fields small and operational.
 */
export function log(level: LogLevel, message: string, fields: LogFields = {}): void {
  const entry = {
    level,
    message,
    ts: new Date().toISOString(),
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}
