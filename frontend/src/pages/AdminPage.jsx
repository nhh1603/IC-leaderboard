import React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  createGame,
  createPlayer,
  createTeam,
  deleteGame,
  deletePlayer,
  deleteTeam,
  fetchGames,
  fetchPlayers,
  fetchTeams,
  login,
  submitScore,
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

export default function AdminPage({ token, setToken, loginOnly = false }) {
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

  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");

  const isLoggedIn = useMemo(() => Boolean(token), [token]);

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

  const handleLogin = async (event) => {
    event.preventDefault();
    setErrorText("");
    setStatusText("");
    try {
      const payload = await login(username, password);
      setToken(payload.access_token);
      setStatusText("Admin authenticated");
      navigate("/admin", { replace: true });
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const handleLogout = () => {
    setToken("");
    setStatusText("Signed out");
    navigate("/admin/login", { replace: true });
  };

  const handleCreateTeam = async (event) => {
    event.preventDefault();
    if (!token) return;
    setErrorText("");
    setStatusText("");

    const playerNames = parsePlayerNames(newTeamPlayersText);
    try {
      const payload = await createTeam(token, newTeamName, playerNames);
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
    if (!token || !editingTeam) return;
    setErrorText("");
    setStatusText("");
    try {
      const payload = await updateTeam(token, editingTeam.id, editingTeam.name);
      setEditingTeam(null);
      setStatusText(`Updated team: ${payload.name}`);
      await loadTeams();
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const handleDeleteTeam = async (teamId, teamName) => {
    if (!token) return;
    if (!window.confirm(`Delete team "${teamName}"? This will remove players and scores.`)) return;
    setErrorText("");
    setStatusText("");
    try {
      await deleteTeam(token, teamId);
      setStatusText(`Deleted team: ${teamName}`);
      if (String(teamId) === String(selectedTeamId)) setSelectedTeamId("");
      await Promise.all([loadTeams(), loadAllPlayers()]);
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const handleCreatePlayer = async (teamId) => {
    if (!token) return;
    const name = (newPlayerByTeam[teamId] || "").trim();
    if (!name) return;

    setErrorText("");
    setStatusText("");
    try {
      const payload = await createPlayer(token, teamId, name);
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
    if (!token || !editingPlayerName.trim()) return;
    setErrorText("");
    setStatusText("");
    try {
      const payload = await updatePlayer(token, player.id, player.team_id, editingPlayerName.trim());
      setStatusText(`Updated player: ${payload.name}`);
      setEditingPlayerId(null);
      setEditingPlayerName("");
      await loadAllPlayers();
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const handleDeletePlayer = async (player) => {
    if (!token) return;
    if (!window.confirm(`Delete player "${player.name}"?`)) return;

    setErrorText("");
    setStatusText("");
    try {
      await deletePlayer(token, player.id);
      setStatusText(`Deleted player: ${player.name}`);
      await loadAllPlayers();
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const handleCreateGame = async (event) => {
    event.preventDefault();
    if (!token) return;
    setErrorText("");
    setStatusText("");
    try {
      const payload = await createGame(token, newGameName);
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
    if (!token || !editingGame) return;
    setErrorText("");
    setStatusText("");
    try {
      const payload = await updateGame(token, editingGame.id, editingGame.name);
      setEditingGame(null);
      setStatusText(`Updated game: ${payload.name}`);
      await loadGames();
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const handleDeleteGame = async (gameId, gameName) => {
    if (!token) return;
    if (!window.confirm(`Delete game "${gameName}"? All its scores will be removed.`)) return;
    setErrorText("");
    setStatusText("");
    try {
      await deleteGame(token, gameId);
      setStatusText(`Deleted game: ${gameName}`);
      if (selectedGameId === String(gameId)) setSelectedGameId("");
      await loadGames();
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const handleSubmitScore = async (event) => {
    event.preventDefault();
    if (!token || !selectedTeamId || !selectedGameId) return;
    setErrorText("");
    setStatusText("");
    try {
      await submitScore(token, selectedTeamId, selectedGameId, delta, reason);
      setStatusText("Score submitted");
    } catch (err) {
      setErrorText(err.message);
    }
  };

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
                            <h4>{team.name}</h4>
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
                <form className="form-grid" onSubmit={handleSubmitScore}>
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
                  <label>
                    Stars won (0-3)
                    <input
                      type="number"
                      min="0"
                      max="3"
                      step="1"
                      value={delta}
                      onChange={(e) => setDelta(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Reason
                    <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
                  </label>
                  <button type="submit" disabled={!selectedGameId || !selectedTeamId}>Submit score</button>
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
          </div>
        </div>
      )}

      {statusText ? <p className="success-text">{statusText}</p> : null}
      {errorText ? <p className="error-text">{errorText}</p> : null}
    </section>
  );
}
