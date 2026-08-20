import { ClientEvents, ServerEvents } from "../protocol/events.js";

import { ErrorCodes } from "../protocol/errors.js";

const REACTION_COOLDOWN_MS = 1200;

const reactionCooldownByPlayer = new Map();

const allowedReactions = Object.freeze({
  nice: "🔥 Nice!",
  lucky: "😂 Lucky",
  rigged: "😤 Rigged",
  brutal: "💀 Brutal",
});

export function registerReactionHandlers({ socket, io, getEnrichedState }) {
  socket.on(ClientEvents.REACTION_SEND, (payload = {}, ack) => {
    try {
      const code = socket.data.roomCode;

      if (!code) {
        return ack?.({
          ok: false,
          error: ErrorCodes.NOT_IN_ROOM,
        });
      }

      const state = getEnrichedState(code);

      if (!state) {
        return ack?.({
          ok: false,
          error: ErrorCodes.ROOM_NOT_FOUND,
        });
      }

      const player =
        state.players?.find((item) => item.id === socket.id) || null;

      if (!player) {
        return ack?.({
          ok: false,
          error: ErrorCodes.PLAYER_NOT_FOUND,
        });
      }

      const now = Date.now();

      const lockKey = `${code}:${socket.id}`;

      const lockedUntil = reactionCooldownByPlayer.get(lockKey) || 0;

      if (now < lockedUntil) {
        return ack?.({
          ok: false,
          error: ErrorCodes.REACTION_COOLDOWN,
          until: lockedUntil,
        });
      }

      reactionCooldownByPlayer.set(lockKey, now + REACTION_COOLDOWN_MS);

      const reactionKey = String(payload?.key || "").trim();

      const reactionLabel = allowedReactions[reactionKey];

      if (!reactionKey || !reactionLabel) {
        return ack?.({
          ok: false,
          error: ErrorCodes.INVALID_REACTION,
        });
      }

      const reaction = {
        id: `${code}-${socket.id}-${now}-${Math.random()
          .toString(16)
          .slice(2)}`,

        roomCode: code,
        playerId: socket.id,

        playerName: player.displayName || player.name || "Player",

        reactionKey,
        reactionLabel,
        createdAt: now,
      };

      io.to(code).emit(ServerEvents.REACTION_SHOW, reaction);

      return ack?.({
        ok: true,
        reactionId: reaction.id,
      });
    } catch (err) {
      console.error("[reaction:send] error", err);

      return ack?.({
        ok: false,
        error: ErrorCodes.SERVER_ERROR,
      });
    }
  });
}
