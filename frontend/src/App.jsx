import React from "react";
import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";

import AdminPage from "./pages/AdminPage";
import PlayerPage from "./pages/PlayerPage";

function RequireAdmin({ token, children }) {
  if (!token) return <Navigate to="/admin/login" replace />;
  return children;
}

export default function App() {
  const [token, setToken] = useState(() => window.localStorage.getItem("admin_token") || "");

  useEffect(() => {
    if (token) {
      window.localStorage.setItem("admin_token", token);
      return;
    }
    window.localStorage.removeItem("admin_token");
  }, [token]);

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
        <Route path="/" element={<PlayerPage />} />
        <Route path="/admin/login" element={<AdminPage token={token} setToken={setToken} loginOnly />} />
        <Route
          path="/admin"
          element={(
            <RequireAdmin token={token}>
              <AdminPage token={token} setToken={setToken} />
            </RequireAdmin>
          )}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
}
