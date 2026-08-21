import { ServerEvents } from "../protocol/events.js";

const IDLE_TIMEOUT_MS = 20_000;

export function createRoomState({ io, rooms, games }) {
  function updateIdleStatesForCode(code) {
    const room = rooms.getRoom?.(code);

    if (!room || !room.players) {
      return;
    }

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

    const base =
      (typeof rooms.safePublicState === "function" &&
        rooms.safePublicState(code)) ||
      rooms.getPublicState(code);

    if (!base) {
      return null;
    }

    const players = Array.isArray(base.players)
      ? base.players
          .filter((player) => player && typeof player === "object" && player.id)
          .map((player) => {
            // Prefer score, but tolerate
            // the older points property.
            const directScore =
              typeof player.score === "number" && Number.isFinite(player.score)
                ? player.score
                : typeof player.points === "number" &&
                    Number.isFinite(player.points)
                  ? player.points
                  : undefined;

            const score =
              directScore ?? Number(games.getScore(code, player.id) ?? 0);

            // Keep points temporarily
            // for existing web UI
            // compatibility.
            return {
              ...player,
              score,
              points: score,
            };
          })
      : [];

    let leaderIds = [];

    if (players.length > 0) {
      const maxScore = Math.max(
        ...players.map((player) =>
          Number.isFinite(player.score) ? player.score : 0,
        ),
      );

      leaderIds = players
        .filter((player) => (player.score ?? 0) === maxScore)
        .map((player) => player.id);
    }

    return {
      ...base,
      players,
      leaderIds,
      updatedAt: Date.now(),
    };
  }

  function emitRoomState(code) {
    const state = getEnrichedState(code);

    if (!state) {
      return null;
    }

    io.to(code).emit(ServerEvents.ROOM_UPDATED, state);

    return state;
  }

  return {
    updateIdleStatesForCode,
    getEnrichedState,
    emitRoomState,
  };
}
