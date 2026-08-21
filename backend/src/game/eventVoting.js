import {
  ServerEvents,
} from "../protocol/events.js";

import {
  ErrorCodes,
} from "../protocol/errors.js";

import {
  normalizeEventKey,
} from "../protocol/validation.js";

const EVENT_COOLDOWN_MS = 2 * 60 * 1000;
const EVENT_VOTE_DURATION_MS = 15_000;

const QUICK_POINT_EVENTS = Object.freeze({
  football: Object.freeze({
    touchdown: Object.freeze({
      title: "Touchdown",
      points: 6,
    }),
    interception: Object.freeze({
      title: "Interception",
      points: 10,
    }),
    fumble: Object.freeze({
      title: "Fumble",
      points: 5,
    }),
    big_play: Object.freeze({
      title: "Big Play (20+ Yards)",
      points: 10,
    }),
  }),

  baseball: Object.freeze({
    home_run: Object.freeze({
      title: "Home Run",
      points: 5,
    }),
    double_score: Object.freeze({
      title: "2x Score",
      points: 10,
    }),
    grand_slam: Object.freeze({
      title: "Grand Slam",
      points: 15,
    }),
  }),

  basketball: Object.freeze({
    dunk: Object.freeze({
      title: "Dunk",
      points: 10,
    }),
    three_pointer: Object.freeze({
      title: "3 Pointer",
      points: 3,
    }),
    steal: Object.freeze({
      title: "Steal",
      points: 4,
    }),
  }),
});

export function createEventVoting({
  io,
  rooms,
  games,
  gameUpdates,
  getEnrichedState,
  emitRoomState,
  logGameTransition,
}) {
  const pendingEventByCode = new Map();
  const eventCooldownByCode = new Map();

  function majorityNeeded(totalEligibleVoters) {
    return Math.floor(totalEligibleVoters / 2) + 1;
  }

  function getPlayerDisplayName(
    state,
    playerId,
  ) {
    const player =
      (state?.players || []).find(
        (item) => item.id === playerId,
      );

    return (
      player?.displayName ||
      player?.name ||
      "Player"
    );
  }

  function getQuickPointEvent(
    gameType,
    eventKey,
  ) {
    const normalizedGameType =
      String(gameType || "")
        .trim()
        .toLowerCase();

    const normalizedEventKey =
      normalizeEventKey(eventKey);

    return (
      QUICK_POINT_EVENTS[
        normalizedGameType
      ]?.[normalizedEventKey] ?? null
    );
  }

  function summarizePending(
    pending,
    totalEligibleVoters,
  ) {
    return {
      id: pending.id,
      eventKey: pending.eventKey,
      title: pending.title,
      points: pending.points,
      byPlayerId: pending.byPlayerId,
      byName: pending.byName,
      createdAt: pending.createdAt,
      expiresAt: pending.expiresAt,
      yesCount: pending.yes.size,
      noCount: pending.no.size,
      totalEligibleVoters,
      neededYes: majorityNeeded(
        totalEligibleVoters,
      ),
    };
  }

  function clearPending(code) {
    const pending =
      pendingEventByCode.get(code);

    if (pending?.timer) {
      clearTimeout(pending.timer);
    }

    pendingEventByCode.delete(code);
  }

  function setCooldown(code) {
    const until =
      Date.now() + EVENT_COOLDOWN_MS;

    eventCooldownByCode.set(
      code,
      until,
    );

    io.to(code).emit(
      ServerEvents.EVENT_COOLDOWN,
      {
        until,
      },
    );

    return until;
  }

  function clearRoom(code) {
    clearPending(code);
    eventCooldownByCode.delete(code);
  }

  function resolveAtTimeout(code) {
    const pending =
      pendingEventByCode.get(code);

    if (!pending) return;

    const state =
      getEnrichedState(code);

    if (!state) {
      clearPending(code);
      return;
    }

    const totalPlayers =
      Array.isArray(state.players)
        ? state.players.length
        : 0;

    const totalEligibleVoters =
      Math.max(
        0,
        totalPlayers - 1,
      );

    const neededYes =
      majorityNeeded(
        totalEligibleVoters,
      );

    const approved =
      pending.yes.size >= neededYes;

    if (approved) {
      const awardResult =
        games.getScore(
          code,
          pending.byPlayerId,
          pending.points,
        );

      const newScore =
        awardResult?.score ??
        rooms.getScore(
          code,
          pending.byPlayerId,
        ) ??
        0;

      io.to(
        pending.byPlayerId,
      ).emit(
        ServerEvents.SCORE_UPDATE,
        newScore,
      );

      io.to(code).emit(
        ServerEvents.PLAYER_UPDATED,
        {
          playerId:
            pending.byPlayerId,
          score: newScore,
        },
      );

      emitRoomState(code);

      const update =
        gameUpdates.pushUpdate(
          code,
          {
            type:
              "EVENT_CONFIRMED",

            player: {
              id:
                pending.byPlayerId,
              name:
                pending.byName,
            },

            card: {
              description:
                pending.title,
              points:
                pending.points,
            },

            deltaPoints:
              pending.points,

            meta: {
              source: "eventBar",
              eventKey:
                pending.eventKey,
              resolvedBy:
                "timeout",
            },
          },
        );

      io.to(code).emit(
        ServerEvents.GAME_UPDATE,
        update,
      );

      setCooldown(code);
    }

    logGameTransition(
      "EVENT_RESOLVED",
      {
        roomCode: code,
        eventId: pending.id,
        proposedBy:
          pending.byPlayerId,
        outcome:
          approved
            ? "approved"
            : "rejected",
        reason: "vote_timeout",
        yesCount:
          pending.yes.size,
        noCount:
          pending.no.size,
        neededYes,
        pointsAwarded:
          approved
            ? pending.points
            : 0,
      },
    );

    io.to(code).emit(
      ServerEvents.EVENT_RESOLVED,
      {
        ok: true,
        id: pending.id,
        approved,
        resolvedBy: "timeout",
        eventKey:
          pending.eventKey,
        title: pending.title,
        points: pending.points,
        byPlayerId:
          pending.byPlayerId,
        byName: pending.byName,
      },
    );

    clearPending(code);
  }

  function propose({
    code,
    playerId,
    eventKey,
  }) {
    const state =
      getEnrichedState(code);

    if (!state) {
      return {
        ok: false,
        error:
          ErrorCodes.ROOM_NOT_FOUND,
      };
    }

    if (state.phase !== "playing") {
      return {
        ok: false,
        error:
          ErrorCodes.GAME_NOT_PLAYING,
      };
    }

    const proposer =
      (state.players || []).find(
        (player) =>
          player.id === playerId,
      );

    if (!proposer) {
      return {
        ok: false,
        error:
          ErrorCodes.PLAYER_NOT_FOUND,
      };
    }

    const cooldownUntil =
      eventCooldownByCode.get(code) || 0;

    if (
      Date.now() < cooldownUntil
    ) {
      return {
        ok: false,
        error:
          ErrorCodes.COOLDOWN,
        until: cooldownUntil,
      };
    }

    if (
      pendingEventByCode.has(code)
    ) {
      return {
        ok: false,
        error:
          ErrorCodes.EVENT_ALREADY_PENDING,
      };
    }

    const normalizedEventKey =
      normalizeEventKey(eventKey);

    const eventDefinition =
      getQuickPointEvent(
        state.gameType,
        normalizedEventKey,
      );

    if (!eventDefinition) {
      return {
        ok: false,
        error:
          ErrorCodes.INVALID_EVENT,
      };
    }

    const {
      title,
      points,
    } = eventDefinition;

    const byName =
      getPlayerDisplayName(
        state,
        playerId,
      );

    const totalPlayers =
      state.players?.length || 0;

    const totalEligibleVoters =
      Math.max(
        0,
        totalPlayers - 1,
      );

    if (
      totalEligibleVoters === 0
    ) {
      return {
        ok: false,
        error:
          ErrorCodes.NO_VOTERS,
      };
    }

    const neededYes =
      majorityNeeded(
        totalEligibleVoters,
      );

    const createdAt =
      Date.now();

    const expiresAt =
      createdAt +
      EVENT_VOTE_DURATION_MS;

    const pending = {
      id:
        `${code}-${createdAt}-${Math.random()
          .toString(16)
          .slice(2)}`,

      eventKey:
        normalizedEventKey,

      title,
      points,

      byPlayerId:
        playerId,

      byName,

      createdAt,
      expiresAt,

      yes: new Set(),
      no: new Set(),

      timer: null,
    };

    pending.timer =
      setTimeout(() => {
        resolveAtTimeout(code);
      }, EVENT_VOTE_DURATION_MS);

    pendingEventByCode.set(
      code,
      pending,
    );

    io.to(code).emit(
      ServerEvents.EVENT_PROPOSED,
      summarizePending(
        pending,
        totalEligibleVoters,
      ),
    );

    logGameTransition(
      "EVENT_PROPOSED",
      {
        roomCode: code,
        playerId,
        eventId:
          pending.id,
        eventKey:
          pending.eventKey,
        title:
          pending.title,
        points:
          pending.points,
        neededYes,
        expiresAt:
          pending.expiresAt,
      },
    );

    return {
      ok: true,
      id: pending.id,
    };
  }

  function vote({
    code,
    playerId,
    eventId,
    vote,
  }) {
    const pending =
      pendingEventByCode.get(code);

    if (!pending) {
      return {
        ok: false,
        error:
          ErrorCodes.NO_PENDING_EVENT,
      };
    }

    if (
      String(eventId || "") !==
      pending.id
    ) {
      return {
        ok: false,
        error:
          ErrorCodes.EVENT_ID_MISMATCH,
      };
    }

    if (
      Date.now() >=
      pending.expiresAt
    ) {
      return {
        ok: false,
        error:
          ErrorCodes.VOTE_EXPIRED,
      };
    }

    const normalizedVote =
      vote === "yes"
        ? "yes"
        : vote === "no"
          ? "no"
          : null;

    if (!normalizedVote) {
      return {
        ok: false,
        error:
          ErrorCodes.INVALID_VOTE,
      };
    }

    if (
      playerId ===
      pending.byPlayerId
    ) {
      return {
        ok: false,
        error:
          ErrorCodes.PROPOSER_CANNOT_VOTE,
      };
    }

    const state =
      getEnrichedState(code);

    if (!state) {
      return {
        ok: false,
        error:
          ErrorCodes.ROOM_NOT_FOUND,
      };
    }

    const voter =
      (state.players || []).find(
        (player) =>
          player.id === playerId,
      );

    if (!voter) {
      return {
        ok: false,
        error:
          ErrorCodes.PLAYER_NOT_FOUND,
      };
    }

    const totalPlayers =
      state.players?.length || 0;

    const totalEligibleVoters =
      Math.max(
        0,
        totalPlayers - 1,
      );

    if (
      totalEligibleVoters === 0
    ) {
      return {
        ok: false,
        error:
          ErrorCodes.NO_VOTERS,
      };
    }

    pending.yes.delete(playerId);
    pending.no.delete(playerId);

    if (
      normalizedVote === "yes"
    ) {
      pending.yes.add(playerId);
    } else {
      pending.no.add(playerId);
    }

    const neededYes =
      majorityNeeded(
        totalEligibleVoters,
      );

    const yesCount =
      pending.yes.size;

    const noCount =
      pending.no.size;

    logGameTransition(
      "EVENT_VOTED",
      {
        roomCode: code,
        playerId,
        eventId:
          pending.id,
        vote:
          normalizedVote,
        yesCount,
        noCount,
        neededYes,
      },
    );

    io.to(code).emit(
      ServerEvents.EVENT_UPDATED,
      summarizePending(
        pending,
        totalEligibleVoters,
      ),
    );

    if (
      yesCount >= neededYes
    ) {
      const awardResult =
        games.getScore(
          code,
          pending.byPlayerId,
          pending.points,
        );

      const newScore =
        awardResult?.score ??
        rooms.getScore(
          code,
          pending.byPlayerId,
        ) ??
        0;

      logGameTransition(
        "EVENT_RESOLVED",
        {
          roomCode: code,
          eventId:
            pending.id,
          proposedBy:
            pending.byPlayerId,
          outcome: "approved",
          reason:
            "majority_reached",
          yesCount,
          noCount,
          neededYes,
          pointsAwarded:
            pending.points,
        },
      );

      io.to(
        pending.byPlayerId,
      ).emit(
        ServerEvents.SCORE_UPDATE,
        newScore,
      );

      io.to(code).emit(
        ServerEvents.PLAYER_UPDATED,
        {
          playerId:
            pending.byPlayerId,
          score:
            newScore,
        },
      );

      emitRoomState(code);

      const update =
        gameUpdates.pushUpdate(
          code,
          {
            type:
              "EVENT_CONFIRMED",

            player: {
              id:
                pending.byPlayerId,
              name:
                pending.byName,
            },

            card: {
              description:
                pending.title,
              points:
                pending.points,
            },

            deltaPoints:
              pending.points,

            meta: {
              source:
                "eventBar",
              eventKey:
                pending.eventKey,
              resolvedBy:
                "votes",
            },
          },
        );

      io.to(code).emit(
        ServerEvents.GAME_UPDATE,
        update,
      );

      io.to(code).emit(
        ServerEvents.EVENT_RESOLVED,
        {
          ok: true,
          id: pending.id,
          approved: true,
          resolvedBy:
            "votes",
          eventKey:
            pending.eventKey,
          title:
            pending.title,
          points:
            pending.points,
          byPlayerId:
            pending.byPlayerId,
          byName:
            pending.byName,
        },
      );

      setCooldown(code);
      clearPending(code);
    }

    return {
      ok: true,
    };
  }

  return {
    propose,
    vote,
    clearRoom,
  };
}