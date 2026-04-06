import React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  createGame,
  deleteGame,
  deleteTimerRound,
  endGameSession,
  fetchAllPerpetratorSubmissions,
  fetchGames,
  fetchLeaderboard,
  fetchPerpetratorPortal,
  fetchPlayers,
  fetchTimerRounds,
  fetchTeams,
  getCurrentUser,
  login,
  registerTimerRound,
  startGameSession,
  submitScore,
  updatePerpetratorPortal,
  updateGame,
} from "../api";

function formatDuration(milliseconds) {
  const total = Math.max(0, Number(milliseconds) || 0);
  const mins = Math.floor(total / 60000);
  const secs = Math.floor((total % 60000) / 1000);
  const ms = total % 1000;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function formatDateTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}

const TOTAL_TAB_ID = "__total__";

export default function AdminPage({ adminToken, setAdminToken, loginOnly = false }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("team");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [teams, setTeams] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");

  const [games, setGames] = useState([]);
  const [newGameName, setNewGameName] = useState("");
  const [editingGame, setEditingGame] = useState(null);

  const [selectedGameId, setSelectedGameId] = useState("");
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState("Manual update");

  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStartAt, setTimerStartAt] = useState(null);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const [stoppedElapsed, setStoppedElapsed] = useState(0);
  const [timerRoundsForSelection, setTimerRoundsForSelection] = useState([]);

  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [activeGameSession, setActiveGameSession] = useState(null);
  const [perpetratorPortal, setPerpetratorPortal] = useState({ is_open: false, updated_at: null, options: [] });
  const [perpetratorSubmissions, setPerpetratorSubmissions] = useState([]);
  const [leaderboardData, setLeaderboardData] = useState(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [activeLeaderboardGameId, setActiveLeaderboardGameId] = useState(TOTAL_TAB_ID);
  const [expandedLeaderboardTeams, setExpandedLeaderboardTeams] = useState(new Set());
  const [adminIdentity, setAdminIdentity] = useState({ username: "", account_type: "" });

  const isLoggedIn = useMemo(() => Boolean(adminToken), [adminToken]);

  const playersByTeam = useMemo(() => {
    const grouped = {};
    for (const player of allPlayers) {
      if (!grouped[player.team_id]) grouped[player.team_id] = [];
      grouped[player.team_id].push(player);
    }
    for (const teamId of Object.keys(grouped)) {
      grouped[teamId].sort((a, b) => a.name.localeCompare(b.name));
    }
    return grouped;
  }, [allPlayers]);

  useEffect(() => {
    if (loginOnly && isLoggedIn) navigate("/admin", { replace: true });
  }, [isLoggedIn, loginOnly, navigate]);

  useEffect(() => {
    if (!adminToken) {
      setAdminIdentity({ username: "", account_type: "" });
      return;
    }

    getCurrentUser(adminToken)
      .then((me) => setAdminIdentity({ username: me.username || "", account_type: me.account_type || "" }))
      .catch(() => setAdminIdentity({ username: "", account_type: "" }));
  }, [adminToken]);

  useEffect(() => {
    if (!timerRunning || !timerStartAt) return undefined;
    const id = window.setInterval(() => {
      setLiveElapsed(Date.now() - timerStartAt);
    }, 33);
    return () => window.clearInterval(id);
  }, [timerRunning, timerStartAt]);

  const loadTeams = async () => {
    try {
      const payload = await fetchTeams();
      setTeams(payload);
      if (!selectedTeamId && payload[0]) {
        setSelectedTeamId(String(payload[0].id));
      }
      if (selectedTeamId && !payload.some((team) => String(team.id) === String(selectedTeamId))) {
        setSelectedTeamId(payload[0] ? String(payload[0].id) : "");
      }
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const loadAllPlayers = async () => {
    try {
      const payload = await fetchPlayers();
      setAllPlayers(payload);
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const loadGames = async () => {
    try {
      const payload = await fetchGames();
      setGames(payload);
      if (!selectedGameId && payload[0]) setSelectedGameId(String(payload[0].id));
      if (selectedGameId && !payload.some((game) => String(game.id) === String(selectedGameId))) {
        setSelectedGameId(payload[0] ? String(payload[0].id) : "");
      }
    } catch (err) {
      setErrorText(err.message);
    }
  };

  useEffect(() => {
    loadTeams();
    loadAllPlayers();
    loadGames();
  }, []);

  const loadPerpetratorData = async () => {
    if (!adminToken) return;
    try {
      const [portal, history] = await Promise.all([
        fetchPerpetratorPortal(adminToken),
        fetchAllPerpetratorSubmissions(adminToken),
      ]);
      setPerpetratorPortal(portal);
      setPerpetratorSubmissions(history);
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const loadLeaderboard = async () => {
    if (!adminToken) return;
    setLeaderboardLoading(true);
    try {
      const payload = await fetchLeaderboard(adminToken);
      setLeaderboardData(payload);
    } catch (err) {
      setErrorText(err.message);
    } finally {
      setLeaderboardLoading(false);
    }
  };

  useEffect(() => {
    if (!adminToken) return;
    loadPerpetratorData();
    loadLeaderboard();
    const intervalId = window.setInterval(loadPerpetratorData, 5000);
    return () => window.clearInterval(intervalId);
  }, [adminToken]);

  useEffect(() => {
    const games = leaderboardData?.games || [];
    if (activeLeaderboardGameId === TOTAL_TAB_ID) return;
    if (games.some((game) => game.game_id === activeLeaderboardGameId)) return;
    setActiveLeaderboardGameId(TOTAL_TAB_ID);
  }, [leaderboardData, activeLeaderboardGameId]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setErrorText("");
    setStatusText("");
    try {
      const payload = await login(username, password);
      const currentUser = await getCurrentUser(payload.access_token);
      if (currentUser.account_type !== "admin") {
        throw new Error("Admin credentials required for admin view");
      }
      setAdminToken(payload.access_token);
      setStatusText("Admin authenticated");
      navigate("/admin", { replace: true });
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const handleLogout = () => {
    setAdminToken("");
    setStatusText("Signed out");
    setIsSidebarOpen(false);
    navigate("/admin/login", { replace: true });
  };

  const selectAdminTab = (tabName) => {
    setActiveTab(tabName);
    setIsSidebarOpen(false);
  };

  const toggleLeaderboardTeam = (teamId) => {
    setExpandedLeaderboardTeams((previous) => {
      const next = new Set(previous);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  };

  const handleCreateGame = async (event) => {
    event.preventDefault();
    if (!adminToken) return;
    setErrorText("");
    setStatusText("");
    try {
      const payload = await createGame(adminToken, newGameName);
      setNewGameName("");
      setStatusText(`Created game: ${payload.name}`);
      await loadGames();
      setSelectedGameId(String(payload.id));
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const handleUpdateGame = async (event) => {
    event.preventDefault();
    if (!adminToken || !editingGame) return;
    setErrorText("");
    setStatusText("");
    try {
      const payload = await updateGame(adminToken, editingGame.id, editingGame.name);
      setEditingGame(null);
      setStatusText(`Updated game: ${payload.name}`);
      await loadGames();
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const handleDeleteGame = async (gameId, gameName) => {
    if (!adminToken) return;
    if (!window.confirm(`Delete game "${gameName}"? All its scores will be removed.`)) return;
    setErrorText("");
    setStatusText("");
    try {
      await deleteGame(adminToken, gameId);
      setStatusText(`Deleted game: ${gameName}`);
      if (selectedGameId === String(gameId)) setSelectedGameId("");
      await loadGames();
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const handleSubmitScore = async (event) => {
    event.preventDefault();
    if (!adminToken || !selectedTeamId || !selectedGameId) return;
    setErrorText("");
    setStatusText("");
    try {
      await submitScore(adminToken, selectedTeamId, selectedGameId, delta, reason);
      setStatusText("Score submitted");
      // Game session will be ended automatically by the backend
      setActiveGameSession(null);
      loadLeaderboard();
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const handleStartGame = async () => {
    if (!adminToken || !selectedTeamId || !selectedGameId) return;
    setErrorText("");
    setStatusText("");
    try {
      const session = await startGameSession(adminToken, selectedTeamId, selectedGameId);
      setActiveGameSession(session);
      setStatusText("Game started! Story should appear for the team.");
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const handleEndGame = async () => {
    if (!adminToken || !activeGameSession) return;
    setErrorText("");
    setStatusText("");
    try {
      await endGameSession(adminToken, activeGameSession.id);
      setActiveGameSession(null);
      setStatusText("Game ended");
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const handleSelectStars = (value) => {
    const nextValue = Number(value) || 0;
    setDelta((previous) => (Number(previous) === nextValue ? 0 : nextValue));
  };

  const handleTogglePerpetratorPortal = async () => {
    if (!adminToken) return;
    setErrorText("");
    setStatusText("");
    try {
      const payload = await updatePerpetratorPortal(adminToken, !perpetratorPortal.is_open);
      setPerpetratorPortal(payload);
      setStatusText(payload.is_open ? "Perpetrator portal opened" : "Perpetrator portal closed");
      await loadPerpetratorData();
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const startTimer = () => {
    if (timerRunning) return;
    if (stoppedElapsed > 0) return;
    setTimerStartAt(Date.now());
    setLiveElapsed(0);
    setStoppedElapsed(0);
    setTimerRunning(true);
  };

  const stopTimer = () => {
    if (!timerRunning || !timerStartAt) return;
    const elapsed = Math.max(0, Date.now() - timerStartAt);
    setTimerRunning(false);
    setTimerStartAt(null);
    setLiveElapsed(elapsed);
    setStoppedElapsed(elapsed);
  };

  const resumeTimer = () => {
    if (timerRunning || stoppedElapsed <= 0) return;
    setTimerStartAt(Date.now() - stoppedElapsed);
    setLiveElapsed(stoppedElapsed);
    setTimerRunning(true);
  };

  const resetTimer = () => {
    setTimerRunning(false);
    setTimerStartAt(null);
    setLiveElapsed(0);
    setStoppedElapsed(0);
  };

  const registerCurrentRound = async () => {
    const duration = timerRunning ? liveElapsed : stoppedElapsed;
    if (!adminToken || !selectedTeamId || !selectedGameId || duration <= 0) return;

    setErrorText("");
    setStatusText("");
    try {
      const payload = await registerTimerRound(adminToken, selectedTeamId, selectedGameId, duration);
      setTimerRoundsForSelection((prev) => [...prev, payload]);
      setStatusText(`Registered round ${payload.round_number}: ${formatDuration(payload.duration_milliseconds)}`);
      resetTimer();
      loadLeaderboard();
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const handleDeleteTimerRound = async (timerRound) => {
    if (!adminToken || !timerRound?.id) return;
    if (!window.confirm(`Delete round ${timerRound.round_number}?`)) return;

    setErrorText("");
    setStatusText("");
    try {
      await deleteTimerRound(adminToken, timerRound.id);
      const refreshed = await fetchTimerRounds(selectedTeamId, selectedGameId);
      setTimerRoundsForSelection(refreshed);
      setStatusText(`Deleted round ${timerRound.round_number}`);
      loadLeaderboard();
    } catch (err) {
      setErrorText(err.message);
    }
  };

  useEffect(() => {
    if (!selectedTeamId || !selectedGameId) {
      setTimerRoundsForSelection([]);
      return;
    }

    fetchTimerRounds(selectedTeamId, selectedGameId)
      .then(setTimerRoundsForSelection)
      .catch((err) => setErrorText(err.message));
  }, [selectedTeamId, selectedGameId]);

  const timerDisplay = timerRunning ? liveElapsed : stoppedElapsed;
  const canSubmitForSelection = Boolean(
    activeGameSession
      && String(activeGameSession.team_id) === String(selectedTeamId)
      && String(activeGameSession.game_id) === String(selectedGameId)
  );

  const leaderboardGames = leaderboardData?.games || [];
  const totalLeaderboardEntries = useMemo(() => {
    const byTeam = new Map();

    for (const game of leaderboardGames) {
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
          time_rounds: (entry.time_rounds || []).map((round) => ({ ...round, game_name: game.game_name })),
        });
      }
    }

    return Array.from(byTeam.values()).sort((left, right) => {
      if (right.total_score !== left.total_score) return right.total_score - left.total_score;
      return left.team_name.localeCompare(right.team_name);
    });
  }, [leaderboardGames]);

  const activeLeaderboardGame = leaderboardGames.find((game) => game.game_id === activeLeaderboardGameId);
  const leaderboardEntries = activeLeaderboardGameId === TOTAL_TAB_ID
    ? totalLeaderboardEntries
    : (activeLeaderboardGame?.entries ?? []);

  return (
    <section className="panel admin-panel">
      {!loginOnly ? (
        <button
          type="button"
          className={isSidebarOpen ? "hamburger-toggle open" : "hamburger-toggle"}
          aria-label="Open admin menu"
          onClick={() => setIsSidebarOpen((previous) => !previous)}
        >
          <span />
          <span />
          <span />
        </button>
      ) : null}

      <h2>Admin View</h2>
      <p className="muted">Manage games, teams, players, and scores.</p>
      {isLoggedIn ? (
        <p className="muted">Logged in as: {adminIdentity.username || "-"} ({adminIdentity.account_type || "unknown"})</p>
      ) : null}

      {!isLoggedIn ? (
        <form className="form-grid" onSubmit={handleLogin}>
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit">Sign in</button>
        </form>
      ) : (
        <div className="admin-layout">
          <aside className={isSidebarOpen ? "admin-sidebar open" : "admin-sidebar"}>
            <button
              type="button"
              className={activeTab === "team" ? "sidebar-tab active" : "sidebar-tab"}
              onClick={() => selectAdminTab("team")}
            >
              Team
            </button>
            <button
              type="button"
              className={activeTab === "score" ? "sidebar-tab active" : "sidebar-tab"}
              onClick={() => selectAdminTab("score")}
            >
              Score
            </button>
            <button
              type="button"
              className={activeTab === "game" ? "sidebar-tab active" : "sidebar-tab"}
              onClick={() => selectAdminTab("game")}
            >
              Game
            </button>
            <button
              type="button"
              className={activeTab === "perpetrator" ? "sidebar-tab active" : "sidebar-tab"}
              onClick={() => selectAdminTab("perpetrator")}
            >
              Perpetrator
            </button>
            <button
              type="button"
              className={activeTab === "leaderboard" ? "sidebar-tab active" : "sidebar-tab"}
              onClick={() => selectAdminTab("leaderboard")}
            >
              Leaderboard
            </button>
            <button type="button" className="sidebar-tab logout" onClick={handleLogout}>
              Sign out
            </button>
          </aside>

          {isSidebarOpen ? (
            <button
              type="button"
              className="sidebar-backdrop"
              aria-label="Close admin menu"
              onClick={() => setIsSidebarOpen(false)}
            />
          ) : null}

          <div className="admin-content">
            {activeTab === "team" && (
              <>
                <h3>Available teams</h3>
                <p className="muted">Teams are managed from config files. This view is read-only.</p>
                <div className="team-cards">
                  {teams.length === 0 ? (
                    <p className="muted">No teams yet.</p>
                  ) : teams.map((team) => {
                    const teamPlayers = playersByTeam[team.id] || [];
                    return (
                      <section key={team.id} className="team-card">
                        <div className="team-card-header">
                          <div>
                            <h4>{team.name}</h4>
                            <p className="muted">Username: {team.username || "-"}</p>
                          </div>
                        </div>

                        <div className="team-card-body">
                          {teamPlayers.length === 0 ? (
                            <p className="muted">No players yet.</p>
                          ) : (
                            <ul className="managed-player-list">
                              {teamPlayers.map((player) => (
                                <li key={player.id}>
                                  <span>{player.name}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </>
            )}

            {activeTab === "score" && (
              <>
                <h3>Submit score</h3>
                
                <div className="form-grid" style={{ marginBottom: "16px" }}>
                  <label>
                    Team
                    <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)} required>
                      <option value="">- select team -</option>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </label>
                  <label>
                    Game
                    <select value={selectedGameId} onChange={(e) => setSelectedGameId(e.target.value)} required>
                      <option value="">- select game -</option>
                      {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={handleStartGame}
                    disabled={!selectedGameId || !selectedTeamId || Boolean(activeGameSession)}
                    className={activeGameSession ? "compact" : ""}
                  >
                    {activeGameSession ? "✓ Game started" : "Start game"}
                  </button>
                </div>

                {activeGameSession && (
                  <p className="success-text" style={{ marginBottom: "12px" }}>
                    Active: {teams.find(t => t.id === parseInt(selectedTeamId))?.name} - {games.find(g => g.id === parseInt(selectedGameId))?.name}
                  </p>
                )}

                <h3>Round timer</h3>
                <div className="timer-panel">
                  <p className="timer-display">{formatDuration(timerDisplay)}</p>
                  <div className="timer-actions">
                    <button type="button" onClick={startTimer} disabled={timerRunning || stoppedElapsed > 0 || !canSubmitForSelection}>Start</button>
                    <button type="button" onClick={resumeTimer} disabled={timerRunning || stoppedElapsed <= 0 || !canSubmitForSelection}>Resume</button>
                    <button type="button" onClick={stopTimer} disabled={!timerRunning || !canSubmitForSelection}>Stop</button>
                    <button type="button" className="compact neutral" onClick={resetTimer} disabled={(timerRunning && liveElapsed === 0) || !canSubmitForSelection}>Reset</button>
                    <button
                      type="button"
                      onClick={registerCurrentRound}
                      disabled={!selectedTeamId || !selectedGameId || timerDisplay <= 0 || timerRunning || !canSubmitForSelection}
                    >
                      Register round
                    </button>
                  </div>
                  <p className="muted">You can register as many rounds as needed for the selected team/game.</p>

                  {timerRoundsForSelection.length > 0 && (
                    <ul className="timer-round-list">
                      {timerRoundsForSelection.map((round) => (
                        <li key={round.id ?? `${round.round_number}-${round.duration_milliseconds}`}>
                          <span>Round {round.round_number}: {formatDuration(round.duration_milliseconds)}</span>
                          <button type="button" className="compact danger" onClick={() => handleDeleteTimerRound(round)}>
                            Delete
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <form className="form-grid" onSubmit={handleSubmitScore}>
                  <label>
                    Stars won
                    <div className="admin-star-picker" role="radiogroup" aria-label="Stars won">
                      {[1, 2, 3].map((starValue) => (
                        <button
                          key={starValue}
                          type="button"
                          className={Number(delta) >= starValue ? "admin-star-btn active" : "admin-star-btn"}
                          onClick={() => handleSelectStars(starValue)}
                          aria-label={`${starValue} star${starValue > 1 ? "s" : ""}`}
                        >
                          ★
                        </button>
                      ))}
                      <button
                        type="button"
                        className="compact outline"
                        onClick={() => setDelta(0)}
                      >
                        Clear
                      </button>
                    </div>
                    <span className="muted">Selected: {Number(delta)} / 3</span>
                  </label>
                  <label>
                    Reason
                    <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
                  </label>
                  <button type="submit" disabled={!selectedGameId || !selectedTeamId || !canSubmitForSelection}>Submit score</button>
                </form>
              </>
            )}

            {activeTab === "game" && (
              <>
                <h3>Games</h3>
                <table className="leaderboard-table table-actions">
                  <thead>
                    <tr><th>Name</th><th>Key</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {games.length === 0 ? (
                      <tr><td colSpan={3} className="empty-cell">No games yet</td></tr>
                    ) : games.map((g) => (
                      <tr key={g.id}>
                        <td>
                          {editingGame?.id === g.id ? (
                            <form className="inline-edit" onSubmit={handleUpdateGame}>
                              <input
                                value={editingGame.name}
                                onChange={(e) => setEditingGame({ ...editingGame, name: e.target.value })}
                                required
                              />
                              <button type="submit" className="compact">Save</button>
                              <button type="button" onClick={() => setEditingGame(null)} className="compact neutral">Cancel</button>
                            </form>
                          ) : g.name}
                        </td>
                        <td><span className="muted">{g.config_key ?? "-"}</span></td>
                        <td className="action-buttons">
                          <button type="button" className="compact outline" onClick={() => setEditingGame({ id: g.id, name: g.name })}>Edit</button>
                          <button type="button" className="compact danger" onClick={() => handleDeleteGame(g.id, g.name)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <form className="form-grid" onSubmit={handleCreateGame}>
                  <label>
                    New game name
                    <input
                      value={newGameName}
                      onChange={(e) => setNewGameName(e.target.value)}
                      placeholder="Game name"
                      required
                    />
                  </label>
                  <button type="submit">Add game</button>
                </form>
              </>
            )}

            {activeTab === "perpetrator" && (
              <>
                <h3>Perpetrator portal</h3>
                <div className="perpetrator-admin-panel">
                  <div className={perpetratorPortal.is_open ? "perpetrator-status open" : "perpetrator-status closed"}>
                    <strong>{perpetratorPortal.is_open ? "Portal is open" : "Portal is closed"}</strong>
                    <p>Last changed: {formatDateTime(perpetratorPortal.updated_at)}</p>
                  </div>
                  <div className="perpetrator-admin-actions">
                    <button type="button" onClick={handleTogglePerpetratorPortal}>
                      {perpetratorPortal.is_open ? "Close portal" : "Open portal"}
                    </button>
                    <button type="button" className="compact outline" onClick={loadPerpetratorData}>
                      Refresh history
                    </button>
                  </div>
                </div>

                <h3>Team submissions</h3>
                {perpetratorSubmissions.length === 0 ? (
                  <p className="muted">No team history available yet.</p>
                ) : (
                  <div className="perpetrator-admin-history">
                    {perpetratorSubmissions.map((teamRow) => (
                      <article key={teamRow.team_id} className="perpetrator-admin-card">
                        <header>
                          <h4>{teamRow.team_name}</h4>
                          <p>
                            Final choice:{" "}
                            <strong>{teamRow.final_choice?.perpetrator_name || "-"}</strong>
                          </p>
                        </header>

                        {teamRow.submissions.length === 0 ? (
                          <p className="muted">No submissions yet.</p>
                        ) : (
                          <ul className="perpetrator-history-list">
                            {teamRow.submissions.map((item) => (
                              <li key={item.id}>
                                <span>{item.perpetrator_name}</span>
                                <span className="muted">{formatDateTime(item.created_at)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === "leaderboard" && (
              <>
                <h3>Leaderboard</h3>
                <button type="button" className="compact outline" onClick={loadLeaderboard}>
                  {leaderboardLoading ? "Refreshing..." : "Refresh leaderboard"}
                </button>

                {!leaderboardGames.length ? (
                  <p className="muted" style={{ marginTop: "10px" }}>No leaderboard data yet.</p>
                ) : (
                  <>
                    <div className="total-tab-section" style={{ marginTop: "12px" }}>
                      <button
                        type="button"
                        className={activeLeaderboardGameId === TOTAL_TAB_ID ? "game-tab active" : "game-tab"}
                        onClick={() => setActiveLeaderboardGameId(TOTAL_TAB_ID)}
                      >
                        Total
                      </button>
                    </div>

                    <div className="game-tabs">
                      {leaderboardGames.map((game) => (
                        <button
                          key={game.game_id}
                          type="button"
                          className={game.game_id === activeLeaderboardGameId ? "game-tab active" : "game-tab"}
                          onClick={() => setActiveLeaderboardGameId(game.game_id)}
                        >
                          {game.game_name}
                        </button>
                      ))}
                    </div>

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
                        {leaderboardEntries.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="empty-cell">No scores yet</td>
                          </tr>
                        ) : (
                          leaderboardEntries.flatMap((entry, index) => {
                            const isExpanded = expandedLeaderboardTeams.has(entry.team_id);
                            const members = playersByTeam[entry.team_id] || [];
                            const rounds = entry.time_rounds || [];

                            return [
                              <tr
                                key={entry.team_id}
                                className="team-row"
                                onClick={() => toggleLeaderboardTeam(entry.team_id)}
                              >
                                <td>{index + 1}</td>
                                <td>
                                  <span className="team-toggle">{isExpanded ? "▾" : "▸"}</span>
                                  {entry.team_name}
                                </td>
                                <td>
                                  {activeLeaderboardGameId === TOTAL_TAB_ID ? (
                                    <span className="total-score-badge">
                                      {entry.total_score} <span className="star-fill">★</span>
                                    </span>
                                  ) : (
                                    <span>{entry.total_score} ★</span>
                                  )}
                                </td>
                                <td>{formatDuration(entry.total_time_milliseconds || 0)}</td>
                              </tr>,
                              isExpanded ? (
                                <tr key={`${entry.team_id}-details`} className="players-row">
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
                                              {activeLeaderboardGameId === TOTAL_TAB_ID && round.game_name ? `${round.game_name} - ` : ""}
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
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {statusText ? <p className="success-text">{statusText}</p> : null}
      {errorText ? <p className="error-text">{errorText}</p> : null}
    </section>
  );
}
