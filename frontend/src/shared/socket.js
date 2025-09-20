// frontend/src/shared/socket.js
import { io } from "socket.io-client";

const isBrowser = typeof window !== "undefined";
const isProd = isBrowser && window.location.protocol === "https:";

// Support both CRA and Vite env vars
const API_URL = isProd
  ? window.location.origin
  : (process.env.REACT_APP_API_URL ||
     (typeof import.meta !== "undefined" ? import.meta.env?.VITE_API_URL : null) ||
     "http://localhost:8080");

let socket;

// Stable per-device key so a player can be re-bound after reconnects
export function getPlayerKey() {
  if (!isBrowser) return "server-key"; // safeguard
  let key = localStorage.getItem("playerKey");
  if (!key) {
    const rand = (window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
    key = `${rand}-${Date.now()}`;
    localStorage.setItem("playerKey", key);
  }
  return key;
}

// Remember room/name after create/join so we can auto-resume on reconnect
export function rememberRoom(code, displayName) {
  if (!isBrowser) return;
  if (code) localStorage.setItem("roomCode", code);
  if (displayName) localStorage.setItem("displayName", displayName);
}

export function getSocket() {
  if (socket) return socket;

  socket = io(API_URL, {
    withCredentials: true,
    path: "/socket.io",
    autoConnect: true,
  });

  // Auto-resume into the last room whenever we (re)connect
  socket.on("connect", () => {
    const roomCode = isBrowser ? localStorage.getItem("roomCode") : null;
    const displayName = (isBrowser && localStorage.getItem("displayName")) || "Player";
    const key = getPlayerKey();

    if (roomCode) {
      socket.emit("player:resume", { roomCode, displayName, key }, (res) => {
        // If resume fails (first time, or server restarted), you can optionally fall back to join:
        // if (!res?.ok) socket.emit("player:join", { roomCode, displayName, key }, () => {});
      });
    }
  });

  socket.on("connect_error", (err) => {
    console.warn("[socket] connect_error:", err?.message || err);
  });

  return socket;
}

export function createRoom(gameType, displayName, cb) {
  const s = getSocket();
  const key = getPlayerKey();
  s.emit("room:create", { gameType, displayName, key }, (res) => {
    if (res?.ok) rememberRoom(res.roomCode, displayName);
    cb?.(res);
  });
}

export function joinRoom(roomCode, displayName, cb) {
  const s = getSocket();
  const key = getPlayerKey();
  s.emit("player:join", {roomCode, displayName, key, token}, (res) => {
    if (res?.ok) rememberRoom(roomCode, displayName);
    cb?.(res);
  });
}
