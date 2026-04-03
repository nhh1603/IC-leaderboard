import React from "react";
import { useEffect, useMemo, useState } from "react";

import { fetchLeaderboard, fetchPlayers, getWsLeaderboardUrl } from "../api";

const TOTAL_TAB_ID = "__total__";

function formatDateTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

function formatDuration(milliseconds) {
  const total = Math.max(0, Number(milliseconds) || 0);
  const hours = Math.floor(total / 3600000);
  const mins = Math.floor((total % 3600000) / 60000);
  const secs = Math.floor((total % 60000) / 1000);
  const ms = total % 1000;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function renderStars(score) {
  const normalizedScore = Math.max(0, Math.min(3, Number(score) || 0));
  const filledCount = Math.round(normalizedScore);

  return (
    <span className="star-rating" aria-label={`${filledCount} out of 3 stars`}>
      {Array.from({ length: 3 }, (_, index) => (
        <span key={index} className={index < filledCount ? "star-fill" : "star-empty"}>
          {index < filledCount ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}

export default function PlayerPage() {
  const [games, setGames] = useState([]);          // list of GameLeaderboard objects
  const [activeGameId, setActiveGameId] = useState(TOTAL_TAB_ID);
  const [playersByTeam, setPlayersByTeam] = useState({});
  const [expandedTeams, setExpandedTeams] = useState(new Set());
  const [lastUpdated, setLastUpdated] = useState(null);
  const [connectionState, setConnectionState] = useState("connecting");
  const [error, setError] = useState("");

  const loadPlayers = async () => {
    try {
      const all = await fetchPlayers();
      const grouped = {};
      for (const p of all) {
        if (!grouped[p.team_id]) grouped[p.team_id] = [];
        grouped[p.team_id].push(p.name);
      }
      setPlayersByTeam(grouped);
    } catch {
      // non-critical
    }
  };

  const applySnapshot = (payload) => {
    const incoming = payload.games || [];
    setGames(incoming);
    setLastUpdated(payload.generated_at || null);
    setActiveGameId((prev) => {
      if (prev === TOTAL_TAB_ID) return prev;
      if (prev && incoming.some((g) => g.game_id === prev)) return prev;
      return TOTAL_TAB_ID;
    });
  };

  const toggleTeam = (teamId) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      next.has(teamId) ? next.delete(teamId) : next.add(teamId);
      return next;
    });
  };

  useEffect(() => {
    let socket;
    let reconnectTimeout;
    let pollingInterval;

    const loadSnapshot = async () => {
      try {
        const payload = await fetchLeaderboard();
        applySnapshot(payload);
      } catch (err) {
        setError(err.message);
      }
    };

    const startPollingFallback = () => {
      if (pollingInterval) return;
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
          applySnapshot(JSON.parse(event.data));
        } catch {
          setError("Received malformed real-time data");
        }
      };

      socket.onclose = () => {
        setConnectionState("reconnecting");
        startPollingFallback();
        reconnectTimeout = window.setTimeout(connect, 2500);
      };

      socket.onerror = () => setConnectionState("error");
    };

    loadSnapshot();
    loadPlayers();
    connect();

    return () => {
      if (socket) socket.close();
      if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
      if (pollingInterval) window.clearInterval(pollingInterval);
    };
  }, []);

  const stateLabel = useMemo(() => {
    if (connectionState === "live") return "Live";
    if (connectionState === "reconnecting") return "Reconnecting";
    if (connectionState === "error") return "Connection issue";
    return "Connecting";
  }, [connectionState]);

  const totalEntries = useMemo(() => {
    const byTeam = new Map();

    for (const game of games) {
      for (const entry of game.entries || []) {
        const existing = byTeam.get(entry.team_id);
        if (existing) {
          existing.total_score += entry.total_score;
          existing.total_time_milliseconds += entry.total_time_milliseconds || 0;
          for (const round of entry.time_rounds || []) {
            existing.time_rounds.push({ ...round, game_name: game.game_name });
          }
          continue;
        }

        byTeam.set(entry.team_id, {
          team_id: entry.team_id,
          team_name: entry.team_name,
          total_score: entry.total_score,
          total_time_milliseconds: entry.total_time_milliseconds || 0,
          time_rounds: (entry.time_rounds || []).map((round) => ({
            ...round,
            game_name: game.game_name,
          })),
        });
      }
    }

    return Array.from(byTeam.values()).sort((a, b) => {
      if (b.total_score !== a.total_score) return b.total_score - a.total_score;
      return a.team_name.localeCompare(b.team_name);
    });
  }, [games]);

  const activeGame = games.find((g) => g.game_id === activeGameId);
  const entries = activeGameId === TOTAL_TAB_ID ? totalEntries : (activeGame?.entries ?? []);

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Leaderboard</h2>
        <div className={`status-pill ${connectionState}`}>{stateLabel}</div>
      </header>
      <p className="muted">Last updated: {formatDateTime(lastUpdated)}</p>
      {error ? <p className="error-text">{error}</p> : null}

      {/* Game tabs */}
      {games.length > 0 && (
        <div className="game-tabs">
          <button
            type="button"
            className={activeGameId === TOTAL_TAB_ID ? "game-tab active" : "game-tab"}
            onClick={() => setActiveGameId(TOTAL_TAB_ID)}
          >
            Total
          </button>
          {games.map((g) => (
            <button
              key={g.game_id}
              type="button"
              className={g.game_id === activeGameId ? "game-tab active" : "game-tab"}
              onClick={() => setActiveGameId(g.game_id)}
            >
              {g.game_name}
            </button>
          ))}
        </div>
      )}

      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Team</th>
            <th>Score</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={4} className="empty-cell">
                {games.length === 0 ? "No games configured yet" : "No scores yet"}
              </td>
            </tr>
          ) : (
            entries.flatMap((entry, index) => {
              const isExpanded = expandedTeams.has(entry.team_id);
              const members = playersByTeam[entry.team_id] || [];
              const rounds = entry.time_rounds || [];
              return [
                <tr key={entry.team_id} className="team-row" onClick={() => toggleTeam(entry.team_id)}>
                  <td>{index + 1}</td>
                  <td>
                    <span className="team-toggle">{isExpanded ? "▾" : "▸"}</span>
                    {entry.team_name}
                  </td>
                  <td>
                    {activeGameId === TOTAL_TAB_ID ? (
                      <span className="total-score-badge">
                        {entry.total_score} <span className="star-fill">★</span>
                      </span>
                    ) : renderStars(entry.total_score)}
                  </td>
                  <td>{formatDuration(entry.total_time_milliseconds || 0)}</td>
                </tr>,
                isExpanded && (
                  <tr key={`${entry.team_id}-players`} className="players-row">
                    <td />
                    <td colSpan={3}>
                      {members.length === 0 ? (
                        <span className="muted">No players</span>
                      ) : (
                        <ul className="player-list">
                          {members.map((name) => <li key={name}>{name}</li>)}
                        </ul>
                      )}

                      <div className="round-breakdown">
                        <strong>Timer rounds</strong>
                        {rounds.length === 0 ? (
                          <p className="muted">No rounds recorded.</p>
                        ) : (
                          <ul className="round-list">
                            {rounds.map((round, roundIndex) => (
                              <li key={`${entry.team_id}-${round.round_number}-${roundIndex}`}>
                                {activeGameId === TOTAL_TAB_ID && round.game_name ? `${round.game_name} - ` : ""}
                                Round {round.round_number}: {formatDuration(round.duration_milliseconds)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </td>
                  </tr>
                ),
              ].filter(Boolean);
            })
          )}
        </tbody>
      </table>
    </section>
  );
}

