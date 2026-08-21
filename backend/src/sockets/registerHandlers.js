import { registerRoomHandlers } from "../handlers/roomHandlers.js";
import { registerPlayerHandlers } from "../handlers/playerHandlers.js";
import { registerGameHandlers } from "../handlers/gameHandlers.js";
import { registerReactionHandlers } from "../handlers/reactionHandlers.js";
import { registerEventHandlers} from "../handlers/eventHandlers.js";

export function registerHandlers({
  socket,
  io,
  rooms,
  games,
  getEnrichedState,
  emitRoomState,
  logGameTransition,
  cancelPlayerLifecycleTimers,
  destroyRoom,
  cancelEmptyRoomTimer,
  schedulePlayerEviction,
  scheduleHostReassignment,
  scheduleEmptyRoomExpiration,
  playerReconnectGraceMs,
  gameUpdates,
  eventVoting,
}) {
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
    logGameTransition,
    cancelPlayerLifecycleTimers,
    cancelEmptyRoomTimer,
    schedulePlayerEviction,
    scheduleHostReassignment,
    scheduleEmptyRoomExpiration,
    playerReconnectGraceMs,
  });

  registerGameHandlers({
    socket,
    io,
    rooms,
    games,
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
}
