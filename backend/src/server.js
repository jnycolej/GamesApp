import http from "http";

import {createApp} from "./app.js";

import { createEventVoting } from "./game/eventVoting.js";
import { createGameUpdates } from "./game/gameUpdates.js";


import {registerHandlers} from "./sockets/registerHandlers.js";
import { createSocketServer } from "./sockets/socketServer.js";
import { protocolVersionMiddleware } from "./sockets/middleware/protocolVersion.js";

import { createRoomManager } from "./roomManager.js";
import { createGameManager } from "./game/gameManager.js";
import { createRoomLifecycle } from "./rooms/roomLifecycle.js";
import { createRoomState } from "./rooms/roomState.js";

import { logGameTransition } from "./logging/logger.js";

import { PORT } from "./config/env.js";
import { corsOptions } from "./config/cors.js";

const rooms = createRoomManager();

const games = createGameManager({rooms,});

console.log("[boot] room manager ready");

const app = createApp({ rooms });

//initiates the server
const server = http.createServer(app);

const io = createSocketServer({
  httpServer: server,
  corsOptions,
});

const roomState = createRoomState({ io, rooms, games });

const { getEnrichedState, emitRoomState } = roomState;

const gameUpdates = createGameUpdates();

const eventVoting = createEventVoting({
  io,
  rooms,
  games,
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

io.use(protocolVersionMiddleware);

io.on("connection", (socket) => {
  console.log("[socket] connected", socket.id);
  registerHandlers({
    socket,
    io,
    rooms,
    games,
    getEnrichedState,
    emitRoomState,
    logGameTransition,
    cancelPlayerLifecycleTimers: roomLifecycle.cancelPlayerLifecycleTimers,
    destroyRoom: roomLifecycle.destroyRoom,
    cancelEmptyRoomTimer: roomLifecycle.cancelEmptyRoomTimer,
    schedulePlayerEviction: roomLifecycle.schedulePlayerEviction,
    scheduleHostReassignment: roomLifecycle.scheduleHostReassignment,
    scheduleEmptyRoomExpiration: roomLifecycle.scheduleEmptyRoomExpiration,
    playerReconnectGraceMs: roomLifecycle.playerReconnectGraceMs,
    gameUpdates,
    eventVoting,
  });
});

console.log("[boot] starting HTTP server on", PORT);
server.listen(PORT, () => console.log("[boot] listening on :" + PORT));
