import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createInbox,
  deleteInbox,
  getInboxMessages,
  listAdminInboxes,
  logout,
  type Message,
  aiSummarize,
} from "../lib/api";
import { ThemeToggle } from "../components/ThemeToggle";

type InboxRow = {
  id: string;
  address: string;
  created_at: string;
  expires_at: string;
  message_count: number;
};

export function MailApp() {
  const { address: routeAddress } = useParams();
  const navigate = useNavigate();
  const [inboxes, setInboxes] = useState<InboxRow[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<Message | null>(null);
  const [activeEmail, setActiveEmail] = useState<string | null>(null);
  const [expires, setExpires] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [customName, setCustomName] = useState("");
  const [tab, setTab] = useState<"text" | "html">("text");
  const [summary, setSummary] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const refreshInboxes = useCallback(async () => {
    try {
      const data = await listAdminInboxes();
      setInboxes(data.inboxes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inboxes");
    }
  }, []);

  const openInbox = useCallback(async (email: string) => {
    setError(null);
    setSelected(null);
    setSummary(null);
    setActiveEmail(email);
    const local = email.split("@")[0] || email;
    try {
      const data = await getInboxMessages(local);
      setMessages(data.messages);
      setExpires(data.expires_at);
      setActiveEmail(data.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    void refreshInboxes();
  }, [refreshInboxes]);

  useEffect(() => {
    if (routeAddress) {
      void openInbox(decodeURIComponent(routeAddress));
    }
  }, [routeAddress, openInbox]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await createInbox(customName.trim() || undefined);
      setCustomName("");
      await refreshInboxes();
      navigate(`/mail/${encodeURIComponent(created.email)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteInbox() {
    if (!activeEmail) return;
    if (!window.confirm(`Delete ${activeEmail}?`)) return;
    setBusy(true);
    try {
      const local = activeEmail.split("@")[0] || activeEmail;
      await deleteInbox(local);
      setActiveEmail(null);
      setMessages([]);
      setSelected(null);
      await refreshInboxes();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSummarize() {
    if (!selected) return;
    setSummary("…");
    try {
      const r = await aiSummarize(selected.text || selected.subject);
      setSummary(r.summary);
    } catch (err) {
      setSummary(err instanceof Error ? err.message : "AI unavailable");
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter(
      (m) =>
        m.subject.toLowerCase().includes(q) ||
        m.from.toLowerCase().includes(q) ||
        m.text.toLowerCase().includes(q) ||
        (m.otp?.code ?? "").includes(q),
    );
  }, [messages, search]);

  async function onLogout() {
    try {
      await logout();
    } catch {
      /* ignore */
    }
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex h-[100dvh] flex-col">
      <header className="glass-panel z-10 mx-2 mt-2 flex flex-wrap items-center gap-3 px-4 py-2 sm:mx-3">
        <div className="text-base font-semibold tracking-tight">TempMail</div>
        <form onSubmit={onCreate} className="flex flex-1 flex-wrap items-center gap-2">
          <input
            className="field max-w-xs"
            placeholder="New inbox name (optional)"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "…" : "Compose inbox"}
          </button>
        </form>
        <ThemeToggle />
        <button type="button" className="btn-ghost" onClick={() => void onLogout()}>
          Log out
        </button>
      </header>

      {error ? (
        <p className="mx-3 mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mx-2 mb-2 mt-2 flex min-h-0 flex-1 gap-2 sm:mx-3">
        {/* Sidebar — inboxes */}
        <aside className="glass-panel hidden w-64 shrink-0 flex-col overflow-hidden md:flex">
          <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted">
            Inboxes
          </div>
          <ul className="flex-1 overflow-auto">
            {inboxes.map((box) => (
              <li key={box.id}>
                <button
                  type="button"
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-surface-2/50 ${
                    activeEmail === box.address ? "bg-accent/15 font-medium" : ""
                  }`}
                  onClick={() => navigate(`/mail/${encodeURIComponent(box.address)}`)}
                >
                  <div className="truncate">{box.address}</div>
                  <div className="text-xs text-muted">{box.message_count} messages</div>
                </button>
              </li>
            ))}
            {inboxes.length === 0 ? (
              <li className="px-3 py-6 text-sm text-muted">No inboxes yet</li>
            ) : null}
          </ul>
        </aside>

        {/* Message list */}
        <section className="glass-panel flex w-full flex-col overflow-hidden md:w-80 md:shrink-0 lg:w-96">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{activeEmail || "Select an inbox"}</div>
              {expires ? (
                <div className="text-xs text-muted">Expires {new Date(expires).toLocaleString()}</div>
              ) : null}
            </div>
            {activeEmail ? (
              <>
                <button type="button" className="btn-ghost text-xs" onClick={() => void openInbox(activeEmail)}>
                  Refresh
                </button>
                <button type="button" className="btn-danger text-xs" disabled={busy} onClick={() => void onDeleteInbox()}>
                  Delete
                </button>
              </>
            ) : null}
          </div>
          <div className="border-b border-border px-3 py-2">
            <input
              className="field"
              placeholder="Search mail"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={!activeEmail}
            />
          </div>
          <ul className="flex-1 overflow-auto">
            {!activeEmail ? (
              <li className="px-4 py-10 text-center text-sm text-muted">
                Create or select an inbox to read mail.
              </li>
            ) : filtered.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-muted">No messages</li>
            ) : (
              filtered.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`w-full border-b border-border/50 px-3 py-2.5 text-left hover:bg-surface-2/40 ${
                      selected?.id === m.id ? "bg-accent/10" : ""
                    }`}
                    onClick={() => {
                      setSelected(m);
                      setTab(m.html ? "html" : "text");
                      setSummary(null);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{m.from || "(unknown)"}</span>
                      <span className="shrink-0 text-[10px] text-muted">
                        {new Date(m.date).toLocaleString()}
                      </span>
                    </div>
                    <div className="truncate text-sm">{m.subject || "(no subject)"}</div>
                    {m.otp?.code ? (
                      <span className="mt-1 inline-block rounded-md bg-accent/20 px-1.5 py-0.5 text-xs font-mono text-accent">
                        OTP {m.otp.code}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>

        {/* Reading pane */}
        <section className="glass-panel hidden min-w-0 flex-1 flex-col overflow-hidden lg:flex">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted">
              Select a message
            </div>
          ) : (
            <>
              <div className="border-b border-border px-5 py-4">
                <h1 className="text-lg font-semibold">{selected.subject || "(no subject)"}</h1>
                <div className="mt-1 text-sm text-muted">
                  <span className="text-ink">{selected.from}</span>
                  {" → "}
                  {selected.to}
                </div>
                <div className="text-xs text-muted">{new Date(selected.date).toLocaleString()}</div>
                {selected.otp?.code ? (
                  <div className="mt-3 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm">
                    <span className="text-muted">One-time code: </span>
                    <span className="font-mono text-base font-semibold tracking-wider text-accent">
                      {selected.otp.code}
                    </span>
                    <button
                      type="button"
                      className="btn-ghost ml-2 text-xs"
                      onClick={() => void navigator.clipboard.writeText(selected.otp!.code)}
                    >
                      Copy
                    </button>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`rounded-lg px-2 py-1 text-xs ${tab === "text" ? "bg-accent text-white" : "text-muted"}`}
                    onClick={() => setTab("text")}
                  >
                    Text
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg px-2 py-1 text-xs ${tab === "html" ? "bg-accent text-white" : "text-muted"}`}
                    onClick={() => setTab("html")}
                    disabled={!selected.html}
                  >
                    HTML
                  </button>
                  <button type="button" className="btn-ghost text-xs" onClick={() => void onSummarize()}>
                    AI summary
                  </button>
                </div>
                {summary ? (
                  <p className="mt-2 rounded-xl bg-surface-2/70 p-3 text-sm text-ink">{summary}</p>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                {tab === "text" ? (
                  <pre className="whitespace-pre-wrap p-5 text-sm leading-relaxed">{selected.text || "—"}</pre>
                ) : (
                  <iframe
                    title="Email HTML"
                    className="h-full min-h-[20rem] w-full bg-white"
                    sandbox=""
                    srcDoc={selected.html || "<p></p>"}
                  />
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
