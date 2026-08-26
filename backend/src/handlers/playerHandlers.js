import crypto from "crypto";

import { ClientEvents, ServerEvents } from "../protocol/events.js";
import { getRequestId, withRequestId } from "../protocol/requestId.js";
import { ErrorCodes } from "../protocol/errors.js";
import {
  beginRequest,
  completeRequest,
  abandonRequest,
} from "../protocol/idempotency.js";
import {
  normalizeRoomCode,
  normalizeDisplayName,
} from "../protocol/validation.js";

export function registerPlayerHandlers({
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
  playerReconnectGraceMs,
}) {
  // Join room
  socket.on(ClientEvents.PLAYER_JOIN, (payload = {}, cb) => {
    const requestId = getRequestId(payload);

    const { roomCode, displayName } = payload;

    let request = null;

    try {
      const code = normalizeRoomCode(roomCode);

      const exists = rooms.getPublicState(code);

      if (!exists) {
        return cb?.(
          withRequestId(requestId, {
            ok: false,
            error: ErrorCodes.ROOM_NOT_FOUND,
          }),
        );
      }

      request = beginRequest({
        scope: socket.id,
        eventName: ClientEvents.PLAYER_JOIN,
        requestId,
      });

      if (request.status === "duplicate") {
        return cb?.(request.response);
      }

      if (request.status === "pending") {
        return cb?.(
          withRequestId(requestId, {
            ok: false,
            error: ErrorCodes.REQUEST_IN_PROGRESS,
          }),
        );
      }

      const finish = (response) => {
        const finalResponse = withRequestId(requestId, response);

        completeRequest(request.key, finalResponse);

        return cb?.(finalResponse);
      };

      const safeName = normalizeDisplayName(displayName);

      const reconnectToken = crypto.randomUUID();

      socket.data.displayName = safeName;

      const result = rooms.addPlayer(code, {
        socketId: socket.id,
        displayName: safeName,
        reconnectToken,
      });

      if (!result.ok) {
        return finish(result);
      }

      socket.data.playerId = result.playerId;

      cancelPlayerLifecycleTimers(code, result.playerId);

      cancelEmptyRoomTimer(code);

      socket.data.roomCode = code;

      socket.join(code);

      const joinedRoom = rooms.getRoom(code);

      if (!joinedRoom.hostId) {
        rooms.reassignHost(code);
      }

      const state = emitRoomState(code);

      logGameTransition("PLAYER_JOINED", {
        roomCode: code,
        playerId: result.playerId,
        socketId: socket.id,
        playerName: safeName,
        playerCount: state?.players?.length ?? null,
      });

      return finish({
        ok: true,
        state,
        playerId: result.playerId,
        reconnectToken,
      });
    } catch (err) {
      abandonRequest(request?.key);

      console.error("[join] error", err);

      return cb?.(
        withRequestId(requestId, {
          ok: false,
          error: ErrorCodes.JOIN_FAILED,
        }),
      );
    }
  });

  // Resume previous player
  socket.on(
    ClientEvents.PLAYER_RESUME,
    ({ roomCode, displayName, reconnectToken }, cb) => {
      if (!reconnectToken) {
        return cb?.({
          ok: false,
          error: ErrorCodes.MISSING_RECONNECT_TOKEN,
        });
      }

      const code = normalizeRoomCode(roomCode);

      const safeName = normalizeDisplayName(displayName);

      socket.data.displayName = safeName;

      const result = rooms.resumePlayer(code, {
        newSocketId: socket.id,
        displayName: safeName,
        reconnectToken,
      });

      if (!result.ok) {
        return cb?.(result);
      }

      socket.data.playerId = result.playerId;

      cancelPlayerLifecycleTimers(code, result.playerId);

      cancelEmptyRoomTimer(code);

      const roomAfterResume = rooms.getRoom(code);

      if (roomAfterResume && !roomAfterResume.hostId) {
        rooms.reassignHost(code);
      }

      socket.data.roomCode = code;
      socket.join(code);

      logGameTransition("PLAYER_RESUMED", {
        roomCode: code,
        playerId: result.playerId,
        playerName: safeName,
        phase: roomAfterResume?.phase,
        wasHost: roomAfterResume?.hostId === result.playerId,
      });

      io.to(socket.id).emit(ServerEvents.HAND_UPDATE, result.hand || []);

      io.to(socket.id).emit(ServerEvents.SCORE_UPDATE, result.score ?? 0);

      const state = emitRoomState(code);

      return cb?.({
        ok: true,
        playerId: result.playerId,
        state,
      });
    },
  );

  // Presence / activity heartbeat
  socket.on(ClientEvents.PLAYER_ACTIVITY, () => {
    const code = socket.data.roomCode;

    const playerId = socket.data.playerId;

    if (!code || !playerId) {
      return;
    }

    const player = rooms.getPlayerByPlayerId(code, playerId);

    if (!player) {
      return;
    }

    player.lastActiveAt = Date.now();

    player.isActive = true;

    emitRoomState(code);
  });
  // Temporary disconnect
  socket.on("disconnect", () => {
    const code = socket.data.roomCode;

    const playerId = socket.data.playerId;

    if (!code || !playerId) {
      return;
    }

    const room = rooms.getRoom(code);

    if (!room) {
      return;
    }

    const player = rooms.getPlayerByPlayerId(code, playerId);

    if (!player) {
      return;
    }

    const playerSnapshot = {
      id: player.id,

      socketId: player.socketId ?? socket.id,

      joinedAt: player.joinedAt,
    };

    const wasHost = room.hostId === playerId;

    rooms.handleDisconnect(code, playerId);

    logGameTransition("PLAYER_DISCONNECTED", {
      roomCode: code,

      playerId,

      socketId: socket.id,

      wasHost,

      phase: room.phase,

      reconnectGraceMs: playerReconnectGraceMs,
    });

    schedulePlayerEviction(code, playerSnapshot);

    if (wasHost) {
      scheduleHostReassignment(code, playerSnapshot);
    }

    scheduleEmptyRoomExpiration(code);

    emitRoomState(code);
  });
}
