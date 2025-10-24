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

const isProd = process.env.NODE_ENV === "production";
const allowedOrigins = isProd
  ? true
  : ["http://localhost:3000", "http://192.168.1.103:3000"];
app.use(cors({ origin: allowedOrigins, credentials: true }));

//initiates the server
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
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

io.on("connection", (socket) => {
  console.log("[socket] connected", socket.id);
  //Connects the to the socket
  socket.on("room:create", ({ gameType, displayName, key }, cb) => {
    try {
      const { code, token } = rooms.createRoom({
        creatorSocketId: socket.id,
        gameType,
        hostKey: key,
      });

      if (!code) throw new Error("createRoom_no_code");
      console.log("[create] room code:", code, "gameType:", gameType);

      socket.data.roomCode = code;
      socket.join(code);

      const safeName = (displayName || "").trim() || "Host";
      const add = rooms.addPlayer(code, {
        id: socket.id,
        displayName: safeName,
        key,
      }); // pass key
      if (!add.ok) {
        console.warn("[create] addPlayer failed:", add);
        return cb?.(add || { ok: false, error: "add_player_failed" });
      }

      const state = rooms.getPublicState(code);
      io.to(code).emit(
        "room:updated",
        rooms.safePublicState ? rooms.safePublicState(code) : state
      );

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

      const res = rooms.addPlayer(CODE, { id: socket.id, displayName, key });
      if (!res.ok) return cb?.(res);

      socket.data.roomCode = CODE;
      socket.join(CODE);

      const state = rooms.getPublicState(CODE);
      console.log("[join] players now=%d", state?.players?.length || 0);
      cb?.({ ok: true, state });
      io.to(CODE).emit("room:updated", state);
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

    const res = rooms.resumePlayer(CODE, {
      newSocketId: socket.id,
      displayName,
      key,
    });
    if (!res.ok) return cb?.(res);

    socket.data.roomCode = CODE;
    socket.join(CODE);

    // send private state back to this socket
    io.to(socket.id).emit("hand:update", res.hand || []);
    io.to(socket.id).emit("score:update", res.score ?? 0);

    // refresh public state (shows them as connected)
    const state = rooms.getPublicState(CODE);
    io.to(CODE).emit("room:updated", state);

    cb?.({ ok: true, state });
  });

  //Get the room code to display the room code
  socket.on("room:get", (_, cb) => {
    const code = socket.data.roomCode;
    if (!code) return cb?.({ ok: false, error: "not_in_room" });
    cb?.({ ok: true, state: rooms.getPublicState(code) });
  });

  socket.on("game:startAndDeal", async (_payload, cb) => {
    const code = socket.data.roomCode;
    if (!code) return cb?.({ ok: false, error: "not_in_room" }); // guard

    const requesterKey = _payload?.key || null;
    const res = rooms.startAndDeal(code, socket.id, requesterKey);
    if (!res.ok) return cb?.(res);

    cb?.({ ok: true });
    const state = rooms.getPublicState(code);
    io.to(code).emit(
      "room:updated",
      rooms.safePublicState ? rooms.safePublicState(code) : state
    );

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
      const state = rooms.getPublicState(code);
      io.to(code).emit(
        "room:updated",
        rooms.safePublicState ? rooms.safePublicState(code) : state
      );
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
        const state = rooms.getPublicState(code);
        io.to(code).emit(
          "room:updated",
          rooms.safePublicState ? rooms.safePublicState(code) : state
        );
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

      if (!res.ok){ 
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
    io.to(code).emit("room:updated", rooms.getPublicState(code));
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

      const state = rooms.getPublicState(code);
      io.to(code).emit(
        "room:updated",
        rooms.safePublicState ? rooms.safePublicState(code) : state
      );

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
  const buildDir = path.join(__dirname, "../frontend/build");
  app.use(express.static(buildDir));

  // Regex catch-all avoids path-to-regexp pitfalls on newer stacks
  app.get(/^\/(?!socket\.io\/).*/, (req, res) => {
    res.sendFile(path.join(buildDir, "index.html"));
  });
}

const PORT = process.env.PORT || 8080;
console.log("[boot] starting HTTP server on", PORT);
server.listen(PORT, () => console.log("[boot] listening on :" + PORT));
