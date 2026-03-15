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

export async function fetchPlayers() {
  const response = await fetch(`${API_BASE_URL}/players`);
  if (!response.ok) {
    throw new Error("Unable to load players");
  }
  return response.json();
}

export async function createPlayer(token, name) {
  const response = await fetch(`${API_BASE_URL}/players`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || "Unable to create player");
  }

  return response.json();
}

export async function submitScore(token, playerId, delta, reason) {
  const response = await fetch(`${API_BASE_URL}/scores`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ player_id: Number(playerId), delta: Number(delta), reason }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail || "Unable to submit score");
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
