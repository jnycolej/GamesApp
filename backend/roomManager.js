import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { networkInterfaces } from "os";

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
        const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let s = "";
        for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
        return roomMap.has(s) ? genCode() : s;
    };

    //Opaque invite token (embed in the deep link)
    const genToken = (bytes = 16) => crypto.randomBytes(bytes).toString("base64url");

    //Build a deep link for the frontend
    const buildInviteUrl = ({ origin, gameType, code, token }) => 
        `${origin}/${gameType}/join?room=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}`;

    //Creates a room for multiplayer gameplay based on type
    function createRoom({ creatorSocketId, gameType }) {
        const code = genCode();
        roomMap.set(code, {
            code,
            gameType: gameType || 'football',
            status: "waiting",
            phase: "lobby",
            hostId: creatorSocketId,
            invite: {token, createdAt: networkInterfaces, ttlMs: 1000 * 60 *60 },
            players: new Map(),
            deckMode: "infinite",
            deckBase: loadDeck(gameType || 'football'),
            drawCount: 0,
            discardPile: [],
            settings: { handSize: 5, openHandsAllowed: true, minPlayers: 1 },
            version: 0,
        });

        return {
            code,
            token,
            inviteUrl: origin
                ? buildInviteUrl({ origin, gameType: gameType || "football", code, token })
                : null,
            isHost: true,
        };
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
    function startAndDeal(code, requesterId) {
        const r = roomMap.get(code);
        if (!r) return { ok: false, error: "room_not_found" }; // IMPORTANT

        //Host gate
        if (r.hostId !== requesterId) {
            return { ok: false, error: "already_started"};
        }
        const minPlayers = r.settings?.minPlayers ?? 1;
        if(r.players.size < minPlayers) {
            return { ok: false, error: "not_enough_players", need: minPlayers };
        }

        r.phase = "playing";
        r.status = "active";
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

function getClientLobbyState(code, requesterId, origin) {
    const r = roomMap.get(code);
    if (!r) return null;
    const isHost = r.hostId === requesterId;

    return {
        ...getPublicState(code),
        isHost,
        inviteUrl: isHost && origin
            ? buildInviteUrl({ origin, gameType: r.gameType, code: r.code, token: r.invite.token})
            : null,
    };
}

function validateInvite(code, token) {
    const r = roomMap.get(code);
    if (!r) return { ok: false, error: "room_not_found"};
    const inv = r.invite;
    if (!inv) return { ok: false, error: "no_invite"};
    if (inv.token !== token) return { ok:false, error: "bad_token"};
    if (inv.ttlMs && Date.now() - inv.createdAt > inv.ttlMs) {
        return { ok: false, error: "token_expired"};
    }
    return {ok: true};
}
  // allow full-hand broadcasting when enabled
  const allowOpenHands = !!(r.settings && r.settings.openHandsAllowed);

  return {
    code: r.code,
    gameType: r.gameType,
    phase: r.phase,
    players: [...r.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      connected: !!p.connected,
      // if open hands, send full hand; otherwise just the count
      ...(allowOpenHands
        ? { hand: p.hand }
        : { handCount: p.hand.length }),
    })),
    // in infinite mode deckCount isn't meaningful; keep null/"∞" as you prefer
    deckCount: r.drawPile ? r.drawPile.length : null,
    discardCount: r.discardPile ? r.discardPile.length : 0,
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
        getClientLobbyState,
        validateInvite,
        handleDisconnect,
        getVersion
    };
}
