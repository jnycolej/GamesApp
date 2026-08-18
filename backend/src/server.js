import http from "http";
import express from "express";
import cors from "cors";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import { createRoomManager } from "./roomManager.js";
import { gameSchedules } from "./data/gameSchedules.js";
import { createGameUpdates } from "./game/gameUpdates.js";
import { isProd, PORT } from "./config/env.js";
import {corsOptions} from "./config/cors.js";
import { PROTOCOL_VERSION } from "./protocol/version.js";

//console.log("SERVER INDEX 33:", gameSchedules[33]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);
app.get("/healthz", (_req, res) => res.send("ok"));
const rooms = createRoomManager();
console.log("[boot] room manager ready");
app.get("/debug/rooms", (_req, res) => {
  try {
    const list = rooms.listCodes ? rooms.listCodes() : [];
    res.json({ rooms: list });
  } catch (err) {
    console.error("/debug/rooms error", err);
    res.json({ rooms: "error" });
  }
});

app.get("/api/schedules", (req, res) => {
  console.log("SCHEDULE REQUEST RECEIVED");
  console.log("INDEX 33 SENT:", gameSchedules[33]);
  res.json(gameSchedules);
});
// Short grace period to ignore 'play' after a 'sacrifice'
const actionLockUntil = new Map();
const ACTION_LOCK_MS = 300;

const reactionCooldownByPlayer = new Map();
const REACTION_COOLDOWN_MS = 1200;

// ------------------------------------
// Room / player lifecycle
// ------------------------------------

const HOST_LOBBY_GRACE_MS = 3 * 60 * 1000;
const HOST_GAME_GRACE_MS = 10 * 60 * 1000;

const PLAYER_RECONNECT_GRACE_MS = 30 * 60 * 1000;

const EMPTY_LOBBY_TTL_MS = 5 * 60 * 1000;
const EMPTY_GAME_TTL_MS = 15 * 60 * 1000;

const MAX_LOBBY_LIFETIME_MS = 60 * 60 * 1000;
const MAX_GAME_LIFETIME_MS = 4 * 60 * 60 * 1000;

const ROOM_SWEEP_INTERVAL_MS = 60 * 1000;

const playerEvictionTimers = new Map();
const hostGraceTimers = new Map();
const emptyRoomTimers = new Map();


// This handles the case where Origin might be undefined in some environments
app.use(cors(corsOptions));

//initiates the server
const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
  path: "/socket.io",
  pingInterval: 25000,
  pingTimeout: 90000,
  connectionStateRecovery: {
    // allows clients to recover missed packets for up to 30 minutes
    maxDisconnectionDuration: 60 * 60 * 1000,
  },
});

const gameUpdates = createGameUpdates();

//Game log
function logGameTransition(event, data = {}) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...data,
    }),
  );
}

//Quick point rules map
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

function normalizeEventKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

function getQuickPointEvent(gameType, eventKey) {
  const normalizedGameType = String(gameType || "")
    .trim()
    .toLowerCase();

  const normalizedEventKey = normalizeEventKey(eventKey);

  return QUICK_POINT_EVENTS[normalizedGameType]?.[normalizedEventKey] ?? null;
}

function resolveEventVoteAtTimeout(code) {
  const pending = pendingEventByCode.get(code);
  if (!pending) return;

  const state = getEnrichedState(code);

  if (!state) {
    clearPending(code);
    return;
  }

  const totalPlayers = Array.isArray(state.players) ? state.players.length : 0;

  const totalEligibleVoters = Math.max(0, totalPlayers - 1);
  const neededYes = majorityNeeded(totalEligibleVoters);
  const approved = pending.yes.size >= neededYes;

  if (approved) {
    const awardRes = rooms.adjustScore(
      code,
      pending.byPlayerId,
      pending.points,
    );

    const newScore =
      awardRes?.score ?? rooms.getScore(code, pending.byPlayerId) ?? 0;

    io.to(pending.byPlayerId).emit("score:update", newScore);

    io.to(code).emit("player:updated", {
      playerId: pending.byPlayerId,
      score: newScore,
    });

    emitRoomState(code);

    const update = gameUpdates.pushUpdate(code, {
      type: "EVENT_CONFIRMED",
      player: {
        id: pending.byPlayerId,
        name: pending.byName,
      },
      card: {
        description: pending.title,
        points: pending.points,
      },
      deltaPoints: pending.points,
      meta: {
        source: "eventBar",
        eventKey: pending.eventKey,
        resolvedBy: "timeout",
      },
    });

    io.to(code).emit("game:update", update);

    setCooldown(code);
  }

  logGameTransition("EVENT_RESOLVED", {
    roomCode: code,
    eventId: pending.id,
    proposedBy: pending.byPlayerId,
    outcome: approved ? "approved" : "rejected",
    reason: "vote_timeout",
    yesCount: pending.yes.size,
    noCount: pending.no.size,
    neededYes,
    pointsAwarded: approved ? pending.points : 0,
  });

  io.to(code).emit("event:resolved", {
    ok: true,
    id: pending.id,
    approved,
    resolvedBy: "timeout",
    eventKey: pending.eventKey,
    title: pending.title,
    points: pending.points,
    byPlayerId: pending.byPlayerId,
    byName: pending.byName,
  });

  clearPending(code);
}

//Pending vote-to-award events per room
const pendingEventByCode = new Map();
// code -> {id, title, points, byPlayerId, byName, createdAt, expiresAt, yes:Set, no:Set, timer }

const eventCooldownByCode = new Map();
// code -> cooldownUntil (timestamp ms)

const EVENT_COOLDOWN_MS = 2 * 60 * 1000;

function setCooldown(code) {
  const until = Date.now() + EVENT_COOLDOWN_MS;
  eventCooldownByCode.set(code, until);
  io.to(code).emit("event:cooldown", { until });
  return until;
}

function majorityNeeded(totalEligibleVoters) {
  //majority of eligible voters: e.g., 1 of 1, 2 of 3, 3 of 5...
  return Math.floor(totalEligibleVoters / 2) + 1;
}

function getPlayerDisplayName(state, playerId) {
  const p = (state?.players || []).find((x) => x.id === playerId);
  return p?.displayName || p?.name || "Player";
}

const IDLE_TIMEOUT_MS = 20_000;

function updateIdleStatesForCode(code) {
  const room = rooms.getRoom?.(code);
  if (!room || !room.players) return;

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

function summarizePending(p, totalEligibleVoters) {
  return {
    id: p.id,
    eventKey: p.eventKey,
    title: p.title,
    points: p.points,
    byPlayerId: p.byPlayerId,
    byName: p.byName,
    createdAt: p.createdAt,
    expiresAt: p.expiresAt,
    yesCount: p.yes.size,
    noCount: p.no.size,
    totalEligibleVoters,
    neededYes: majorityNeeded(totalEligibleVoters),
  };
}

function clearPending(code) {
  const p = pendingEventByCode.get(code);
  if (p?.timer) clearTimeout(p.timer);
  pendingEventByCode.delete(code);
}

// Prevent overlapping actions from the same player
const actionLock = new Map(); // key: `${code}:${playerId}` -> boolean

function withPlayerLock(code, playerId, fn) {
  const key = `${code}:${playerId}`;
  if (actionLock.get(key)) return { ok: false, error: "action_in_progress" };
  actionLock.set(key, true);
  try {
    return fn();
  } finally {
    actionLock.set(key, false);
  }
}

// function pushUpdate(code, ev) {
//   const at = Date.now();
//   const id =
//     ev.id ||
//     `${code}-${at}-${ev.type}-${ev?.player?.id ?? ""}-${ev?.card?.id ?? ""}`;
//   const full = { id, at, roomCode: code, ...ev };
//   const arr = updatesByCode.get(code) || [];
//   arr.push(full);
//   if (arr.length > MAX_UPDATES) arr.shift();
//   updatesByCode.set(code, arr);
//   return full;
// }

// function getUpdates(code) {
//   return (updatesByCode.get(code) || []).slice(-MAX_UPDATES);
// }

function getEnrichedState(code) {
  updateIdleStatesForCode(code);

  // base public snapshot
  const base =
    (typeof rooms.safePublicState === "function" &&
      rooms.safePublicState(code)) ||
    rooms.getPublicState(code);

  if (!base) return null;

  // normalize players + ensure numeric points
  const players = Array.isArray(base.players)
    ? base.players
        .filter((p) => p && typeof p === "object" && p.id)
        .map((p) => {
          // tolerate both 'points' (preferred) and legacy 'score'
          const direct =
            typeof p.score === "number" && Number.isFinite(p.score)
              ? p.score
              : typeof p.points === "number" && Number.isFinite(p.points)
                ? p.points
                : undefined;

          const score = direct ?? Number(rooms.getScore(code, p.id) ?? 0);

          // Keep points temporarily for existing UI compatibility,
          // but guarantee that it always matches score.
          return {
            ...p,
            score,
            points: score,
          };
        })
    : [];

  // compute leaderIds
  let leaderIds = [];
  if (players.length > 0) {
    const max = Math.max(
      ...players.map((p) => (Number.isFinite(p.score) ? p.score : 0)),
    );

    leaderIds = players.filter((p) => (p.score ?? 0) === max).map((p) => p.id);
  }

  // 4) stamp updatedAt
  const enriched = {
    ...base,
    players,
    leaderIds,
    updatedAt: Date.now(),
  };

  return enriched;
}

function emitRoomState(code) {
  const state = getEnrichedState(code);
  if (!state) return null;
  io.to(code).emit("room:updated", state);
  return state;
}

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
  clearPending(code);

  eventCooldownByCode.delete(code);
  gameUpdates.delete(code);

  clearTimerFromMap(emptyRoomTimers, code);

  for (const [key, timer] of playerEvictionTimers) {
    if (key.startsWith(`${code}:`)) {
      clearTimeout(timer);
      playerEvictionTimers.delete(key);
    }
  }

  for (const [key, timer] of hostGraceTimers) {
    if (key.startsWith(`${code}:`)) {
      clearTimeout(timer);
      hostGraceTimers.delete(key);
    }
  }
}

function destroyRoom(code, reason = "expired") {
  const room = rooms.getRoom(code);
  if (!room) return false;

  io.to(code).emit("room:expired", {
    code,
    reason,
  });

  clearRoomAuxiliaryState(code);
  rooms.destroyRoom(code);

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

  if (connectedPlayers.length > 0) {
    cancelEmptyRoomTimer(code);
    return;
  }

  if (emptyRoomTimers.has(code)) return;

  const ttl = room.phase === "playing" ? EMPTY_GAME_TTL_MS : EMPTY_LOBBY_TTL_MS;

  const timer = setTimeout(() => {
    emptyRoomTimers.delete(code);

    const latestRoom = rooms.getRoom(code);
    if (!latestRoom) return;

    const anyoneConnected = [...latestRoom.players.values()].some(
      (player) => player.connected,
    );

    if (anyoneConnected) return;

    destroyRoom(code, "empty_room_timeout");
  }, ttl);

  emptyRoomTimers.set(code, timer);
}

function schedulePlayerEviction(code, player) {
  const identity = player?.key || player?.id;
  if (!identity) return;

  const timerKey = playerLifecycleKey(code, identity);

  clearTimerFromMap(playerEvictionTimers, timerKey);

  const timer = setTimeout(() => {
    playerEvictionTimers.delete(timerKey);

    const room = rooms.getRoom(code);
    if (!room) return;

    const currentPlayer = player.key
      ? [...room.players.values()].find((p) => p.key === player.key)
      : room.players.get(player.id);

    // They reconnected.
    if (!currentPlayer || currentPlayer.connected) {
      return;
    }

    const result = player.key
      ? rooms.removePlayerByKey(code, player.key)
      : rooms.removePlayer(code, player.id);

    if (!result?.ok) return;
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

    // Find the original host by persistent identity.
    const disconnectedHost = player.key
      ? [...latestRoom.players.values()].find((p) => p.key === player.key)
      : latestRoom.players.get(player.id);

    // Host came back before grace expired.
    if (disconnectedHost?.connected) {
      return;
    }

    const result = rooms.reassignHost(code);

    if (!result?.ok) return;

    emitRoomState(code);

    if (result.hostAssigned) {
      io.to(code).emit("host:changed", {
        hostId: result.hostId,
      });
    }
  }, graceMs);

  hostGraceTimers.set(timerKey, timer);
}
io.use((socket, next) => {
  const clientProtocolVersion = socket.handshake.auth?.protocolVersion;

  if (clientProtocolVersion !== PROTOCOL_VERSION) {
    const err = new Error("Incompatible protocol version");

    err.data = {
      code: "INCOMPATIBLE_PROTOCOL_VERSION",
      clientProtocolVersion,
      serverProtocolVersion: PROTOCOL_VERSION,
    };

    return next(err);
  }

  next();
});

io.on("connection", (socket) => {
  console.log("[socket] connected", socket.id);
  //Connects the to the socket
  socket.on("room:create", ({ gameType, displayName, matchup }, cb) => {
    try {
      const reconnectToken = crypto.randomUUID();

      const { code, token } = rooms.createRoom({
        creatorSocketId: socket.id,
        gameType,
        matchup: matchup ?? null,
        hostKey: reconnectToken,
      });

      if (!code) throw new Error("createRoom_no_code");
      console.log("[create] room code:", code, "gameType:", gameType);

      socket.data.roomCode = code;
      socket.join(code);

      const safeName = (displayName || "").trim() || "Host";
      socket.data.displayName = safeName;

      const add = rooms.addPlayer(code, {
        id: socket.id,
        displayName: safeName,
        key: reconnectToken,
      }); // pass key
      if (!add.ok) {
        console.warn("[create] addPlayer failed:", add);
        return cb?.(add || { ok: false, error: "add_player_failed" });
      }

      const state = emitRoomState(code);
      logGameTransition("ROOM_CREATED", {
        roomCode: code,
        gameType,
        hostId: socket.id,
        phase: "lobby",
        matchup: matchup ?? null,
      });

      return cb?.({ ok: true, roomCode: code, token, reconnectToken, state });
    } catch (err) {
      console.error("[create] error:", err);
      return cb?.({ ok: false, error: "create_failed" });
    }
  });
  //Allows player to join room based on room code
  socket.on(
    "player:join",
    ({ roomCode, displayName, reconnectToken, token }, cb) => {
      try {
        const CODE = String(roomCode || "")
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 6);

        // Reject if room doesn't exist
        const exists = rooms.getPublicState(CODE);

        if (!exists) {
          return cb?.({
            ok: false,
            error: "room_not_found",
          });
        }

        const safeName =
          String(displayName || "")
            .trim()
            .slice(0, 24) || "Player";

        const playerKey = reconnectToken || crypto.randomUUID();

        socket.data.displayName = safeName;

        const res = rooms.addPlayer(CODE, {
          id: socket.id,
          displayName: safeName,
          key: playerKey,
        });

        if (!res.ok) return cb?.(res);

        cancelPlayerLifecycleTimers(CODE, playerKey);
        cancelEmptyRoomTimer(CODE);

        socket.data.roomCode = CODE;
        socket.join(CODE);

        const state = emitRoomState(CODE);

        const joinedRoom = rooms.getRoom(CODE);

        if (joinedRoom && !joinedRoom.hostId && !joinedRoom.hostKey) {
          rooms.reassignHost(CODE);
        }

        logGameTransition("PLAYER_JOINED", {
          roomCode: CODE,
          playerId: socket.id,
          playerName: safeName,
          playerCount: state?.players?.length ?? null,
        });

        cb?.({
          ok: true,
          state,
          reconnectToken: playerKey,
        });
      } catch (err) {
        console.error("[join] error:", err);

        cb?.({
          ok: false,
          error: "join_failed",
        });
      }
    },
  );

  // resumes if player disconnects
  socket.on(
    "player:resume",
    ({ roomCode, displayName, reconnectToken }, cb) => {
      if (!reconnectToken) {
        return cb?.({
          ok: false,
          error: "missing_reconnect_token",
        });
      }

      const CODE = String(roomCode || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6);

      const safeName =
        String(displayName || "")
          .trim()
          .slice(0, 24) || "Player";

      socket.data.displayName = safeName;

      const res = rooms.resumePlayer(CODE, {
        newSocketId: socket.id,
        displayName: safeName,
        key: reconnectToken,
      });

      if (!res.ok) return cb?.(res);

      cancelPlayerLifecycleTimers(CODE, reconnectToken);
      cancelEmptyRoomTimer(CODE);

      const roomAfterResume = rooms.getRoom(CODE);

      logGameTransition("PLAYER_RESUMED", {
        roomCode: CODE,
        playerId: socket.id,
        playerName: safeName,
        phase: roomAfterResume?.phase,
        wasHost: roomAfterResume?.hostId === socket.id,
      });

      if (
        roomAfterResume &&
        !roomAfterResume.hostId &&
        !roomAfterResume.hostKey
      ) {
        rooms.reassignHost(CODE);
      }

      socket.data.roomCode = CODE;
      socket.join(CODE);

      // send private state back to this socket
      io.to(socket.id).emit("hand:update", res.hand || []);
      io.to(socket.id).emit("score:update", res.score ?? 0);

      // refresh public state
      const state = emitRoomState(CODE);

      cb?.({ ok: true, state });
    },
  );

  //Get the room code to display the room code
  socket.on("room:get", (_, cb) => {
    const code = socket.data.roomCode;
    if (!code) return cb?.({ ok: false, error: "not_in_room" });
    cb?.({ ok: true, state: getEnrichedState(code) });
  });

  socket.on("game:startAndDeal", async (_payload, cb) => {
    const code = socket.data.roomCode;
    if (!code) return cb?.({ ok: false, error: "not_in_room" });

    const requesterKey = _payload?.key || null;

    const res = rooms.startAndDeal(code, socket.id, requesterKey);
    if (!res.ok) return cb?.(res);

    const room = rooms.getRoom(code);

    logGameTransition("GAME_STARTED", {
      roomCode: code,
      triggeredBy: socket.id,
      gameType: room?.gameType,
      playerCount: room?.players?.size ?? 0,
      phase: room?.phase,
      version: res.version,
    });

    cb?.({ ok: true });
    emitRoomState(code);

    const socketsInRoom = await io.in(code).fetchSockets();
    for (const s of socketsInRoom) {
      io.to(s.id).emit("hand:update", rooms.getHand(code, s.id) || []);
      io.to(s.id).emit("score:update", rooms.getScore(code, s.id) ?? 0);
    }
  });

  socket.on("game:playCard", ({ index, cardId }, cb) => {
    const code = socket.data.roomCode;
    if (!code) return cb?.({ ok: false, error: "not_in_room" });

    const now = Date.now();
    if ((actionLockUntil.get(socket.id) || 0) > now) {
      return cb?.({ ok: false, error: "locked" });
    }

    const result = withPlayerLock(code, socket.id, () => {
      const prevScore = rooms.getScore(code, socket.id) ?? 0;

      const res = cardId
        ? rooms.playCardById(code, socket.id, cardId)
        : rooms.playCard(code, socket.id, index);

      if (!res.ok) return res;

      const nextScore = res.score ?? rooms.getScore(code, socket.id) ?? 0;

      const delta = nextScore - prevScore;
      const playedCard = res.playedCard;

      // Private updates for the player who played
      io.to(socket.id).emit("hand:update", res.hand || []);
      io.to(socket.id).emit("score:update", nextScore);

      // Lightweight update to the other clients
      socket.to(code).emit("player:updated", {
        playerId: socket.id,
        handCount: res.hand?.length ?? 0,
        score: nextScore,
      });

      // Authoritative public room state
      const state = emitRoomState(code);

      const actor =
        (state?.players || []).find((p) => p.id === socket.id) || {};

      const actorName = actor.displayName || actor.name || "Player";

      const ev = gameUpdates.pushUpdate(code, {
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

      io.to(code).emit("game:update", ev);

      // Log while the variables still exist in this scope
      logGameTransition("CARD_PLAYED", {
        roomCode: code,
        playerId: socket.id,
        cardId: playedCard?.id ?? cardId ?? null,
        points: delta,
        scoreBefore: prevScore,
        scoreAfter: nextScore,
        version: res.version ?? null,
      });

      return {
        ok: true,
        newScore: nextScore,
        version: res.version,
      };
    });

    return cb?.(result);
  });

  //Retrieves user's hand
  socket.on("hand:getMine", (_, cb) => {
    const code = socket.data.roomCode;
    cb?.({ ok: true, hand: rooms.getHand(code, socket.id) || [] });
  });

  //retrieves user's score
  socket.on("score:getMine", (_, cb) => {
    const code = socket.data.roomCode;
    cb?.({ ok: true, score: rooms.getScore(code, socket.id) ?? 0 });
  });

  //retrieves opponent(s)'s hand
  socket.on("hand:getOpponents", (_, cb) => {
    const code = socket.data.roomCode;
    const opp = rooms.getOpponentsHands
      ? rooms.getOpponentsHands(code, socket.id)
      : null;
    if (opp == null) return cb?.({ ok: false, error: "room_not_found" });
    // Always OK; if disabled, get OpponentsHands returns []
    cb?.({ ok: true, opponents: opp });
  });

  socket.on("event:propose", async (payload = {}, ack) => {
    try {
      const code = socket.data.roomCode;

      if (!code) {
        return ack?.({
          ok: false,
          error: "not_in_room",
        });
      }

      const state = getEnrichedState(code);

      if (!state) {
        return ack?.({
          ok: false,
          error: "room_not_found",
        });
      }

      if (state.phase !== "playing") {
        return ack?.({
          ok: false,
          error: "game_not_playing",
        });
      }

      const proposer = (state.players || []).find(
        (player) => player.id === socket.id,
      );

      if (!proposer) {
        return ack?.({
          ok: false,
          error: "player_not_found",
        });
      }

      const cooldownUntil = eventCooldownByCode.get(code) || 0;

      if (Date.now() < cooldownUntil) {
        return ack?.({
          ok: false,
          error: "cooldown",
          until: cooldownUntil,
        });
      }

      if (pendingEventByCode.has(code)) {
        return ack?.({
          ok: false,
          error: "event_already_pending",
        });
      }

      const eventKey = normalizeEventKey(payload?.eventKey);
      const eventDefinition = getQuickPointEvent(state.gameType, eventKey);

      if (!eventDefinition) {
        return ack?.({
          ok: false,
          error: "invalid_event",
        });
      }

      const { title, points } = eventDefinition;

      const byPlayerId = socket.id;
      const byName = getPlayerDisplayName(state, byPlayerId);

      const totalPlayers = (state.players || []).length;
      const totalEligibleVoters = Math.max(0, totalPlayers - 1);

      if (totalEligibleVoters === 0) {
        return ack?.({
          ok: false,
          error: "no_voters",
        });
      }
      const neededYes = majorityNeeded(totalEligibleVoters);

      const createdAt = Date.now();
      const expiresAt = createdAt + 15_000;

      const pending = {
        id: `${code}-${createdAt}-${Math.random().toString(16).slice(2)}`,

        eventKey,

        // These now came from the server rule table.
        title,
        points,

        byPlayerId,
        byName,
        createdAt,
        expiresAt,
        yes: new Set(),
        no: new Set(),
        timer: null,
      };

      pending.timer = setTimeout(() => {
        resolveEventVoteAtTimeout(code);
      }, 15_000);

      pendingEventByCode.set(code, pending);

      io.to(code).emit(
        "event:proposed",
        summarizePending(pending, totalEligibleVoters),
      );
      logGameTransition("EVENT_PROPOSED", {
        roomCode: code,
        playerId: socket.id,
        eventId: pending.id,
        eventKey,
        title: pending.title,
        points: pending.points,
        neededYes,
        expiresAt: pending.expiresAt,
      });

      return ack?.({
        ok: true,
        id: pending.id,
      });
    } catch (err) {
      console.error("[event:propose] error", err);

      return ack?.({
        ok: false,
        error: "server_error",
      });
    }
  });

  socket.on("event:vote", (payload = {}, ack) => {
    try {
      const code = socket.data.roomCode;
      if (!code) return ack?.({ ok: false, error: "not_in_room" });

      const pending = pendingEventByCode.get(code);
      if (!pending) return ack?.({ ok: false, error: "no_pending_event" });

      if (String(payload?.id || "") !== pending.id) {
        return ack?.({ ok: false, error: "event_id_mismatch" });
      }

      if (Date.now() >= pending.expiresAt) {
        return ack?.({
          ok: false,
          error: "vote_expired",
        });
      }

      const vote =
        payload?.vote === "yes" ? "yes" : payload?.vote === "no" ? "no" : null;
      if (!vote) return ack?.({ ok: false, error: "invalid_vote" });

      //proposer cannot vote
      if (socket.id === pending.byPlayerId) {
        return ack?.({ ok: false, error: "proposer_cannot_vote" });
      }

      const state = getEnrichedState(code);
      if (!state) return ack?.({ ok: false, error: "room_not_found" });

      const voter = (state.players || []).find(
        (player) => player.id === socket.id,
      );

      if (!voter) {
        return ack?.({
          ok: false,
          error: "player_not_found",
        });
      }

      const totalPlayers = (state.players || []).length;
      const totalEligibleVoters = Math.max(0, totalPlayers - 1);
      if (totalEligibleVoters === 0)
        return ack?.({ ok: false, error: "no_voters" });

      //on vote per player: remove from both, the add
      pending.yes.delete(socket.id);
      pending.no.delete(socket.id);

      if (vote === "yes") pending.yes.add(socket.id);
      else pending.no.add(socket.id);

      const neededYes = majorityNeeded(totalEligibleVoters);
      const yesCount = pending.yes.size;
      const noCount = pending.no.size;

      logGameTransition("EVENT_VOTED", {
        roomCode: code,
        playerId: socket.id,
        eventId: pending.id,
        vote,
        yesCount,
        noCount,
        neededYes,
      });

      //broadcast updated counts so clients update UI
      io.to(code).emit(
        "event:updated",
        summarizePending(pending, totalEligibleVoters),
      );

      //majority-yes early approval

      if (yesCount >= neededYes) {
        //award points
        const awardRes = rooms.adjustScore(
          code,
          pending.byPlayerId,
          pending.points,
        );
        const newScore =
          awardRes?.score ?? rooms.getScore(code, pending.byPlayerId) ?? 0;
        logGameTransition("EVENT_RESOLVED", {
          roomCode: code,
          eventId: pending.id,
          proposedBy: pending.byPlayerId,
          outcome: "approved",
          reason: "majority_reached",
          yesCount,
          noCount,
          neededYes,
          pointsAwarded: pending.points,
        });

        io.to(pending.byPlayerId).emit("score:update", newScore);
        io.to(code).emit("player:updated", {
          playerId: pending.byPlayerId,
          score: newScore,
        });
        emitRoomState(code);

        const ev = gameUpdates.pushUpdate(code, {
          type: "EVENT_CONFIRMED",
          player: { id: pending.byPlayerId, name: pending.byName },
          card: { description: pending.title, points: pending.points },
          deltaPoints: pending.points,
          meta: {
            source: "eventBar",
            eventKey: pending.eventKey,
            resolvedBy: "votes",
          },
        });
        io.to(code).emit("game:update", ev);

        io.to(code).emit("event:resolved", {
          ok: true,
          id: pending.id,
          approved: true,
          resolvedBy: "votes",
          eventKey: pending.eventKey,
          title: pending.title,
          points: pending.points,
          byPlayerId: pending.byPlayerId,
          byName: pending.byName,
        });

        setCooldown(code);
        clearPending(code);
      }

      return ack?.({ ok: true });
    } catch (err) {
      console.error("[event:vote] error", err);
      return ack?.({ ok: false, error: "server_error" });
    }
  });

  socket.on("reaction:send", (payload = {}, ack) => {
    try {
      const code = socket.data.roomCode;
      if (!code) {
        return ack?.({ ok: false, error: "not_in_room" });
      }

      const state = getEnrichedState(code);
      if (!state) {
        return ack?.({ ok: false, error: "room_not_found" });
      }

      const player =
        (state.players || []).find((p) => p.id === socket.id) || null;

      if (!player) {
        return ack?.({ ok: false, error: "player_not_found" });
      }

      const now = Date.now();
      const reactionLockKey = `${code}:${socket.id}`;
      const lockedUntil = reactionCooldownByPlayer.get(reactionLockKey) || 0;

      if (now < lockedUntil) {
        return ack?.({
          ok: false,
          error: "reaction_cooldown",
          until: lockedUntil,
        });
      }

      reactionCooldownByPlayer.set(reactionLockKey, now + REACTION_COOLDOWN_MS);

      const allowedReactions = {
        nice: "🔥 Nice!",
        lucky: "😂 Lucky",
        rigged: "😤 Rigged",
        brutal: "💀 Brutal",
      };

      const reactionKey = String(payload?.key || "").trim();
      const reactionLabel = allowedReactions[reactionKey];

      if (!reactionKey || !reactionLabel) {
        return ack?.({ ok: false, error: "invalid_reaction" });
      }

      const reaction = {
        id: `${code}-${socket.id}-${now}-${Math.random().toString(16).slice(2)}`,
        roomCode: code,
        playerId: socket.id,
        playerName: player.displayName || player.name || "Player",
        reactionKey,
        reactionLabel,
        createdAt: now,
      };

      io.to(code).emit("reaction:show", reaction);
      return ack?.({ ok: true, reactionId: reaction.id });
    } catch (err) {
      console.error("[reaction:send] error", err);
      return ack?.({ ok: false, error: "server_error" });
    }
  });

  socket.on("score:adjust", ({ delta, meta } = {}, ack) => {
    try {
      const code = socket.data.roomCode;

      if (!code) {
        return ack?.({
          ok: false,
          error: "not_in_room",
        });
      }

      const n = Number(delta);
      const safeDelta = Number.isFinite(n) ? Math.trunc(n) : 0;

      if (safeDelta === 0) {
        return ack?.({
          ok: false,
          error: "invalid_delta",
        });
      }

      const oldScore = rooms.getScore(code, socket.id) ?? 0;

      const res = rooms.adjustScore(code, socket.id, safeDelta);

      if (!res || res.ok === false) {
        return ack?.({
          ok: false,
          error: res?.error || "player_not_found",
        });
      }

      const newScore = res.score;

      // Private immediate update for the player
      io.to(socket.id).emit("score:update", newScore);

      // Existing lightweight compatibility update
      io.to(code).emit("player:updated", {
        playerId: socket.id,
        score: newScore,
        points: newScore,
      });

      // Authoritative public snapshot
      const state = emitRoomState(code);

      const actor = state?.players?.find((p) => p.id === socket.id) || {};

      const actorName = actor.displayName || actor.name || "Player";

      // Play-by-play
      const ev = gameUpdates.pushUpdate(code, {
        type: "SCORE_ADJUSTED",
        player: {
          id: socket.id,
          name: actorName,
        },
        deltaPoints: safeDelta,
        meta: meta ?? {},
      });

      io.to(code).emit("game:update", ev);

      // Structured log only after everything above succeeded
      logGameTransition("SCORE_ADJUSTED", {
        roomCode: code,
        playerId: socket.id,
        delta: safeDelta,
        scoreBefore: oldScore,
        scoreAfter: newScore,
        source: meta?.source ?? "unknown",
      });

      return ack?.({
        ok: true,
        newScore,
        version: res.version ?? null,
      });
    } catch (err) {
      console.error("[score:adjust] error", err);

      return ack?.({
        ok: false,
        error: "server_error",
      });
    }
  });

  socket.on("player:sacrifice", async (payload = {}, ack) => {
    try {
      const code = socket.data.roomCode;
      const playerId = socket.id;
      const cardId = payload?.cardId;

      if (!code) {
        return ack?.({
          ok: false,
          error: "not_in_room",
        });
      }

      if (!cardId) {
        return ack?.({
          ok: false,
          error: "missing_card",
        });
      }

      // Short shield against an accidental play immediately after sacrifice
      actionLockUntil.set(playerId, Date.now() + ACTION_LOCK_MS);

      const result = withPlayerLock(code, playerId, () => {
        const prevScore = rooms.getScore(code, playerId) ?? 0;

        const roomHand = rooms.getHand(code, playerId) || [];

        const sacrificedFromPrev =
          roomHand.find((c) => c?.id === cardId) || null;

        const res = rooms.sacrificeCard(code, playerId, cardId);

        if (!res || res.ok === false) {
          return (
            res || {
              ok: false,
              error: "sacrifice_failed",
            }
          );
        }

        const hand = Array.isArray(res.hand)
          ? res.hand
          : rooms.getHand(code, playerId) || [];

        const nextScore =
          typeof res.score === "number"
            ? res.score
            : (rooms.getScore(code, playerId) ?? 0);

        const delta = nextScore - prevScore;

        // Private state
        io.to(playerId).emit("hand:update", hand);

        io.to(playerId).emit("score:update", nextScore);

        // Lightweight compatibility update
        socket.to(code).emit("player:updated", {
          playerId,
          handCount: hand.length,
          score: nextScore,
          points: nextScore,
        });

        // Authoritative snapshot for everybody
        const state = emitRoomState(code);

        const actor = state?.players?.find((p) => p.id === playerId) || {};

        const actorName = actor.displayName || actor.name || "Player";

        const sacrificedCard = res.sacrificedCard || sacrificedFromPrev;

        const ev = gameUpdates.pushUpdate(code, {
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

        io.to(code).emit("game:update", ev);

        // Keep log inside this scope
        logGameTransition("CARD_SACRIFICED", {
          roomCode: code,
          playerId,
          cardId: sacrificedCard?.id ?? cardId ?? null,
          points: delta,
          scoreBefore: prevScore,
          scoreAfter: nextScore,
          version: res.version ?? null,
        });

        return {
          ok: true,
          newScore: nextScore,
          version: res.version ?? null,
        };
      });

      if (!result?.ok) {
        actionLockUntil.delete(playerId);
        return ack?.(result);
      }

      return ack?.(result);
    } catch (err) {
      actionLockUntil.delete(socket.id);

      console.error("[player:sacrifice] error:", err);

      return ack?.({
        ok: false,
        error: err?.message || "Could not sacrifice",
      });
    }
  });

  socket.on("game:history:request", () => {
    const code = socket.data.roomCode;
    if (!code) return;
    io.to(socket.id).emit("game:history", gameUpdates.getUpdates(code));
  });

  socket.on("player:activity", () => {
    const code = socket.data.roomCode;
    if (!code) return;

    const room = rooms.getRoom?.(code);
    if (!room) return;

    const player = room.players.get(socket.id);
    if (!player) return;

    player.lastActiveAt = Date.now();
    player.isActive = true;

    emitRoomState(code);
  });

  //Players disconnect and leave the game room
  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    if (!code) return;

    const room = rooms.getRoom(code);
    if (!room) return;

    const player = room.players.get(socket.id);
    if (!player) return;

    const playerSnapshot = {
      id: player.id,
      key: player.key,
      joinedAt: player.joinedAt,
    };

    const wasHost =
      room.hostId === socket.id ||
      (!!room.hostKey && !!player.key && room.hostKey === player.key);

    rooms.handleDisconnect(code, socket.id);
    logGameTransition("PLAYER_DISCONNECTED", {
      roomCode: code,
      playerId: socket.id,
      wasHost,
      phase: room.phase,
      reconnectGraceMs: PLAYER_RECONNECT_GRACE_MS,
    });
    // Every disconnected player eventually expires.
    schedulePlayerEviction(code, playerSnapshot);

    // Host gets a shorter host-specific grace period.
    if (wasHost) {
      scheduleHostReassignment(code, playerSnapshot);
    }

    // If nobody remains connected, start room expiration.
    scheduleEmptyRoomExpiration(code);

    emitRoomState(code);
  });

  socket.on("leaveRoom", (cb) => {
    try {
      const code = socket.data.roomCode;

      if (!code) {
        return cb?.({
          ok: false,
          error: "not_in_room",
        });
      }

      const room = rooms.getRoom(code);

      if (!room) {
        socket.data.roomCode = undefined;
        socket.leave(code);

        return cb?.({
          ok: false,
          error: "room_not_found",
        });
      }

      const player = room.players.get(socket.id);

      if (!player) {
        return cb?.({
          ok: false,
          error: "player_not_found",
        });
      }

      const playerKey = player.key;

      // Intentional leave means all reconnect reservations disappear.
      cancelPlayerLifecycleTimers(code, playerKey || socket.id);

      const result = rooms.removePlayer(code, socket.id, {
        reassignHostIfNeeded: true,
      });

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

      socket.to(code).emit("player:left", {
        playerId: socket.id,
      });

      // Last player intentionally left -> delete immediately.
      if (result.roomEmpty) {
        destroyRoom(code, "last_player_left");

        return cb?.({
          ok: true,
          roomClosed: true,
        });
      }

      // New host is already assigned by roomManager.
      emitRoomState(code);

      if (result.wasHost && result.hostResult?.hostAssigned) {
        io.to(code).emit("host:changed", {
          hostId: result.hostResult.hostId,
        });
      }

      cb?.({
        ok: true,
        roomClosed: false,
      });
    } catch (err) {
      console.error("[leaveRoom] error", err);

      cb?.({
        ok: false,
        error: "leave_failed",
      });
    }
  });
});

const roomLifetimeSweep = setInterval(() => {
  const now = Date.now();

  for (const code of rooms.listCodes()) {
    const room = rooms.getRoom(code);

    if (!room) continue;

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
        isPlaying
          ? "max_game_lifetime"
          : "max_lobby_lifetime",
      );
    }
  }
}, ROOM_SWEEP_INTERVAL_MS);

roomLifetimeSweep.unref?.();
//In production serve the frontend from the same app
if (isProd) {
  const distDir = path.join(__dirname, "../../frontend-vite/dist");
  app.use(express.static(distDir));

  // SPA fallback (avoid socket.io route)
  app.get(/^\/(?!socket\.io\/).*/, (req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

console.log("[boot] starting HTTP server on", PORT);
server.listen(PORT, () => console.log("[boot] listening on :" + PORT));
