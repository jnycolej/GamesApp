// frontend/src/shared/socket.js
import { io } from "socket.io-client";
import { getPlayerKey } from "@/shared/playerIdentity";

const isBrowser = typeof window !== "undefined";
const isProd = isBrowser && window.location.protocol === "https:";

const API_URL = isProd
  ? window.location.origin
  : ((typeof import.meta !== "undefined" ? import.meta.env?.VITE_API_URL : null) ||
     "http://localhost:8080");

let socket;

export function rememberRoom(code, displayName) {
  if (!isBrowser) return;
  if (code) localStorage.setItem("roomCode", code);
  if (displayName) localStorage.setItem("displayName", displayName);
}

export function getSocket() {
  if (socket) return socket;

  socket = io(API_URL, {
    path: "/socket.io",
    autoConnect: true,
  });

  socket.on("connect", () => {
    const roomCode = isBrowser ? localStorage.getItem("roomCode") : null;
    const displayName =
      (isBrowser && localStorage.getItem("displayName")) || "Player";
    const key = getPlayerKey();

    if (roomCode) {
      socket.emit("player:resume", { roomCode, displayName, key }, () => {});
    }
  });

  socket.on("connect_error", (err) => {
    console.warn("[socket] connect_error:", err?.message || err);
  });

  return socket;
}