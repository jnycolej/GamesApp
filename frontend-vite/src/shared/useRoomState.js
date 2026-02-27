import { useEffect, useState } from "react";
import { getSocket } from "./socket";

export function useRoomChannel() {
  const [room, setRoom] = useState(null);      // Multiplayer room
  const [myHand, setMyHand] = useState([]);    // User's hand
  const [myScore, setMyScore] = useState(0);   // User's score
  const [scores, setScores] = useState({});    // Other players' scores

  useEffect(() => {
    const s = getSocket();

    const onUpdated = (state) => setRoom(state);

    const onHand = (payload) => {
      // accept [] OR { hand: [] }
      const hand = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.hand)
          ? payload.hand
          : [];
      setMyHand(hand.filter(Boolean));
    };

    const onMyScore = (payload) => {
      // accept number OR { score } OR { newScore }
      const next =
        typeof payload === "number"
          ? payload
          : payload && typeof payload === "object"
            ? Number(payload.score ?? payload.newScore ?? 0)
            : 0;

      setMyScore(Number.isFinite(next) ? next : 0);
    };

    const onPlayerUpdated = ({ playerId, handCount, score }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const next = structuredClone(prev);

        const player = next.players?.find((p) => p?.id === playerId);
        if (player) {
          if (typeof handCount === "number") player.handCount = handCount;
          if (typeof score === "number") {
            // keep both fields in sync if your UI uses either
            player.score = score;
            player.points = score;
          }
        }
        return next;
      });

      setScores((prev) => ({
        ...prev,
        [playerId]: score,
      }));
    };

    s.on("room:updated", onUpdated);
    s.on("hand:update", onHand);
    s.on("score:update", onMyScore);
    s.on("player:updated", onPlayerUpdated);

    return () => {
      s.off("room:updated", onUpdated);
      s.off("hand:update", onHand);
      s.off("score:update", onMyScore);
      s.off("player:updated", onPlayerUpdated);
    };
  }, []);

  const resetRoomState = () => {
    setRoom(null);
    setMyHand([]);
    setMyScore(0);
    setScores({});
  };

  return {
    room,
    setRoom,
    myHand,
    setMyHand,
    myScore,
    setMyScore,
    scores,
    setScores,
    resetRoomState,
  };
}