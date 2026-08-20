import { ServerEvents } from "../protocol/events.js";

// Host reconnect grace periods
const HOST_LOBBY_GRACE_MS = 3 * 60 * 1000;
const HOST_GAME_GRACE_MS = 10 * 60 * 1000;

// Regular player reconnect grace
const PLAYER_RECONNECT_GRACE_MS = 30 * 60 * 1000;

// How long an empty room may remain
const EMPTY_LOBBY_TTL_MS = 5 * 60 * 1000;
const EMPTY_GAME_TTL_MS = 15 * 60 * 1000;

// Absolute room lifetime
const MAX_LOBBY_LIFETIME_MS = 60 * 60 * 1000;
const MAX_GAME_LIFETIME_MS = 4 * 60 * 60 * 1000;

// How often to check absolute room lifetime
const ROOM_SWEEP_INTERVAL_MS = 60 * 1000;

export function createRoomLifecycle({
  io,
  rooms,
  emitRoomState,
  logGameTransition,
  eventVoting,
  gameUpdates,
}) {
  // These Maps belong only to this lifecycle service.
  const playerEvictionTimers = new Map();
  const hostGraceTimers = new Map();
  const emptyRoomTimers = new Map();

  let roomLifetimeSweep = null;

  function playerLifecycleKey(code, playerOrKey) {
    const identity =
      typeof playerOrKey === "string"
        ? playerOrKey
        : playerOrKey?.key || playerOrKey?.id;

    return `${code}:${identity}`;
  }

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

  function clearRoomAuxiliaryState(code) {
    // Voting state is owned by eventVoting.
    eventVoting.clearRoom(code);

    // Game history is owned by gameUpdates.
    gameUpdates.clear(code);

    // Empty-room expiration timer
    clearTimerFromMap(emptyRoomTimers, code);

    // Player eviction timers
    for (const [key, timer] of playerEvictionTimers) {
      if (key.startsWith(`${code}:`)) {
        clearTimeout(timer);
        playerEvictionTimers.delete(key);
      }
    }

    // Host grace timers
    for (const [key, timer] of hostGraceTimers) {
      if (key.startsWith(`${code}:`)) {
        clearTimeout(timer);
        hostGraceTimers.delete(key);
      }
    }
  }

  function destroyRoom(code, reason = "expired") {
    const room = rooms.getRoom(code);

    if (!room) {
      return false;
    }

    io.to(code).emit(ServerEvents.ROOM_EXPIRED, {
      code,
      reason,
    });

    clearRoomAuxiliaryState(code);

    rooms.destroyRoom(code);

    // Remove connected sockets from the
    // Socket.IO room as well.
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

    // Someone is still connected.
    if (connectedPlayers.length > 0) {
      cancelEmptyRoomTimer(code);
      return;
    }

    // Don't schedule the same expiration twice.
    if (emptyRoomTimers.has(code)) {
      return;
    }

    const ttl =
      room.phase === "playing" ? EMPTY_GAME_TTL_MS : EMPTY_LOBBY_TTL_MS;

    const timer = setTimeout(() => {
      emptyRoomTimers.delete(code);

      const latestRoom = rooms.getRoom(code);

      if (!latestRoom) return;

      const anyoneConnected = [...latestRoom.players.values()].some(
        (player) => player.connected,
      );

      // Someone came back before timeout.
      if (anyoneConnected) {
        return;
      }

      destroyRoom(code, "empty_room_timeout");
    }, ttl);

    emptyRoomTimers.set(code, timer);
  }

  function schedulePlayerEviction(code, player) {
    const identity = player?.key || player?.id;

    if (!identity) return;

    const timerKey = playerLifecycleKey(code, identity);

    // Replace an existing timer if needed.
    clearTimerFromMap(playerEvictionTimers, timerKey);

    const timer = setTimeout(() => {
      playerEvictionTimers.delete(timerKey);

      const room = rooms.getRoom(code);

      if (!room) return;

      // Find player using persistent
      // reconnect identity when available.
      const currentPlayer = player.key
        ? [...room.players.values()].find((item) => item.key === player.key)
        : room.players.get(player.id);

      // Player already returned or
      // no longer exists.
      if (!currentPlayer || currentPlayer.connected) {
        return;
      }

      const result = player.key
        ? rooms.removePlayerByKey(code, player.key)
        : rooms.removePlayer(code, player.id);

      if (!result?.ok) {
        return;
      }

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

      const disconnectedHost = player.key
        ? [...latestRoom.players.values()].find(
            (item) => item.key === player.key,
          )
        : latestRoom.players.get(player.id);

      // Original host returned before
      // their grace period expired.
      if (disconnectedHost?.connected) {
        return;
      }

      const result = rooms.reassignHost(code);

      if (!result?.ok) {
        return;
      }

      emitRoomState(code);

      if (result.hostAssigned) {
        io.to(code).emit(ServerEvents.HOST_CHANGED, {
          hostId: result.hostId,
        });
      }
    }, graceMs);

    hostGraceTimers.set(timerKey, timer);
  }

  function startRoomLifetimeSweep() {
    // Prevent accidentally creating
    // multiple sweep intervals.
    if (roomLifetimeSweep) {
      return;
    }

    roomLifetimeSweep = setInterval(() => {
      const now = Date.now();

      for (const code of rooms.listCodes()) {
        const room = rooms.getRoom(code);

        if (!room) {
          continue;
        }

        const isPlaying = room.phase === "playing";

        const referenceTime = isPlaying
          ? Number(room.startedAt || room.createdAt || now)
          : Number(room.createdAt || now);

        const maxLifetime = isPlaying
          ? MAX_GAME_LIFETIME_MS
          : MAX_LOBBY_LIFETIME_MS;

        const age = now - referenceTime;

        if (age >= maxLifetime) {
          destroyRoom(
            code,
            isPlaying ? "max_game_lifetime" : "max_lobby_lifetime",
          );
        }
      }
    }, ROOM_SWEEP_INTERVAL_MS);

    roomLifetimeSweep.unref?.();
  }

  function stopRoomLifetimeSweep() {
    if (!roomLifetimeSweep) {
      return;
    }

    clearInterval(roomLifetimeSweep);

    roomLifetimeSweep = null;
  }

  return {
    cancelPlayerLifecycleTimers,
    cancelEmptyRoomTimer,

    schedulePlayerEviction,
    scheduleHostReassignment,
    scheduleEmptyRoomExpiration,

    destroyRoom,

    startRoomLifetimeSweep,
    stopRoomLifetimeSweep,

    playerReconnectGraceMs: PLAYER_RECONNECT_GRACE_MS,
  };
}
