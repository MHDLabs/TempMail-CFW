/** Intentionally empty — panel does not persist inbox bearer tokens. */
export function saveInboxToken(_addressOrId: string, _token: string): void {
  /* no-op: tokens are shown once and not stored */
}

export function getInboxToken(_addressOrId: string): string | null {
  return null;
}

export function removeInboxToken(_addressOrId: string): void {
  /* no-op */
}
