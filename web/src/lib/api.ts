export type ApiError = {
  success: false;
  error: { code: string; message: string };
  request_id?: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T | ApiError;
  if (!res.ok) {
    const err = data as ApiError;
    throw new Error(err.error?.message || `Request failed (${res.status})`);
  }
  return data as T;
}

const csrfHeaders = { "X-Requested-With": "TempMail-CFW" };

export async function login(password: string) {
  return parseJson<{ success: true; expires_at: string }>(
    await fetch("/api/v1/admin/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...csrfHeaders },
      body: JSON.stringify({ password }),
    }),
  );
}

export async function logout() {
  return parseJson<{ success: true }>(
    await fetch("/api/v1/admin/logout", {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders,
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

export async function createInbox(name?: string) {
  return parseJson<{
    success: true;
    id: string;
    email: string;
    token: string;
    expires_at: string;
  }>(
    await fetch("/api/v1/inboxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(name ? { name } : {}),
    }),
  );
}

export async function getInboxMessages(idOrName: string, token: string) {
  return parseJson<{
    success: true;
    inbox_id?: string;
    email: string;
    messages: Array<{
      id: string;
      from: string;
      to: string;
      subject: string;
      date: string;
      text: string;
      html: string;
    }>;
    expires_at: string;
  }>(
    await fetch(`/api/v1/inboxes/${encodeURIComponent(idOrName)}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
}

export async function deleteInbox(idOrName: string, token: string) {
  return parseJson<{ success: true; deleted: boolean }>(
    await fetch(`/api/v1/inboxes/${encodeURIComponent(idOrName)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
}

export async function runCleanup() {
  return parseJson<{ success: true; inboxesDeleted: number; sessionsDeleted: number }>(
    await fetch("/api/v1/admin/cleanup", {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders,
    }),
  );
}
