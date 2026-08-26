import crypto from "crypto";

import { ClientEvents, ServerEvents } from "../protocol/events.js";
import { getRequestId, withRequestId } from "../protocol/requestId.js";
import { beginRequest, completeRequest } from "../protocol/idempotency.js";
import { ErrorCodes } from "../protocol/errors.js";
import { normalizeDisplayName } from "../protocol/validation.js";

export function registerRoomHandlers({
  socket,
  io,
  rooms,
  getEnrichedState,
  emitRoomState,
  logGameTransition,
  cancelPlayerLifecycleTimers,
  destroyRoom,
}) {
  // Create room
  socket.on(ClientEvents.ROOM_CREATE, (payload = {}, cb) => {
    const requestId = getRequestId(payload);

    const { gameType, displayName, matchup } = payload;

    const request = beginRequest({
      scope: socket.id,
      eventName: ClientEvents.ROOM_CREATE,
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

    try {
      const reconnectToken = crypto.randomUUID();

      const { code, token } = rooms.createRoom({
        gameType,
        matchup: matchup ?? null,
      });

      if (!code) {
        return finish({
          ok: false,
          error: ErrorCodes.CREATE_FAILED,
        });
      }

      console.log("[create] room code:", code, "gameType:", gameType);

      socket.data.roomCode = code;
      socket.join(code);

      const safeName = normalizeDisplayName(displayName, "Host");

      socket.data.displayName = safeName;

      const add = rooms.addPlayer(code, {
        socketId: socket.id,
        displayName: safeName,
        reconnectToken,
      });

      if (!add.ok) {
        console.warn(ErrorCodes.ADD_PLAYER_FAILED, add);

        return finish(
          add || {
            ok: false,
            error: ErrorCodes.ADD_PLAYER_FAILED,
          },
        );
      }

      socket.data.playerId = add.playerId;

      const state = emitRoomState(code);

      logGameTransition("ROOM_CREATED", {
        roomCode: code,
        gameType,
        hostId: add.playerId,
        socketId: socket.id,
        phase: "lobby",
        matchup: matchup ?? null,
      });

      return finish({
        ok: true,
        roomCode: code,
        playerId: add.playerId,
        token,
        reconnectToken,
        state,
      });
    } catch (err) {
      console.error("[create] error:", err);

      return finish({
        ok: false,
        error: ErrorCodes.CREATE_FAILED,
      });
    }
  });

  // Get current room
  socket.on(ClientEvents.ROOM_GET, (_, cb) => {
    const code = socket.data.roomCode;

    if (!code) {
      return cb?.({
        ok: false,
        error: ErrorCodes.NOT_IN_ROOM,
      });
    }

    return cb?.({
      ok: true,
      state: getEnrichedState(code),
    });
  });

  // Intentionally leave room
  socket.on(ClientEvents.ROOM_LEAVE, (payloadOrCb = {}, maybeCb) => {
    const payload = typeof payloadOrCb === "function" ? {} : payloadOrCb;

    const cb = typeof payloadOrCb === "function" ? payloadOrCb : maybeCb;

    const requestId = getRequestId(payload);

    const request = beginRequest({
      scope: socket.id,
      eventName: ClientEvents.ROOM_LEAVE,
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

    try {
      const code = socket.data.roomCode;

      const playerId = socket.data.playerId;

      if (!code) {
        return finish({
          ok: false,
          error: ErrorCodes.NOT_IN_ROOM,
        });
      }

      if (!playerId) {
        return finish({
          ok: false,
          error: ErrorCodes.PLAYER_NOT_FOUND,
        });
      }

      const room = rooms.getRoom(code);

      if (!room) {
        socket.data.roomCode = undefined;

        socket.data.playerId = undefined;

        socket.leave(code);

        return finish({
          ok: false,
          error: ErrorCodes.ROOM_NOT_FOUND,
        });
      }

      const player = rooms.getPlayerByPlayerId(code, playerId);

      if (!player) {
        return finish({
          ok: false,
          error: ErrorCodes.PLAYER_NOT_FOUND,
        });
      }

      cancelPlayerLifecycleTimers(code, playerId);

      const result = rooms.removePlayer(code, playerId, {
        reassignHostIfNeeded: true,
      });

      if (!result.ok) {
        return finish(result);
      }

      socket.leave(code);

      socket.data.roomCode = undefined;

      socket.data.playerId = undefined;

      logGameTransition("PLAYER_LEFT", {
        roomCode: code,
        playerId,
        socketId: socket.id,
        wasHost: result.wasHost,
        remainingPlayers: room.players.size,
      });

      socket.to(code).emit(ServerEvents.PLAYER_LEFT, {
        playerId,
      });

      if (result.roomEmpty) {
        destroyRoom(code, "last_player_left");

        return finish({
          ok: true,
          roomClosed: true,
        });
      }

      emitRoomState(code);

      if (result.wasHost && result.hostResult?.hostAssigned) {
        io.to(code).emit(ServerEvents.HOST_CHANGED, {
          hostId: result.hostResult.hostId,
        });
      }

      return finish({
        ok: true,
        roomClosed: false,
      });
    } catch (err) {
      console.error("[leaveRoom] error:", err);

      return finish({
        ok: false,
        error: ErrorCodes.LEAVE_FAILED,
      });
    }
  });
}
