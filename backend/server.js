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

const isProd = process.env.NODE_ENV === "production";
const allowedOrigins = isProd ? true : ["http://localhost:3000"];
app.use(cors({ origin: allowedOrigins, credentials: true }));

//initiates the server
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: allowedOrigins, credentials: true },
    path: "/socket.io",
});

const rooms = createRoomManager();

io.on("connection", (socket) => {

//Connects the to the socket
socket.on("room:create", ({ gameType, displayName, key }, cb) => {
    const {code, token} = rooms.createRoom({ creatorSocketId: socket.id, gameType });
    socket.data.roomCode = code;
    socket.join(code);
    const add = rooms.addPlayer(code, { id: socket.id, displayName: displayName || "Player", key }); // pass key
    if (!add.ok) return cb?.(add);

    cb?.({ ok: true, roomCode: code, token });

    //Broadcast state so UI shows the host as player1
    const state = rooms.getPublicState(code);
    io.to(code).emit("room:updated", state);
});

//Allows player to join room based on room code
socket.on("player:join", ({ roomCode, displayName, key, token }, cb) => {
    
    const check = rooms.validateInvite(roomCode, token ?? "");
    if (!check.ok) return cb?.(check);

    const res = rooms.addPlayer(roomCode, { id: socket.id, displayName, key });
    if (!res.ok) return cb?.(res);
    socket.data.roomCode = roomCode;
    socket.join(roomCode);
    const state = rooms.getPublicState(roomCode);
    cb?.({ ok: true, state });
    io.to(roomCode).emit("room:updated", state);
});

// resumes if player disconnects
socket.on("player:resume", ({ roomCode, displayName, key }, cb) => {
    const res = rooms.resumePlayer(roomCode, { newSocketId: socket.id, displayName, key });
    if (!res.ok) return cb?.(res);

    socket.data.roomCode = roomCode;
    socket.join(roomCode);

    // send private state back to this socket
    io.to(socket.id).emit("hand:update", res.hand || []);
    io.to(socket.id).emit("score:update", res.score ?? 0);

    // refresh public state (shows them as connected)
    const state = rooms.getPublicState(roomCode);
    io.to(roomCode).emit("room:updated", state);

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
    io.to(code).emit("room:updated", state);

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
    io.to(code).emit("room:updated", state);

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
server.listen(PORT, () => console.log("listening on :" + PORT));
