export type ApiError = {
  success: false;
  error: { code: string; message: string };
};

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T | ApiError;
  if (!res.ok) {
    const err = data as ApiError;
    throw new Error(err.error?.message || `Request failed (${res.status})`);
  }
  return data as T;
}

const csrf = { "X-Requested-With": "TempMail-CFW" };

export type Message = {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  text: string;
  html: string;
  otp?: { code: string; kind: string; source?: string } | null;
};

export async function login(password: string) {
  return parseJson<{ success: true; expires_at: string }>(
    await fetch("/api/v1/admin/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...csrf },
      body: JSON.stringify({ password }),
    }),
  );
}

export async function logout() {
  return parseJson<{ success: true }>(
    await fetch("/api/v1/admin/logout", {
      method: "POST",
      credentials: "include",
      headers: csrf,
    }),
  );
}

export async function getSession() {
  const res = await fetch("/api/v1/admin/session", { credentials: "include" });
  if (res.status === 401) return null;
  return parseJson<{ success: true; authenticated: boolean; expires_at: string }>(res);
}

export async function listAdminInboxes() {
  return parseJson<{
    success: true;
    inboxes: Array<{
      id: string;
      address: string;
      created_at: string;
      expires_at: string;
      message_count: number;
    }>;
  }>(await fetch("/api/v1/admin/inboxes", { credentials: "include" }));
}

export async function createInbox(name?: string, domain?: string) {
  const body: Record<string, string> = {};
  if (name) body.name = name;
  if (domain) body.domain = domain;
  return parseJson<{
    success: true;
    id: string;
    email: string;
    expires_at: string;
  }>(
    await fetch("/api/v1/inboxes", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...csrf },
      body: JSON.stringify(body),
    }),
  );
}

export async function getInboxMessages(idOrName: string) {
  return parseJson<{
    success: true;
    inbox_id: string;
    email: string;
    messages: Message[];
    expires_at: string;
    next_cursor: string | null;
  }>(
    await fetch(`/api/v1/inboxes/${encodeURIComponent(idOrName)}/messages`, {
      credentials: "include",
    }),
  );
}

export async function deleteInbox(idOrName: string) {
  return parseJson<{ success: true; deleted: boolean }>(
    await fetch(`/api/v1/inboxes/${encodeURIComponent(idOrName)}`, {
      method: "DELETE",
      credentials: "include",
      headers: csrf,
    }),
  );
}

export async function runCleanup() {
  return parseJson<{ success: true; inboxesDeleted: number; sessionsDeleted: number }>(
    await fetch("/api/v1/admin/cleanup", {
      method: "POST",
      credentials: "include",
      headers: csrf,
    }),
  );
}

export async function aiSummarize(text: string) {
  return parseJson<{ success: true; summary: string }>(
    await fetch("/api/v1/admin/ai/summary", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...csrf },
      body: JSON.stringify({ text: text.slice(0, 4000) }),
    }),
  );
}
