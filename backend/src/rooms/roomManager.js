import crypto from "crypto";
import { ErrorCodes } from "../protocol/errors.js";

import { loadDeck } from "../domain/deckService.js";

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
  function createRoom({ gameType, matchup = null }) {
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
      hostId: null,
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

  function addPlayer(code, { socketId, displayName, reconnectToken }) {
    const room = roomMap.get(code);

    if (!room) {
      return {
        ok: false,
        error: ErrorCodes.ROOM_NOT_FOUND,
      };
    }

    if (!reconnectToken) {
      return {
        ok: false,
        error: ErrorCodes.MISSING_RECONNECT_TOKEN,
      };
    }

    const now = Date.now();

    const playerId = crypto.randomUUID();

    const player = {
      // Permanent public identity.
      id: playerId,

      // Current Socket.IO connection.
      socketId,

      // Secret used only to resume.
      reconnectToken,

      name: displayName || "Player",

      hand: [],

      connected: true,
      isActive: true,

      lastActiveAt: now,
      joinedAt: now,

      score: 0,
    };

    room.players.set(playerId, player);

    return {
      ok: true,
      resumed: false,
      playerId,
    };
  }

  function resumePlayer(code, { newSocketId, reconnectToken, displayName }) {
    const room = roomMap.get(code);

    if (!room) {
      return {
        ok: false,
        error: ErrorCodes.ROOM_NOT_FOUND,
      };
    }

    if (!reconnectToken) {
      return {
        ok: false,
        error: ErrorCodes.MISSING_RECONNECT_TOKEN,
      };
    }

    const player = getPlayerByReconnectToken(code, reconnectToken);

    if (!player) {
      return {
        ok: false,
        error: ErrorCodes.PLAYER_NOT_FOUND,
      };
    }

    // The permanent ID never changes.
    // Only the live connection changes.
    player.socketId = newSocketId;

    player.connected = true;
    player.isActive = true;

    player.lastActiveAt = Date.now();

    player.disconnectedAt = null;

    if (displayName) {
      player.name = displayName;
    }

    return {
      ok: true,
      playerId: player.id,
      hand: player.hand,
      score: player.score,
    };
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
      hostId: r.hostId ?? null,
      stateVersion: r.version ?? 0,
      players: [...r.players.values()].map((p) => ({
        id: p.id,
        name: p.name ?? p.displayName,
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
    if (!inv) return { ok: false, error: ErrorCodes.NO_INVITE };
    if (inv.token !== token) return { ok: false, error: ErrorCodes.BAD_INVITE_TOKEN };
    if (inv.ttlMs && Date.now() - inv.createdAt > inv.ttlMs) {
      return { ok: false, error: ErrorCodes.INVITE_TOKEN_EXPIRED };
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

  function handleDisconnect(code, playerId) {
    const room = roomMap.get(code);

    if (!room) {
      return {
        ok: false,
        error: ErrorCodes.ROOM_NOT_FOUND,
      };
    }

    const player = room.players.get(playerId);

    if (!player) {
      return {
        ok: false,
        error: ErrorCodes.PLAYER_NOT_FOUND,
      };
    }

    player.connected = false;
    player.isActive = false;
    player.disconnectedAt = Date.now();

    room.version = (room.version || 0) + 1;

    return {
      ok: true,
      player,

      wasHost: room.hostId === playerId,
    };
  }

  function reassignHost(code) {
    const room = roomMap.get(code);

    if (!room) {
      return {
        ok: false,
        error: ErrorCodes.ROOM_NOT_FOUND,
      };
    }

    const candidates = [...room.players.values()]
      .filter((player) => player.connected)
      .sort((a, b) => {
        const aJoined = Number(a.joinedAt ?? 0);

        const bJoined = Number(b.joinedAt ?? 0);

        return aJoined - bJoined;
      });

    const nextHost = candidates[0] ?? null;

    if (!nextHost) {
      room.hostId = null;

      room.version = (room.version || 0) + 1;

      return {
        ok: true,
        hostAssigned: false,
        hostId: null,
      };
    }

    room.hostId = nextHost.id;

    room.version = (room.version || 0) + 1;

    return {
      ok: true,
      hostAssigned: true,
      hostId: nextHost.id,
      player: nextHost,
    };
  }

  function removePlayer(code, playerId, { reassignHostIfNeeded = true } = {}) {
    const room = roomMap.get(code);

    if (!room) {
      return {
        ok: false,
        error: ErrorCodes.ROOM_NOT_FOUND,
      };
    }

    const player = room.players.get(playerId);

    if (!player) {
      return {
        ok: false,
        error: ErrorCodes.PLAYER_NOT_FOUND,
      };
    }

    const wasHost = room.hostId === playerId;

    room.players.delete(playerId);

    let hostResult = null;

    if (wasHost && reassignHostIfNeeded && room.players.size > 0) {
      hostResult = reassignHost(code);
    }

    if (room.players.size === 0) {
      room.hostId = null;
    }

    room.version = (room.version || 0) + 1;

    return {
      ok: true,
      player,
      wasHost,
      roomEmpty: room.players.size === 0,
      hostResult,
    };
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

  function getPlayerBySocketId(code, socketId) {
    const room = roomMap.get(code);

    if (!room || !socketId) {
      return null;
    }

    return (
      [...room.players.values()].find(
        (player) => player.socketId === socketId,
      ) ?? null
    );
  }

  function getPlayerByPlayerId(code, playerId) {
    const room = roomMap.get(code);

    if (!room || !playerId) {
      return null;
    }

    return room.players.get(playerId) ?? null;
  }

function getPlayerByReconnectToken(
  code,
  reconnectToken,
) {
  const room =
    roomMap.get(code);

  if (
    !room ||
    !reconnectToken
  ) {
    return null;
  }

  return (
    [
      ...room.players.values(),
    ].find(
      (player) =>
        player.reconnectToken ===
        reconnectToken,
    ) ?? null
  );
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

    getPlayerBySocketId,
    getPlayerByPlayerId,
    getPlayerByReconnectToken,

    handleDisconnect,

    listCodes,
    getRoom,

    removePlayer,
    reassignHost,

    destroyRoom,
    destroyIfEmpty,
  };
}
