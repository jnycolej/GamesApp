import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSocket } from "../shared/socket";
import { useRoomChannel } from "../shared/useRoomState";
import { motion, AnimatePresence } from "framer-motion";

//component imports
import NavBar from "../components/NavBar";
import Scoreboard from "../components/Scoreboard";
import TriviaQuiz from "../components/TriviaQuiz";

//Bootstrap imports
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";

//Game card backgrounds
import footballBackground from "../assets/football-background.png";
import baseballBackground from "../assets/baseball-background.png";

export default function GameScreen() {
  const { game } = useParams();
  const { room, setRoom, myHand, setMyHand } = useRoomChannel();
  const socket = getSocket();

  //State declarations
  const [points, setPoints] = useState(0); //Your score
  const [otherScores, setOtherScores] = useState({}); //Your opponent's scores
  const [socketId, setSocketId] = useState(socket.id || null);
  const [quizUnlocked, setQuizUnlocked] = useState(false);

  //Keeps track of the cards that are being sacrficed
  const [pendingSacrificeId, setPendingSacrificeId] = useState(null);
  const [sacrificeTimer, setSacrificeTimer] = useState(null);

  //setting quiz unlock timer
  const [unlockAt, setUnlockAt] = useState(() => Date.now() + 1 * 60 * 1000);
  const [quizTimerNow, setQuizTimerNow] = useState(Date.now());

  //tick
  useEffect(() => {
    const t = setInterval(() => setQuizTimerNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const remainingMs = Math.max(0, unlockAt - quizTimerNow);
  const isUnlocked = remainingMs === 0;

  function fmt(ms) {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60)
      .toString()
      .padStart(2, "0");
    const s = (total % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }
  //Game updates window
  const [updates, setUpdates] = useState([]);
  const MAX_UPDATES = 100;
  const scrollerRef = useRef(null);

  const navigate = useNavigate();

  const [lastDealtId, setLastDealtId] = useState(null); //Stores the id of the card dealt before the previous one

  //Gives a buffer for clicking a sacrifice
  const SACRIFICE_SHIELD_MS = 400;
  const SACRFIFICE_COOLDOWN_MS = 2000;

  const sacrificeShieldRef = useRef(false);
  const playCooldownRef = useRef(new Set());
  const cardPlayIgnoreUntilRef = useRef(new Map());

  const [sacrificeCooldown, setSacrificeCooldown] = useState({});

  //Tracks the time until another card is allowed to be sacrificed
  const [sacrificeTick, setSacrificeTick] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setSacrificeTick(Date.now()), 100);
    return () => clearInterval(t);
  }, []);

  function armSacrificeShield(ms = SACRIFICE_SHIELD_MS) {
    sacrificeShieldRef.current = true;
    setTimeout(() => (sacrificeShieldRef.current = false), ms);
  }

  function playOnce(cardId, fn, ms = 250) {
    if (playCooldownRef.current.has(cardId)) return;
    playCooldownRef.current.add(cardId);
    try {
      fn();
    } finally {
      setTimeout(() => playCooldownRef.current.delete(cardId), ms);
    }
  }

  //Timer for displaying the quiz
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuizUnlocked(true);
    }, 10 * 60 * 1000);

    return () => clearTimeout(timer);
  }, []);

  //Tracks the relative time
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  //Picks which background to use based on the game being played
  const background =
    game === "baseball" ? baseballBackground : footballBackground;

  //updates the game room
  useEffect(() => {
    const update = () => setSocketId(socket.id || null);
    update();
    socket.on("connect", update);
    socket.on("reconnect", update);
    socket.on("disconnect", () => setSocketId(null));
    socket.emit("room:get", {}, (res) => res?.ok && setRoom(res.state));

    const onRoom = (st) => {
      if (st?.players?.length) {
        //Checks to see if there are platers in the room
        st.players = st.players
          .filter((p) => p && typeof p === "object" && p.id) //Cleans the player list
          .map((p) => ({
            //updates the player array by cloning the previous one and cleans up their hands
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

  // handles the card sacrifice and the new player score
  const handleSacrifice = (card) => {
    if (!card?.id) return;

    //ignore plays on this card surface for a short window
    cardPlayIgnoreUntilRef.current.set(
      card.id,
      Date.now() + SACRIFICE_SHIELD_MS
    );

    setPendingSacrificeId(card.id);
    if (sacrificeTimer) {
      clearTimeout(sacrificeTimer);
      setSacrificeTimer(null);
    }
    console.log("[UI] sacrifice click", { cardId: card.id });

    socket.emit("player:sacrifice", { cardId: card.id }, (ack) => {
      if (ack?.error) {
        console.warn("[sacrifice] error:", ack.error);
        setPendingSacrificeId(null);
        return;
      }
      setPendingSacrificeId(null);

      //start cooldown for this specific card slot (the replacement has a new id)
      setSacrificeCooldown((prev) => ({
        ...prev,
        [card.id]: Date.now() + SACRFIFICE_COOLDOWN_MS,
      }));
    });

    const t = setTimeout(() => setPendingSacrificeId(null), 6000);
    setSacrificeTimer(t);
  };

  //Puts together the update messages displayed in the game updates component based on the card played
  const formatUpdate = (ev) => {
    const name = ev?.player?.name || "Player";
    const delta = Number(ev?.deltaPoints ?? 0);
    const pts = Math.abs(delta);
    const c = ev?.card || {};

    // Prefer description, then name, then penalty, then an ID fallback
    const label =
      c.description ?? c.name ?? c.penalty ?? (c.id ? `#${c.id}` : null);

    const quoted = label ? `"${String(label)}"` : "a card";
    const ptsWord = pts === 1 ? "pt" : "pts";

    switch (ev?.type) {
      case "CARD_PLAYED":
        return `${name} played ${quoted} for ${pts} ${ptsWord}.`;
      case "CARD_SACRIFICED":
        return `${name} sacrificed ${quoted} for a loss of ${pts} ${ptsWord}.`;
      case "SCORE_ADJUSTED":
        return `${name} ${delta > 0 ? "gains" : "loses"} ${pts} ${ptsWord}.`;
      case "TURN_STARTED":
        return `Turn ${ev?.meta?.turn ?? "?"}: ${name}'s move.`;
      default:
        return ev?.text || "Update";
    }
  };

  //Formating for the game update text window
  const scrollIfNearBottom = () => {
    const el = scrollerRef.current;
    if (!el || !(el instanceof HTMLElement)) return;

    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 0) return;

    const distanceFromBottom = maxScroll - el.scrollTop;
    if (distanceFromBottom < 80) {
      // Smooth + safe autoscroll
      try {
        // Using scrollTo on the parent element ensures no read-only assignment
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      } catch {
        // fallback to requestAnimationFrame if it’s not supported
        requestAnimationFrame(() => {
          try {
            el.scrollTop = el.scrollHeight;
          } catch {}
        });
      }
    }
  };

  //Tracks when the update was pushed
  useEffect(() => {
    const onUpdate = (ev) => {
      const id =
        ev?.id ||
        `${ev?.roomCode ?? "room"}-${ev?.ot ?? Date.now()}-${
          ev?.type ?? "SYS"
        }-${ev?.player?.id ?? ""}`;
      const withId = { id, ...ev };
      setUpdates((prev) => {
        const next = [...prev, withId].slice(-MAX_UPDATES);
        return next;
      });
      requestAnimationFrame(scrollIfNearBottom);
    };

    const onHistory = (arr) => {
      const trimmed = Array.isArray(arr) ? arr.slice(-MAX_UPDATES) : [];
      setUpdates(trimmed);
      requestAnimationFrame(scrollIfNearBottom);
    };

    const onConnect = () => {
      socket.emit("game:history:request");
    };

    socket.on("game:update", onUpdate);
    socket.on("game:history", onHistory);
    socket.on("connect", onConnect);

    //Refresh history whenever the room state swaps
    socket.on("room:updated", () => socket.emit("game:history:request"));

    return () => {
      socket.off("game:update", onUpdate);
      socket.off("game:history", onHistory);
      socket.off("connect", onConnect);
      socket.off("connect", onConnect);
    };
  }, [socket]);

  // clear when a fresh state arrives
  useEffect(() => {
    const onState = (next) => {
      // whenever server pushes a new state, ensure nothing is stuck
      if (pendingSacrificeId) setPendingSacrificeId(null);
    };
    socket.on("room:state", onState);
    return () => socket.off("room:state", onState);
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

  const localName =
    (typeof window !== "undefined" && localStorage.getItem("displayName")) ||
    null;

  // Absolute clock: 24h HH:MM:SS
  function formatClock(at) {
    if (!at) return "";
    const d = new Date(at);
    return d.toLocaleTimeString([], {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  // Relative: "just now", "12s ago", "5m ago", "3h ago", "2d ago"
  function formatRelative(at, now = Date.now()) {
    if (!at) return "";
    let s = Math.max(0, Math.floor((now - at) / 1000));
    if (s < 60) return "just now";
    // if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }

  // my hand + my score
  useEffect(() => {
    socket.emit("hand:getMine", {}, (res) =>
      setMyHand(Array.isArray(res?.hand) ? res.hand.filter(Boolean) : [])
    );
    socket.emit("score:getMine", {}, (res) => setPoints(res?.score ?? 0));

    const onHand = (hand) =>
      setMyHand(Array.isArray(hand) ? hand.filter(Boolean) : []);
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
    ? room.players.filter((p) => p && typeof p === "object" && p.id)
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
      <NavBar />

      {/* Scoreboard */}
      <div className="mb-2 rounded">
        <h2 className="display-3 text-center text-white">Scoreboard</h2>
        <Scoreboard
          players={room?.players ?? []}
          leaderIds={room?.leaderIds ?? []}
          currentUserId={socketId}
        />
      </div>

      {/* Card Game Play-By-Play */}
      <div className="bg-success border rounded">
        <h3 className="text-light">Game Updates:</h3>
        <div
          ref={scrollerRef}
          className="overflow-auto bg-light gameUpdates border rounded p-2"
          style={{ maxHeight: 120, overflowY: "auto" }}
        >
          <ul className="mb-0 ps-3">
            {updates.map((ev) => {
              const cls =
                ev?.deltaPoints > 0
                  ? "text-success"
                  : ev?.deltaPoints < 0
                  ? "text-danger"
                  : "text-body";
              const abs = ev?.at ? formatClock(ev.at) : "";
              const rel = ev?.at ? formatRelative(ev.at, nowTick) : "";

              const ts = ev?.at ? new Date(ev.at).toLocaleTimeString() : "";

              return (
                <li
                  key={ev.id}
                  className={`py-1 ${cls}`}
                  title={ev?.at ? new Date(ev.at).toLocaleString() : ""}
                >
                  {formatUpdate(ev)}
                  {ev?.at && (
                    <span className="text-muted ms-2">
                      · {abs} ({rel})
                    </span>
                  )}
                </li>
              );
            })}
            {updates.length === 0 && (
              <li className="text-muted">No updates yet.</li>
            )}
          </ul>
        </div>
      </div>

      {/* Button trigger modal */}
      <div className="text-center my-3">
        <button
          type="button"
          className="btn btn-danger btn-lg"
          data-bs-toggle="modal"
          data-bs-target="#quizModal"
          disabled={!isUnlocked}
        >
          {isUnlocked ? "Bonus Points Quiz" : `Quiz Unlocks in ${fmt(remainingMs)}`}
        </button>

        {/* helper text for screen readers */}
        <div className="visually-hidden" aria-live="polite">
          {isUnlocked ? "Quiz unlocked" : `Quiz unlocks in ${fmt(remainingMs)}`}
        </div>
      </div>

      <div
        className="modal fade"
        id="quizModal"
        tabindex={-1}
        role="dialog"
        aria-labelledby="quizModalLabel"
        aria-hidden="true"
      >
        <div className="modal-dialog modal-dialog-centered" role="dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="quizModalLabel">
                Half-time Quiz
              </h5>
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
                aria-label="Close"
              ></button>
            </div>
            <div className="modal-body">
              <TriviaQuiz
                onAward={(delta) => {
                  socket.emit("score:adjust", { delta }, (ack) => {
                    if (!ack?.ok) console.warn("Award failed:", ack?.error);
                  });
                }}
              />
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                data-bs-dismiss="modal"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      <h2 className="display-3 text-light text-center">
        {me?.name || localName || "Player"}'s Hand
      </h2>

      {/* My points */}
      <h3 className="display-4 text-light text-center">Points: {points}</h3>

      {/* My hand */}
      <div className="container">
        <div
          className="row g-2 justify-content-center"
          style={{ perspective: 1200 }}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {myHand.map((card, idx) => {
              const isJustDealt = card.id === lastDealtId;
              const isPending = pendingSacrificeId === card.id;

              return (
                <motion.div
                  key={card.id}
                  className="col-12 col-sm-6 col-md-4 col-lg-3"
                  layout="position"
                  initial={{ opacity: 0, y: -20, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, y: 10 }}
                  transition={{ type: "spring", stiffness: 500, damping: 36 }}
                >
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <div
                      className="card playingCard p-3 d-flex flex-column"
                      style={{
                        minHeight: 0,
                        ...(pendingSacrificeId === card.id
                          ? { opacity: 0.9 }
                          : {}),
                      }}
                      onPointerUp={(e) => {
                        if (sacrificeShieldRef.current) return; // just sacrificed

                        const until =
                          cardPlayIgnoreUntilRef.current.get(card.id) || 0;
                        if (Date.now() < until) return;

                        //ignore if this came from a button
                        const t = e.target;
                        if (t && t.closest && t.closest("button")) return;

                        playOnce(card.id, () => handleCardClick(idx));
                      }}
                    >
                      <div className="flex-grow-1 overflow-auto">
                        <div className="d-flex justify-content-between align-items-center">
                          {typeof card.points === "number" && (
                            <span className="badge bg-warning text-dark">
                              {card.points} pts
                            </span>
                          )}
                        </div>

                        {card.description && (
                          <p className="fs-4 pt-3 text-muted">
                            {card.description}
                          </p>
                        )}

                        {card.penalty && (
                          <p className="fs-5 text-dark">{card.penalty}</p>
                        )}
                      </div>

                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger w-100"
                        disabled={
                          pendingSacrificeId === card.id ||
                          (sacrificeCooldown[card.id] ?? 0) > sacrificeTick
                        }
                        aria-label="Sacrifice this card to draw a replacement"
                        onPointerDown={(e) => {
                          // arm shield BEFORE container's pointerup
                          e.stopPropagation(); // no preventDefault here
                          armSacrificeShield();
                        }}
                        onPointerUp={(e) => {
                          // run sacrifice and cancel the click entirely
                          e.stopPropagation();
                          e.preventDefault(); // suppress the upcoming click
                          handleSacrifice(card); // SACRIFICE by id
                        }}
                        onClick={(e) => {
                          // belt & suspenders; click should be suppressed already
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        {(() => {
                          const until = sacrificeCooldown[card.id] ?? 0;
                          const remain = Math.max(0, until - sacrificeTick);
                          if (pendingSacrificeId === card.id)
                            return "Sacrificing...";
                          if (remain > 0)
                            return `Ready in ${(remain / 1000).toFixed(1)}s`;
                          return "Sacrifice";
                        })()}
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      <hr style={{ margin: "24px 0" }} />

      {/* Opponents */}
      <div className="container" style={{ marginTop: 16 }}>
        {opponents.map((p) => (
          <div key={p.id} className="mb-3">
            <strong className="fs-2 text-light text-center d-block">
              {p.name}
            </strong>{" "}
            {Array.isArray(p.hand) && (
              <div
                className="row g-2 justify-content-center mt-2"
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginTop: 6,
                }}
              >
                {p.hand.filter(Boolean).map((c, i) => (
                  <div
                    key={c?.id ?? i}
                    className="col-12 col-sm-6 col-md-4 col-lg-3"
                  >
                    <div
                      className="card bg-warning playingCard p-2 text-center d-flex flex-column"
                      style={{ minHeight: 0 }}
                    >
                      <div className="flex-grow-1 overflow-auto">
                        <div className="fs-3">
                          <p>{c?.description ?? "-"}</p>
                        </div>
                        <div className="mt-2 fs-4 fw-bold">
                          <p>{c?.penalty ?? ""}</p>
                        </div>
                        <div className="mt-3 fs-4 card-text">
                          <p>Points: {Number(c?.points ?? 0)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        className="btn btn-danger"
        onClick={handleLeaveGame}
        style={{ position: "absolute", top: 16, right: 16 }}
      >
        Leave Game
      </button>
    </div>
  );
}
