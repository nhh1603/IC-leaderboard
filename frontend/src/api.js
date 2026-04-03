const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || "ws://localhost:8000";

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function getWsLeaderboardUrl() {
  return `${WS_BASE_URL}/ws/leaderboard`;
}

export async function login(username, password) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error("Invalid username or password");
  }

  return response.json();
}

export async function fetchTeams() {
  const response = await fetch(`${API_BASE_URL}/teams`);
  if (!response.ok) {
    throw new Error("Unable to load teams");
  }
  return response.json();
}

export async function createTeam(token, name, playerNames = []) {
  const response = await fetch(`${API_BASE_URL}/teams`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, player_names: playerNames }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || "Unable to create team");
  }

  return response.json();
}

export async function updateTeam(token, teamId, name) {
  const response = await fetch(`${API_BASE_URL}/teams/${teamId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || "Unable to update team");
  }

  return response.json();
}

export async function deleteTeam(token, teamId) {
  const response = await fetch(`${API_BASE_URL}/teams/${teamId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || "Unable to delete team");
  }
}

export async function fetchGames() {
  const response = await fetch(`${API_BASE_URL}/games`);
  if (!response.ok) {
    throw new Error("Unable to load games");
  }
  return response.json();
}

export async function createGame(token, name) {
  const response = await fetch(`${API_BASE_URL}/games`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || "Unable to create game");
  }

  return response.json();
}

export async function updateGame(token, gameId, name) {
  const response = await fetch(`${API_BASE_URL}/games/${gameId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || "Unable to update game");
  }

  return response.json();
}

export async function deleteGame(token, gameId) {
  const response = await fetch(`${API_BASE_URL}/games/${gameId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || "Unable to delete game");
  }
}

export async function fetchPlayers(teamId) {
  const url = teamId
    ? `${API_BASE_URL}/players?team_id=${teamId}`
    : `${API_BASE_URL}/players`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Unable to load players");
  }
  return response.json();
}

export async function createPlayer(token, teamId, name) {
  const response = await fetch(`${API_BASE_URL}/players`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ team_id: Number(teamId), name }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || "Unable to create player");
  }

  return response.json();
}

export async function updatePlayer(token, playerId, teamId, name) {
  const response = await fetch(`${API_BASE_URL}/players/${playerId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ team_id: Number(teamId), name }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || "Unable to update player");
  }

  return response.json();
}

export async function deletePlayer(token, playerId) {
  const response = await fetch(`${API_BASE_URL}/players/${playerId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || "Unable to delete player");
  }
}

export async function submitScore(token, teamId, gameId, delta, reason) {
  const response = await fetch(`${API_BASE_URL}/scores`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ team_id: Number(teamId), game_id: Number(gameId), delta: Number(delta), reason }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || "Unable to submit score");
  }

  return response.json();
}

export async function registerTimerRound(token, teamId, gameId, durationMilliseconds) {
  const response = await fetch(`${API_BASE_URL}/timer-rounds`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      team_id: Number(teamId),
      game_id: Number(gameId),
      duration_milliseconds: Number(durationMilliseconds),
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || "Unable to register timer round");
  }

  return response.json();
}

export async function deleteTimerRound(token, timerRoundId) {
  const response = await fetch(`${API_BASE_URL}/timer-rounds/${timerRoundId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || "Unable to delete timer round");
  }
}

export async function fetchTimerRounds(teamId, gameId) {
  const params = new URLSearchParams();
  if (teamId) params.set("team_id", String(teamId));
  if (gameId) params.set("game_id", String(gameId));

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_BASE_URL}/timer-rounds${suffix}`);
  if (!response.ok) {
    throw new Error("Unable to load timer rounds");
  }
  return response.json();
}

export async function fetchLeaderboard() {
  const response = await fetch(`${API_BASE_URL}/leaderboard`);
  if (!response.ok) {
    throw new Error("Unable to load leaderboard");
  }
  return response.json();
}
