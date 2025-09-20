import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getSocket } from "../shared/socket";
import { useRoomChannel } from "../shared/useRoomState";
import NavBar from "../components/NavBar";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import footballBackground from "../assets/football-background.png";
import baseballBackground from "../assets/baseball-background.png";

export default function GameScreen() {
  const { game } = useParams();
  const { room, setRoom, myHand, setMyHand } = useRoomChannel();
  const [points, setPoints] = useState(0);
  const [otherScores, setOtherScores] = useState({});
  const socket = getSocket();
  const [socketId, setSocketId] = useState(socket.id || null);

  const background = game === "baseball" ? baseballBackground : footballBackground;

  useEffect(() => {
    const update = () => setSocketId(socket.id || null);
    update();
    socket.on("connect", update);
    socket.on("reconnect", update);
    socket.on("disconnect", () => setSocketId(null));

    socket.emit("room:get", {}, (res) => res?.ok && setRoom(res.state));
    const onRoom = (st) => setRoom(st);
    socket.on("room:updated", onRoom);

    return () => {
      socket.off("connect", update);
      socket.off("reconnect", update);
      socket.off("disconnect", update);
      socket.off("room:updated", onRoom);
    };
  }, [socket, setRoom]);

  const backgroundStyle = {
    backgroundImage: `url(${background})`,
    minHeight: "100vh",
    width: "100%",
    backgroundRepeat: "no-repeat",
    backgroundAttachment: "fixed",
    backgroundSize: "cover",
  };

  const me = useMemo(() => {
    if (!room?.players || !socketId) return null;
    return room.players.find((p) => p.id === socketId) || null;
  }, [room?.players, socketId]);

  const localName = (typeof window !== "undefined" && localStorage.getItem("displayName")) || null;

  // my hand + my score
  useEffect(() => {
    socket.emit("hand:getMine", {}, (res) => setMyHand(res?.hand || []));
    socket.emit("score:getMine", {}, (res) => setPoints(res?.score ?? 0));
    const onHand = (hand) => setMyHand(hand || []);
    const onScore = (score) => setPoints(score ?? 0);
    socket.on("hand:update", onHand);
    socket.on("score:update", onScore);
    return () => {
      socket.off("hand:update", onHand);
      socket.off("score:update", onScore);
    };
  }, [socket, setMyHand]);

  useEffect(() => {
  // others' scores (hand counts come via room:updated)
  const onPlayerUpdated = ({ playerId, handCount, score }) => {
    setOtherScores((prev) => ({ ...prev, [playerId]: score}));
  };
  socket.on("player:updated", onPlayerUpdated);
  return () => socket.off("player:updated", onPlayerUpdated);
}, [socket]);

  const handleCardClick = (index) => {
    getSocket().emit("game:playCard", { index }, (res) => {
      if (!res?.ok) alert(res?.error ?? "Could not play card");
    });
  };

  const players = room?.players ?? [];
  const opponents = useMemo(
    () => (socketId ? players.filter((p) => p.id !== socketId) : []),
    [players, socketId]
  );

  return (
    <div className="p-5" style={backgroundStyle}>
      <h1 className="display-1 text-center fw-bold text-light">Sports Shuffle</h1>
      <NavBar />
      <h2 className="display-2 text-center text-white">{game?.toUpperCase()} Game</h2>

      <h2 className="display-3 text-light text-center">
        {me?.name || localName || "Player"}
      </h2>

      {/* Scoreboard */}
      <div className="container my-3">
        <div className="row gy-2">
          {players.map((p) => {
            const isMe = p.id === socketId;
            const score = isMe ? points : otherScores[p.id] ?? 0;

            return (
              <div key={p.id} className="col-12 col-md-6 col-lg-4">
                <div
                  className={`d-flex justify-content-between align-items-center p-3 rounded shadow-sm ${isMe ? "bg-light border border-primary" : "bg-white"
                    }`}
                  title={p.connected ? "Connected" : "Disconnected"}
                >
                  <div className="fw-semibold">
                    {p.name} {isMe ? "(You)" : ""}
                  </div>
                  <div className="text-nowrap">{score} pts</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* My points */}
      <h3 className="display-4 text-light text-center">Points: {points}</h3>

      {/* My hand */}
      <div className="container">
        <div className="row g-2 row-cols-auto">
          {myHand.map((card, idx) => (
            <div className="col" key={card.id ?? idx}>
              <button className="card playingCard p-3" onClick={() => handleCardClick(idx)}>
                <p className="fs-5 card-text">{card.description}</p>
                <p className="fw-bold card-text">{card.penalty}</p>
                <p className="card-text">Points: {Number(card.points || 0)}</p>
              </button>
            </div>
          ))}
        </div>
      </div>

      <hr style={{ margin: "24px 0" }} />

      {/* Always-show Opponents */}
      <div style={{ marginTop: 16 }}>
        {opponents.map((p) => (
            <div key={p.id} style={{ marginBottom: 12 }}>
              <strong className="fs-2 text-light text-center">{p.name}</strong>{" "}

              {Array.isArray(p.hand) && (
                <div className="justify-content-center" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  {p.hand.map((c, i) => (
                    <div className="p-2 text-center card bg-warning playingCard" key={c.id ?? i}>
                      <div className="fs-5">{c.description}</div>
                      <div className="mt-2 fw-bold">{c.penalty}</div>
                      <div className="mt-3 card-text">Points: {Number(c.points || 0)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
