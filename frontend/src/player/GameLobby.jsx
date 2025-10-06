import { useMemo, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getSocket, getPlayerKey } from "../shared/socket";
import { getDisplayName } from "../shared/playerIdentity";
import { useRoomChannel } from "../shared/useRoomState";
import footballBackground from '../assets/football-background.png';
import baseballBackground from '../assets/baseball-background.png';
import 'bootstrap/dist/css/bootstrap.min.css'; // Import Bootstrap CSS
import 'bootstrap/dist/js/bootstrap.bundle.min.js'; // Import Bootstrap JS (optional)

import NavBar from "../components/NavBar";
import HowToPlay from "../components/HowToPlay";

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
        socket.emit("player:resume", { roomCode: code, displayName, key }, (res) => {
            if (res?.ok && res.state) {
                setRoom(res.state);
                return;
            }
            //Otherwise, join fresh
            socket.emit("player:join", { roomCode: code, displayName, key }, (res2) => {
                if (res2?.ok && res2.state) setRoom(res2.state);

            });
        });
    }, [code, room?.code, setRoom, socket]);

    // Auto-resume when you return from iMessage (focus/visibility)
    useEffect(() => {
        if (!code) return;

        const resume = () => {
            const roomCode = code || localStorage.getItem("roomCode");
            if (!roomCode) return;

            const displayName = getDisplayName();
            let key = localStorage.getItem("playerKey");
            if (!key) {
                // fallback if key was cleared (keeps behavior consistent with your ensureKey)
                key =
                    (window.crypto?.randomUUID?.()) ||
                    (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).toUpperCase();
                localStorage.setItem("playerKey", key);
            }

            socket.emit("player:resume", { roomCode, displayName, key }, (res) => {
                if (res?.ok && res.state) setRoom(res.state);
            });
        };

        const onVisibility = () => { if (!document.hidden) resume(); };

        window.addEventListener("focus", resume);
        document.addEventListener("visibilitychange", onVisibility);

        return () => {
            window.removeEventListener("focus", resume);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [socket, code, setRoom]);

    //Verifies there is a room with at least two players in it
    const canStart = useMemo(
        () => !!room && (room.players?.length ?? 0) >= 1,
        [room]
    );

    //If there is at least 2 players then the game can start
    const startAndDeal = () => {
        if (!canStart) return;
        const key = getPlayerKey();
        getSocket().emit("game:startAndDeal", { key }, (res) => {
            if (!res?.ok) return alert(res.error);
            nav(`/${game}/game`);
        });
    };

    return (
        <div className="" style={backgroundStyle}>
            <div className="p-5">
                <NavBar />
                
                 <h2 className="display-2 text-center text-light">ROOM - <strong>{room?.code ?? code ?? ""}</strong></h2>
                 {/* <h2>{room?.gameType ? `- ${room.gameType} game` : ""}</h2> */}
               
                <div className="d-flex justify-content-center">
                    <HowToPlay />                    
                </div>

                <div>
                {inviteUrl && (
                    <div className="alert alert-light mt-3 d-flex gap2 align-items-center" style={{ opacity: 0.95 }}>
                        <span className="me-2">Invite link:</span>
                        <button
                            className="btn btn-outline-primary btn-sm"
                            onClick={async () => {
                                try {
                                    if (navigator.share) {
                                        await navigator.share({ title: "Join my room", text: `Join my ${game?.toUpperCase()} room on Sports Shuffle: ${inviteUrl}`, url: inviteUrl });
                                    } else {
                                        await navigator.clipboard.writeText(`Join my ${game?.toUpperCase()} room on Sports Shuffle: ${inviteUrl}`);
                                        alert("Invite copied!");
                                    }
                                } catch { }
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
                </div>

                <h4 className="fs-3 text-light text-center m3">Please wait for the host to Start the Game</h4>
                <p className="m-3 text-light text-center fs-2">Players: {room?.players?.length ?? 0}</p>
                {/* List of Players */}
                <ul className="gameLobby">
                    {room?.players?.map(p => (
                        <li className="text-light text-center fs-4" key={p.id}>{p.name} {p.connected === false ? '(reconnecting...)' : ''}</li>
                    ))}
                </ul>
                <button className="btn justify-content-center btn-lg btn-light " onClick={startAndDeal} disabled={!canStart}>Start & Deal</button>
            </div>

        </div>
    );
}