import { ClientEvents, ServerEvents } from "../protocol/events.js";

import { ErrorCodes } from "../protocol/errors.js";
import {
  beginRequest,
  completeRequest,
  abandonRequest,
} from "../protocol/idempotency.js";

import { getRequestId, withRequestId } from "../protocol/requestId.js";

const ACTION_LOCK_MS = 300;

const actionLockUntil = new Map();
const actionLock = new Map();

function withPlayerLock(code, playerId, operation) {
  const key = `${code}:${playerId}`;

  if (actionLock.get(key)) {
    return {
      ok: false,
      error: ErrorCodes.ACTION_IN_PROGRESS,
    };
  }

  actionLock.set(key, true);

  try {
    return operation();
  } finally {
    actionLock.set(key, false);
  }
}

export function registerGameHandlers({
  socket,
  io,
  rooms,
  games,
  gameUpdates,
  emitRoomState,
  logGameTransition,
}) {
  // Start game and deal
  // Start game and deal
  socket.on(ClientEvents.GAME_START_AND_DEAL, async (payload = {}, cb) => {
    const requestId = getRequestId(payload);

    const code = socket.data.roomCode;

    const playerId = socket.data.playerId;

    if (!code) {
      return cb?.(
        withRequestId(requestId, {
          ok: false,
          error: ErrorCodes.NOT_IN_ROOM,
        }),
      );
    }

    if (!playerId) {
      return cb?.(
        withRequestId(requestId, {
          ok: false,
          error: ErrorCodes.PLAYER_NOT_FOUND,
        }),
      );
    }

    const request = beginRequest({
      scope: playerId,
      eventName: ClientEvents.GAME_START_AND_DEAL,
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

    const result = games.startAndDeal(code, playerId);

    if (!result.ok) {
      return finish(result);
    }

    const room = rooms.getRoom(code);

    logGameTransition("GAME_STARTED", {
      roomCode: code,
      playerId,
      socketId: socket.id,
      gameType: room?.gameType,
      playerCount: room?.players?.size ?? 0,
      phase: room?.phase,
      version: result.version,
    });

    finish({
      ok: true,
      stateVersion: result.version,
    });

    emitRoomState(code);

    const socketsInRoom = await io.in(code).fetchSockets();

    for (const playerSocket of socketsInRoom) {
      const socketPlayerId =
        playerSocket.data?.playerId ??
        rooms.getPlayerBySocketId(code, playerSocket.id)?.id;

      if (!socketPlayerId) {
        continue;
      }

      io.to(playerSocket.id).emit(
        ServerEvents.HAND_UPDATE,
        games.getHand(code, socketPlayerId) || [],
      );

      io.to(playerSocket.id).emit(
        ServerEvents.SCORE_UPDATE,
        games.getScore(code, socketPlayerId) ?? 0,
      );
    }
  });

  // Play card
  socket.on(ClientEvents.GAME_PLAY_CARD, (payload = {}, cb) => {
    const requestId = getRequestId(payload);

    const { index, cardId } = payload;

    const code = socket.data.roomCode;

    const playerId = socket.data.playerId;

    if (!code) {
      return cb?.(
        withRequestId(requestId, {
          ok: false,
          error: ErrorCodes.NOT_IN_ROOM,
        }),
      );
    }
    if (!playerId) {
      return cb?.(
        withRequestId(requestId, {
          ok: false,
          error: ErrorCodes.PLAYER_NOT_FOUND,
        }),
      );
    }

    const request = beginRequest({
      scope: playerId,
      eventName: ClientEvents.GAME_PLAY_CARD,
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

    const now = Date.now();

    if ((actionLockUntil.get(playerId) || 0) > now) {
      abandonRequest(request.key);

      return cb?.(
        withRequestId(requestId, {
          ok: false,
          error: ErrorCodes.LOCKED,
        }),
      );
    }

    const result = withPlayerLock(code, playerId, () => {
      const previousScore = games.getScore(code, playerId) ?? 0;

      const playResult = cardId
        ? games.playCardById(code, playerId, cardId)
        : games.playCard(code, playerId, index);

      if (!playResult.ok) {
        return playResult;
      }

      const nextScore = playResult.score ?? games.getScore(code, playerId) ?? 0;

      const delta = nextScore - previousScore;

      const playedCard = playResult.playedCard;

      io.to(socket.id).emit(ServerEvents.HAND_UPDATE, playResult.hand || []);

      io.to(socket.id).emit(ServerEvents.SCORE_UPDATE, nextScore);

      socket.to(code).emit(ServerEvents.PLAYER_UPDATED, {
        playerId,
        handCount: playResult.hand?.length ?? 0,
        score: nextScore,
      });

      const state = emitRoomState(code);

      const actor =
        state?.players?.find((player) => player.id === playerId) || {};

      const actorName = actor.displayName || actor.name || "Player";

      const update = gameUpdates.pushUpdate(code, {
        type: "CARD_PLAYED",

        player: {
          id: playerId,
          name: actorName,
        },

        card: playedCard
          ? {
              id: playedCard.id,
              name: playedCard.name,
              description:
                playedCard.description ?? playedCard.desc ?? playedCard.penalty,
              points:
                typeof playedCard.points === "number"
                  ? playedCard.points
                  : undefined,
            }
          : undefined,

        deltaPoints: Number(delta) || 0,

        meta: {
          index: typeof index === "number" ? index : undefined,
          cardId,
        },
      });

      io.to(code).emit(ServerEvents.GAME_UPDATE, update);

      logGameTransition("CARD_PLAYED", {
        roomCode: code,
        playerId: socket.data.playerId,
        socketId: socket.id,
        cardId: playedCard?.id ?? cardId ?? null,
        points: delta,
        scoreBefore: previousScore,
        scoreAfter: nextScore,
        stateVersion: playResult.version ?? null,
      });

      return {
        ok: true,
        newScore: nextScore,
        stateVersion: playResult.version,
      };
    });

    return finish(result);
  });

  // Own hand
  socket.on(ClientEvents.HAND_GET_MINE, (_, cb) => {
    const code = socket.data.roomCode;

    if (!code) {
      return cb?.({
        ok: false,
        error: ErrorCodes.NOT_IN_ROOM,
      });
    }

    return cb?.({
      ok: true,
      hand: games.getHand(code, socket.data.playerId) || [],
    });
  });

  // Own score
  socket.on(ClientEvents.SCORE_GET_MINE, (_, cb) => {
    const code = socket.data.roomCode;

    if (!code) {
      return cb?.({
        ok: false,
        error: ErrorCodes.NOT_IN_ROOM,
      });
    }

    return cb?.({
      ok: true,
      score: games.getScore(code, socket.data.playerId) ?? 0,
    });
  });

  // Opponent hands
  socket.on(ClientEvents.HAND_GET_OPPONENTS, (_, cb) => {
    const code = socket.data.roomCode;

    if (!code) {
      return cb?.({
        ok: false,
        error: ErrorCodes.NOT_IN_ROOM,
      });
    }

    const opponents = games.getOpponentsHands
      ? games.getOpponentsHands(code, socket.data.playerId)
      : null;

    if (opponents == null) {
      return cb?.({
        ok: false,
        error: ErrorCodes.ROOM_NOT_FOUND,
      });
    }

    return cb?.({
      ok: true,
      opponents,
    });
  });

  // Manual score adjustment
  socket.on(ClientEvents.SCORE_ADJUST, (payload = {}, ack) => {
    const requestId = getRequestId(payload);

    const { delta, meta } = payload;

    let request = null;

    try {
      const code = socket.data.roomCode;

      if (!code) {
        return ack?.(
          withRequestId(requestId, {
            ok: false,
            error: ErrorCodes.NOT_IN_ROOM,
          }),
        );
      }

      const playerId = socket.data.playerId;

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
        eventName: ClientEvents.SCORE_ADJUST,
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

      const value = Number(delta);

      const safeDelta = Number.isFinite(value) ? Math.trunc(value) : 0;

      if (safeDelta === 0) {
        return finish({
          ok: false,
          error: ErrorCodes.INVALID_DELTA,
        });
      }

      const oldScore = games.getScore(code, playerId) ?? 0;

      const result = games.adjustScore(code, playerId, safeDelta);

      if (!result || result.ok === false) {
        return finish({
          ok: false,
          error: result?.error || ErrorCodes.PLAYER_NOT_FOUND,
        });
      }

      const newScore = result.score;

      io.to(socket.id).emit(ServerEvents.SCORE_UPDATE, newScore);

      io.to(code).emit(ServerEvents.PLAYER_UPDATED, {
        playerId,
        score: newScore,
        points: newScore,
      });

      const state = emitRoomState(code);

      const actor =
        state?.players?.find((player) => player.id === playerId) || {};

      const actorName = actor.displayName || actor.name || "Player";

      const update = gameUpdates.pushUpdate(code, {
        type: "SCORE_ADJUSTED",

        player: {
          id: playerId,
          name: actorName,
        },

        deltaPoints: safeDelta,

        meta: meta ?? {},
      });

      io.to(code).emit(ServerEvents.GAME_UPDATE, update);

      logGameTransition("SCORE_ADJUSTED", {
        roomCode: code,
        playerId,
        delta: safeDelta,
        scoreBefore: oldScore,
        scoreAfter: newScore,
        source: meta?.source ?? "unknown",
      });

      return finish({
        ok: true,
        newScore,
        stateVersion: result.version ?? null,
      });
    } catch (err) {
      abandonRequest(request?.key);

      console.error("[score:adjust] error", err);

      return ack?.(
        withRequestId(requestId, {
          ok: false,
          error: ErrorCodes.SERVER_ERROR,
        }),
      );
    }
  });

  // Sacrifice card
  socket.on(ClientEvents.PLAYER_SACRIFICE, (payload = {}, ack) => {
    const requestId = getRequestId(payload);

    let request = null;

    try {
      const code = socket.data.roomCode;
      const playerId = socket.data.playerId;

      if (!playerId) {
        return ack?.(
          withRequestId(requestId, {
            ok: false,
            error: ErrorCodes.PLAYER_NOT_FOUND,
          }),
        );
      }
      const cardId = payload?.cardId;

      if (!code) {
        return ack?.(
          withRequestId(requestId, {
            ok: false,
            error: ErrorCodes.NOT_IN_ROOM,
          }),
        );
      }

      if (!cardId) {
        return ack?.(
          withRequestId(requestId, {
            ok: false,
            error: ErrorCodes.MISSING_CARD,
          }),
        );
      }

      request = beginRequest({
        scope: playerId,
        eventName: ClientEvents.PLAYER_SACRIFICE,
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

      actionLockUntil.set(playerId, Date.now() + ACTION_LOCK_MS);

      const result = withPlayerLock(code, playerId, () => {
        const previousScore = games.getScore(code, playerId) ?? 0;

        const previousHand = games.getHand(code, playerId) || [];

        const sacrificedBefore =
          previousHand.find((card) => card?.id === cardId) || null;

        const sacrificeResult = games.sacrificeCard(code, playerId, cardId);

        if (!sacrificeResult || sacrificeResult.ok === false) {
          return (
            sacrificeResult || {
              ok: false,
              error: ErrorCodes.SACRIFICE_FAILED,
            }
          );
        }

        const hand = Array.isArray(sacrificeResult.hand)
          ? sacrificeResult.hand
          : games.getHand(code, playerId) || [];

        const nextScore =
          typeof sacrificeResult.score === "number"
            ? sacrificeResult.score
            : (games.getScore(code, playerId) ?? 0);

        const delta = nextScore - previousScore;

        io.to(socket.id).emit(ServerEvents.HAND_UPDATE, hand);

        io.to(socket.id).emit(ServerEvents.SCORE_UPDATE, nextScore);

        socket.to(code).emit(ServerEvents.PLAYER_UPDATED, {
          playerId,
          handCount: hand.length,
          score: nextScore,
          points: nextScore,
        });

        const state = emitRoomState(code);

        const actor =
          state?.players?.find((player) => player.id === playerId) || {};

        const actorName = actor.displayName || actor.name || "Player";

        const sacrificedCard =
          sacrificeResult.sacrificedCard || sacrificedBefore;

        const update = gameUpdates.pushUpdate(code, {
          type: "CARD_SACRIFICED",

          player: {
            id: playerId,
            name: actorName,
          },

          card: sacrificedCard
            ? {
                id: sacrificedCard.id,
                name: sacrificedCard.name,
                description:
                  sacrificedCard.description ??
                  sacrificedCard.desc ??
                  sacrificedCard.penalty,
                points:
                  typeof sacrificedCard.points === "number"
                    ? sacrificedCard.points
                    : undefined,
              }
            : undefined,

          deltaPoints: delta,

          meta: {
            cardId,
          },
        });

        io.to(code).emit(ServerEvents.GAME_UPDATE, update);

        logGameTransition("CARD_SACRIFICED", {
          roomCode: code,
          playerId,
          cardId: sacrificedCard?.id ?? cardId,
          points: delta,
          scoreBefore: previousScore,
          scoreAfter: nextScore,
          version: sacrificeResult.version ?? null,
        });

        return {
          ok: true,
          newScore: nextScore,
          stateVersion: sacrificeResult.version ?? null,
        };
      });

      if (!result?.ok) {
        actionLockUntil.delete(playerId);

        if (result?.error === ErrorCodes.ACTION_IN_PROGRESS) {
          abandonRequest(request.key);

          return ack?.(withRequestId(requestId, result));
        }

        return finish(result);
      }

      return finish(result);
    } catch (err) {
      actionLockUntil.delete(socket.data.playerId);
      abandonRequest(request?.key);
      console.error("[player:sacrifice] error:", err);

      return ack?.(
        withRequestId(requestId, {
          ok: false,
          error: ErrorCodes.SACRIFICE_FAILED,
        }),
      );
    }
  });

  // Game history
  socket.on(ClientEvents.GAME_HISTORY_REQUEST, () => {
    const code = socket.data.roomCode;

    if (!code) return;

    io.to(socket.id).emit(
      ServerEvents.GAME_HISTORY,
      gameUpdates.getUpdates(code),
    );
  });
}
