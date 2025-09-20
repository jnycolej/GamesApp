import { useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSocket, rememberRoom } from "../shared/socket";
import { getPlayerKey, getDisplayName, setDisplayName } from "../shared/playerIdentity";
import { useRoomChannel } from "../shared/useRoomState";
import footballBackground from '../assets/football-background.png';
import baseballBackground from '../assets/baseball-background.png';
import NavBar from "../components/NavBar";

export default function GameLobby() {
    const { game, code } = useParams();
    const { room, setRoom } = useRoomChannel();
    const nav = useNavigate();
    const socket = getSocket();
    const inviteToken = (code && localStorage.getItem(`inviteToken:${code}`)) || null;
    const inviteUrl = 
        inviteToken
            ? `${window.location.origin}/${game}/join?room=${encodeURIComponent(code)}&token=${encodeURIComponent(inviteToken)}`
            : null;
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

    // Keep room state in sync with server broadcasts
    useEffect(() => {
        const onUpdated = (state) => setRoom(state);
        socket.on("room:updated", onUpdated);
        return () => socket.off("room:updated", onUpdated);
    }, [socket, setRoom]);

    //Ensure this socket is actually in the room identified by the URL `code`
    useEffect(() => {
        if (!code) return;
        if (room?.code === code) return;

        const ensureKey = () => {
            let k = localStorage.getItem("playerKey");
            if (!k) {
                const gen = 
                    (typeof window !== "undefined" &&
                        window.crypto &&
                        typeof window.crypto.randomUUID === "function" &&
                        window.crypto.randomUUID()) ||
                    (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).toUpperCase();
                localStorage.setItem("playerKey", gen);
                k = gen;
            }
            return k;
        };

        const key = ensureKey();
        const displayName = getDisplayName();

        // Try to resume first (returns ok if you were previously in this room)
        socket.emit("player:resume", {roomCode: code, displayName, key}, (res) => {
            if (res?.ok && res.state) {
                setRoom(res.state);
                return;
            }
            //Otherwise, join fresh
            socket.emit("player:join", { roomCode: code, displayName, key}, (res2) => {
                if (res2?.ok && res2.state) setRoom(res2.state);

            });
        });
    }, [code, room?.code, setRoom, socket]);

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
                <h2 className="display-2 text-light">Room {room?.code ?? code ?? ""} {room?.gameType ? `- ${room.gameType} game` : ""}</h2>
                {inviteUrl && (
                    <div className="alert alert-light mt-3 d-flex gap2 align-items-center" style={{ opacity: 0.95}}>
                        <span className="me-2">Invite link ready:</span>
                        <button
                            className="btn btn-outline-primary btn-sm"
                            onClick={async () => {
                                try {
                                    if (navigator.share) {
                                        await navigator.share({ title: "Join my room", text: `Join my ${game?.toUpperCase()} room on Sports Shuffle: ${inviteUrl}`, url: inviteUrl});
                                    } else {
                                        await navigator.clipboard.writeText(`Join my ${game?.toUpperCase()} room on Sports Shuffle: ${inviteUrl}`);
                                        alert("Invite copied!");
                                    }
                                } catch {}
                            }}
                        >
                            Share / Copy
                        </button>
                        <a 
                            className="btn btn-outline-success btn-sm"
                            href={`sms:&body=${encodeURIComponent(`Join my ${game?.toUpperCase()} room on Sports Shuffle: ${inviteUrl}`)}`}
                        >
                            Text
                        </a>
                    </div>
                )}
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