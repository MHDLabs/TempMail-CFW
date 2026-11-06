import { Link, Outlet, useNavigate } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";
import { logout } from "../lib/api";

export function Shell() {
  const navigate = useNavigate();

  async function onLogout() {
    try {
      await logout();
    } catch {
      /* still leave */
    }
    navigate("/login", { replace: true });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6">
      <header className="glass-panel mb-6 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-base font-semibold tracking-tight">
            TempMail-CFW
          </Link>
          <nav className="flex gap-3 text-sm text-muted">
            <Link className="hover:text-ink" to="/">
              Inboxes
            </Link>
            <Link className="hover:text-ink" to="/settings">
              Settings
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button type="button" className="btn-ghost" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
