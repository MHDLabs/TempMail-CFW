import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createInbox, listAdminInboxes } from "../lib/api";
import { saveInboxToken } from "../lib/inboxTokens";

type InboxRow = {
  id: string;
  address: string;
  created_at: string;
  expires_at: string;
  message_count: number;
};

export function DashboardPage() {
  const [inboxes, setInboxes] = useState<InboxRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [customName, setCustomName] = useState("");
  const [domain, setDomain] = useState("");
  const [lastToken, setLastToken] = useState<{ email: string; token: string } | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const data = await listAdminInboxes();
      setInboxes(data.inboxes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inboxes");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const name = customName.trim() || undefined;
      const created = await createInbox(name, domain || undefined);
      setLastToken({ email: created.email, token: created.token });
      setCustomName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="glass-panel p-5">
        <h2 className="text-lg font-semibold">Create inbox</h2>
        <p className="mt-1 text-sm text-muted">
          Optional custom local-part. Leave empty for a random address.
        </p>
        <form onSubmit={onCreate} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            className="field sm:max-w-xs"
            placeholder="custom-name"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            pattern="[A-Za-z0-9_-]{3,32}"
            title="3–32 chars: letters, numbers, _ or -"
          />
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Creating…" : "Create"}
          </button>
        </form>
        {lastToken ? (
          <div className="mt-4 rounded-xl border border-border bg-surface-2/70 p-3 text-sm">
            <p className="font-medium">{lastToken.email}</p>
            <p className="mt-1 text-muted">
              Access token (shown once):{" "}
              <code className="break-all text-ink">{lastToken.token}</code>
            </p>
            <button
              type="button"
              className="btn-ghost mt-2"
              onClick={() => void navigator.clipboard.writeText(lastToken.token)}
            >
              Copy token
            </button>
          </div>
        ) : null}
      </section>

      <section className="glass-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-lg font-semibold">Active inboxes</h2>
          <button type="button" className="btn-ghost" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
        {error ? (
          <p className="px-5 py-4 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {inboxes.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted">No inboxes yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {inboxes.map((box) => (
              <li key={box.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div>
                  <Link
                    className="font-medium text-accent hover:underline"
                    to={`/inbox/${encodeURIComponent(box.address)}`}
                  >
                    {box.address}
                  </Link>
                  <p className="text-xs text-muted">
                    {box.message_count} messages · expires {new Date(box.expires_at).toLocaleString()}
                  </p>
                </div>
                <Link className="btn-ghost text-xs" to={`/inbox/${encodeURIComponent(box.address)}`}>
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
