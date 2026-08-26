// src/shared/playerIdentity.js

const isBrowser = typeof window !== "undefined";

const PLAYER_ID_KEY = "playerId";

const RECONNECT_TOKEN_KEY = "reconnectToken";

const DISPLAY_NAME_KEY = "displayName";

export function getPlayerId() {
  if (!isBrowser) {
    return null;
  }

  return localStorage.getItem(PLAYER_ID_KEY);
}

export function setPlayerId(playerId) {
  if (!isBrowser || !playerId) {
    return;
  }

  localStorage.setItem(PLAYER_ID_KEY, playerId);
}

export function clearPlayerId() {
  if (!isBrowser) {
    return;
  }

  localStorage.removeItem(PLAYER_ID_KEY);
}

export function getReconnectToken() {
  if (!isBrowser) {
    return null;
  }

  return localStorage.getItem(RECONNECT_TOKEN_KEY);
}

export function setReconnectToken(reconnectToken) {
  if (!isBrowser || !reconnectToken) {
    return;
  }

  localStorage.setItem(RECONNECT_TOKEN_KEY, reconnectToken);
}

export function clearReconnectToken() {
  if (!isBrowser) {
    return;
  }

  localStorage.removeItem(RECONNECT_TOKEN_KEY);
}

export function getDisplayName() {
  if (!isBrowser) {
    return "Player";
  }

  return localStorage.getItem(DISPLAY_NAME_KEY) || "Player";
}

export function setDisplayName(name) {
  const safe = (name || "").trim() || "Player";

  if (!isBrowser) {
    return safe;
  }

  localStorage.setItem(DISPLAY_NAME_KEY, safe);

  return safe;
}
