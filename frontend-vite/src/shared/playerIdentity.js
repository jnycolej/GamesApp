// src/shared/playerIdentity.js

const isBrowser = typeof window !== "undefined";

export function getPlayerKey() {
  if (!isBrowser) return "server-key";

  let k = localStorage.getItem("playerKey");
  if (k) return k;

  const gen =
    (window.crypto &&
      typeof window.crypto.randomUUID === "function" &&
      window.crypto.randomUUID()) ||
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.toUpperCase();

  localStorage.setItem("playerKey", gen);
  return gen;
}

export function getDisplayName() {
  if (!isBrowser) return "Player";
  return localStorage.getItem("displayName") || "Player";
}

export function setDisplayName(name) {
  if (!isBrowser) return (name || "").trim() || "Player";
  const safe = (name || "").trim() || "Player";
  localStorage.setItem("displayName", safe);
  return safe;
}