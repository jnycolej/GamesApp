import {useMemo} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {getSocket} from "../shared/socket";
import {useRoomChannel} from "../shared/useRoomState";
import { useEffect } from "react";

export default function GameLobby() {
    const { game, code } = useParams();
    const { room, setRoom } = useRoomChannel();
    const nav = useNavigate();
    
    // If there is no room state yet or it's for a different room, fetch it
    useEffect(() => {
        if(!room?.code || room.code !== code) { 
            getSocket().emit("room:get", {}, (res) => {
                if (res?.ok && res.state) setRoom(res.state);
            });
        }
    }, [code, room?.code, setRoom]);

    //Verifies there is a room with at least two players in it
    const canStart = useMemo(
        () => !!room && (room.players?.length ?? 0) >= 1,
        [room]
    );

    //If there is at least 2 players then the game can start
    const startAndDeal = () => {
        if (!canStart) return;
        getSocket().emit("game:startAndDeal", {}, (res) => {
            if(!res?.ok) return alert(res.error);
            nav(`/${game}/game`);
        });
    };

    return (
        <div style={{ padding: 24}}>
            <h2>Room {room?.code ?? ""} {room?.gameType ? `- ${room.gameType}` : ""}</h2>
            <p>Players: {room?.players?.length ?? 0}</p>
            <button onClick={startAndDeal} disabled={!canStart}>Start & Deal</button>
        </div>
    );
}