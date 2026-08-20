import http from "http";
import express from "express";
import cors from "cors";
import path from "path";

import { fileURLToPath } from "url";
import { Server } from "socket.io";
import healthRoutes from "./routes/healthRoutes.js";
import { createScheduleRoutes } from "./routes/scheduleRoutes.js";
import { createDebugRoutes } from "./routes/debugRoutes.js";

import { registerRoomHandlers } from "./handlers/roomHandlers.js";
import { registerPlayerHandlers } from "./handlers/playerHandlers.js";
import { registerGameHandlers } from "./handlers/gameHandlers.js";
import { registerReactionHandlers } from "./handlers/reactionHandlers.js";

import { createEventVoting } from "./game/eventVoting.js";
import { registerEventHandlers } from "./handlers/eventHandlers.js";

import { ErrorCodes } from "./protocol/errors.js";

import { createRoomManager } from "./roomManager.js";

import { createRoomLifecycle } from "./rooms/roomLifecycle.js";
import { gameSchedules } from "./data/gameSchedules.js";
import { createGameUpdates } from "./game/gameUpdates.js";

import {logGameTransition} from "./logging/logger.js";

import { createRoomState } from "./rooms/roomState.js";

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

const roomState = createRoomState({ io, rooms });

const { getEnrichedState, emitRoomState } = roomState;

const gameUpdates = createGameUpdates();

const eventVoting = createEventVoting({
  io,
  rooms,
  gameUpdates,
  getEnrichedState,
  emitRoomState,
  logGameTransition,
});

const roomLifecycle = createRoomLifecycle({
  io,
  rooms,
  emitRoomState,
  logGameTransition,
  eventVoting,
  gameUpdates,
});

roomLifecycle.startRoomLifetimeSweep();

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
    cancelPlayerLifecycleTimers: roomLifecycle.cancelPlayerLifecycleTimers,
    destroyRoom: roomLifecycle.destroyRoom,
  });

  registerPlayerHandlers({
    socket,
    io,
    rooms,
    emitRoomState,
    logGameTransition,
    cancelPlayerLifecycleTimers: roomLifecycle.cancelPlayerLifecycleTimers,
    cancelEmptyRoomTimer: roomLifecycle.cancelEmptyRoomTimer,
    schedulePlayerEviction: roomLifecycle.schedulePlayerEviction,
    scheduleHostReassignment: roomLifecycle.scheduleHostReassignment,
    scheduleEmptyRoomExpiration: roomLifecycle.scheduleEmptyRoomExpiration,
    playerReconnectGraceMs: roomLifecycle.playerReconnectGraceMs,
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
    getEnrichedState,
  });

  registerEventHandlers({
    socket,
    eventVoting,
  });
});
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
