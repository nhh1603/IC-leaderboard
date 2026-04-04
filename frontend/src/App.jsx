import React from "react";
import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";

import { getCurrentUser } from "./api";
import AdminPage from "./pages/AdminPage";
import PlayerPage from "./pages/PlayerPage";

function RequireAdmin({ token, setAdminToken, children }) {
  const [accessState, setAccessState] = useState("checking");

  useEffect(() => {
    if (!token) {
      setAccessState("denied");
      return;
    }

    let cancelled = false;

    const validateAdmin = async () => {
      try {
        const me = await getCurrentUser(token);
        if (!cancelled) {
          setAccessState(me.account_type === "admin" ? "allowed" : "denied");
          if (me.account_type !== "admin") setAdminToken("");
        }
      } catch {
        if (!cancelled) {
          setAccessState("denied");
          setAdminToken("");
        }
      }
    };

    setAccessState("checking");
    validateAdmin();

    return () => {
      cancelled = true;
    };
  }, [token, setAdminToken]);

  if (accessState === "checking") return null;
  if (accessState === "denied") return <Navigate to="/admin/login" replace />;
  return children;
}

function RequireViewer({ token, children }) {
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const [adminToken, setAdminToken] = useState(() => window.localStorage.getItem("admin_token") || "");
  const [viewerToken, setViewerToken] = useState(() => window.localStorage.getItem("viewer_token") || "");

  useEffect(() => {
    if (adminToken) {
      window.localStorage.setItem("admin_token", adminToken);
    } else {
      window.localStorage.removeItem("admin_token");
    }
  }, [adminToken]);

  useEffect(() => {
    if (viewerToken) {
      window.localStorage.setItem("viewer_token", viewerToken);
    } else {
      window.localStorage.removeItem("viewer_token");
    }
  }, [viewerToken]);

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>IC Leaderboard</h1>
        <nav className="tabs">
          <NavLink to="/" className={({ isActive }) => (isActive ? "tab active" : "tab")} end>
            Player View
          </NavLink>
          <NavLink to="/admin" className={({ isActive }) => (isActive ? "tab active" : "tab")}>
            Admin View
          </NavLink>
        </nav>
      </header>

      <Routes>
        <Route path="/login" element={<PlayerPage viewerToken={viewerToken} setViewerToken={setViewerToken} loginOnly />} />
        <Route
          path="/"
          element={
            <RequireViewer token={viewerToken}>
              <PlayerPage viewerToken={viewerToken} setViewerToken={setViewerToken} />
            </RequireViewer>
          }
        />
        <Route path="/admin/login" element={<AdminPage adminToken={adminToken} setAdminToken={setAdminToken} loginOnly />} />
        <Route
          path="/admin"
          element={
            <RequireAdmin token={adminToken} setAdminToken={setAdminToken}>
              <AdminPage adminToken={adminToken} setAdminToken={setAdminToken} />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
}
