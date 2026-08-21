import { ErrorCodes } from "../protocol/errors.js";
import { drawCard } from "../domain/deckService.js";

export function createGameManager({ rooms }) {

  function startAndDeal(code, requesterId, requesterKey = null) {
    const room = rooms.getRoom(code);

    if (!room) return { ok: false, error: ErrorCodes.ROOM_NOT_FOUND }; // IMPORTANT

    //Host gate
    const isHost =
      (room.hostKey && requesterKey && room.hostKey === requesterKey) ||
      room.hostId === requesterId;

    if (!isHost) {
      return { ok: false, error: "not_host" };
    }

    const minPlayers = room.settings?.minPlayers ?? 1;
    
    if (room.players.size < minPlayers) {
      return { ok: false, error: "not_enough_players", need: minPlayers };
    }

    room.phase = "playing";
    room.status = "active";
    if (!room.startedAt) {
      room.startedAt = Date.now();
    }

    room.discardPile = [];
    room.drawCount = 0;

    const handSize = room.settings?.handSize ?? 5;
    for (const player of room.players.values()) {
      player.hand = [];
      player.score = 0;
      
      for (let i = 0; i < handSize; i++) {
        player.hand.push(drawCard(room));
        room.drawCount++;
      }
    }

    room.version += 1;
    return { ok: true, version: room.version };
  }

  function playCard(code, playerId, index) {
    const room = rooms.getRoom(code);
    if (!room) return { ok: false, error: ErrorCodes.ROOM_NOT_FOUND };

    const player = room.players.get(playerId); // <- use `player`
    if (!player) return { ok: false, error: ErrorCodes.NOT_IN_ROOM };
    if (room.phase !== "playing") return { ok: false, error: "not_playing" };
    if (index == null || index < 0 || index >= player.hand.length) {
      return { ok: false, error: "bad_index" };
    }

    const picked = player.hand[index];
    const playedSnap = picked
      ? {
          id: picked.id,
          name: picked.title ?? picked.name ?? picked.description ?? "Card",
          description:
            picked.description ?? picked.text ?? picked.penalty ?? "",
          points: Number.isFinite(picked.points) ? picked.points : 0,
        }
      : null;

    const pts = Number.isFinite(picked.points) ? picked.points : 0;
    player.score += pts;

    // keep history
    room.discardPile.push(picked);

    // semi-infinite replacement
    const replacement = drawCard(room);
    player.hand[index] = replacement; // <- write to `player`, not `p`
    room.drawCount = (room.drawCount || 0) + 1;

    room.version = (room.version || 0) + 1;

    return {
      ok: true,
      hand: player.hand,
      score: player.score,
      version: room.version,
      playedCard: playedSnap,
      replacementCard: {
        id: replacement.id,
        name:
          replacement.title ??
          replacement.name ??
          replacement.description ??
          "Card",
        description:
          replacement.description ??
          replacement.text ??
          replacement.penalty ??
          "",
        points: Number.isFinite(replacement.points) ? replacement.points : 0,
      },
    };
  }

  function playCardById(code, playerId, cardId) {
    const room = rooms.getRoom(code);
    if (!room) return { ok: false, error: ErrorCodes.ROOM_NOT_FOUND };
    const player = room.players.get(playerId);
    if (!player) return { ok: false, error: ErrorCodes.NOT_IN_ROOM };
    if (!Array.isArray(player.hand)) return { ok: false, error: "no_hand" };
    const idx = player.hand.findIndex((c) => c && c.id === cardId);
    if (idx === -1) return { ok: false, error: "card_not_in_hand" };
    return playCard(code, playerId, idx);
  }

  function sacrificeCard(code, playerId, cardId) {
    const room = rooms.getRoom(code);
    if (!room) return { ok: false, error: ErrorCodes.ROOM_NOT_FOUND };
    if (room.phase !== "playing") return { ok: false, error: "not_playing" };

    const player = room.players.get(playerId);
    if (!player) return { ok: false, error: ErrorCodes.NOT_IN_ROOM };
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
          description:
            picked.description ?? picked.text ?? picked.penalty ?? "",
          points: Number.isFinite(picked.points) ? picked.points : 0,
        }
      : null;

    //scoring change
    const pts = Number.isFinite(picked.points) ? picked.points : 0;
    player.score -= pts;

    // discard the chosen card
    const [burned] = player.hand.splice(idx, 1);
    room.discardPile.push(burned);

    // draw a replacement into the same slot
    const replacement = drawCard(room);
    player.hand.splice(idx, 0, replacement);

    room.drawCount = (room.drawCount || 0) + 1;
    room.version = (room.version || 0) + 1;

    return {
      ok: true,
      hand: player.hand,
      score: player.score,
      version: room.version,
      sacrificedCard: sacrificedSnap,
      replacementCard: {
        id: replacement.id,
        name:
          replacement.title ??
          replacement.name ??
          replacement.description ??
          "Card",
        description:
          replacement.description ??
          replacement.text ??
          replacement.penalty ??
          "",
        points: Number.isFinite(replacement.points) ? replacement.points : 0,
      },
    };
  }

  function getHand(code, playerId) {
    const room = rooms.getRoom(code);

    if (!room) return null;

    const player = room.players.get(playerId);
    return player ? player.hand : null;
  }

  function getScore(code, playerId) {
    const room = rooms.getRoom(code);
    if (!room) return 0;
    const player = room.players.get(playerId);
    return player ? player.score : 0;
  }

  function setScore(code, playerId, score) {
    const room = rooms.getRoom(code);
    if (!room) return false;

    const player = room.players.get(playerId);
    if (!player) return false;

    const value = Number(score);
    if (!Number.isFinite(value)) return false;

    player.score = Math.trunc(value);
    room.version = (room.version || 0) + 1;
    return true;
  }

  function adjustScore(code, playerId, delta) {
    const room = rooms.getRoom(code);
    if (!room) return { ok: false, error: ErrorCodes.ROOM_NOT_FOUND };

    const player = room.players.get(playerId);
    if (!player) return { ok: false, error: ErrorCodes.NOT_IN_ROOM };

    const amount = Number(delta);
    if (!Number.isFinite(amount)) return { ok: false, error: "bad_delta" };

    player.score += amount;

    room.version = (room.version || 0) + 1;

    return { ok: true, score: player.score, version: room.version };
  }

  function getOpponentsHands(code, requesterId) {
    const room = rooms.getRoom(code);
    if (!room) return null;
    if (!room.settings?.openHandsAllowed) return [];
    return [...room.players.values()]
      .filter((player) => player.id !== requesterId)
      .map((player) => ({
        id: player.id,
        name: player.name,
        hand: player.hand,
      }));
  }

  function getVersion(code) {
    const room = rooms.getRoom(code);
    return room ? room.version : 0;
  }

  return {
    startAndDeal,
    playCard,
    playCardById,
    sacrificeCard,
    getHand,
    getScore,
    setScore,
    adjustScore,
    getOpponentsHands,
    getVersion,
  }
}
