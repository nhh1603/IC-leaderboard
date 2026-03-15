import React from "react";
import { useState } from "react";

import AdminPage from "./pages/AdminPage";
import PlayerPage from "./pages/PlayerPage";

export default function App() {
  const [activeView, setActiveView] = useState("player");

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>IC Leaderboard</h1>
        <nav className="tabs">
          <button
            type="button"
            className={activeView === "player" ? "tab active" : "tab"}
            onClick={() => setActiveView("player")}
          >
            Player View
          </button>
          <button
            type="button"
            className={activeView === "admin" ? "tab active" : "tab"}
            onClick={() => setActiveView("admin")}
          >
            Admin View
          </button>
        </nav>
      </header>

      {activeView === "player" ? <PlayerPage /> : <AdminPage />}
    </main>
  );
}
