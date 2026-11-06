import { useState } from "react";
import { runCleanup } from "../lib/api";
import { ThemeToggle } from "../components/ThemeToggle";

export function SettingsPage() {
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCleanup() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const r = await runCleanup();
      setMsg(`Cleanup finished: ${r.inboxesDeleted} inboxes, ${r.sessionsDeleted} sessions removed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cleanup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="glass-panel space-y-3 p-5">
        <h2 className="text-lg font-semibold">Appearance</h2>
        <ThemeToggle />
      </section>
      <section className="glass-panel space-y-3 p-5">
        <h2 className="text-lg font-semibold">Maintenance</h2>
        <p className="text-sm text-muted">
          Remove expired inboxes and sessions immediately. A scheduled job also runs every 15 minutes.
        </p>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void onCleanup()}>
          {busy ? "Running…" : "Run cleanup now"}
        </button>
        {msg ? <p className="text-sm text-ink">{msg}</p> : null}
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </section>
      <section className="glass-panel space-y-2 p-5 text-sm text-muted">
        <h2 className="text-lg font-semibold text-ink">API</h2>
        <p>Public inbox API remains available under legacy paths and <code className="text-ink">/api/v1</code>.</p>
        <p>Admin session uses an HttpOnly cookie. State-changing admin calls require the CSRF header.</p>
      </section>
    </div>
  );
}
