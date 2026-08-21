import crypto from "crypto";
import { ErrorCodes } from "./protocol/errors.js";

import { loadDeck } from "./domain/deckService.js";

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


const buildInviteUrl = ({ origin, gameType, code, token }) =>
  `${origin}/${gameType}/join?room=${encodeURIComponent(
    code,
  )}&token=${encodeURIComponent(token)}`;

export function createRoomManager() {
  const roomMap = new Map();

  //Creates a room for multiplayer gameplay based on type
  function createRoom({ creatorSocketId, gameType, matchup = null, hostKey }) {
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
      matchup,
      createdAt: Date.now(),
      startedAt: null,
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
    if (!r) return { ok: false, error: ErrorCodes.ROOM_NOT_FOUND };

    //If the joining player has a key that already exists, treat as resume
    if (key) {
      const prev = [...r.players.values()].find((p) => p.key === key);
      if (prev) {
        r.players.delete(prev.id);
        prev.id = id;
        prev.connected = true;
        prev.isActive = true;
        prev.lastActiveAt = Date.now();
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
      isActive: true,
      lastActiveAt: Date.now(),
      joinedAt: Date.now(),
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
    if (!r) return { ok: false, error: ErrorCodes.ROOM_NOT_FOUND };
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

  function getPublicState(code) {
    const r = roomMap.get(code);
    if (!r) return null;

    // allow full-hand broadcasting when enabled
    const allowOpenHands = !!(r.settings && r.settings.openHandsAllowed);

    return {
      code: r.code,
      gameType: r.gameType,
      matchup: r.matchup ?? null,
      team: r.team ?? null,
      phase: r.phase,
      //hostKey: r.hostKey ?? null,
      hostId: r.hostId ?? null,
      players: [...r.players.values()].map((p) => ({
        id: p.id,
        name: p.name ?? p.displayName,
        //key: p.key ?? null,
        score: p.score,
        connected: !!p.connected,
        isActive: !!p.isActive,
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
    if (!r) return { ok: false, error: ErrorCodes.ROOM_NOT_FOUND };
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

  function handleDisconnect(code, socketId) {
    const r = roomMap.get(code);
    if (!r) return { ok: false, error: ErrorCodes.ROOM_NOT_FOUND };

    const p = r.players.get(socketId);
    if (!p) return { ok: false, error: ErrorCodes.PLAYER_NOT_FOUND };

    // keep player reserved for 60 minutes after disconnect
    //const EVICT_MS = 60 * 60 * 1000;

    p.connected = false;
    p.isActive = false;
    p.disconnectedAt = Date.now();

    r.version = (r.version || 0) + 1;

    // clearTimeout(p._evictTimer);
    // p._evictTimer = setTimeout(() => {
    //   // only evict if they never reconnected
    //   if (!p.connected) r.players.delete(socketId);
    // }, EVICT_MS);

    //return { roomClosed: false };
    return {
      ok: true,
      player: p,
      wasHost:
        r.hostId === socketId ||
        (!!r.hostKey && !!p.key && r.hostKey === p.key),
    };
  }
  function reassignHost(code) {
    const r = roomMap.get(code);
    if (!r) return { ok: false, error: ErrorCodes.ROOM_NOT_FOUND };

    const candidates = [...r.players.values()]
      .filter((p) => p.connected)
      .sort((a, b) => {
        const aJoined = Number(a.joinedAt ?? 0);
        const bJoined = Number(b.joinedAt ?? 0);
        return aJoined - bJoined;
      });

    const nextHost = candidates[0] ?? null;

    if (!nextHost) {
      r.hostId = null;
      r.hostKey = null;
      r.version = (r.version || 0) + 1;

      return {
        ok: true,
        hostAssigned: false,
        hostId: null,
        hostKey: null,
      };
    }

    r.hostId = nextHost.id;
    r.hostKey = nextHost.key ?? null;
    r.version = (r.version || 0) + 1;

    return {
      ok: true,
      hostAssigned: true,
      hostId: nextHost.id,
      hostKey: nextHost.key ?? null,
      player: nextHost,
    };
  }

  function removePlayer(code, socketId, { reassignHostIfNeeded = true } = {}) {
    const r = roomMap.get(code);
    if (!r) return { ok: false, error: ErrorCodes.ROOM_NOT_FOUND };

    const player = r.players.get(socketId);
    if (!player) return { ok: false, error: ErrorCodes.PLAYER_NOT_FOUND };

    const wasHost =
      r.hostId === socketId ||
      (!!r.hostKey && !!player.key && r.hostKey === player.key);

    r.players.delete(socketId);

    let hostResult = null;

    if (wasHost && reassignHostIfNeeded && r.players.size > 0) {
      hostResult = reassignHost(code);
    }

    if (r.players.size === 0) {
      r.hostId = null;
      r.hostKey = null;
    }

    r.version = (r.version || 0) + 1;

    return {
      ok: true,
      player,
      wasHost,
      roomEmpty: r.players.size === 0,
      hostResult,
    };
  }
  function removePlayerByKey(code, key, { reassignHostIfNeeded = true } = {}) {
    const r = roomMap.get(code);
    if (!r) return { ok: false, error: ErrorCodes.ROOM_NOT_FOUND };
    if (!key) return { ok: false, error: "missing_key" };

    const player = [...r.players.values()].find((p) => p.key === key);

    if (!player) {
      return { ok: false, error: ErrorCodes.PLAYER_NOT_FOUND };
    }

    return removePlayer(code, player.id, {
      reassignHostIfNeeded,
    });
  }
  function destroyRoom(code) {
    const r = roomMap.get(code);
    if (!r) return false;

    for (const player of r.players.values()) {
      if (player._evictTimer) {
        clearTimeout(player._evictTimer);
      }
    }

    roomMap.delete(code);
    return true;
  }

  function destroyIfEmpty(code) {
    const r = roomMap.get(code);

    if (!r) {
      return { destroyed: false, reason: ErrorCodes.ROOM_NOT_FOUND };
    }

    if (r.players.size > 0) {
      return { destroyed: false };
    }

    destroyRoom(code);

    return { destroyed: true };
  }

  function getRoom(code) {
    return roomMap.get(code) ?? null;
  }

  function listCodes() {
    return Array.from(roomMap.keys());
  }

  return {
    createRoom,
    addPlayer,
    resumePlayer,

    getPublicState,
    getClientLobbyState,
    validateInvite,
    safePublicState,

    handleDisconnect,

    listCodes,
    getRoom,

    removePlayer,
    removePlayerByKey,
    reassignHost,
    
    destroyRoom,
    destroyIfEmpty,
  };
}
