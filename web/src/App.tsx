import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { getSession } from "./lib/api";
import { LoginPage } from "./pages/LoginPage";
import { MailApp } from "./pages/MailApp";
import { SettingsPage } from "./pages/SettingsPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "yes" | "no">("loading");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await getSession();
        if (!cancelled) setState(s?.authenticated ? "yes" : "no");
      } catch {
        if (!cancelled) setState("no");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        Checking session…
      </div>
    );
  }
  if (state === "no") return <Navigate to="/login" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <MailApp />
          </RequireAuth>
        }
      />
      <Route
        path="/mail/:address"
        element={
          <RequireAuth>
            <MailApp />
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
