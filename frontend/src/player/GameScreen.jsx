import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getSocket } from "../shared/socket";
import { useRoomChannel } from "../shared/useRoomState";
import NavBar from "../components/NavBar";
import 'bootstrap/dist/css/bootstrap.min.css'; // Import Bootstrap CSS
import 'bootstrap/dist/js/bootstrap.bundle.min.js'; // Import Bootstrap JS (optional)
import footballBackground from '../assets/football-background.png';
import baseballBackground from '../assets/baseball-background.png';

export default function GameScreen() {
    const { game } = useParams();
    const { room, myHand, setMyHand } = useRoomChannel();
    const [opponents, setOpponents] = useState([]);
    const [points, setPoints] = useState(0);

    //Switches background based on type of game
    const background = game === 'baseball' ? baseballBackground : footballBackground;

    const backgroundStyle = {
        backgroundImage: `url(${background})`,
        minHeight: '100vh',
        width: '100%',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
        backgroundSize: 'cover',
    }
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
        return () => { s.off("hand:update", onHand); s.off("score:update", onScore); };
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
        <div className="p-5" style={backgroundStyle}>
             <h1 className="display-1 text-center fw-bold text-light">Sports Shuffle</h1>
             <NavBar />
            <h2 className="display-2 text-center text-white">{game?.toUpperCase()} Game</h2>
           
            <h2 className="display-3 text-light text-center">{me?.name || localName || "Player"}</h2>

            <h3 className="display-4 text-light text-center">Points: {points}</h3>
            <div className="container">
                <div className="row">
                    {myHand.map((card, idx) => (
                        <div className="col m-2" key={card.id}>
                            <button className="card playingCard p-3" onClick={() => handleCardClick(idx)}>
                                <p className=" fs-5 card-text">{card.description}</p>
                                <p className="fw-bold card-text">{card.penalty}</p>
                                <p className="card-text">Points: {card.points}</p>
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <hr style={{ margin: "24px 0" }} />

            <button onClick={viewOpponents}>View Opponents</button>
            <div style={{ marginTop: 16 }}>
                {opponents.map((p) => (
                    <div key={p.id} style={{ marginBottom: 12 }}>
                        <strong className="fs-2">{p.name}</strong> ({p.hand.length})
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                            {p.hand.map((c) => (
                                <div className=" p-2 text-center card bg-warning playingCard" key={c.id}>
                                    <div className="fs-5">{c.description}</div>
                                    <div className="mt-2 fw-bold">{c.penalty}</div>
                                    <div className="mt-3 card-text">points: {c.points}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}