import crypto from "crypto";

import {
  ClientEvents,
  ServerEvents,
} from "../protocol/events.js";

import { ErrorCodes } from "../protocol/errors.js";

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
  socket.on(
    ClientEvents.PLAYER_JOIN,
    (
      {
        roomCode,
        displayName,
        reconnectToken,
      },
      cb,
    ) => {
      try {
        const code = normalizeRoomCode(roomCode);

        const exists = rooms.getPublicState(code);

        if (!exists) {
          return cb?.({
            ok: false,
            error: ErrorCodes.ROOM_NOT_FOUND,
          });
        }

        const safeName =
          normalizeDisplayName(displayName);

        const playerKey =
          reconnectToken || crypto.randomUUID();

        socket.data.displayName = safeName;

        const result = rooms.addPlayer(code, {
          id: socket.id,
          displayName: safeName,
          key: playerKey,
        });

        if (!result.ok) {
          return cb?.(result);
        }

        cancelPlayerLifecycleTimers(
          code,
          playerKey,
        );

        cancelEmptyRoomTimer(code);

        socket.data.roomCode = code;
        socket.join(code);

        const joinedRoom = rooms.getRoom(code);

        if (
          joinedRoom &&
          !joinedRoom.hostId &&
          !joinedRoom.hostKey
        ) {
          rooms.reassignHost(code);
        }

        const state = emitRoomState(code);

        logGameTransition("PLAYER_JOINED", {
          roomCode: code,
          playerId: socket.id,
          playerName: safeName,
          playerCount:
            state?.players?.length ?? null,
        });

        return cb?.({
          ok: true,
          state,
          reconnectToken: playerKey,
        });
      } catch (err) {
        console.error("[join] error:", err);

        return cb?.({
          ok: false,
          error: ErrorCodes.JOIN_FAILED,
        });
      }
    },
  );

  // Resume previous player
  socket.on(
    ClientEvents.PLAYER_RESUME,
    (
      {
        roomCode,
        displayName,
        reconnectToken,
      },
      cb,
    ) => {
      if (!reconnectToken) {
        return cb?.({
          ok: false,
          error:
            ErrorCodes.MISSING_RECONNECT_TOKEN,
        });
      }

      const code = normalizeRoomCode(roomCode);

      const safeName =
        normalizeDisplayName(displayName);

      socket.data.displayName = safeName;

      const result = rooms.resumePlayer(code, {
        newSocketId: socket.id,
        displayName: safeName,
        key: reconnectToken,
      });

      if (!result.ok) {
        return cb?.(result);
      }

      cancelPlayerLifecycleTimers(
        code,
        reconnectToken,
      );

      cancelEmptyRoomTimer(code);

      const roomAfterResume =
        rooms.getRoom(code);

      if (
        roomAfterResume &&
        !roomAfterResume.hostId &&
        !roomAfterResume.hostKey
      ) {
        rooms.reassignHost(code);
      }

      socket.data.roomCode = code;
      socket.join(code);

      logGameTransition("PLAYER_RESUMED", {
        roomCode: code,
        playerId: socket.id,
        playerName: safeName,
        phase: roomAfterResume?.phase,
        wasHost:
          roomAfterResume?.hostId === socket.id,
      });

      io.to(socket.id).emit(
        ServerEvents.HAND_UPDATE,
        result.hand || [],
      );

      io.to(socket.id).emit(
        ServerEvents.SCORE_UPDATE,
        result.score ?? 0,
      );

      const state = emitRoomState(code);

      return cb?.({
        ok: true,
        state,
      });
    },
  );

  // Presence / activity heartbeat
  socket.on(ClientEvents.PLAYER_ACTIVITY, () => {
    const code = socket.data.roomCode;

    if (!code) return;

    const room = rooms.getRoom?.(code);

    if (!room) return;

    const player =
      room.players.get(socket.id);

    if (!player) return;

    player.lastActiveAt = Date.now();
    player.isActive = true;

    emitRoomState(code);
  });

  // Temporary disconnect
  socket.on("disconnect", () => {
    const code = socket.data.roomCode;

    if (!code) return;

    const room = rooms.getRoom(code);

    if (!room) return;

    const player =
      room.players.get(socket.id);

    if (!player) return;

    const playerSnapshot = {
      id: player.id,
      key: player.key,
      joinedAt: player.joinedAt,
    };

    const wasHost =
      room.hostId === socket.id ||
      (
        !!room.hostKey &&
        !!player.key &&
        room.hostKey === player.key
      );

    rooms.handleDisconnect(
      code,
      socket.id,
    );

    logGameTransition(
      "PLAYER_DISCONNECTED",
      {
        roomCode: code,
        playerId: socket.id,
        wasHost,
        phase: room.phase,
        reconnectGraceMs:
          playerReconnectGraceMs,
      },
    );

    schedulePlayerEviction(
      code,
      playerSnapshot,
    );

    if (wasHost) {
      scheduleHostReassignment(
        code,
        playerSnapshot,
      );
    }

    scheduleEmptyRoomExpiration(code);

    emitRoomState(code);
  });
}