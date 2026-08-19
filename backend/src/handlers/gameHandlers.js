import {
  ClientEvents,
  ServerEvents,
} from "../protocol/events.js";

import { ErrorCodes } from "../protocol/errors.js";

const ACTION_LOCK_MS = 300;

const actionLockUntil = new Map();
const actionLock = new Map();

function withPlayerLock(
  code,
  playerId,
  operation,
) {
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
  gameUpdates,
  emitRoomState,
  logGameTransition,
}) {
  // Start game and deal
  socket.on(
    ClientEvents.GAME_START_AND_DEAL,
    async (payload = {}, cb) => {
      const code = socket.data.roomCode;

      if (!code) {
        return cb?.({
          ok: false,
          error: ErrorCodes.NOT_IN_ROOM,
        });
      }

      // Transitional until host auth no longer
      // requires the old key argument.
      const requesterKey =
        payload?.key || null;

      const result = rooms.startAndDeal(
        code,
        socket.id,
        requesterKey,
      );

      if (!result.ok) {
        return cb?.(result);
      }

      const room = rooms.getRoom(code);

      logGameTransition("GAME_STARTED", {
        roomCode: code,
        triggeredBy: socket.id,
        gameType: room?.gameType,
        playerCount:
          room?.players?.size ?? 0,
        phase: room?.phase,
        version: result.version,
      });

      cb?.({
        ok: true,
      });

      emitRoomState(code);

      const socketsInRoom =
        await io.in(code).fetchSockets();

      for (const playerSocket of socketsInRoom) {
        io.to(playerSocket.id).emit(
          ServerEvents.HAND_UPDATE,
          rooms.getHand(
            code,
            playerSocket.id,
          ) || [],
        );

        io.to(playerSocket.id).emit(
          ServerEvents.SCORE_UPDATE,
          rooms.getScore(
            code,
            playerSocket.id,
          ) ?? 0,
        );
      }
    },
  );

  // Play card
  socket.on(
    ClientEvents.GAME_PLAY_CARD,
    ({ index, cardId }, cb) => {
      const code = socket.data.roomCode;

      if (!code) {
        return cb?.({
          ok: false,
          error: ErrorCodes.NOT_IN_ROOM,
        });
      }

      const now = Date.now();

      if (
        (actionLockUntil.get(socket.id) || 0) >
        now
      ) {
        return cb?.({
          ok: false,
          error: ErrorCodes.LOCKED,
        });
      }

      const result = withPlayerLock(
        code,
        socket.id,
        () => {
          const previousScore =
            rooms.getScore(
              code,
              socket.id,
            ) ?? 0;

          const playResult = cardId
            ? rooms.playCardById(
                code,
                socket.id,
                cardId,
              )
            : rooms.playCard(
                code,
                socket.id,
                index,
              );

          if (!playResult.ok) {
            return playResult;
          }

          const nextScore =
            playResult.score ??
            rooms.getScore(
              code,
              socket.id,
            ) ??
            0;

          const delta =
            nextScore - previousScore;

          const playedCard =
            playResult.playedCard;

          io.to(socket.id).emit(
            ServerEvents.HAND_UPDATE,
            playResult.hand || [],
          );

          io.to(socket.id).emit(
            ServerEvents.SCORE_UPDATE,
            nextScore,
          );

          socket.to(code).emit(
            ServerEvents.PLAYER_UPDATED,
            {
              playerId: socket.id,
              handCount:
                playResult.hand?.length ?? 0,
              score: nextScore,
            },
          );

          const state =
            emitRoomState(code);

          const actor =
            state?.players?.find(
              (player) =>
                player.id === socket.id,
            ) || {};

          const actorName =
            actor.displayName ||
            actor.name ||
            "Player";

          const update =
            gameUpdates.pushUpdate(
              code,
              {
                type: "CARD_PLAYED",

                player: {
                  id: socket.id,
                  name: actorName,
                },

                card: playedCard
                  ? {
                      id: playedCard.id,
                      name: playedCard.name,
                      description:
                        playedCard.description ??
                        playedCard.desc ??
                        playedCard.penalty,
                      points:
                        typeof playedCard.points ===
                        "number"
                          ? playedCard.points
                          : undefined,
                    }
                  : undefined,

                deltaPoints:
                  Number(delta) || 0,

                meta: {
                  index:
                    typeof index === "number"
                      ? index
                      : undefined,
                  cardId,
                },
              },
            );

          io.to(code).emit(
            ServerEvents.GAME_UPDATE,
            update,
          );

          logGameTransition(
            "CARD_PLAYED",
            {
              roomCode: code,
              playerId: socket.id,
              cardId:
                playedCard?.id ??
                cardId ??
                null,
              points: delta,
              scoreBefore: previousScore,
              scoreAfter: nextScore,
              version:
                playResult.version ?? null,
            },
          );

          return {
            ok: true,
            newScore: nextScore,
            version: playResult.version,
          };
        },
      );

      return cb?.(result);
    },
  );

  // Own hand
  socket.on(
    ClientEvents.HAND_GET_MINE,
    (_, cb) => {
      const code = socket.data.roomCode;

      if (!code) {
        return cb?.({
          ok: false,
          error: ErrorCodes.NOT_IN_ROOM,
        });
      }

      return cb?.({
        ok: true,
        hand:
          rooms.getHand(
            code,
            socket.id,
          ) || [],
      });
    },
  );

  // Own score
  socket.on(
    ClientEvents.SCORE_GET_MINE,
    (_, cb) => {
      const code = socket.data.roomCode;

      if (!code) {
        return cb?.({
          ok: false,
          error: ErrorCodes.NOT_IN_ROOM,
        });
      }

      return cb?.({
        ok: true,
        score:
          rooms.getScore(
            code,
            socket.id,
          ) ?? 0,
      });
    },
  );

  // Opponent hands
  socket.on(
    ClientEvents.HAND_GET_OPPONENTS,
    (_, cb) => {
      const code = socket.data.roomCode;

      if (!code) {
        return cb?.({
          ok: false,
          error: ErrorCodes.NOT_IN_ROOM,
        });
      }

      const opponents =
        rooms.getOpponentsHands
          ? rooms.getOpponentsHands(
              code,
              socket.id,
            )
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
    },
  );

  // Manual score adjustment
  socket.on(
    ClientEvents.SCORE_ADJUST,
    ({ delta, meta } = {}, ack) => {
      try {
        const code =
          socket.data.roomCode;

        if (!code) {
          return ack?.({
            ok: false,
            error: ErrorCodes.NOT_IN_ROOM,
          });
        }

        const value = Number(delta);

        const safeDelta =
          Number.isFinite(value)
            ? Math.trunc(value)
            : 0;

        if (safeDelta === 0) {
          return ack?.({
            ok: false,
            error: ErrorCodes.INVALID_DELTA,
          });
        }

        const oldScore =
          rooms.getScore(
            code,
            socket.id,
          ) ?? 0;

        const result =
          rooms.adjustScore(
            code,
            socket.id,
            safeDelta,
          );

        if (!result || result.ok === false) {
          return ack?.({
            ok: false,
            error:
              result?.error ||
              ErrorCodes.PLAYER_NOT_FOUND,
          });
        }

        const newScore = result.score;

        io.to(socket.id).emit(
          ServerEvents.SCORE_UPDATE,
          newScore,
        );

        io.to(code).emit(
          ServerEvents.PLAYER_UPDATED,
          {
            playerId: socket.id,
            score: newScore,
            points: newScore,
          },
        );

        const state =
          emitRoomState(code);

        const actor =
          state?.players?.find(
            (player) =>
              player.id === socket.id,
          ) || {};

        const actorName =
          actor.displayName ||
          actor.name ||
          "Player";

        const update =
          gameUpdates.pushUpdate(
            code,
            {
              type: "SCORE_ADJUSTED",

              player: {
                id: socket.id,
                name: actorName,
              },

              deltaPoints: safeDelta,

              meta: meta ?? {},
            },
          );

        io.to(code).emit(
          ServerEvents.GAME_UPDATE,
          update,
        );

        logGameTransition(
          "SCORE_ADJUSTED",
          {
            roomCode: code,
            playerId: socket.id,
            delta: safeDelta,
            scoreBefore: oldScore,
            scoreAfter: newScore,
            source:
              meta?.source ?? "unknown",
          },
        );

        return ack?.({
          ok: true,
          newScore,
          version:
            result.version ?? null,
        });
      } catch (err) {
        console.error(
          "[score:adjust] error",
          err,
        );

        return ack?.({
          ok: false,
          error: ErrorCodes.SERVER_ERROR,
        });
      }
    },
  );

  // Sacrifice card
  socket.on(
    ClientEvents.PLAYER_SACRIFICE,
    (payload = {}, ack) => {
      try {
        const code =
          socket.data.roomCode;

        const playerId = socket.id;
        const cardId = payload?.cardId;

        if (!code) {
          return ack?.({
            ok: false,
            error: ErrorCodes.NOT_IN_ROOM,
          });
        }

        if (!cardId) {
          return ack?.({
            ok: false,
            error: ErrorCodes.MISSING_CARD,
          });
        }

        actionLockUntil.set(
          playerId,
          Date.now() + ACTION_LOCK_MS,
        );

        const result =
          withPlayerLock(
            code,
            playerId,
            () => {
              const previousScore =
                rooms.getScore(
                  code,
                  playerId,
                ) ?? 0;

              const previousHand =
                rooms.getHand(
                  code,
                  playerId,
                ) || [];

              const sacrificedBefore =
                previousHand.find(
                  (card) =>
                    card?.id === cardId,
                ) || null;

              const sacrificeResult =
                rooms.sacrificeCard(
                  code,
                  playerId,
                  cardId,
                );

              if (
                !sacrificeResult ||
                sacrificeResult.ok === false
              ) {
                return (
                  sacrificeResult || {
                    ok: false,
                    error:
                      ErrorCodes.SACRIFICE_FAILED,
                  }
                );
              }

              const hand =
                Array.isArray(
                  sacrificeResult.hand,
                )
                  ? sacrificeResult.hand
                  : rooms.getHand(
                      code,
                      playerId,
                    ) || [];

              const nextScore =
                typeof sacrificeResult.score ===
                "number"
                  ? sacrificeResult.score
                  : rooms.getScore(
                      code,
                      playerId,
                    ) ?? 0;

              const delta =
                nextScore -
                previousScore;

              io.to(playerId).emit(
                ServerEvents.HAND_UPDATE,
                hand,
              );

              io.to(playerId).emit(
                ServerEvents.SCORE_UPDATE,
                nextScore,
              );

              socket.to(code).emit(
                ServerEvents.PLAYER_UPDATED,
                {
                  playerId,
                  handCount: hand.length,
                  score: nextScore,
                  points: nextScore,
                },
              );

              const state =
                emitRoomState(code);

              const actor =
                state?.players?.find(
                  (player) =>
                    player.id === playerId,
                ) || {};

              const actorName =
                actor.displayName ||
                actor.name ||
                "Player";

              const sacrificedCard =
                sacrificeResult.sacrificedCard ||
                sacrificedBefore;

              const update =
                gameUpdates.pushUpdate(
                  code,
                  {
                    type:
                      "CARD_SACRIFICED",

                    player: {
                      id: playerId,
                      name: actorName,
                    },

                    card: sacrificedCard
                      ? {
                          id:
                            sacrificedCard.id,
                          name:
                            sacrificedCard.name,
                          description:
                            sacrificedCard.description ??
                            sacrificedCard.desc ??
                            sacrificedCard.penalty,
                          points:
                            typeof sacrificedCard.points ===
                            "number"
                              ? sacrificedCard.points
                              : undefined,
                        }
                      : undefined,

                    deltaPoints: delta,

                    meta: {
                      cardId,
                    },
                  },
                );

              io.to(code).emit(
                ServerEvents.GAME_UPDATE,
                update,
              );

              logGameTransition(
                "CARD_SACRIFICED",
                {
                  roomCode: code,
                  playerId,
                  cardId:
                    sacrificedCard?.id ??
                    cardId,
                  points: delta,
                  scoreBefore:
                    previousScore,
                  scoreAfter:
                    nextScore,
                  version:
                    sacrificeResult.version ??
                    null,
                },
              );

              return {
                ok: true,
                newScore: nextScore,
                version:
                  sacrificeResult.version ??
                  null,
              };
            },
          );

        if (!result?.ok) {
          actionLockUntil.delete(
            playerId,
          );

          return ack?.(result);
        }

        return ack?.(result);
      } catch (err) {
        actionLockUntil.delete(
          socket.id,
        );

        console.error(
          "[player:sacrifice] error:",
          err,
        );

        return ack?.({
          ok: false,
          error:
            ErrorCodes.SACRIFICE_FAILED,
        });
      }
    },
  );

  // Game history
  socket.on(
    ClientEvents.GAME_HISTORY_REQUEST,
    () => {
      const code =
        socket.data.roomCode;

      if (!code) return;

      io.to(socket.id).emit(
        ServerEvents.GAME_HISTORY,
        gameUpdates.getUpdates(code),
      );
    },
  );
}