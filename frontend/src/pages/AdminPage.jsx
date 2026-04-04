import React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  createGame,
  createPlayer,
  createTeam,
  deleteGame,
  deletePlayer,
  deleteTimerRound,
  deleteTeam,
  endGameSession,
  fetchAllPerpetratorSubmissions,
  fetchGames,
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
  updatePlayer,
  updateTeam,
} from "../api";

function parsePlayerNames(raw) {
  return raw
    .split(/[\n,]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

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

export default function AdminPage({ adminToken, setAdminToken, loginOnly = false }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("team");

  const [teams, setTeams] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamPlayersText, setNewTeamPlayersText] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");

  const [editingTeam, setEditingTeam] = useState(null);
  const [editingPlayerId, setEditingPlayerId] = useState(null);
  const [editingPlayerName, setEditingPlayerName] = useState("");
  const [newPlayerByTeam, setNewPlayerByTeam] = useState({});

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

  useEffect(() => {
    if (!adminToken) return;
    loadPerpetratorData();
    const intervalId = window.setInterval(loadPerpetratorData, 5000);
    return () => window.clearInterval(intervalId);
  }, [adminToken]);

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
    navigate("/admin/login", { replace: true });
  };

  const handleCreateTeam = async (event) => {
    event.preventDefault();
    if (!adminToken) return;
    setErrorText("");
    setStatusText("");

    const playerNames = parsePlayerNames(newTeamPlayersText);
    try {
      const payload = await createTeam(adminToken, newTeamName, playerNames);
      setNewTeamName("");
      setNewTeamPlayersText("");
      setStatusText(`Created team: ${payload.name}`);
      await Promise.all([loadTeams(), loadAllPlayers()]);
      setSelectedTeamId(String(payload.id));
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const handleUpdateTeam = async (event) => {
    event.preventDefault();
    if (!adminToken || !editingTeam) return;
    setErrorText("");
    setStatusText("");
    try {
      const payload = await updateTeam(adminToken, editingTeam.id, editingTeam.name);
      setEditingTeam(null);
      setStatusText(`Updated team: ${payload.name}`);
      await loadTeams();
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const handleDeleteTeam = async (teamId, teamName) => {
    if (!adminToken) return;
    if (!window.confirm(`Delete team "${teamName}"? This will remove players and scores.`)) return;
    setErrorText("");
    setStatusText("");
    try {
      await deleteTeam(adminToken, teamId);
      setStatusText(`Deleted team: ${teamName}`);
      if (String(teamId) === String(selectedTeamId)) setSelectedTeamId("");
      await Promise.all([loadTeams(), loadAllPlayers()]);
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const handleCreatePlayer = async (teamId) => {
    if (!adminToken) return;
    const name = (newPlayerByTeam[teamId] || "").trim();
    if (!name) return;

    setErrorText("");
    setStatusText("");
    try {
      const payload = await createPlayer(adminToken, teamId, name);
      setStatusText(`Added player: ${payload.name}`);
      setNewPlayerByTeam((prev) => ({ ...prev, [teamId]: "" }));
      await loadAllPlayers();
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const startEditPlayer = (player) => {
    setEditingPlayerId(player.id);
    setEditingPlayerName(player.name);
  };

  const handleUpdatePlayer = async (player) => {
    if (!adminToken || !editingPlayerName.trim()) return;
    setErrorText("");
    setStatusText("");
    try {
      const payload = await updatePlayer(adminToken, player.id, player.team_id, editingPlayerName.trim());
      setStatusText(`Updated player: ${payload.name}`);
      setEditingPlayerId(null);
      setEditingPlayerName("");
      await loadAllPlayers();
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const handleDeletePlayer = async (player) => {
    if (!adminToken) return;
    if (!window.confirm(`Delete player "${player.name}"?`)) return;

    setErrorText("");
    setStatusText("");
    try {
      await deletePlayer(adminToken, player.id);
      setStatusText(`Deleted player: ${player.name}`);
      await loadAllPlayers();
    } catch (err) {
      setErrorText(err.message);
    }
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

  return (
    <section className="panel">
      <h2>Admin View</h2>
      <p className="muted">Manage games, teams, players, and scores.</p>

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
          <aside className="admin-sidebar">
            <button
              type="button"
              className={activeTab === "team" ? "sidebar-tab active" : "sidebar-tab"}
              onClick={() => setActiveTab("team")}
            >
              Team
            </button>
            <button
              type="button"
              className={activeTab === "score" ? "sidebar-tab active" : "sidebar-tab"}
              onClick={() => setActiveTab("score")}
            >
              Score
            </button>
            <button
              type="button"
              className={activeTab === "game" ? "sidebar-tab active" : "sidebar-tab"}
              onClick={() => setActiveTab("game")}
            >
              Game
            </button>
            <button
              type="button"
              className={activeTab === "perpetrator" ? "sidebar-tab active" : "sidebar-tab"}
              onClick={() => setActiveTab("perpetrator")}
            >
              Perpetrator
            </button>
            <button type="button" className="sidebar-tab logout" onClick={handleLogout}>
              Sign out
            </button>
          </aside>

          <div className="admin-content">
            {activeTab === "team" && (
              <>
                <h3>Create team with players</h3>
                <form className="form-grid" onSubmit={handleCreateTeam}>
                  <label>
                    Team name
                    <input
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      placeholder="Team name"
                      required
                    />
                  </label>
                  <label>
                    Players (comma or new line separated)
                    <textarea
                      value={newTeamPlayersText}
                      onChange={(e) => setNewTeamPlayersText(e.target.value)}
                      placeholder="Alice, Bob, Charlie"
                      rows={3}
                    />
                  </label>
                  <button type="submit">Create team</button>
                </form>

                <h3>Current teams</h3>
                <div className="team-cards">
                  {teams.length === 0 ? (
                    <p className="muted">No teams yet.</p>
                  ) : teams.map((team) => {
                    const teamPlayers = playersByTeam[team.id] || [];
                    const isEditingTeam = editingTeam?.id === team.id;
                    return (
                      <section key={team.id} className="team-card">
                        <div className="team-card-header">
                          {isEditingTeam ? (
                            <form className="inline-edit" onSubmit={handleUpdateTeam}>
                              <input
                                value={editingTeam.name}
                                onChange={(e) => setEditingTeam({ ...editingTeam, name: e.target.value })}
                                required
                              />
                              <button type="submit" className="compact">Save</button>
                              <button type="button" className="compact neutral" onClick={() => setEditingTeam(null)}>Cancel</button>
                            </form>
                          ) : (
                            <div>
                              <h4>{team.name}</h4>
                              <p className="muted">Username: {team.username || "-"}</p>
                            </div>
                          )}

                          {!isEditingTeam && (
                            <div className="action-buttons">
                              <button
                                type="button"
                                className="compact outline"
                                onClick={() => setEditingTeam({ id: team.id, name: team.name })}
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                className="compact danger"
                                onClick={() => handleDeleteTeam(team.id, team.name)}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="team-card-body">
                          {teamPlayers.length === 0 ? (
                            <p className="muted">No players yet.</p>
                          ) : (
                            <ul className="managed-player-list">
                              {teamPlayers.map((player) => (
                                <li key={player.id}>
                                  {editingPlayerId === player.id ? (
                                    <>
                                      <input
                                        value={editingPlayerName}
                                        onChange={(e) => setEditingPlayerName(e.target.value)}
                                        className="player-inline-input"
                                      />
                                      <button type="button" className="compact" onClick={() => handleUpdatePlayer(player)}>Save</button>
                                      <button
                                        type="button"
                                        className="compact neutral"
                                        onClick={() => {
                                          setEditingPlayerId(null);
                                          setEditingPlayerName("");
                                        }}
                                      >
                                        Cancel
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <span>{player.name}</span>
                                      <div className="action-buttons">
                                        <button type="button" className="compact outline" onClick={() => startEditPlayer(player)}>Edit</button>
                                        <button type="button" className="compact danger" onClick={() => handleDeletePlayer(player)}>Delete</button>
                                      </div>
                                    </>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}

                          <div className="inline-create">
                            <input
                              value={newPlayerByTeam[team.id] || ""}
                              onChange={(e) => setNewPlayerByTeam((prev) => ({ ...prev, [team.id]: e.target.value }))}
                              placeholder="New player name"
                            />
                            <button type="button" onClick={() => handleCreatePlayer(team.id)}>Add player</button>
                          </div>
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
          </div>
        </div>
      )}

      {statusText ? <p className="success-text">{statusText}</p> : null}
      {errorText ? <p className="error-text">{errorText}</p> : null}
    </section>
  );
}
