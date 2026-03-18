import http from "http";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import { createRoomManager } from "./roomManager.js";

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

// Short grace period to ignore 'play' after a 'sacrifice'
const actionLockUntil = new Map();
const ACTION_LOCK_MS = 300;

const reactionCooldownByPlayer = new Map();
const REACTION_COOLDOWN_MS = 1200;

const isProd = process.env.NODE_ENV === "production";
const allowedOrigins = isProd
  ? true
  : [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://192.168.1.103:5173",
    ];

// This handles the case where Origin might be undefined in some environments
const corsOptions = {
  origin: (origin, cb) => {
    if (allowedOrigins === true) return cb(null, true);
    if (!origin) return cb(null, true); // allow same-origin / non-browser clients
    return cb(null, allowedOrigins.includes(origin));
  },
  credentials: false,
};
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

const updatesByCode = new Map();
const MAX_UPDATES = 100;

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

function summarizePending(p, totalEligibleVoters) {
  return {
    id: p.id,
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

function pushUpdate(code, ev) {
  const at = Date.now();
  const id =
    ev.id ||
    `${code}-${at}-${ev.type}-${ev?.player?.id ?? ""}-${ev?.card?.id ?? ""}`;
  const full = { id, at, roomCode: code, ...ev };
  const arr = updatesByCode.get(code) || [];
  arr.push(full);
  if (arr.length > MAX_UPDATES) arr.shift();
  updatesByCode.set(code, arr);
  return full;
}

function getUpdates(code) {
  return (updatesByCode.get(code) || []).slice(-MAX_UPDATES);
}

function getEnrichedState(code) {
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
            typeof p.points === "number" && Number.isFinite(p.points)
              ? p.points
              : typeof p.score === "number" && Number.isFinite(p.score)
                ? p.score
                : undefined;

          const score = direct ?? Number(rooms.getScore(code, p.id) ?? 0);
          return { ...p, points: score };
        })
    : [];

  // compute leaderIds
  let leaderIds = [];
  if (players.length > 0) {
    const max = Math.max(
      ...players.map((p) => (Number.isFinite(p.points) ? p.points : 0)),
    );
    leaderIds = players.filter((p) => (p.points ?? 0) === max).map((p) => p.id);
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

io.on("connection", (socket) => {
  console.log("[socket] connected", socket.id);
  //Connects the to the socket
  socket.on("room:create", ({ gameType, displayName, key, matchup }, cb) => {
    try {
      if (!key) {
        return cb?.({ ok: false, error: "missing_player_key"});
      }

      const { code, token } = rooms.createRoom({
        creatorSocketId: socket.id,
        gameType,
        matchup: matchup ?? null,
        hostKey: key,
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
        key,
      }); // pass key
      if (!add.ok) {
        console.warn("[create] addPlayer failed:", add);
        return cb?.(add || { ok: false, error: "add_player_failed" });
      }

      const state = emitRoomState(code);

      return cb?.({ ok: true, roomCode: code, token, state });
    } catch (err) {
      console.error("[create] error:", err);
      return cb?.({ ok: false, error: "create_failed" });
    }
  });
  //Allows player to join room based on room code
  // Allows player to join room based on room code
  socket.on("player:join", ({ roomCode, displayName, key, token }, cb) => {
    try {
      const CODE = String(roomCode || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6);

      console.log("[join] incoming", {
        code: CODE,
        name: (displayName || "").trim(),
        key: (key || "").slice(0, 6) + "...",
        socket: socket.id,
      });

      // Optional: reject if room doesn't exist
      const exists = rooms.getPublicState(CODE);
      if (!exists) {
        console.warn("[join] room_not_found", CODE);
        return cb?.({ ok: false, error: "room_not_found" });
      }
      const safeName =
        String(displayName || "")
          .trim()
          .slice(0, 24) || "Player";

      socket.data.displayName = safeName;

      const res = rooms.addPlayer(CODE, {
        id: socket.id,
        displayName: safeName,
        key,
      });
      if (!res.ok) return cb?.(res);

      socket.data.roomCode = CODE;
      socket.join(CODE);

      const state = emitRoomState(CODE);
      console.log("[join] players now=%d", state?.players?.length || 0);
      cb?.({ ok: true, state });
    } catch (err) {
      console.error("[join] error:", err);
      cb?.({ ok: false, error: "join_failed" });
    }
  });

  // resumes if player disconnects
  socket.on("player:resume", ({ roomCode, displayName, key }, cb) => {
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
      key,
    });
    if (!res.ok) return cb?.(res);

    socket.data.roomCode = CODE;
    socket.join(CODE);

    // send private state back to this socket
    io.to(socket.id).emit("hand:update", res.hand || []);
    io.to(socket.id).emit("score:update", res.score ?? 0);

    // refresh public state (shows them as connected)
    const state = emitRoomState(CODE);

    cb?.({ ok: true, state });
  });

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
      io.to(socket.id).emit("hand:update", res.hand || []);
      io.to(socket.id).emit("score:update", nextScore);
      socket.to(code).emit("player:updated", {
        playerId: socket.id,
        handCount: res.hand?.length ?? 0,
        score: nextScore,
      });
      const state = emitRoomState(code);

      const actor =
        (state?.players || []).find((p) => p.id === socket.id) || {};
      const actorName = actor.displayName || actor.name || "Player";
      const ev = pushUpdate(code, {
        type: "CARD_PLAYED",
        player: { id: socket.id, name: actorName },
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
        meta: { index: typeof index === "number" ? index : undefined, cardId },
      });
      io.to(code).emit("game:update", ev);
      return { ok: true };
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
      if (!code) return ack?.({ ok: false, error: "not_in_room" });
      console.log("[server] event:propose", { code, from: socket.id, payload });
      const cooldownUntil = eventCooldownByCode.get(code) || 0;
      if (Date.now() < cooldownUntil) {
        return ack?.({ ok: false, error: "cooldown", until: cooldownUntil });
      }

      const title = String(payload?.title || "").trim();
      const pointsRaw = Number(payload?.points);
      const points = Number.isFinite(pointsRaw) ? Math.trunc(pointsRaw) : 0;

      if (!title || points <= 0) {
        return ack?.({ ok: false, error: "invalid_event" });
      }

      //Only allow one pending event per room (simple stop-gap)
      if (pendingEventByCode.has(code)) {
        return ack?.({ ok: false, error: "event_already_pending" });
      }

      const state = getEnrichedState(code);
      if (!state) return ack?.({ ok: false, error: "room_not_found" });

      const byPlayerId = socket.id;
      const byName = getPlayerDisplayName(state, byPlayerId);

      //Eligible voters = everyone except the proposer
      const totalPlayers = (state.players || []).length;
      const totalEligibleVoters = Math.max(0, totalPlayers - 1);

      // If no one else is in the room, do NOT allow vote-award flow
      if (totalEligibleVoters === 0) {
        return ack?.({ ok: false, error: "no_voters" });
      }

      const createdAt = Date.now();
      const expiresAt = createdAt + 15000;

      const pending = {
        id: `${code}-${createdAt}-${Math.random().toString(16).slice(2)}`,
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

      //Start the 15s timer
      pending.timer = setTimeout(() => {
        //Option B: Timeout does NOT auto-award unless someone voted
        //Approve at timeout only if yes ? no AND at least 1 vote occurred
        const p = pendingEventByCode.get(code);
        if (!p) return;

        const yesCount = p.yes.size;
        const noCount = p.no.size;
        const totalVotes = yesCount + noCount;

        if (totalVotes === 0) {
          //nobody voted -> reject
          io.to(code).emit("event:resolved", {
            ok: false,
            id: p.id,
            reason: "no_votes",
          });
          clearPending(code);
          return;
        }

        const approved = yesCount > noCount;
        if (!approved) {
          io.to(code).emit("event:resolved", {
            ok: false,
            id: p.id,
            reason: "vote_failed",
          });
          clearPending(code);
          return;
        }

        //Approved at timeout -> award
        const awardRes = rooms.adjustScore(code, p.byPlayerId, p.points);
        const newScore =
          awardRes?.score ?? rooms.getScore(code, p.byPlayerId) ?? 0;

        //update client score immediately
        io.to(p.byPlayerId).emit("score:update", newScore);
        io.to(code).emit("player:updated", {
          playerId: p.byPlayerId,
          score: newScore,
        });
        emitRoomState(code);

        //push update feed
        const ev = pushUpdate(code, {
          type: "EVENT_CONFIRMED",
          player: { id: p.byPlayerId, name: p.byName },
          card: { description: p.title, points: p.points },
          deltaPoints: p.points,
          meta: { source: "eventBar", resolvedBy: "timeout" },
        });
        io.to(code).emit("game:update", ev);

        io.to(code).emit("event:resolved", {
          ok: true,
          id: p.id,
          approved: true,
          resolvedBy: "timeout",
          title: p.title,
          points: p.points,
          byPlayerId: p.byPlayerId,
          byName: p.byName,
        });
        setCooldown(code);
        clearPending(code);
      }, 15000);

      pendingEventByCode.set(code, pending);

      //Broadcast proposal to everyone (so all clients open the modal)
      io.to(code).emit(
        "event:proposed",
        summarizePending(pending, totalEligibleVoters),
      );

      return ack?.({ ok: true, id: pending.id });
    } catch (err) {
      console.error("[event:propose] error", err);
      return ack?.({ ok: false, error: "server_error" });
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

      const vote =
        payload?.vote === "yes" ? "yes" : payload?.vote === "no" ? "no" : null;
      if (!vote) return ack?.({ ok: false, error: "invalid_vote" });

      //proposer cannot vote
      if (socket.id === pending.byPlayerId) {
        return ack?.({ ok: false, error: "proposer_cannot_vote" });
      }

      const state = getEnrichedState(code);
      if (!state) return ack?.({ ok: false, error: "room_not_found" });

      const totalPlayers = (state.players || []).length;
      const totalEligibleVoters = Math.max(0, totalPlayers - 1);
      if (totalEligibleVoters === 0)
        return ack?.({ ok: false, error: "no_voters" });

      //on vote per player: remove from both, the add
      pending.yes.delete(socket.id);
      pending.no.delete(socket.id);
      if (vote === "yes") pending.yes.add(socket.id);
      else pending.no.add(socket.id);

      //broadcast updated counts so clients update UI
      io.to(code).emit(
        "event:updated",
        summarizePending(pending, totalEligibleVoters),
      );

      //majority-yes early approval
      const neededYes = majorityNeeded(totalEligibleVoters);
      const yesCount = pending.yes.size;

      if (yesCount >= neededYes) {
        //award points
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

        const ev = pushUpdate(code, {
          type: "EVENT_CONFIRMED",
          player: { id: pending.byPlayerId, name: pending.byName },
          card: { description: pending.title, points: pending.points },
          deltaPoints: pending.points,
          meta: { source: "eventBar", resolvedBy: "votes" },
        });
        io.to(code).emit("game:update", ev);

        io.to(code).emit("event:resolved", {
          ok: true,
          id: pending.id,
          approved: true,
          resolvedBy: "votes",
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

    reactionCooldownByPlayer.set(
      reactionLockKey,
      now + REACTION_COOLDOWN_MS,
    );

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

  socket.on("score:adjust", ({ delta }, ack) => {
    try {
      const code = socket.data.roomCode;
      if (!code) return ack?.({ ok: false, error: "not in a room" });

      // validate delta
      const n = Number(delta);
      const safeDelta = Number.isFinite(n) ? Math.trunc(n) : 0;
      if (safeDelta === 0) return ack?.({ ok: false, error: "invalid delta" });

      const res = rooms.adjustScore(code, socket.id, safeDelta);
      if (!res || res.ok === false)
        return ack?.({
          ok: false,
          error: res?.error || "room/player not found",
        });

      const newScore = res.score;

      ack?.({ ok: true, newScore, version: res.version ?? Date.now() });
      io.to(socket.id).emit("score:update", newScore);
      io.to(code).emit("player:updated", {
        playerId: socket.id,
        score: newScore,
      });
    } catch (err) {
      console.error("[score:adjust] error", err);
      ack?.({ ok: false, error: "server error" });
    }
  });

  socket.on("player:sacrifice", async (payload = {}, ack) => {
    try {
      const code = socket.data.roomCode;
      const playerId = socket.id;
      const cardId = payload?.cardId;

      if (!code) throw new Error("not_in_room");
      if (!cardId) throw new Error("missing_card");

      //Sets a short-time lock to block any follow-up 'play'
      actionLockUntil.set(playerId, Date.now() + ACTION_LOCK_MS);

      const res = withPlayerLock(code, playerId, () => {
        const prevScore = rooms.getScore(code, playerId) ?? 0;
        const roomHand = rooms.getHand(code, playerId) || [];
        const sacrificedFromPrev =
          roomHand.find((c) => c?.id === cardId) || null;
        const r = rooms.sacrificeCard(code, playerId, cardId);
        if (r && r.ok === false) return r;
        const hand = rooms.getHand(code, playerId) || [];
        const score = rooms.getScore(code, playerId) ?? 0;
        const delta = score - prevScore; // negative
        io.to(playerId).emit("hand:update", hand);
        io.to(playerId).emit("score:update", score);
        socket
          .to(code)
          .emit("player:updated", { playerId, handCount: hand.length, score });

        const state = emitRoomState(code);

        const actor =
          (state?.players || []).find((p) => p.id === playerId) || {};
        const actorName = actor.displayName || actor.name || "Player";
        const sacrificedCard = r.sacrificedCard || sacrificedFromPrev;
        const ev = pushUpdate(code, {
          type: "CARD_SACRIFICED",
          player: { id: playerId, name: actorName },
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
          deltaPoints: Number(delta) || -1,
          meta: { cardId },
        });
        io.to(code).emit("game:update", ev);
        return { ok: true };
      });

      if (!res.ok) {
        actionLockUntil.delete(playerId);
        return ack?.(res);
      }

      return ack?.({ ok: true });
    } catch (err) {
      actionLockUntil.delete(socket.id);
      console.error("[player:sacrifice] error:", err);
      ack?.({ error: err?.message || "Could not sacrifice" });
      socket.emit("error:action", {
        action: "sacrifice",
        message: err?.message || "Could not sacrifice",
      });
    }
  });

  socket.on("game:history:request", () => {
    const code = socket.data.roomCode;
    if (!code) return;
    io.to(socket.id).emit("game:history", getUpdates(code));
  });

  //Players disconnect and leave the game room
  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    if (!code) return;
    rooms.handleDisconnect(code, socket.id);
    emitRoomState(code);
  });

  socket.on("leaveRoom", (cb) => {
    try {
      const code = socket.data.roomCode;
      if (!code) return cb?.({ ok: false, error: "not_in_room" });

      //Update room state
      if (typeof rooms.removePlayer === "function") {
        rooms.removePlayer(code, socket.id);
      } else if (typeof rooms.handleDisconnect === "function") {
        rooms.handleDisconnect(code, socket.id);
      }

      socket.leave(code);
      socket.data.roomCode = undefined;

      emitRoomState(code);

      //Let clients know explicitly who left
      socket.to(code).emit("player:left", { playerId: socket.id });

      //Clear up empty rooms if your manager supports it
      if (typeof rooms.destroyIfEmpty === "function") {
        rooms.destroyIfEmpty(code);
      }

      cb?.({ ok: true });
    } catch (err) {
      console.error("[leaveRoom] error", err);
      cb?.({ ok: false, error: "leave_failed" });
    }
  });
});

//In production serve the frontend from the same app
if (isProd) {
  const distDir = path.join(__dirname, "../frontend-vite/dist");
  app.use(express.static(distDir));

  // SPA fallback (avoid socket.io route)
  app.get(/^\/(?!socket\.io\/).*/, (req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

const PORT = process.env.PORT || 8080;
console.log("[boot] starting HTTP server on", PORT);
server.listen(PORT, () => console.log("[boot] listening on :" + PORT));
