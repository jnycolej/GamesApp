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

const isProd = process.env.NODE_ENV === "production";
const allowedOrigins = isProd ? true : ["http://localhost:3000"];
app.use(cors({ origin: allowedOrigins, credentials: true }));

//initiates the server
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: allowedOrigins, credentials: true },
    path: "/socket.io",
    pingInterval: 25000,
    pingTimeout: 90000,
    connectionStateRecovery: {
        // allows clients to recover missed packets for up to 10 minutes
        maxDisconnectionDuration: 10 * 60 * 1000,
    },
});


io.on("connection", (socket) => {
    console.log("[socket] connected", socket.id);
    //Connects the to the socket
    socket.on("room:create", ({ gameType, displayName, key }, cb) => {
        try {
            const { code, token } = rooms.createRoom({ creatorSocketId: socket.id, gameType });
            if (!code) throw new Error("createRoom_no_code");
            console.log("[create] room code:", code, "gameType:", gameType);

            socket.data.roomCode = code;
            socket.join(code);

            const safeName = (displayName || "").trim() || "Host";
            const add = rooms.addPlayer(code, { id: socket.id, displayName: safeName, key }); // pass key
            if (!add.ok) {
                console.warn("[create] addPlayer failed:", add);
                return cb?.(add || { ok: false, error: "add_player_failed" });
            }

            const state = rooms.getPublicState(code);
            io.to(code).emit("room:updated", rooms.safePublicState ? rooms.safePublicState(code) : state);

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

    const res = rooms.resumePlayer(CODE, { newSocketId: socket.id, displayName, key });
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
socket.on('room:get', (_, cb) => {
    const code = socket.data.roomCode;
    if (!code) return cb?.({ ok: false, error: 'not_in_room' });
    cb?.({ ok: true, state: rooms.getPublicState(code) });
});

socket.on("game:startAndDeal", async (_payload, cb) => {
    const code = socket.data.roomCode;
    if (!code) return cb?.({ ok: false, error: "not_in_room" });  // guard

    const res = rooms.startAndDeal(code, socket.id);
    if (!res.ok) return cb?.(res);

    cb?.({ ok: true });
    const state = rooms.getPublicState(code);
    io.to(code).emit("room:updated", rooms.safePublicState ? rooms.safePublicState(code) : state);

    const socketsInRoom = await io.in(code).fetchSockets();
    for (const s of socketsInRoom) {
        io.to(s.id).emit("hand:update", rooms.getHand(code, s.id) || []);
        io.to(s.id).emit("score:update", rooms.getScore(code, s.id) ?? 0);
    }
});

socket.on("game:playCard", ({ index }, cb) => {
    const code = socket.data.roomCode;
    if (!code) return cb?.({ ok: false, error: "not_in_room" });  // guard

    const res = rooms.playCard(code, socket.id, index);
    if (!res.ok) return cb?.(res);

    // Private updates to just this player (full hand + score)
    io.to(socket.id).emit("hand:update", res.hand || []);
    io.to(socket.id).emit("score:update", res.score ?? 0);

    // Public patch to everyone else: do NOT leak the hand, only count + score
    socket.to(code).emit("player:updated", {
        playerId: socket.id,
        handCount: res.hand?.length ?? 0,
        score: res.score ?? 0,
    });

    // Refresh shared public counters (deck/discard/connected flags)
    const state = rooms.getPublicState(code);
    io.to(code).emit("room:updated", rooms.safePublicState ? rooms.safePublicState(code) : state);

    cb?.({ ok: true });
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
    const opp = rooms.getOpponentsHands ? rooms.getOpponentsHands(code, socket.id) : null;
    if (opp == null) return cb?.({ ok: false, error: "room_not_found" });
    // Always OK; if disabled, get OpponentsHands returns []
    cb?.({ ok: true, opponents: opp });
});

//Players disconnect and leave the game room
socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    if (!code) return;
    rooms.handleDisconnect(code, socket.id);
    io.to(code).emit("room:updated", rooms.getPublicState(code));
});

socket.on("leaveRoom", () => {
    
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
