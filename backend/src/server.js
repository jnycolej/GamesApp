import http from "http";
import express from "express";
import cors from "cors";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import { ClientEvents, ServerEvents } from "./protocol/events.js";

import healthRoutes from "./routes/healthRoutes.js";
import { createScheduleRoutes } from "./routes/scheduleRoutes.js";
import { createDebugRoutes } from "./routes/debugRoutes.js";

import { registerRoomHandlers } from "./handlers/roomHandlers.js";
import { registerPlayerHandlers } from "./handlers/playerHandlers.js";
import { registerGameHandlers } from "./handlers/gameHandlers.js";
import { registerReactionHandlers } from "./handlers/reactionHandlers.js";

import { createEventVoting } from "./game/eventVoting.js"
import { registerEventHandlers} from "./handlers/eventHandlers.js";

import { ErrorCodes } from "./protocol/errors.js";

import { createRoomManager } from "./roomManager.js";

import { gameSchedules } from "./data/gameSchedules.js";
import { createGameUpdates } from "./game/gameUpdates.js";

import { isProd, PORT } from "./config/env.js";
import { corsOptions } from "./config/cors.js";
import { PROTOCOL_VERSION } from "./protocol/version.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set("trust proxy", 1);
// Handles the case where Origin might be undefined in some environments
app.use(cors(corsOptions));

const rooms = createRoomManager();

console.log("[boot] room manager ready");

app.use(healthRoutes);
app.use(createScheduleRoutes(gameSchedules));
app.use(createDebugRoutes(rooms));

// Room / player lifecycle

const HOST_LOBBY_GRACE_MS = 3 * 60 * 1000;
const HOST_GAME_GRACE_MS = 10 * 60 * 1000;

const PLAYER_RECONNECT_GRACE_MS = 30 * 60 * 1000;

const EMPTY_LOBBY_TTL_MS = 5 * 60 * 1000;
const EMPTY_GAME_TTL_MS = 15 * 60 * 1000;

const MAX_LOBBY_LIFETIME_MS = 60 * 60 * 1000;
const MAX_GAME_LIFETIME_MS = 4 * 60 * 60 * 1000;

const ROOM_SWEEP_INTERVAL_MS = 60 * 1000;

const playerEvictionTimers = new Map();
const hostGraceTimers = new Map();
const emptyRoomTimers = new Map();

//initiates the server
const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
  path: "/socket.io",
  pingInterval: 25000,
  pingTimeout: 90000,
  connectionStateRecovery: {
    // allows clients to recover missed packets for up to 30 minutes
    maxDisconnectionDuration: 60 * 60 * 1000,
  },
});

const gameUpdates = createGameUpdates();

//Game log
function logGameTransition(event, data = {}) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...data,
    }),
  );
}

const IDLE_TIMEOUT_MS = 20_000;

function clearTimerFromMap(map, key) {
  const timer = map.get(key);

  if (timer) {
    clearTimeout(timer);
  }

  map.delete(key);
}

function cancelPlayerLifecycleTimers(code, key) {
  if (!key) return;

  const timerKey = playerLifecycleKey(code, key);

  clearTimerFromMap(playerEvictionTimers, timerKey);
  clearTimerFromMap(hostGraceTimers, timerKey);
}

function cancelEmptyRoomTimer(code) {
  clearTimerFromMap(emptyRoomTimers, code);
}

function playerLifecycleKey(code, playerOrKey) {
  const identity =
    typeof playerOrKey === "string"
      ? playerOrKey
      : playerOrKey?.key || playerOrKey?.id;

  return `${code}:${identity}`;
}
function updateIdleStatesForCode(code) {
  const room = rooms.getRoom?.(code);
  if (!room || !room.players) return;

  const now = Date.now();

  for (const player of room.players.values()) {
    if (!player.connected) {
      player.isActive = false;
      continue;
    }

    const lastActiveAt = player.lastActiveAt ?? 0;
    player.isActive = now - lastActiveAt < IDLE_TIMEOUT_MS;
  }
}

function getEnrichedState(code) {
  updateIdleStatesForCode(code);

  // base public snapshot
  const base =
    (typeof rooms.safePublicState === "function" &&
      rooms.safePublicState(code)) ||
    rooms.getPublicState(code);

  if (!base) return null;

  // normalize players + ensure numeric points
  const players = Array.isArray(base.players)
    ? base.players
        .filter((p) => p && typeof p === "object" && p.id)
        .map((p) => {
          // tolerate both 'points' (preferred) and legacy 'score'
          const direct =
            typeof p.score === "number" && Number.isFinite(p.score)
              ? p.score
              : typeof p.points === "number" && Number.isFinite(p.points)
                ? p.points
                : undefined;

          const score = direct ?? Number(rooms.getScore(code, p.id) ?? 0);

          // Keep points temporarily for existing UI compatibility,
          // but guarantee that it always matches score.
          return {
            ...p,
            score,
            points: score,
          };
        })
    : [];

  // compute leaderIds
  let leaderIds = [];
  if (players.length > 0) {
    const max = Math.max(
      ...players.map((p) => (Number.isFinite(p.score) ? p.score : 0)),
    );

    leaderIds = players.filter((p) => (p.score ?? 0) === max).map((p) => p.id);
  }

  // 4) stamp updatedAt
  const enriched = {
    ...base,
    players,
    leaderIds,
    updatedAt: Date.now(),
  };

  return enriched;
}

function emitRoomState(code) {
  const state = getEnrichedState(code);
  if (!state) return null;
  io.to(code).emit(ServerEvents.ROOM_UPDATED, state);
  return state;
}

const eventVoting = createEventVoting({
  io,
  rooms,
  gameUpdates,
  getEnrichedState,
  emitRoomState,
  logGameTransition,
});

function clearRoomAuxiliaryState(code) {
  eventVoting.clearRoom(code);
  gameUpdates.clear(code);

  clearTimerFromMap(
    emptyRoomTimers,
    code,
  );

  for (
    const [key, timer]
    of playerEvictionTimers
  ) {
    if (
      key.startsWith(`${code}:`)
    ) {
      clearTimeout(timer);
      playerEvictionTimers.delete(key);
    }
  }

  for (
    const [key, timer]
    of hostGraceTimers
  ) {
    if (
      key.startsWith(`${code}:`)
    ) {
      clearTimeout(timer);
      hostGraceTimers.delete(key);
    }
  }
}

function destroyRoom(code, reason = "expired") {
  const room = rooms.getRoom(code);
  if (!room) return false;

  io.to(code).emit(ServerEvents.ROOM_EXPIRED, {
    code,
    reason,
  });

  clearRoomAuxiliaryState(code);
  rooms.destroyRoom(code);

  io.in(code).socketsLeave(code);

  logGameTransition("ROOM_EXPIRED", {
    roomCode: code,
    reason,
    phase: room.phase,
    gameType: room.gameType,
    playerCount: room.players?.size ?? 0,
    createdAt: room.createdAt,
    startedAt: room.startedAt,
  });

  console.log(`[room] destroyed ${code}: ${reason}`);

  return true;
}

function scheduleEmptyRoomExpiration(code) {
  const room = rooms.getRoom(code);
  if (!room) return;

  const connectedPlayers = [...room.players.values()].filter(
    (player) => player.connected,
  );

  if (connectedPlayers.length > 0) {
    cancelEmptyRoomTimer(code);
    return;
  }

  if (emptyRoomTimers.has(code)) return;

  const ttl = room.phase === "playing" ? EMPTY_GAME_TTL_MS : EMPTY_LOBBY_TTL_MS;

  const timer = setTimeout(() => {
    emptyRoomTimers.delete(code);

    const latestRoom = rooms.getRoom(code);
    if (!latestRoom) return;

    const anyoneConnected = [...latestRoom.players.values()].some(
      (player) => player.connected,
    );

    if (anyoneConnected) return;

    destroyRoom(code, "empty_room_timeout");
  }, ttl);

  emptyRoomTimers.set(code, timer);
}

function schedulePlayerEviction(code, player) {
  const identity = player?.key || player?.id;
  if (!identity) return;

  const timerKey = playerLifecycleKey(code, identity);

  clearTimerFromMap(playerEvictionTimers, timerKey);

  const timer = setTimeout(() => {
    playerEvictionTimers.delete(timerKey);

    const room = rooms.getRoom(code);
    if (!room) return;

    const currentPlayer = player.key
      ? [...room.players.values()].find((p) => p.key === player.key)
      : room.players.get(player.id);

    // They reconnected.
    if (!currentPlayer || currentPlayer.connected) {
      return;
    }

    const result = player.key
      ? rooms.removePlayerByKey(code, player.key)
      : rooms.removePlayer(code, player.id);

    if (!result?.ok) return;
    logGameTransition("PLAYER_EVICTED", {
      roomCode: code,
      playerId: player.id,
      reason: "reconnect_grace_expired",
      roomEmpty: result.roomEmpty,
    });
    if (result.roomEmpty) {
      destroyRoom(code, "all_players_evicted");
      return;
    }

    emitRoomState(code);
  }, PLAYER_RECONNECT_GRACE_MS);

  playerEvictionTimers.set(timerKey, timer);
}

function scheduleHostReassignment(code, player) {
  const identity = player?.key || player?.id;
  if (!identity) return;

  const room = rooms.getRoom(code);
  if (!room) return;

  const timerKey = playerLifecycleKey(code, identity);

  clearTimerFromMap(hostGraceTimers, timerKey);

  const graceMs =
    room.phase === "playing" ? HOST_GAME_GRACE_MS : HOST_LOBBY_GRACE_MS;

  const timer = setTimeout(() => {
    hostGraceTimers.delete(timerKey);

    const latestRoom = rooms.getRoom(code);
    if (!latestRoom) return;

    // Find the original host by persistent identity.
    const disconnectedHost = player.key
      ? [...latestRoom.players.values()].find((p) => p.key === player.key)
      : latestRoom.players.get(player.id);

    // Host came back before grace expired.
    if (disconnectedHost?.connected) {
      return;
    }

    const result = rooms.reassignHost(code);

    if (!result?.ok) return;

    emitRoomState(code);

    if (result.hostAssigned) {
      io.to(code).emit(ServerEvents.HOST_CHANGED, {
        hostId: result.hostId,
      });
    }
  }, graceMs);

  hostGraceTimers.set(timerKey, timer);
}

io.use((socket, next) => {
  const clientProtocolVersion = socket.handshake.auth?.protocolVersion;

  if (clientProtocolVersion !== PROTOCOL_VERSION) {
    const err = new Error(ErrorCodes.INCOMPATIBLE_PROTOCOL_VERSION);

    err.data = {
      code: ErrorCodes.INCOMPATIBLE_PROTOCOL_VERSION,
      clientProtocolVersion,
      serverProtocolVersion: PROTOCOL_VERSION,
    };

    return next(err);
  }

  next();
});

io.on("connection", (socket) => {
  console.log("[socket] connected", socket.id);

  registerRoomHandlers({
    socket,
    io,
    rooms,
    getEnrichedState,
    emitRoomState,
    logGameTransition,
    cancelPlayerLifecycleTimers,
    destroyRoom,
  });

  registerPlayerHandlers({
    socket,
    io,
    rooms,
    emitRoomState,
    cancelPlayerLifecycleTimers,
    cancelEmptyRoomTimer,
    schedulePlayerEviction,
    scheduleHostReassignment,
    scheduleEmptyRoomExpiration,
    logGameTransition,
    playerReconnectGraceMs: PLAYER_RECONNECT_GRACE_MS,
  });

  registerGameHandlers({
    socket,
    io,
    rooms,
    gameUpdates,
    emitRoomState,
    logGameTransition,
  });

  registerReactionHandlers({
    socket,
    io,
    getEnrichedState
  })

  registerEventHandlers({
    socket,
    eventVoting,
  });

});

const roomLifetimeSweep = setInterval(() => {
  const now = Date.now();

  for (const code of rooms.listCodes()) {
    const room = rooms.getRoom(code);

    if (!room) continue;

    const isPlaying = room.phase === "playing";

    const referenceTime = isPlaying
      ? Number(room.startedAt || room.createdAt || now)
      : Number(room.createdAt || now);

    const maxLifetime = isPlaying
      ? MAX_GAME_LIFETIME_MS
      : MAX_LOBBY_LIFETIME_MS;

    const age = now - referenceTime;

    if (age >= maxLifetime) {
      destroyRoom(code, isPlaying ? "max_game_lifetime" : "max_lobby_lifetime");
    }
  }
}, ROOM_SWEEP_INTERVAL_MS);

roomLifetimeSweep.unref?.();
//In production serve the frontend from the same app
if (isProd) {
  const distDir = path.join(__dirname, "../../frontend-vite/dist");
  app.use(express.static(distDir));

  // SPA fallback (avoid socket.io route)
  app.get(/^\/(?!socket\.io\/).*/, (req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

console.log("[boot] starting HTTP server on", PORT);
server.listen(PORT, () => console.log("[boot] listening on :" + PORT));
