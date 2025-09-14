import { useEffect, useState } from "react";
import { getSocket } from "./socket";

export function useRoomChannel() {

    const [room, setRoom] = useState(null);
    const [myHand, setMyHand] = useState([]);
    const [myScore, setMyScore] = useState(0);
    const [scores, setScores] = useState({});

    useEffect(() => {
        const s = getSocket();
        const onUpdated = (state) => setRoom(state);
        const onHand = (hand) => setMyHand(hand);
        const onMyScore = (score) => setMyScore(score);

        const onPlayerUpdated = ({ playerId, handCount, score }) => {
            setRoom((prev) => {
                if (!prev) return prev;
                const next = structuredClone(prev);
                const player = next.players.find((p) => p.id === playerId);
                if (player) {
                    player.handCount = handCount;
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

    return { 
        room, 
        setRoom, 
        myHand, 
        setMyHand,
        myScore,
        scores, 
    };
}