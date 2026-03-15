import React from "react";
import { useEffect, useMemo, useState } from "react";

import { createPlayer, fetchPlayers, login, submitScore } from "../api";

export default function AdminPage() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [players, setPlayers] = useState([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState("Manual update");
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");

  const isLoggedIn = useMemo(() => Boolean(token), [token]);

  const loadPlayers = async () => {
    try {
      const payload = await fetchPlayers();
      setPlayers(payload);
      if (!selectedPlayerId && payload[0]) {
        setSelectedPlayerId(String(payload[0].id));
      }
    } catch (err) {
      setErrorText(err.message);
    }
  };

  useEffect(() => {
    loadPlayers();
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    setErrorText("");
    setStatusText("");

    try {
      const payload = await login(username, password);
      setToken(payload.access_token);
      setStatusText("Admin authenticated");
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const handleCreatePlayer = async (event) => {
    event.preventDefault();
    if (!token) return;

    setErrorText("");
    setStatusText("");
    try {
      const payload = await createPlayer(token, newPlayerName);
      setNewPlayerName("");
      setSelectedPlayerId(String(payload.id));
      setStatusText(`Created player: ${payload.name}`);
      await loadPlayers();
    } catch (err) {
      setErrorText(err.message);
    }
  };

  const handleSubmitScore = async (event) => {
    event.preventDefault();
    if (!token) return;

    setErrorText("");
    setStatusText("");
    try {
      await submitScore(token, selectedPlayerId, delta, reason);
      setStatusText("Score submitted");
    } catch (err) {
      setErrorText(err.message);
    }
  };

  return (
    <section className="panel">
      <h2>Admin View</h2>
      <p className="muted">Manual score entry for tournament admin.</p>

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
        <>
          <form className="form-grid" onSubmit={handleCreatePlayer}>
            <label>
              New player name
              <input
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                placeholder="Player name"
                required
              />
            </label>
            <button type="submit">Create player</button>
          </form>

          <form className="form-grid" onSubmit={handleSubmitScore}>
            <label>
              Player
              <select
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                required
              >
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Score delta
              <input
                type="number"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                required
              />
            </label>

            <label>
              Reason
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
            </label>

            <button type="submit">Submit score</button>
          </form>
        </>
      )}

      {statusText ? <p className="success-text">{statusText}</p> : null}
      {errorText ? <p className="error-text">{errorText}</p> : null}
    </section>
  );
}
