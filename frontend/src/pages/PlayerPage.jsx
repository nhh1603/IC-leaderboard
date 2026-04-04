import React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  fetchLeaderboard,
  fetchMyClues,
  fetchMyPerpetratorSubmissions,
  fetchPerpetratorPortal,
  fetchPlayers,
  fetchTeams,
  getCurrentUser,
  getWsLeaderboardUrl,
  login,
  submitPerpetratorGuess,
} from "../api";
import StoryTab from "../components/StoryTab";

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

function PlayerLoginPage({ setViewerToken }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorText, setErrorText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorText("");

    try {
      const payload = await login(username, password);
      setViewerToken(payload.access_token);
      navigate("/", { replace: true });
    } catch (err) {
      setErrorText(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="panel">
      <h2>Viewer Login</h2>
      <p className="muted">Use either the admin account or a team account.</p>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Username
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="admin or team username"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            required
          />
        </label>
        <button type="submit" disabled={isLoading}>{isLoading ? "Signing in..." : "Sign in"}</button>
      </form>
      {errorText ? <p className="error-text">{errorText}</p> : null}
    </section>
  );
}

function PlayerLeaderboard({ viewerToken, clearViewerToken }) {
  const navigate = useNavigate();
  const [games, setGames] = useState([]);
  const [activeViewTab, setActiveViewTab] = useState("leaderboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [myClues, setMyClues] = useState([]);
  const [currentTeamId, setCurrentTeamId] = useState(null);
  const [activeGameId, setActiveGameId] = useState(TOTAL_TAB_ID);
  const [playersByTeam, setPlayersByTeam] = useState({});
  const [expandedTeams, setExpandedTeams] = useState(new Set());
  const [lastUpdated, setLastUpdated] = useState(null);
  const [connectionState, setConnectionState] = useState("connecting");
  const [error, setError] = useState("");
  const [perpetratorPortal, setPerpetratorPortal] = useState({ is_open: false, options: [], updated_at: null });
  const [myPerpetratorHistory, setMyPerpetratorHistory] = useState({ submissions: [], final_choice: null });
  const [selectedPerpetratorName, setSelectedPerpetratorName] = useState("");
  const [isSubmittingPerpetrator, setIsSubmittingPerpetrator] = useState(false);

  const loadViewerTeam = async () => {
    try {
      const viewer = await getCurrentUser(viewerToken);
      if (viewer.account_type !== "team") {
        setCurrentTeamId(null);
        return;
      }

      const teams = await fetchTeams();
      const team = teams.find((entry) => entry.username === viewer.username);
      setCurrentTeamId(team?.id ?? null);
    } catch {
      setCurrentTeamId(null);
    }
  };

  const loadPlayers = async () => {
    try {
      const all = await fetchPlayers();
      const grouped = {};
      for (const player of all) {
        if (!grouped[player.team_id]) grouped[player.team_id] = [];
        grouped[player.team_id].push(player.name);
      }
      setPlayersByTeam(grouped);
    } catch {
      // non-critical
    }
  };

  const loadMyClues = async () => {
    try {
      const payload = await fetchMyClues(viewerToken);
      setMyClues(payload);
    } catch {
      setMyClues([]);
    }
  };

  const loadPerpetratorPortal = async () => {
    try {
      const payload = await fetchPerpetratorPortal(viewerToken);
      setPerpetratorPortal(payload);
    } catch {
      setPerpetratorPortal({ is_open: false, options: [], updated_at: null });
    }
  };

  const loadMyPerpetratorHistory = async () => {
    if (currentTeamId === null) {
      setMyPerpetratorHistory({ submissions: [], final_choice: null });
      return;
    }
    try {
      const payload = await fetchMyPerpetratorSubmissions(viewerToken);
      setMyPerpetratorHistory(payload);
      if (payload.final_choice?.perpetrator_name) {
        setSelectedPerpetratorName(payload.final_choice.perpetrator_name);
      }
    } catch {
      setMyPerpetratorHistory({ submissions: [], final_choice: null });
    }
  };

  const applySnapshot = (payload) => {
    const incoming = payload.games || [];
    setGames(incoming);
    setLastUpdated(payload.generated_at || null);
    setActiveGameId((previousGameId) => {
      if (previousGameId === TOTAL_TAB_ID) return previousGameId;
      if (previousGameId && incoming.some((game) => game.game_id === previousGameId)) return previousGameId;
      return TOTAL_TAB_ID;
    });
    // Refresh clues when leaderboard updates (e.g., after score submission)
    loadMyClues();
    if (currentTeamId !== null) {
      loadMyPerpetratorHistory();
    }
  };

  const handleSubmitPerpetrator = async (event) => {
    event.preventDefault();
    if (!selectedPerpetratorName || !perpetratorPortal.is_open || currentTeamId === null) return;

    setIsSubmittingPerpetrator(true);
    setError("");
    try {
      await submitPerpetratorGuess(viewerToken, selectedPerpetratorName);
      await loadMyPerpetratorHistory();
    } catch (err) {
      setError(err.message || "Unable to submit perpetrator choice");
    } finally {
      setIsSubmittingPerpetrator(false);
    }
  };

  const toggleTeam = (teamId) => {
    setExpandedTeams((previous) => {
      const next = new Set(previous);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  };

  const handleLogout = () => {
    clearViewerToken();
    navigate("/login", { replace: true });
  };

  const selectViewTab = (tabName) => {
    setActiveViewTab(tabName);
    setIsSidebarOpen(false);
  };

  useEffect(() => {
    let socket;
    let reconnectTimeout;
    let pollingInterval;

    const loadSnapshot = async () => {
      try {
        const payload = await fetchLeaderboard(viewerToken);
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
      if (!pollingInterval) return;
      window.clearInterval(pollingInterval);
      pollingInterval = undefined;
    };

    const connect = () => {
      setConnectionState("connecting");
      socket = new WebSocket(getWsLeaderboardUrl(viewerToken));

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

    loadPlayers();
    loadViewerTeam();
    loadMyClues();
    loadPerpetratorPortal();
    loadSnapshot();
    connect();

    return () => {
      if (socket) socket.close();
      if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
      if (pollingInterval) window.clearInterval(pollingInterval);
    };
  }, [viewerToken]);

  useEffect(() => {
    loadMyPerpetratorHistory();
  }, [currentTeamId, viewerToken]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadPerpetratorPortal();
      if (currentTeamId !== null) {
        loadMyPerpetratorHistory();
      }
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [currentTeamId, viewerToken]);

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

    return Array.from(byTeam.values()).sort((left, right) => {
      if (right.total_score !== left.total_score) return right.total_score - left.total_score;
      return left.team_name.localeCompare(right.team_name);
    });
  }, [games]);

  const activeGame = games.find((game) => game.game_id === activeGameId);
  const entries = activeGameId === TOTAL_TAB_ID ? totalEntries : (activeGame?.entries ?? []);

  return (
    <section className="panel">
      <button
        type="button"
        className={isSidebarOpen ? "hamburger-toggle open" : "hamburger-toggle"}
        aria-label="Open menu"
        onClick={() => setIsSidebarOpen((previous) => !previous)}
      >
        <span />
        <span />
        <span />
      </button>

      <header className="panel-header">
        <h2>Leaderboard</h2>
        <div className="panel-actions">
          <div className={`status-pill ${connectionState}`}>{stateLabel}</div>
          <button type="button" className="compact outline" onClick={handleLogout}>Logout</button>
        </div>
      </header>
      <p className="muted">Last updated: {formatDateTime(lastUpdated)}</p>
      {error ? <p className="error-text">{error}</p> : null}

      <div className="player-layout">
        <aside className={isSidebarOpen ? "player-sidebar open" : "player-sidebar"}>
          <button
            type="button"
            className={activeViewTab === "leaderboard" ? "sidebar-tab active" : "sidebar-tab"}
            onClick={() => selectViewTab("leaderboard")}
          >
            Leaderboard
          </button>
          <button
            type="button"
            className={activeViewTab === "story" ? "sidebar-tab active" : "sidebar-tab"}
            onClick={() => selectViewTab("story")}
          >
            Story
          </button>
          <button
            type="button"
            className={activeViewTab === "clues" ? "sidebar-tab active" : "sidebar-tab"}
            onClick={() => selectViewTab("clues")}
          >
            Clues
          </button>
          <button
            type="button"
            className={activeViewTab === "perpetrator" ? "sidebar-tab active" : "sidebar-tab"}
            onClick={() => selectViewTab("perpetrator")}
          >
            Perpetrator
          </button>
        </aside>

        {isSidebarOpen ? (
          <button
            type="button"
            className="sidebar-backdrop"
            aria-label="Close side menu"
            onClick={() => setIsSidebarOpen(false)}
          />
        ) : null}

        <div className="player-content">
          {activeViewTab === "clues" ? (
            <section className="clues-section">
              {currentTeamId === null ? (
                <p className="muted">Clues are available when logged in with a team account.</p>
              ) : myClues.length === 0 ? (
                <p className="muted">No clues earned yet. Submit stars from admin to unlock clues.</p>
              ) : (
                <div className="clues-list">
                  {myClues.map((group) => (
                    <article key={group.game_id} className="clue-card">
                      <h4>{group.game_name}</h4>
                      <ul>
                        {group.clues.map((clue) => (
                          <li key={clue.id}>
                            <strong>Clue {clue.clue_order}:</strong> {clue.clue_text}
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {activeViewTab === "story" ? (
            <StoryTab games={games} currentTeamId={currentTeamId} viewerToken={viewerToken} />
          ) : null}

          {activeViewTab === "perpetrator" ? (
            <section className="perpetrator-section">
              {currentTeamId === null ? (
                <p className="muted">Perpetrator submission is available only for team accounts.</p>
              ) : (
                <>
                  <div className={perpetratorPortal.is_open ? "perpetrator-status open" : "perpetrator-status closed"}>
                    <strong>{perpetratorPortal.is_open ? "Portal is open" : "Portal is closed"}</strong>
                    <p>
                      {perpetratorPortal.is_open
                        ? "You can submit multiple times. Your latest submission is your final choice."
                        : "Submissions are locked by admin."}
                    </p>
                  </div>

                  <form className="perpetrator-picker" onSubmit={handleSubmitPerpetrator}>
                    <div className="perpetrator-grid">
                      {perpetratorPortal.options.map((option) => {
                        const isSelected = selectedPerpetratorName === option.name;
                        return (
                          <label
                            key={option.name}
                            className={isSelected ? "perpetrator-card selected" : "perpetrator-card"}
                          >
                            <input
                              type="radio"
                              name="perpetrator"
                              value={option.name}
                              checked={isSelected}
                              onChange={(event) => setSelectedPerpetratorName(event.target.value)}
                            />
                            {option.image_path ? (
                              <img
                                src={option.image_path}
                                alt={option.name}
                                className="perpetrator-image"
                              />
                            ) : (
                              <div className="perpetrator-image placeholder">No photo</div>
                            )}
                            <span>{option.name}</span>
                          </label>
                        );
                      })}
                    </div>

                    <button
                      type="submit"
                      disabled={!perpetratorPortal.is_open || !selectedPerpetratorName || isSubmittingPerpetrator}
                    >
                      {isSubmittingPerpetrator ? "Submitting..." : "Submit choice"}
                    </button>
                  </form>

                  <div className="perpetrator-history">
                    <h4>Final choice</h4>
                    {myPerpetratorHistory.final_choice ? (
                      <p>
                        <strong>{myPerpetratorHistory.final_choice.perpetrator_name}</strong>
                        {" "}
                        ({formatDateTime(myPerpetratorHistory.final_choice.created_at)})
                      </p>
                    ) : (
                      <p className="muted">No submission yet.</p>
                    )}

                    <h4>Submission history</h4>
                    {myPerpetratorHistory.submissions?.length ? (
                      <ul className="perpetrator-history-list">
                        {myPerpetratorHistory.submissions.map((item) => (
                          <li key={item.id}>
                            <span>{item.perpetrator_name}</span>
                            <span className="muted">{formatDateTime(item.created_at)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">No submissions in history.</p>
                    )}
                  </div>
                </>
              )}
            </section>
          ) : null}

          {activeViewTab === "leaderboard" && games.length > 0 && (
            <>
              <div className="total-tab-section">
                <button
                  type="button"
                  className={activeGameId === TOTAL_TAB_ID ? "game-tab active" : "game-tab"}
                  onClick={() => setActiveGameId(TOTAL_TAB_ID)}
                >
                  Total
                </button>
              </div>
              <div className="game-tabs">
                {games.map((game) => (
                  <button
                    key={game.game_id}
                    type="button"
                    className={game.game_id === activeGameId ? "game-tab active" : "game-tab"}
                    onClick={() => setActiveGameId(game.game_id)}
                  >
                    {game.game_name}
                  </button>
                ))}
              </div>
            </>
          )}

          {activeViewTab === "leaderboard" ? (
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
              const isCurrentTeam = entry.team_id === currentTeamId;
              const members = playersByTeam[entry.team_id] || [];
              const rounds = entry.time_rounds || [];

              return [
                <tr
                  key={entry.team_id}
                  className={isCurrentTeam ? "team-row current-team-row" : "team-row"}
                  onClick={() => toggleTeam(entry.team_id)}
                >
                  <td>{index + 1}</td>
                  <td>
                    <span className="team-toggle">{isExpanded ? "▾" : "▸"}</span>
                    {entry.team_name}
                    {isCurrentTeam ? <span className="current-team-label">Your team</span> : null}
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
                isExpanded ? (
                  <tr
                    key={`${entry.team_id}-players`}
                    className={isCurrentTeam ? "players-row current-team-details" : "players-row"}
                  >
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
                ) : null,
              ].filter(Boolean);
            })
          )}
        </tbody>
      </table>
      ) : null}
        </div>
      </div>
    </section>
  );
}

export default function PlayerPage({ viewerToken, setViewerToken, loginOnly = false }) {
  if (loginOnly) {
    return <PlayerLoginPage setViewerToken={setViewerToken} />;
  }

  return <PlayerLeaderboard viewerToken={viewerToken} clearViewerToken={() => setViewerToken("")} />;
}

