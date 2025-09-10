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

const isProd = process.env.NODE_ENV === "production";
const allowedOrigins = isProd ? true : ["http://localhost:3000"];

app.use(cors({ origin: allowedOrigins, credentials: true}));

//initiates the server
const server = http.createServer(app);
const io = new Server(server, {
    cors: {origin: allowedOrigins, credentials: true},
    path: "/socket.io",
});

const rooms = createRoomManager();

//Connects the to the socket
io.on("connection", (socket) => {
    //Creates a room based on game type for multiplayer gameplay
    socket.on("room:create", ({ gameType, displayName }, cb) => {
        const code = rooms.createRoom({ creatorSocketId: socket.id, gameType });    //Creates the room based on type
        socket.data.roomCode = code;
        socket.join(code); //Join room
        rooms.addPlayer(code, { id: socket.id, displayName: displayName || "Player" });    //Adds player to the room based on the code
        const state = rooms.getPublicState(code);
        cb?.({ ok: true, roomCode: code, state});
        io.to(code).emit("room:updated", state);
    });

    //Allows player to join room based on room code
    socket.on("player:join", ({ roomCode, displayName }, cb) => {
        const res = rooms.addPlayer(roomCode, { id: socket.id, displayName});
        if(!res.ok) return cb?.(res);
        socket.data.roomCode = roomCode;
        socket.join(roomCode);
        const state = rooms.getPublicState(roomCode);
        cb?.({ ok: true, state});
        io.to(roomCode).emit("room:updated", state);
    });

    //Get the room code to display the room code
    socket.on('room:get', (_, cb) => {
        const code = socket.data.roomCode;
        if(!code) return cb?.({ ok: false, error: 'not_in_room'});
        cb?.({ok: true, state: rooms.getPublicState(code)});
    });

    //start game
    socket.on("game:startAndDeal", async (_payload, cb) => {
        const code = socket.data.roomCode;
        const res = rooms.startAndDeal(code);
        if (!res.ok) return cb?.(res);
        
        cb?.({ ok: true });
        
        //broadcast the public room state (phase=playing, counts, names, etc.)
        const state = rooms.getPublicState(code);
        io.to(code).emit("room:updated", state);

        //send each player their private hand
        const socketsInRoom = await io.in(code).fetchSockets();
        for (const s of socketsInRoom) {
            //const hand = rooms.getHand(code, s.id);
            io.to(s.id).emit("hand:update", rooms.getHand(code, s.id) || []);
            io.to(s.id).emit("score:update", rooms.getScore(code, s.id) ?? 0);   //send starting score (0)
        }
    });

    socket.on("game:playCard", ({ index }, cb) => {
        const code = socket.data.roomCode;
        const res = rooms.playCard(code, socket.id, index);
        if (!res.ok) return cb?.(res);
        //private updates to just this player
        io.to(socket.id).emit("hand:update", res.hand || []);
        io.to(socket.id).emit("score:update", res.score ?? 0);
        cb?.({ ok: true });
    });    
    
    //Retrieves user's hand
    socket.on("hand:getMine", (_ , cb) => {
        const code = socket.data.roomCode;
        cb?.({ ok: true, hand: rooms.getHand(code, socket.id) || []});
    });  

    //retrieves user's score
    socket.on("score:getMine", (_ , cb) => {
        const code = socket.data.roomCode;
        cb?.({ ok: true, score: rooms.getScore(code, socket.id) ?? 0});
    });    

    //retrieves opponent(s)'s hand
    socket.on("hand:getOpponents", (_ , cb) => {
        const code = socket.data.roomCode;
        const opp = rooms.getOpponentsHands ? rooms.getOpponentsHands(code, socket.id) : null;
        if (opp == null) return cb?.({ ok: false, error: "room_not_found" });
        // Always OK; if disabled, get OpponentsHands returns []
        cb?.({ ok: true, opponents: opp});
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
if(isProd) {
    const buildDir = path.join(__dirname, "../frontend/build");
    app.use(express.static(buildDir));

    app.get("/*", (_req, res) => {
        res.sendFile(path.join(buildDir, "index.html"));
    });
}

const PORT = process.env.PORT ||8080;
server.listen(PORT, () => console.log("listening on :" + PORT));