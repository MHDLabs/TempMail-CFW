const NAME_RE = /^[a-zA-Z0-9_-]+$/;

export function isValidLocalPart(name: string, maxLength = 32): boolean {
  if (!name || typeof name !== "string") return false;
  if (name.length < 3 || name.length > maxLength) return false;
  return NAME_RE.test(name);
}
