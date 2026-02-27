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

// Guards against repeated resume emits (connect/reconnect can fire multiple times)
let lastResumeAt = 0;
let resumeInFlight = false;

export function rememberRoom(code, displayName) {
  if (!isBrowser) return;
  if (code) localStorage.setItem("roomCode", code);
  if (displayName) localStorage.setItem("displayName", displayName);
}

function safeGetStoredRoom() {
  if (!isBrowser) return { roomCode: null, displayName: "Player" };
  return {
    roomCode: localStorage.getItem("roomCode"),
    displayName: localStorage.getItem("displayName") || "Player",
  };
}

function maybeResume() {
  if (!socket || !socket.connected) return;

  const { roomCode, displayName } = safeGetStoredRoom();
  if (!roomCode) return;

  // debounce + in-flight guard
  const now = Date.now();
  if (resumeInFlight) return;
  if (now - lastResumeAt < 800) return;

  resumeInFlight = true;
  lastResumeAt = now;

  const key = getPlayerKey();

  socket.emit("player:resume", { roomCode, displayName, key }, () => {
    resumeInFlight = false;
  });
}

export function getSocket() {
  if (socket) return socket;

  socket = io(API_URL, {
    path: "/socket.io",
    autoConnect: true,
    // withCredentials: true,
  });

  socket.on("connect", () => {
    // reset per-connection state
    resumeInFlight = false;
    maybeResume();
  });

  socket.on("reconnect", () => {
    resumeInFlight = false;
    maybeResume();
  });

  socket.on("connect_error", (err) => {
    console.warn("[socket] connect_error:", err?.message || err);
  });

  return socket;
}