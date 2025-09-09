import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getSocket } from "../shared/socket";
import { useRoomChannel } from "../shared/useRoomState";
import  NavBar  from "../components/NavBar";
import 'bootstrap/dist/css/bootstrap.min.css'; // Import Bootstrap CSS
import 'bootstrap/dist/js/bootstrap.bundle.min.js'; // Import Bootstrap JS (optional)

export default function GameScreen() {
    const { game } = useParams();
    const { room, myHand, setMyHand } = useRoomChannel();
    const [ opponents, setOpponents ] = useState([]);
    const [points, setPoints] = useState(0);

    //figure out "me" from the room using my socket id
    const socketId = getSocket().id;    //defined after connection
    const me = useMemo(() => {
        if (!room?.players || !socketId) return null;
        return room.players.find((p) => p.id === socketId) || null;
    }, [room?.players, socketId]);

    const localName = typeof window !== "undefined" ? localStorage.getItem("displayName") : null;

    useEffect(() => {
        const s = getSocket();
        const onHand = (hand) => setMyHand(hand || []);
        const onScore = (score) => setPoints(score ?? 0);
        s.on("hand:update", onHand);
        s.on("score:update", onScore);
        return () => {s.off("hand:update", onHand); s.off("score:update", onScore);};
    }, [setMyHand]);

    useEffect(() => {
        //If someone refreshes mid-game, fetch their hand
        if (!myHand?.length) {
            getSocket().emit("hand:getMine", {}, (res) => {
                if (res?.ok) setMyHand(res.hand ?? []);
            });
            getSocket().emit("score:getMine", {}, (res) => {
                if (res?.ok && typeof res.score === "number") setPoints(res.score);
            });
        }
    }, [myHand, setMyHand]);

    const handleCardClick = (index) => {
        getSocket().emit("game:playCard", { index }, (res) => {
            if (!res?.ok) alert(res?.error ?? "Could not play card");

        })
    }    
    //View opponents hand on demand
    const viewOpponents = () => {
        getSocket().emit("hand:getOpponents", {}, (res) => {
            if (!res?.ok) return alert(res.error ?? "Not allowed");
            setOpponents(res.opponents || []);
        });
    };

    

    return (
        <div style={{ padding: 24 }}>
            <NavBar />
            <h2>{game?.toUpperCase()} Game</h2>
            <NavBar />
            <h2>{me?.name || localName || "Player"}</h2>

            <h3>Deck | Points: {points}</h3>
            <div className="container">
                <div className="row">
                    {myHand.map((card, idx) => (
                        <div className="col m-2" key={card.id}>
                            <button className="card playingCard p-3" onClick={() => handleCardClick(idx)}>
                                <p className="card-text">{card.description}</p>
                                <p className="card-text">{card.penalty}</p>
                                <p className="card-text">points: {card.points}</p>
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <hr style={{ margin: "24px 0"}} />

            <button onClick={viewOpponents}>View Opponents</button>
            <div style={{ marginTop: 16 }}>
                {opponents.map((p) => (
                    <div key={p.id} style={{ marginBottom: 12 }}>
                        <strong>{p.name}</strong> ({p.hand.length})
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                            {p.hand.map((c) => (
                                <div key={c.id} style={{ border: "1px dashed #aaa", borderRadius: 6, padding: 8 }}>
                                    <div style={{ fontWeight: 600 }}>{c.description}</div>
                                    <div style={{ fontSize: 11 }}>{c.penalty}</div>
                                    <div style={{ fontSize: 11 }}>points: {c.points}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}