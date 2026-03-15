import React from "react";
import { useEffect, useMemo, useState } from "react";

import { fetchLeaderboard, getWsLeaderboardUrl } from "../api";

function formatDateTime(iso) {
  if (!iso) {
    return "-";
  }
  return new Date(iso).toLocaleString();
}

export default function PlayerPage() {
  const [entries, setEntries] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [connectionState, setConnectionState] = useState("connecting");
  const [error, setError] = useState("");

  useEffect(() => {
    let socket;
    let reconnectTimeout;
    let pollingInterval;

    const loadSnapshot = async () => {
      try {
        const payload = await fetchLeaderboard();
        setEntries(payload.entries || []);
        setLastUpdated(payload.generated_at || null);
      } catch (err) {
        setError(err.message);
      }
    };

    const startPollingFallback = () => {
      if (pollingInterval) {
        return;
      }
      pollingInterval = window.setInterval(loadSnapshot, 5000);
    };

    const stopPollingFallback = () => {
      if (pollingInterval) {
        window.clearInterval(pollingInterval);
        pollingInterval = undefined;
      }
    };

    const connect = () => {
      setConnectionState("connecting");
      socket = new WebSocket(getWsLeaderboardUrl());

      socket.onopen = () => {
        setConnectionState("live");
        setError("");
        stopPollingFallback();
        socket.send("ready");
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          setEntries(payload.entries || []);
          setLastUpdated(payload.generated_at || null);
        } catch {
          setError("Received malformed real-time data");
        }
      };

      socket.onclose = () => {
        setConnectionState("reconnecting");
        startPollingFallback();
        reconnectTimeout = window.setTimeout(connect, 2500);
      };

      socket.onerror = () => {
        setConnectionState("error");
      };
    };

    loadSnapshot();
    connect();

    return () => {
      if (socket) {
        socket.close();
      }
      if (reconnectTimeout) {
        window.clearTimeout(reconnectTimeout);
      }
      if (pollingInterval) {
        window.clearInterval(pollingInterval);
      }
    };
  }, []);

  const stateLabel = useMemo(() => {
    if (connectionState === "live") return "Live";
    if (connectionState === "reconnecting") return "Reconnecting";
    if (connectionState === "error") return "Connection issue";
    return "Connecting";
  }, [connectionState]);

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Player View</h2>
        <div className={`status-pill ${connectionState}`}>{stateLabel}</div>
      </header>
      <p className="muted">Last updated: {formatDateTime(lastUpdated)}</p>
      {error ? <p className="error-text">{error}</p> : null}

      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={3} className="empty-cell">
                No scores yet
              </td>
            </tr>
          ) : (
            entries.map((entry, index) => (
              <tr key={entry.player_id}>
                <td>{index + 1}</td>
                <td>{entry.player_name}</td>
                <td>{entry.total_score}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
