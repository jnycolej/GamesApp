import { useEffect, useState } from "react";
import { getSocket } from "./socket";

export function useRoomChannel() {
    
    const [room, setRoom] = useState(null);
    const [myHand, setMyHand] = useState([]);

    useEffect(() => {
        const s = getSocket();
        const onUpdated = (state) => setRoom(state);
        const onHand = (hand) => setMyHand(hand);
        s.on("room:updated", onUpdated);
        s.on("hand:update", onHand);
        return () => {s.off("room:updated", onUpdated); s.off("hand:update", onHand); };
    }, []);

    return {room, setRoom, myHand, setMyHand };
}