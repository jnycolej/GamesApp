import crypto from "crypto";

import {
  ClientEvents,
  ServerEvents,
} from "../protocol/events.js";

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
  socket.on(
    ClientEvents.ROOM_CREATE,
    ({ gameType, displayName, matchup }, cb) => {
      try {
        const reconnectToken = crypto.randomUUID();

        const { code, token } = rooms.createRoom({
          creatorSocketId: socket.id,
          gameType,
          matchup: matchup ?? null,
          hostKey: reconnectToken,
        });

        if (!code) {
          throw new Error(ErrorCodes.CREATE_FAILED);
        }

        console.log(
          "[create] room code:",
          code,
          "gameType:",
          gameType,
        );

        socket.data.roomCode = code;
        socket.join(code);

        const safeName = normalizeDisplayName(
          displayName,
          "Host",
        );

        socket.data.displayName = safeName;

        const add = rooms.addPlayer(code, {
          id: socket.id,
          displayName: safeName,
          key: reconnectToken,
        });

        if (!add.ok) {
          console.warn(
            ErrorCodes.ADD_PLAYER_FAILED,
            add,
          );

          return cb?.(
            add || {
              ok: false,
              error: ErrorCodes.ADD_PLAYER_FAILED,
            },
          );
        }

        const state = emitRoomState(code);

        logGameTransition("ROOM_CREATED", {
          roomCode: code,
          gameType,
          hostId: socket.id,
          phase: "lobby",
          matchup: matchup ?? null,
        });

        return cb?.({
          ok: true,
          roomCode: code,
          token,
          reconnectToken,
          state,
        });
      } catch (err) {
        console.error("[create] error:", err);

        return cb?.({
          ok: false,
          error: ErrorCodes.CREATE_FAILED,
        });
      }
    },
  );

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
  socket.on(ClientEvents.ROOM_LEAVE, (cb) => {
    try {
      const code = socket.data.roomCode;

      if (!code) {
        return cb?.({
          ok: false,
          error: ErrorCodes.NOT_IN_ROOM,
        });
      }

      const room = rooms.getRoom(code);

      if (!room) {
        socket.data.roomCode = undefined;
        socket.leave(code);

        return cb?.({
          ok: false,
          error: ErrorCodes.ROOM_NOT_FOUND,
        });
      }

      const player = room.players.get(socket.id);

      if (!player) {
        return cb?.({
          ok: false,
          error: ErrorCodes.PLAYER_NOT_FOUND,
        });
      }

      const playerKey = player.key;

      cancelPlayerLifecycleTimers(
        code,
        playerKey || socket.id,
      );

      const result = rooms.removePlayer(
        code,
        socket.id,
        {
          reassignHostIfNeeded: true,
        },
      );

      if (!result.ok) {
        return cb?.(result);
      }

      socket.leave(code);
      socket.data.roomCode = undefined;

      logGameTransition("PLAYER_LEFT", {
        roomCode: code,
        playerId: socket.id,
        wasHost: result.wasHost,
        remainingPlayers: room.players.size,
      });

      socket.to(code).emit(
        ServerEvents.PLAYER_LEFT,
        {
          playerId: socket.id,
        },
      );

      if (result.roomEmpty) {
        destroyRoom(code, "last_player_left");

        return cb?.({
          ok: true,
          roomClosed: true,
        });
      }

      emitRoomState(code);

      if (
        result.wasHost &&
        result.hostResult?.hostAssigned
      ) {
        io.to(code).emit(
          ServerEvents.HOST_CHANGED,
          {
            hostId: result.hostResult.hostId,
          },
        );
      }

      return cb?.({
        ok: true,
        roomClosed: false,
      });
    } catch (err) {
      console.error("[leaveRoom] error:", err);

      return cb?.({
        ok: false,
        error: ErrorCodes.LEAVE_FAILED,
      });
    }
  });
}