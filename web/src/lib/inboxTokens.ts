const KEY = "tm-inbox-tokens";

type MapJson = Record<string, string>;

function read(): MapJson {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as MapJson;
  } catch {
    return {};
  }
}

export function saveInboxToken(addressOrId: string, token: string) {
  const m = read();
  m[addressOrId] = token;
  localStorage.setItem(KEY, JSON.stringify(m));
}

export function getInboxToken(addressOrId: string): string | null {
  return read()[addressOrId] ?? null;
}

export function removeInboxToken(addressOrId: string) {
  const m = read();
  delete m[addressOrId];
  localStorage.setItem(KEY, JSON.stringify(m));
}
