import React from "react";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { getCurrentUser } from "./api";
import StoryIntro from "./components/StoryIntro";
import AdminPage from "./pages/AdminPage";
import PlayerPage from "./pages/PlayerPage";

const INTRO_SEEN_KEY = "ic_story_intro_seen_v1";

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
  if (accessState === "denied") return <Navigate to="/login" replace />;
  return children;
}

function RequireViewer({ token, adminToken, children }) {
  if (token) return children;
  if (adminToken) return <Navigate to="/admin" replace />;
  return <Navigate to="/login" replace />;
}

function RootRedirect({ viewerToken, adminToken }) {
  if (viewerToken) return <Navigate to="/" replace />;
  if (adminToken) return <Navigate to="/admin" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  const [adminToken, setAdminToken] = useState(() => window.localStorage.getItem("admin_token") || "");
  const [viewerToken, setViewerToken] = useState(() => window.localStorage.getItem("viewer_token") || "");
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    const hasSeenIntro = window.localStorage.getItem(INTRO_SEEN_KEY) === "true";
    if (!hasSeenIntro) {
      setShowIntro(true);
    }
  }, []);

  const finishIntro = () => {
    window.localStorage.setItem(INTRO_SEEN_KEY, "true");
    setShowIntro(false);
  };

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
      {showIntro ? <StoryIntro onFinish={finishIntro} /> : null}

      <Routes>
        <Route
          path="/login"
          element={<PlayerPage viewerToken={viewerToken} setViewerToken={setViewerToken} setAdminToken={setAdminToken} loginOnly />}
        />
        <Route
          path="/"
          element={
            <RequireViewer token={viewerToken} adminToken={adminToken}>
              <PlayerPage viewerToken={viewerToken} setViewerToken={setViewerToken} />
            </RequireViewer>
          }
        />
        <Route path="/admin/login" element={<Navigate to="/login" replace />} />
        <Route
          path="/admin"
          element={
            <RequireAdmin token={adminToken} setAdminToken={setAdminToken}>
              <AdminPage adminToken={adminToken} setAdminToken={setAdminToken} />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<RootRedirect viewerToken={viewerToken} adminToken={adminToken} />} />
      </Routes>
    </main>
  );
}
