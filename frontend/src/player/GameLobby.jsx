import { useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSocket } from "../shared/socket";
import { useRoomChannel } from "../shared/useRoomState";
import footballBackground from '../assets/football-background.png';
import baseballBackground from '../assets/baseball-background.png';
import NavBar from "../components/NavBar";

export default function GameLobby() {
    const { game, code } = useParams();
    const { room, setRoom } = useRoomChannel();
    const nav = useNavigate();

    const background = game === 'baseball' ? baseballBackground : footballBackground;

    const backgroundStyle = {
        backgroundImage: `url(${background})`,
        minHeight: '100vh',
        width: '100%',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
        backgroundSize: 'cover',
    }
    //If phase flips to 'playing', take everyone to the game screen
    useEffect(() => {
        if (room?.phase === "playing") {
            nav(`/${game}/game`);
        }
    }, [room?.phase, game, nav]);

    // If there is no room state yet or it's for a different room, fetch it
    useEffect(() => {
        if (!room?.code || room.code !== code) {
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
            if (!res?.ok) return alert(res.error);
            nav(`/${game}/game`);
        });
    };

    return (
        <div className="" style={backgroundStyle}>
            <div className="p-5">
                <h1 className="display-1 text-light fw-bold text-center">Sports Shuffle</h1>
                <NavBar />
                <h2 className="display-2 text-light">Room {room?.code ?? ""} {room?.gameType ? `- ${room.gameType} game` : ""}</h2>
                <p className="m-3 text-secondary text-center fs-2">Players: {room?.players?.length ?? 0}</p>
                <ul className="">
                    {room?.players?.map(p => (
                        <li className="text-light text-center fs-4" key={p.id}>{p.name} {p.connected === false ? '(reconnecting...)' : ''}</li>
                    ))}
                </ul>
                <button className="btn justify-content-center btn-lg btn-light " onClick={startAndDeal} disabled={!canStart}>Start & Deal</button>
            </div>

        </div>
    );
}