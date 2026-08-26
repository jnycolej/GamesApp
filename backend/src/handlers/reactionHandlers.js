import { ClientEvents, ServerEvents } from "../protocol/events.js";
import { withRequestId, getRequestId } from "../protocol/requestId.js";
import { ErrorCodes } from "../protocol/errors.js";
import {
  beginRequest,
  completeRequest,
  abandonRequest,
} from "../protocol/idempotency.js";

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
    const requestId = getRequestId(payload);

    let request = null;

    try {
      const code = socket.data.roomCode;

      const playerId = socket.data.playerId;

      if (!code) {
        return ack?.(
          withRequestId(requestId, {
            ok: false,
            error: ErrorCodes.NOT_IN_ROOM,
          }),
        );
      }

      if (!playerId) {
        return ack?.(
          withRequestId(requestId, {
            ok: false,
            error: ErrorCodes.PLAYER_NOT_FOUND,
          }),
        );
      }

      request = beginRequest({
        scope: playerId,
        eventName: ClientEvents.REACTION_SEND,
        requestId,
      });

      if (request.status === "duplicate") {
        return ack?.(request.response);
      }

      if (request.status === "pending") {
        return ack?.(
          withRequestId(requestId, {
            ok: false,
            error: ErrorCodes.REQUEST_IN_PROGRESS,
          }),
        );
      }

      const finish = (response) => {
        const finalResponse = withRequestId(requestId, response);

        completeRequest(request.key, finalResponse);

        return ack?.(finalResponse);
      };

      const state = getEnrichedState(code);

      if (!state) {
        return finish({
          ok: false,
          error: ErrorCodes.ROOM_NOT_FOUND,
        });
      }

      const player =
        state.players?.find((item) => item.id === playerId) || null;

      if (!player) {
        return finish({
          ok: false,
          error: ErrorCodes.PLAYER_NOT_FOUND,
        });
      }

      const now = Date.now();

      const lockKey = `${code}:${playerId}`;

      const lockedUntil = reactionCooldownByPlayer.get(lockKey) || 0;

      if (now < lockedUntil) {
        abandonRequest(request.key);

        return ack?.(
          withRequestId(requestId, {
            ok: false,
            error: ErrorCodes.REACTION_COOLDOWN,
            until: lockedUntil,
          }),
        );
      }

      const reactionKey = String(payload?.key || "").trim();

      const reactionLabel = allowedReactions[reactionKey];

      if (!reactionKey || !reactionLabel) {
        return finish({
          ok: false,
          error: ErrorCodes.INVALID_REACTION,
        });
      }

      reactionCooldownByPlayer.set(lockKey, now + REACTION_COOLDOWN_MS);

      const reaction = {
        id: `${code}-${playerId}-${now}-${Math.random().toString(16).slice(2)}`,

        roomCode: code,
        playerId,

        playerName: player.displayName || player.name || "Player",

        reactionKey,
        reactionLabel,
        createdAt: now,
      };

      io.to(code).emit(ServerEvents.REACTION_SHOW, reaction);

      return finish({
        ok: true,
        reactionId: reaction.id,
      });
    } catch (err) {
      abandonRequest(request?.key);

      console.error("[reaction:send] error", err);

      return ack?.(
        withRequestId(requestId, {
          ok: false,
          error: ErrorCodes.SERVER_ERROR,
        }),
      );
    }
  });
}
