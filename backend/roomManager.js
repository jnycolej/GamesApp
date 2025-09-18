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
// add this helper near the top
function ensureDeckBase(r) {
    if (!r.deckBase) r.deckBase = loadDeck(r.gameType || "football");
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
            meta: { ...(c.meta || {}), penalty: pen, points: pts },
        };

    });
}

function drawCardFromBase(r) {
    if (!r) throw new Error("drawCardFromBase called with no room");
    if (!r.deckBase) r.deckBase = loadDeck(r.gameType || "football");
    const base = r.deckBase;
    if (!base?.length) throw new Error("No base deck loaded");

    const tpl = base[Math.floor(Math.random() * base.length)];
    const instanceId = crypto.randomUUID();

    return {
        ...tpl,
        id: instanceId,          // IMPORTANT: keep property name `id` for React keys & your UI
        instanceId,              // optional: also expose instanceId if you want
        templateId: tpl.id,      // optional: which template it came from
    };
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
    function createRoom({ creatorSocketId, gameType }) {
        const code = genCode();
        roomMap.set(code, {
            code,
            gameType: gameType || 'football',
            phase: "lobby",
            players: new Map(),
            deckMode: "infinite",
            deckBase: loadDeck(gameType || 'football'),
            drawCount: 0,
            discardPile: [],
            settings: { handSize: 5, openHandsAllowed: true },
            version: 0,
        });
        return code;
    }

    function addPlayer(code, { id, displayName, key }) {
        const r = roomMap.get(code);
        if (!r) return { ok: false, error: "room_not_found" };
        r.players.set(id, {
            id,
            key: key || null,            // NEW
            name: displayName || "Player",
            hand: [],
            connected: true,
            score: 0,
        });
        return { ok: true };
    }

    // Rebind an old player entry (found by key) to the new socket id
    function resumePlayer(code, { newSocketId, key, displayName }) {
        const r = roomMap.get(code);
        if (!r) return { ok: false, error: "room_not_found" };
        if (!key) return { ok: false, error: "missing_key" };

        const old = [...r.players.values()].find(p => p.key === key);
        if (!old) return { ok: false, error: "no_player_for_key" };

        r.players.delete(old.id);       // move entry under new socket id
        old.id = newSocketId;
        old.connected = true;
        if (displayName) old.name = displayName;
        r.players.set(newSocketId, old);

        return { ok: true, hand: old.hand, score: old.score };
    }
    function startAndDeal(code) {
        const r = roomMap.get(code);
        if (!r) return { ok: false, error: "room_not_found" }; // IMPORTANT

        r.phase = "playing";
        r.discardPile = [];
        r.drawCount = 0;

        const H = r.settings?.handSize ?? 5;
        for (const player of r.players.values()) {
            player.hand = [];
            player.score = 0;
            for (let i = 0; i < H; i++) {
                player.hand.push(drawCardFromBase(r));
                r.drawCount++;
            }
        }

        r.version += 1;
        return { ok: true, version: r.version };
    }

    function getOpponentsHands(code, requesterId) {
        const r = roomMap.get(code);
        if (!r) return null;
        if (!r.settings?.openHandsAllowed) return [];
        return [...r.players.values()]
            .filter((p) => p.id !== requesterId)
            .map((p) => ({
                id: p.id,
                name: p.name,
                hand: p.hand,
            }));
    }

    function playCard(code, socketId, index) {
        const r = roomMap.get(code);
        if (!r) return { ok: false, error: "room_not_found" };

        const player = r.players.get(socketId);   // <- use `player`
        if (!player) return { ok: false, error: "not_in_room" };
        if (r.phase !== "playing") return { ok: false, error: "not_playing" };
        if (index == null || index < 0 || index >= player.hand.length) {
            return { ok: false, error: "bad_index" };
        }

        const picked = player.hand[index];
        const pts = Number.isFinite(picked.points) ? picked.points : 0;
        player.score += pts;

        // (optional) keep history
        r.discardPile.push(picked);

        // semi-infinite replacement
        const replacement = drawCardFromBase(r);
        player.hand[index] = replacement;        // <- write to `player`, not `p`
        r.drawCount = (r.drawCount || 0) + 1;

        r.version = (r.version || 0) + 1;
        return { ok: true, hand: player.hand, score: player.score, version: r.version };
    }

    function getVersion(code) {
        const r = roomMap.get(code);
        return r ? r.version : 0;
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
                connected: p.connected,
                ...(open
                    ? { hand: p.hand }
                    : { handCount: p.hand.length }
                ),
            })),
            deckCount: r.drawPile ? r.drawPile.length : null,
            discardCount: r.discardPile.length,
        };
    }

    function handleDisconnect(code, socketId) {
        const r = roomMap.get(code);
        if (!r) return {};
        const p = r.players.get(socketId);
        if (p) {
            p.connected = false;
            clearTimeout(p._evictTimer);
            p._evictTimer = setTimeout(() => {
                if (!p.connected) r.players.delete(socketId);
            }, 120000); // 2 minutes
        }
        return { roomClosed: false };
    }


    return {
        createRoom,
        addPlayer,
        resumePlayer,
        startAndDeal,
        playCard,
        getHand,
        getScore,
        getOpponentsHands,
        getPublicState,
        handleDisconnect,
        getVersion
    };
}
