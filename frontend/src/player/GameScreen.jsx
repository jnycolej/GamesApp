import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSocket } from "../shared/socket";
import { useRoomChannel } from "../shared/useRoomState";
import { motion, AnimatePresence } from "framer-motion";

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
  const [pendingSacrificeId, setPendingSacrificeId] = useState(null);
  const [sacrificeTimer, setSacrificeTimer] = useState(null);


  const navigate = useNavigate();
  const [lastDealtId, setLastDealtId] = useState(null);

  const background = game === "baseball" ? baseballBackground : footballBackground;


  useEffect(() => {
    const update = () => setSocketId(socket.id || null);
    update();
    socket.on("connect", update);
    socket.on("reconnect", update);
    socket.on("disconnect", () => setSocketId(null));

    socket.emit("room:get", {}, (res) => res?.ok && setRoom(res.state));

    const onRoom = (st) => {
      if (st?.players?.length) {
        st.players = st.players
          .filter((p) => p && typeof p === "object" && p.id)
          .map((p) => ({
            ...p,
            hand: Array.isArray(p.hand) ? p.hand.filter(Boolean) : p.hand,
          }));
      }
      setRoom(st);
    };
    socket.on("room:updated", onRoom);

    return () => {
      socket.off("connect", update);
      socket.off("reconnect", update);
      socket.off("disconnect", update);
      socket.off("room:updated", onRoom);
    };
  }, [socket, setRoom]);


  // --- replace your handleSacrifice with this
  const handleSacrifice = (card) => {
   

    if (!card?.id) return;

    setPendingSacrificeId(card.id);
    if (sacrificeTimer) { clearTimeout(sacrificeTimer); setSacrificeTimer(null); }
 console.log("[UI] sacrifice click", { cardId: card.id });
    socket.emit("player:sacrifice", { cardId: card.id }, (ack) => {
      if (ack?.error) {
        console.warn("[sacrifice] error:", ack.error);
        setPendingSacrificeId(null);
        return;
      }
      setPendingSacrificeId(null);
    });

    const t = setTimeout(() => setPendingSacrificeId(null), 6000);
    setSacrificeTimer(t);
  };


  // --- make sure we also clear when a fresh state arrives
  useEffect(() => {
    const onState = (next) => {
      // whenever server pushes a new state, ensure nothing is stuck
      if (pendingSacrificeId) setPendingSacrificeId(null);
    };
    socket.on("room:state", onState);
    return () => socket.off("room:state", onState);
    // include pendingSacrificeId in deps so we read the latest
  }, [socket, pendingSacrificeId]);


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
    socket.emit("hand:getMine", {}, (res) => setMyHand(Array.isArray(res?.hand) ? res.hand.filter(Boolean) : []));
    socket.emit("score:getMine", {}, (res) => setPoints(res?.score ?? 0));

    const onHand = (hand) => setMyHand(Array.isArray(hand) ? hand.filter(Boolean) : []);
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
      setOtherScores((prev) => ({ ...prev, [playerId]: score }));
    };
    socket.on("player:updated", onPlayerUpdated);
    return () => socket.off("player:updated", onPlayerUpdated);
  }, [socket]);

  const handleCardClick = (index) => {
    getSocket().emit("game:playCard", { index }, (res) => {
      if (!res?.ok) alert(res?.error ?? "Could not play card");
    });
  };

  //watch hand for changes
  useEffect(() => {
    if (Array.isArray(myHand) && myHand.length > 0) {
      const newest = myHand[myHand.length - 1];
      setLastDealtId(newest?.id ?? null);
    } else {
      setLastDealtId(null);
    }
  }, [myHand]);

  const players = Array.isArray(room?.players)
    ? room.players.filter(p => p && typeof p === "object" && p.id)
    : [];

  const opponents = useMemo(
    () => (socketId ? players.filter((p) => p.id !== socketId) : []),
    [players, socketId]
  );

  function handleLeaveGame() {
    socket.emit("leaveRoom");
    navigate("/multiplayer");
  }

  return (
    <div className="p-5" style={backgroundStyle}>
      <h1 className="display-1 text-center fw-bold text-light">Sports Shuffle</h1>
      <NavBar />
      {/* <h2 className="display-2 text-center text-white">{game?.toUpperCase()} Game</h2> */}

      <h2 className="display-3 text-light text-center">
        {me?.name || localName || "Player"}
      </h2>

      {/* Scoreboard */}
      <div className="container my-3">
        <div className="row gy-2">
          {players
            .filter(p => p.id !== socketId)
            .map((p) => {
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
        <div className="row g-2 justify-content-center" style={{ perspective: 1200 }}>
          <AnimatePresence initial={false} mode="popLayout">
            {myHand.map((card, idx) => {
              const isJustDealt = card.id === lastDealtId;
              const isPending = pendingSacrificeId === card.id;

              return (
                <motion.div
                  key={card.id ?? idx}
                  className="col card playingCard gap-3 m-1 p-2"
                  layout="position"
                  initial={{ opacity: 0, y: -20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, y: 10 }}
                  transition={{ type: "spring", stiffness: 500, damping: 36 }}
                  onClick={() => handleCardClick(idx)}
                >
                  <div className="d-flex flex-column h-100">
                    <div className="flex-grow-1 overflow-auto">
                      <div className="d-flex justify-content-between align-items-center">
                        {typeof card.points === "number" && (
                          <span className="badge bg-dark-subtle text-dark">
                            {card.points} pts
                          </span>
                        )}
                      </div>

                      {card.description && (
                        <p className="fs-6 pt-3 text-muted">{card.description}</p>
                      )}

                      {card.penalty && (
                        <p className="fs-5 text-dark">{card.penalty}</p>
                      )}
                      
                    </div>

                    <div className="pt-2 mt-2 border-top">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger w-100"
                        disabled={pendingSacrificeId === card.id}
                        aria-label="Sacrifice this card to draw a replacement"
                        onClick={(e) => {
                          e.stopPropagation();                // ← don’t trigger play
                          handleSacrifice(card);
                        }}
                      >
                        {pendingSacrificeId === card.id ? "Sacrificing…" : "Sacrifice"}
                      </button>
                    </div>
                  </div>
                </motion.div>

              );
            })}
          </AnimatePresence>
        </div>
      </div>


      <hr style={{ margin: "24px 0" }} />

      {/* Opponents */}
      <div style={{ marginTop: 16 }}>
        {opponents.map((p) => (
          <div key={p.id} style={{ marginBottom: 12 }}>
            <strong className="fs-2 text-light text-center">{p.name}</strong>{" "}

            {Array.isArray(p.hand) && (
              <div className="justify-content-center" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                {p.hand.filter(Boolean).map((c, i) => (
                  <div className="p-2 text-center card bg-warning playingCard" key={c?.id ?? i}>
                    <div className="fs-5">{c?.description ?? "-"}</div>
                    <div className="mt-2 fw-bold">{c?.penalty ?? ""}</div>
                    <div className="mt-3 card-text">Points: {Number(c?.points ?? 0)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <button className="btn btn-danger" onClick={handleLeaveGame} style={{ position: "absolute", top: 16, right: 16 }}>
        Leave Game
      </button>
    </div>
  );
}
