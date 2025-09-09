import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function loadDeck(gameType) {
    const file = 
        gameType === "baseball"
            ? path.join(__dirname, "data", "baseballDeck.json")
            : path.join(__dirname, "data", "footballDeck.json");
    
    if (!fs.existsSync(file)) {
        throw new Error(`Deck file not found" ${file}`);
    }

    const raw = JSON.parse(fs.readFileSync(file, "utf8"));

    //normalize cards and ensure each has an id
    return raw.map((c) => {

        const pts = 
            Number.isFinite(c.points) ? c.points : 
            (c.points != null ? Number(c.points) : 0);
        
        const desc = c.description ?? c.title ?? c.name ?? "";
        const pen = c.penalty ?? "";

        return {
            id: c.id ?? crypto.randomUUID(),
            // presernve your original fields so the client can render them
            // description: c.description ?? c.title ?? c.name ?? "",
            // penalty: c.penalty ?? "",
            // points: Number.isFinite(c.points) ? c.points : (c.points ? Number(c.points) : 0),
            description: desc,
            penalty: pen,
            points: pts,
            
            // keep a couple convenience fields if you want
            title: c.title ?? desc ?? "Card",
            text: c.text ?? desc ?? "",
            meta: { ...(c.meta || {}), penalty: pen, points: pts},            
        };

    });
}
export function createRoomManager() {
    const roomMap = new Map();

    //Generates random for character room code for user input
    const genCode = () => {
        const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789";
        let s = "";
        for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
        return roomMap.has(s) ? genCode() : s;
    };

    //Creates a room for multiplayer gameplay based on type
    function createRoom({ creatorSocketId, gameType}) {
        const code = genCode();
        roomMap.set(code, {
            code,
            gameType: gameType || 'football',
            phase: "lobby",
            players: new Map(),
            drawPile: [],
            discardPile: [],
            settings: { handSize: 5, openHandsAllowed: true }
        });
        return code;
    }

    function addPlayer(code, { id, displayName }) {
        const r = roomMap.get(code);
        if (!r) return { ok: false, error: "room_not_found"};
        r.players.set(id, { id, name: displayName || "Player", hand: [], connected: true, score: 0 });
        return { ok: true };
    }

    function startAndDeal(code) {
        const r = roomMap.get(code);
        if (!r) return { ok: false, error: "room_not_found"};
        if (r.players.size === 0) return { ok: false, error: "no_players"};

        //load and shuffle a fresh deck based on game type
        const deck = shuffle(loadDeck(r.gameType));
        r.drawPile = deck;
        r.discardPile = [];
        r.phase = "playing";

        //deal
        const H = (r.settings?.handSize ?? 5);
        for (const p of r.players.values()) {
            p.hand = [];
            p.score = 0;    //reset score at start
            for (let i = 0; i < H; i++) { 
                const card = r.drawPile.pop();
                if (card) p.hand.push(card);
            }
        }
        return { ok: true };
    }

    function getOpponentsHands(code, requesterId) {
        const r = roomMap.get(code);
        if (!r) return null;
        if (!r.settings?.openHandsAllowed) return [];
        return [...r.players.values()]
            .filter((p) => p.id !==requesterId)
            .map((p) => ({
                id: p.id,
                name: p.name,
                hand: p.hand,
            }));
    }

    function playCard(code, socketId, index) { 
        const r = roomMap.get(code);
        if (!r) return { ok: false, error: "room_not_found"};
        const p = r.players.get(socketId);
        if (!p) return { ok: false, error: "not_in_room"};
        if (r.phase !== "playing") return { ok: false, error: "not_playing"};
        if (index == null || index < 0 || index >= p.hand.length) return {ok: false, error: "bad_index"};

        const picked = p.hand[index];
        const pts = Number.isFinite(picked.points) ? picked.points : 0;
        p.score += pts;

        //discard the used card
        r.discardPile.push(picked);

        //draw a replacement
        if (r.drawPile.length === 0) {
            //reshuffle if needed
            r.drawPile = shuffle(r.discardPile.splice(0));
        }
        const replacement = r.drawPile.pop() || null;
        if (replacement) p.hand[index] = replacement;
        else p.hand.splice(index, 1);   //no more cards, shrink hand

        return { ok: true, hand: p.hand, score: p.score};
    }

    function getHand(code, socketId) {
        const r = roomMap.get(code);
        if (!r) return null;
        const p = r.players.get(socketId);
        return p ? p.hand : null;
    }

    function getScore(code, socketId) {
        const r = roomMap.get(code);
        if (!r) return 0;
        const p = r.players.get(socketId);
        return p ? p.score : 0;
    }

    function getPublicState(code) {
        const r = roomMap.get(code);
        if (!r) return null;
        return {
            code: r.code,
            gameType: r.gameType,
            phase: r.phase,
            players: [...r.players.values()].map(p => ({
                id: p.id, 
                name: p.name, 
                handCount: p.hand.length, 
                connected: p.connected
            })),
            deckCount: r.drawPile.length,
            discardCount: r.discardPile.length,
        };
    }

    function handleDisconnect(code, socketId) {
        const r = roomMap.get(code);
        if (!r) return {};
        const p = r.players.get(socketId);
        if (p) p.connected = false;
        return { roomClosed: false };
    }

    return { createRoom,
         addPlayer, 
         startAndDeal,
         playCard, 
         getHand, 
         getScore,
         getOpponentsHands,
         getPublicState, 
         handleDisconnect 
    };
}