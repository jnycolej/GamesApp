import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const listeners = process.rawListeners("warning");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOM_CODE_LEN = 6;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function uid(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

function genCode(len = ROOM_CODE_LEN) {
  let out = "";
  for (let i = 0; i < len; i++) {
    const idx = crypto.randomInt(0, CODE_ALPHABET.length);
    out += CODE_ALPHABET[idx];
  }
  return out;
}
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

const RARITY_TO_WEIGHT = {
  common: 5,
  semicommon: 4,
  uncommon: 3,
  unusual: 2,
  rare: 1,
};

function loadDeck(gameType) {
  const file =
    gameType === "baseball"
      ? path.join(__dirname, "data", "baseballDeck.json")
      : path.join(__dirname, "data", "footballDeck.json");

  if (!fs.existsSync(file)) {
    throw new Error(`Deck file not found: ${file}`);
  }

  const raw = JSON.parse(fs.readFileSync(file, "utf8"));

  //normalize cards and ensure each has an id
  return raw.map((c) => {
    const pts = Number.isFinite(c.points)
      ? c.points
      : c.points != null
      ? Number(c.points)
      : 0;

    const desc = c.description ?? c.title ?? c.name ?? "";
    const pen = c.penalty ?? "";

    let w;
    if (c.weight != null) {
      const parsed = Number(c.weight);
      w = Number.isFinite(parsed) ? parsed : 1;
    } else if (c.rarity) {
      const key = String(c.rarity).toLowerCase();
      w = RARITY_TO_WEIGHT[key] ?? 1;
    } else {
      w = 1;
    }
    const weight = Math.max(1, Math.floor(w));

    return {
      id: c.id ?? crypto.randomUUID(),
      description: desc,
      penalty: pen,
      points: pts,

      // keep a couple convenience fields if you want
      title: c.title ?? desc ?? "Card",
      text: c.text ?? desc ?? "",
      meta: { ...(c.meta || {}), penalty: pen, points: pts },

      rarity: c.rarity ?? null,
      weight,
    };
  });
}

function buildWeightedDeck(baseDeck) {
  const expanded = [];
  for (const card of baseDeck) {
    const copies = card.weight || 1;
    for (let i = 0; i < copies; i++) {
      expanded.push({ ...card });
    }
  }
  return shuffle(expanded);
}

function drawCardFromBase(r) {
  if (!r) throw new Error("drawCardFromBase called with no room");
  if (!r.deckBase) r.deckBase = loadDeck(r.gameType || "football");
  const base = r.deckBase;
  if (!base?.length) throw new Error("No base deck loaded");

  const total = base.reduce((s, c) => s + (c.weight || 1), 0);
  let rnum = Math.random() * total;
  let tpl = base[0];
  for (const c of base) {
    rnum -= c.weight || 1;
    if (rnum <= 0) {
      tpl = c;
      break;
    }
  }

  const instanceId = crypto.randomUUID();
  return {
    ...tpl,
    id: instanceId, // IMPORTANT: keep property name `id` for React keys & your UI
    instanceId,
    templateId: tpl.id, // which template it came from
  };
}

const buildInviteUrl = ({ origin, gameType, code, token }) =>
  `${origin}/${gameType}/join?room=${encodeURIComponent(
    code
  )}&token=${encodeURIComponent(token)}`;

export function createRoomManager() {
  const roomMap = new Map();

  
  //Creates a room for multiplayer gameplay based on type
  function createRoom({ creatorSocketId, gameType, hostKey }) {
    let code;
    for (let attempts = 0; attempts < 5; attempts++) {
      code = genCode();
      if (!roomMap.has(code)) break;
      code = null;
    }
    if (!code) {
      // as a last resort
      code = genCode(ROOM_CODE_LEN + 1);
    }
    const token = uid(8);

    const room = {
      code,
      gameType,
      createdAt: Date.now(),
      status: "waiting",
      phase: "lobby",
      hostId: creatorSocketId,
      hostKey: hostKey || null,
      invite: { token, createdAt: Date.now(), ttlMs: 1000 * 60 * 60 },
      players: new Map(),
      deckMode: "infinite",
      deckBase: loadDeck(gameType || "football"),
      drawCount: 0,
      discardPile: [],
      settings: { handSize: 5, openHandsAllowed: true, minPlayers: 1 },
      version: 0,
    };
    roomMap.set(code, room);

    return { code, token };
  }

  function addPlayer(code, { id, displayName, key }) {
    const r = roomMap.get(code);
    if (!r) return { ok: false, error: "room_not_found" };

    //If the joining player has a key that already exists, treat as resume
    if (key) {
      const prev = [...r.players.values()].find((p) => p.key === key);
      if (prev) {
        r.players.delete(prev.id);
        prev.id = id;
        prev.connected = true;
        if (displayName) prev.name = displayName;
        r.players.set(id, prev);
        //If this key is the host's key, rebind hostId to the new socket id
        if (r.hostKey && r.hostKey === key) {
          r.hostId = id;
        }
        return { ok: true, resumed: true };
      }
    }

    r.players.set(id, {
      id,
      key: key || null,
      name: displayName || "Player",
      hand: [],
      connected: true,
      score: 0,
    });

    if (!r.hostKey && key && r.hostId === id) {
      r.hostKey = key;
    }

    return { ok: true };
  }

  // Rebind an old player entry (found by key) to the new socket id
  function resumePlayer(code, { newSocketId, key, displayName }) {
    const r = roomMap.get(code);
    if (!r) return { ok: false, error: "room_not_found" };
    if (!key) return { ok: false, error: "missing_key" };

    const old = [...r.players.values()].find((p) => p.key === key);
    if (!old) return { ok: false, error: "no_player_for_key" };

    r.players.delete(old.id); // move entry under new socket id
    old.id = newSocketId;
    old.connected = true;
    if (old._evictTimer) {
      clearTimeout(old._evictTimer);
      old._evictTimer = null;
    }
    if (displayName) old.name = displayName;
    r.players.set(newSocketId, old);

    //If this key is the host, update hostId to the new live socket
    if (r.hostKey && r.hostKey === key) {
      r.hostId = newSocketId;
    }

    return { ok: true, hand: old.hand, score: old.score };
  }

  function startAndDeal(code, requesterId) {
    const r = roomMap.get(code);
    if (!r) return { ok: false, error: "room_not_found" }; // IMPORTANT

    //Host gate
    if (r.hostId !== requesterId) {
      return { ok: false, error: "not_host" };
    }
    const minPlayers = r.settings?.minPlayers ?? 1;
    if (r.players.size < minPlayers) {
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

    const player = r.players.get(socketId); // <- use `player`
    if (!player) return { ok: false, error: "not_in_room" };
    if (r.phase !== "playing") return { ok: false, error: "not_playing" };
    if (index == null || index < 0 || index >= player.hand.length) {
      return { ok: false, error: "bad_index" };
    }

    const picked = player.hand[index];
    const playedSnap = picked
      ? {
          id: picked.id,
          name: picked.title ?? picked.name ?? picked.description ?? "Card",
          description:
            picked.description ??
            picked.text ??
            picked.penalty ??
            "",
          points: Number.isFinite(picked.points) ? picked.points : 0,
        }
      : null;

    const pts = Number.isFinite(picked.points) ? picked.points : 0;
    player.score += pts;

    // keep history
    r.discardPile.push(picked);

    // semi-infinite replacement
    const replacement = drawCardFromBase(r);
    player.hand[index] = replacement; // <- write to `player`, not `p`
    r.drawCount = (r.drawCount || 0) + 1;

    r.version = (r.version || 0) + 1;

    return {
      ok: true,
      hand: player.hand,
      score: player.score,
      version: r.version,
      playedCard: playedSnap,
      replacementCard: {
        id: replacement.id,
        name: replacement.title ?? replacement.name ?? replacement.description ?? "Card",
        description: replacement.description ?? replacement.text ?? replacement.penalty ?? "",
        points: Number.isFinite(replacement.points) ? replacement.points : 0,
      },
    };
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
  function adjustScore(code, socketId, delta) {
    const r = roomMap.get(code);
    if(!r) return { ok: false, error: "room_not_found"};

    const p = r.players.get(socketId);
    if(!p) return { ok: false, error: "not_in_room"};

    const d = Number(delta);
    if (!Number.isFinite(d)) return { ok: false, error: "bad_delta"};

    p.score += d;
    r.version = (r.version || 0) + 1;

    return { ok: true, score: p.score, version: r.version };
  }

  function getPublicState(code) {
    const r = roomMap.get(code);
    if (!r) return null;

    // allow full-hand broadcasting when enabled
    const allowOpenHands = !!(r.settings && r.settings.openHandsAllowed);

    return {
      code: r.code,
      gameType: r.gameType,
      phase: r.phase,
      players: [...r.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        connected: !!p.connected,
        // if open hands, send full hand; otherwise just the count
        ...(allowOpenHands ? { hand: p.hand } : { handCount: p.hand.length }),
      })),
      // in infinite mode deckCount isn't meaningful; keep null/"∞" as you prefer
      deckCount: r.deckMode === "finite" && r.deck ? r.deck.length : null,
      discardCount: r.discardPile ? r.discardPile.length : 0,
    };
  }

  function getClientLobbyState(code, requesterId, origin) {
    const r = roomMap.get(code);
    if (!r) return null;
    const isHost = r.hostId === requesterId;

    let inviteUrl = null;
    const token = r.invite?.token;
    if (isHost && origin && token) {
      const gameType = r.gameType || "football";
      inviteUrl = buildInviteUrl({ origin, gameType, code: r.code, token });
    }

    const pub = getPublicState(code);
    return { ...pub, isHost, inviteUrl };
  }

  function validateInvite(code, token) {
    const r = roomMap.get(code);
    if (!r) return { ok: false, error: "room_not_found" };
    const inv = r.invite;
    if (!inv) return { ok: false, error: "no_invite" };
    if (inv.token !== token) return { ok: false, error: "bad_token" };
    if (inv.ttlMs && Date.now() - inv.createdAt > inv.ttlMs) {
      return { ok: false, error: "token_expired" };
    }
    return { ok: true };
  }

  function safePublicState(code) {
    const s = getPublicState(code);
    if (!s) return s;

    //drop any bad player entries
    s.players = Array.isArray(s.players)
      ? s.players.filter((p) => {
          // if open hands are present, make sure there are no undefined cards
          if (Array.isArray(p.hand)) {
            p.hand = p.hand.filter(Boolean).map((card) => ({
              //normalize a minimal safe shape for the UI
              id: card?.id ?? crypto.randomUUID(),
              description: card?.description ?? card?.title ?? "Card",
              penalty: card?.penalty ?? "",
              points: Number.isFinite(card?.points) ? card.points : 0,
            }));
          }
          return p;
        })
      : [];

    return s;
  }

  function sacrificeCard(code, playerId, cardId) {
    const r = roomMap.get(code);
    if (!r) return { ok: false, error: "room_not_found" };
    if (r.phase !== "playing") return { ok: false, error: "not_playing" };

    const player = r.players.get(playerId);
    if (!player) return { ok: false, error: "not_in_room" };
    if (!Array.isArray(player.hand)) return { ok: false, error: "no_hand" };

    // find the card by its instance id
    const idx = player.hand.findIndex((c) => c && c.id === cardId);
    if (idx === -1) return { ok: false, error: "card_not_in_hand" };

    //score changed on sacrifice
    const picked = player.hand[idx];
    const sacrificedSnap = picked
        ? {
            id: picked.id,
            name: picked.title ?? picked.name ?? picked.description ?? "Card",
            description: picked.description ?? picked.text ?? picked.penalty ?? "",
            points: Number.isFinite(picked.points) ? picked.points : 0,
        } 
        : null;
    
    //scoring change
    const pts = Number.isFinite(picked.points) ? picked.points : 0;
    player.score -= pts;

    // discard the chosen card
    const [burned] = player.hand.splice(idx, 1);
    r.discardPile.push(burned);

    // draw a replacement into the same slot
    const replacement = drawCardFromBase(r);
    player.hand.splice(idx, 0, replacement);

    r.drawCount = (r.drawCount || 0) + 1;
    r.version = (r.version || 0) + 1;

    return {
      ok: true,
      hand: player.hand,
      score: player.score,
      version: r.version,
      sacrificedCard: sacrificedSnap,
      replacementCard: {
        id: replacement.id,
        name: replacement.title ?? replacement.name ?? replacement.description ?? "Card",
        description: replacement.description ?? replacement.text ?? replacement.penalty ?? "",
        points: Number.isFinite(replacement.points) ? replacement.points : 0,
      },
    };
  }

  function playCardById(code, socketId, cardId) {
    const r = roomMap.get(code);
    if (!r) return { ok: false, error: "room_not_found"};
    const player = r.players.get(socketId);
    if (!player) return { ok: false, error: "not_in_room"};
    if (!Array.isArray(player.hand)) return { ok: false, error: "no_hand"};
    const idx = player.hand.findIndex(c => c && c.id === cardId);
    if (idx === -1) return { ok: false, error: "card_not_in_hand"};
    return playCard(code, socketId, idx);
  }

  function handleDisconnect(code, socketId) {
    const r = roomMap.get(code);
    if (!r) return {};
    const p = r.players.get(socketId);
    

    if (p) {
      const playerKey = p.key;
      p.connected = false;
      clearTimeout(p._evictTimer);
      p._evictTimer = setTimeout(() => {
        if (!p.connected) r.players.delete(socketId);
      }, 45 * 60 * 1000); // 5 minutes
    }
    return { roomClosed: false };
  }

  function listCodes() {
    return Array.from(roomMap.keys());
  }

  function setScore(code, socketId, score) {
    const r = roomMap.get(code);
    if(!r) return false;

    const p = r.players.get(socketId);
    if (!p) return false;

    const n = Number(score);
    if (!Number.isFinite(n)) return false;

    p.score = Math.trunc(n);
    r.version = (r.version || 0) + 1;
    return true;
  }

  function adjustScore(code, socketId, delta) {
  const r = roomMap.get(code);
  if (!r) return null;

  const p = r.players.get(socketId);
  if (!p) return null;

  const n = Number(delta);
  if (!Number.isFinite(n)) return null;

  p.score += Math.trunc(n);
  r.version = (r.version || 0) + 1;
  return p.score;
}


  return {
    createRoom,
    addPlayer,
    resumePlayer,
    startAndDeal,
    playCard,
    playCardById,
    getHand,
    getScore,
    setScore,
    adjustScore,
    getOpponentsHands,
    getPublicState,
    getClientLobbyState,
    validateInvite,
    handleDisconnect,
    listCodes,
    getVersion,
    sacrificeCard,
    safePublicState,

  };
}
