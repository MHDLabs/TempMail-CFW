import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { deleteInbox, getInboxMessages } from "../lib/api";
import { getInboxToken, removeInboxToken } from "../lib/inboxTokens";

type Message = {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  text: string;
  html: string;
};

export function InboxPage() {
  const { address = "" } = useParams();
  const decoded = decodeURIComponent(address);
  const localPart = decoded.split("@")[0] || decoded;
  const [token, setToken] = useState(() => getInboxToken(decoded) || getInboxToken(localPart) || "");
  const [messages, setMessages] = useState<Message[]>([]);
  const [expires, setExpires] = useState<string | null>(null);
  const [selected, setSelected] = useState<Message | null>(null);
  const [tab, setTab] = useState<"text" | "html">("text");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setError("Access token required for this inbox (enter the token shown at creation).");
      return;
    }
    setError(null);
    try {
      const data = await getInboxMessages(localPart, token);
      setMessages(data.messages);
      setExpires(data.expires_at);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    }
  }, [localPart, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDelete() {
    if (!token) return;
    if (!window.confirm(`Delete inbox ${decoded}? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteInbox(localPart, token);
      removeInboxToken(decoded);
      removeInboxToken(localPart);
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="glass-panel flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <Link to="/" className="text-xs text-muted hover:text-ink">
            ← Inboxes
          </Link>
          <h1 className="text-lg font-semibold">{decoded}</h1>
          {expires ? (
            <p className="text-xs text-muted">Expires {new Date(expires).toLocaleString()}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={() => void load()}>
            Refresh
          </button>
          <button type="button" className="btn-danger" disabled={busy || !token} onClick={() => void onDelete()}>
            Delete inbox
          </button>
        </div>
      </div>

      {!getInboxToken(decoded) && !getInboxToken(localPart) ? (
        <div className="glass-panel space-y-2 p-4">
          <label className="label" htmlFor="token">
            Inbox access token
          </label>
          <input
            id="token"
            className="field"
            value={token}
            onChange={(e) => setToken(e.target.value.trim())}
            placeholder="Paste token from creation response"
          />
          <button type="button" className="btn-primary" onClick={() => void load()}>
            Load messages
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass-panel overflow-hidden">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Messages</h2>
          {messages.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted">No messages yet.</p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-border overflow-auto">
              {messages.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`w-full px-4 py-3 text-left hover:bg-surface-2/50 ${
                      selected?.id === m.id ? "bg-surface-2/70" : ""
                    }`}
                    onClick={() => {
                      setSelected(m);
                      setTab(m.html ? "html" : "text");
                    }}
                  >
                    <div className="truncate text-sm font-medium">{m.subject || "(no subject)"}</div>
                    <div className="truncate text-xs text-muted">{m.from}</div>
                    <div className="text-xs text-muted">{new Date(m.date).toLocaleString()}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="glass-panel flex min-h-[20rem] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Preview</h2>
            {selected ? (
              <div className="flex gap-1 text-xs">
                <button
                  type="button"
                  className={`rounded-lg px-2 py-1 ${tab === "text" ? "bg-accent text-white" : "text-muted"}`}
                  onClick={() => setTab("text")}
                >
                  Text
                </button>
                <button
                  type="button"
                  className={`rounded-lg px-2 py-1 ${tab === "html" ? "bg-accent text-white" : "text-muted"}`}
                  onClick={() => setTab("html")}
                  disabled={!selected.html}
                >
                  HTML
                </button>
              </div>
            ) : null}
          </div>
          {!selected ? (
            <p className="p-4 text-sm text-muted">Select a message to preview.</p>
          ) : tab === "text" ? (
            <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 text-sm">{selected.text || "—"}</pre>
          ) : (
            <iframe
              title="Email HTML preview"
              className="min-h-[20rem] flex-1 bg-white"
              sandbox=""
              srcDoc={selected.html || "<p></p>"}
            />
          )}
        </section>
      </div>
    </div>
  );
}
