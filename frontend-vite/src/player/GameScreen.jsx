import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSocket } from "@/shared/socket";
import { useRoomChannel } from "../shared/useRoomState";
import { motion, AnimatePresence } from "framer-motion";
import { FaCircle, FaRegCircle } from "react-icons/fa";

//component imports
import NavBar from "../components/NavBar";
import Scoreboard from "../components/Scoreboard";
import TriviaQuiz from "../components/TriviaQuiz";
import EventBar from "@/components/EventBar";

//Card Decks (temporary while transitioning single player into server)
import footballDeck from "../assets/footballDeck.json";
import baseballDeck from "../assets/baseballDeck.json";
import basketballDeck from "../assets/basketballDeck.json";

//Game card backgrounds
import footballBackground from "@/assets/images/football-background.png";
import baseballBackground from "@/assets/images/baseball-background.png";
import basketballBackground from "@/assets/images/basketballbackground.png";

export default function GameScreen() {
  const { game, mode } = useParams();
  const actualMode = mode ?? "multi";
  const { room, setRoom, myHand, setMyHand } = useRoomChannel();
  const uid = () =>
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

  const hasMatchup = !!room?.matchup;
  const socket = getSocket();

  //State declarations
  const [points, setPoints] = useState(0); //Your score
  const [otherScores, setOtherScores] = useState({}); //Your opponent's scores
  const [socketId, setSocketId] = useState(socket.id || null);
  const [quizUnlocked, setQuizUnlocked] = useState(false);
  const [pendingVote, setPendingVote] = useState(null);
  const [eventCooldownUntil, setEventCooldownUntil] = useState(0);

  const [voteNow, setVoteNow] = useState(Date.now());
  useEffect(() => {
    if (!pendingVote) return;
    const t = setInterval(() => setVoteNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [pendingVote]);

  //Keeps track of the cards that are being sacrficed
  const [pendingSacrificeId, setPendingSacrificeId] = useState(null);
  const [sacrificeTimer, setSacrificeTimer] = useState(null);

  //setting quiz unlock timer
  const [unlockAt, setUnlockAt] = useState(() => Date.now() + 400 * 60 * 25);
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
  const SACRIFICE_SHIELD_MS = 200;
  const SACRFIFICE_COOLDOWN_MS = 1000;

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

  useEffect(() => {
    if (actualMode === "single") return;

    const onCooldown = (payload) => {
      const until = Number(payload?.until ?? 0) || 0;
      setEventCooldownUntil(until);
    };

    socket.on("event:cooldown", onCooldown);
    return () => socket.off("event:cooldown", onCooldown);
  }, [actualMode, socket]);

  const cooldownSeconds = Math.max(
    0,
    Math.ceil((eventCooldownUntil - Date.now()) / 1000),
  );
  const eventBarDisabled =
    actualMode !== "single" && (pendingVote != null || cooldownSeconds > 0);

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

  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  //Picks which background to use based on the game being played
  let background;

  switch (game) {
    case "baseball":
      background = baseballBackground;
      break;
    case "basketball":
      background = basketballBackground;
      break;
    case "football":
      background = footballBackground;
      break;
    default:
      background = footballBackground;
      break;
  }

  //Shuffles and deals the deck
  useEffect(() => {
    if (actualMode !== "single") return;

    const decks = {
      football: footballDeck,
      baseball: baseballDeck,
      basketball: basketballDeck,
    };

    const base = decks[game] ?? footballDeck;

    //normalize cards (match your UI expectations)
    const normalized = base.map((c, i) => ({
      id: c.id ?? `${game}-${i}-${uid()}`,
      description: c.description ?? c.title ?? c.name ?? "",
      penalty: c.penalty ?? "",
      points: Number.isFinite(c.points) ? c.points : Number(c.points ?? 0),
    }));

    //shuffle + deal 5
    const shuffled = [...normalized].sort(() => Math.random() - 0.5);
    const hand = shuffled.slice(0, 5);

    setMyHand(hand);
    setPoints(0);

    //also set a room object so Scoreboard works
    const displayName =
      (typeof window !== "undefined" && localStorage.getItem("displayName")) ||
      "Player";

    const meId = "local-player";

    setRoom({
      code: "LOCAL",
      gameType: game,
      phase: "playing",
      matchup: null,
      leaderIds: [meId],
      players: [{ id: meId, name: displayName, points: 0, score: 0 }],
    });

    setSocketId(meId);
  }, [actualMode, game, setMyHand, setPoints, setRoom]);

  //updates the game room
  useEffect(() => {
    if (actualMode === "single") return;

    const update = () => setSocketId(socket.id || null);
    const onDisconnect = () => setSocketId(null);

    update();

    socket.on("connect", update);
    socket.on("reconnect", update);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", update);
      socket.off("reconnect", update);
      socket.off("disconnect", onDisconnect);
    };
  }, [actualMode, socket]);

  const voteSecondsLeft = pendingVote
    ? Math.max(0, Math.ceil((pendingVote.expiresAt - voteNow) / 1000))
    : 0;

  useEffect(() => {
    if (actualMode === "single") return;

    const onProposed = (ev) => setPendingVote(ev);
    const onUpdated = (ev) => setPendingVote(ev);
    const onResolved = (_res) => setPendingVote(null);

    socket.on("event:proposed", onProposed);
    socket.on("event:updated", onUpdated);
    socket.on("event:resolved", onResolved);

    return () => {
      socket.off("event:proposed", onProposed);
      socket.off("event:updated", onUpdated);
      socket.off("event:resolved", onResolved);
    };
  }, [actualMode, socket]);

  // handles the card sacrifice and the new player score
  const handleSacrifice = (card) => {
    if (actualMode === "single") {
      // local: subtract card points and replace it
      const pts = Number(card.points ?? 0) || 0;
      setPoints((p) => p - pts);

      setMyHand((prev) => {
        const idx = prev.findIndex((c) => c?.id === card.id);
        if (idx === -1) return prev;
        const next = [...prev];

        const decks = {
          football: footballDeck,
          baseball: baseballDeck,
          basketball: basketballDeck,
        };
        const base = decks[game] ?? footballDeck;
        const raw = base[Math.floor(Math.random() * base.length)];

        next[idx] = {
          id: raw.id ?? uid(),
          description: raw.description ?? raw.title ?? raw.name ?? "",
          penalty: raw.penalty ?? "",
          points: Number(raw.points ?? 0),
        };
        return next;
      });

      return;
    }

    if (!card?.id) return;

    //ignore plays on this card surface for a short window
    cardPlayIgnoreUntilRef.current.set(
      card.id,
      Date.now() + SACRIFICE_SHIELD_MS,
    );

    setPendingSacrificeId(card.id);
    if (sacrificeTimer) {
      clearTimeout(sacrificeTimer);
      setSacrificeTimer(null);
    }
    //console.log("[UI] sacrifice click", { cardId: card.id });

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
    const id = ev?.player?.id || ev?.playerId;
    const fromRoom =
      room?.players?.find((p) => p.id === id)?.displayName ||
      room?.players?.find((p) => p.id === id)?.name;

    const name = ev?.player?.name || fromRoom || "Player";
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
        return (
          <span className="text-green-500 font-semibold">
            🟢 +{pts}
            <span className="font-bold"> {name} </span>
            <span className="text-muted-foreground"> - {quoted}</span>
          </span>
        );
      case "CARD_SACRIFICED":
        return (
          <span className="text-red-500 font-semibold">
            🔴 -{pts}
            <span className="font-bold"> {name} </span>
            <span className="text-muted-foreground"> - {quoted}</span>
          </span>
        );
      case "SCORE_ADJUSTED":
        return `${name} ${delta > 0 ? "gains" : "loses"} ${pts} ${ptsWord}!`;
      case "TURN_STARTED":
        return `Turn ${ev?.meta?.turn ?? "?"}: ${name}'s move.`;
      case "EVENT_CONFIRMED":
        return (
          <span className="text-primary font-semibold">
            ✅ <span className="font-bold">{name}</span>{" "}
            <span className="text-muted-foreground">hit</span>{" "}
            <span className="text-muted-foreground">{quoted}</span>{" "}
            <span className="text-muted-foreground">(+{pts})</span>
          </span>
        );
      default:
        return ev?.text || "Update";
    }
  };

  useEffect(() => {
    if (actualMode === "single") return;

    const onAny = (name, ...args) => {
      if (String(name).startsWith("event:")) {
        console.log("[UI] recv", name, args[0]);
      }
    };

    socket.onAny(onAny);
    return () => socket.offAny(onAny);
  }, [actualMode, socket]);

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
    if (actualMode === "single") return;

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
    const onRoomUpdated = () => socket.emit("game:history:request");
    socket.on("room:updated", onRoomUpdated);

    return () => {
      socket.off("room:updated", onRoomUpdated);
      socket.off("game:update", onUpdate);
      socket.off("game:history", onHistory);
      socket.off("connect", onConnect);
    };
  }, [actualMode, socket]);

  // clear when a fresh state arrives
  useEffect(() => {
    if (actualMode === "single") return;

    const onState = (next) => {
      // whenever server pushes a new state, ensure nothing is stuck
      if (pendingSacrificeId) setPendingSacrificeId(null);
    };
    socket.on("room:state", onState);
    return () => socket.off("room:state", onState);
  }, [actualMode, socket, pendingSacrificeId]);

  //Styles the background image
  const backgroundStyle = {
    backgroundImage: `url(${background})`,
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

  useEffect(() => {
    if (actualMode === "single") return;

    const syncMine = () => {
      socket.emit("hand:getMine", {}, (res) =>
        setMyHand(Array.isArray(res?.hand) ? res.hand.filter(Boolean) : []),
      );

      socket.emit("score:getMine", {}, (res) =>
        setPoints(Number(res?.score ?? 0) || 0),
      );

      // optional but helps UI immediately after resume
      socket.emit("room:get", {}, (res) => {
        if (res?.ok && res?.state) setRoom(res.state);
      });
    };

    syncMine();
    socket.on("connect", syncMine);

    return () => {
      socket.off("connect", syncMine);
    };
  }, [actualMode, socket, setMyHand, setPoints, setRoom]);

  //updates score and hand in the backend
  useEffect(() => {
    if (actualMode === "single") return;

    const onHand = (hand) =>
      setMyHand(Array.isArray(hand) ? hand.filter(Boolean) : []);
    const onScore = (score) => setPoints(Number(score ?? 0) || 0);

    socket.on("hand:update", onHand);
    socket.on("score:update", onScore);

    return () => {
      socket.off("hand:update", onHand);
      socket.off("score:update", onScore);
    };
  }, [actualMode, socket, setMyHand, setPoints]);

  //replaces card with new one after playing a card
  const handleCardClick = (index) => {
    if (actualMode === "single") {
      setMyHand((prev) => {
        const next = [...prev];
        const picked = next[index];
        if (!picked) return prev;

        const pts = Number(picked.points ?? 0) || 0;
        setPoints((p) => p + pts);

        // replace with a new random card
        const decks = {
          football: footballDeck,
          baseball: baseballDeck,
          basketball: basketballDeck,
        };
        const base = decks[game] ?? footballDeck;
        const raw = base[Math.floor(Math.random() * base.length)];
        next[index] = {
          id: raw.id ?? uid(),
          description: raw.description ?? raw.title ?? raw.name ?? "",
          penalty: raw.penalty ?? "",
          points: Number(raw.points ?? 0),
        };
        return next;
      });

      // keep scoreboard in sync
      setRoom((prev) => {
        if (!prev?.players?.length) return prev;
        const meId = "local-player";
        const next = structuredClone(prev);
        const me = next.players.find((p) => p.id === meId);
        if (me) {
          me.points =
            (me.points ?? 0) + (Number(myHand?.[index]?.points ?? 0) || 0);
          me.score = me.points;
        }
        next.leaderIds = [meId];
        return next;
      });

      return;
    }

    socket.emit("game:playCard", { index }, (res) => {
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
    [players, socketId],
  );

  //adds points based on Event bar buttons
  const handleEventConfirm = (ev) => {
    const delta = Number(ev?.points ?? 0) || 0;
    const title = ev?.title ?? "Event";

    if (!delta) return;

    //Single Player: update local points + scoreboard room
    if (actualMode === "single") {
      setPoints((p) => (Number.isFinite(p) ? p : 0) + delta);

      setRoom((prev) => {
        if (!prev?.players?.length) return prev;
        const meId = "local-player";
        const next = structuredClone(prev);
        const me = next.players.find((p) => p.id === meId);
        if (me) {
          me.points = (me.points ?? 0) + delta;
          me.score = me.points;
        }
        next.leaderIds = [meId];
        return next;
      });

      //Push into your local updates feed
      setUpdates((prev) => {
        const withId = {
          id: `local-event-${Date.now()}-${Math.random()}`,
          type: "EVENT_CONFIRMED",
          at: Date.now(),
          deltaPoints: delta,
          playerId: "local-player",
          card: { description: title },
          text: `Event: ${title} (+${delta})`,
        };
        return [...prev, withId].slice(-MAX_UPDATES);
      });

      return;
    }

    //Scoring API
    socket.emit(
      "score:adjust",
      { delta, meta: { source: "eventBar", title } },
      (ack) => {
        if (!ack?.ok) {
          console.warn("Event score adjust failed:", ack?.error);
          return;
        }
        const next = Number(ack.newScore);
        if (Number.isFinite(next)) setPoints(next);
      },
    );
  };

  function handleLeaveGame() {
    socket.emit("leaveRoom");
    navigate(`/`);
  }

  return (
    <div className="p-5 min-h-screen w-screen" style={backgroundStyle}>
      <NavBar />
      <h1 className="text-white text-center">
        {room?.matchup?.teams?.length
          ? `${room.matchup.teams[0]} vs. ${room.matchup.teams[1]}`
          : `${game?.toUpperCase()} Game`}
      </h1>

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

      <EventBar
        gameType={game}
        disabled={eventBarDisabled}
        cooldownSeconds={cooldownSeconds}
        onPropose={(ev) => {
          if (actualMode === "single") {
            handleEventConfirm(ev); // your local single-player behavior
            return;
          }
          if (!room?.code || room?.phase !== "playing") {
            console.warn("[UI] cannot propose: not in playing room", {
              roomCode: room?.code,
              phase: room?.phase,
            });
            return;
          }
          console.log("[UI] proposing event", ev, {
            socketId: socket.id,
            connected: socket.connected,
            roomCode: room?.code,
            phase: room?.phase,
            players: room?.players?.length,
          });
          socket.emit(
            "event:propose",
            { title: ev.title, points: ev.points },
            (ack) => {
              console.log("[UI] event:propose ACK:", ack);

              if (!ack?.ok) {
                if (ack?.error === "cooldown" && ack?.until)
                  setEventCooldownUntil(ack.until);
                console.warn("event:propose failed:", ack?.error);
              }
            },
          );
        }}
      />
      {pendingVote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4">
            <h3 className="text-xl font-bold">
              {pendingVote.byName} selected: {pendingVote.title}
            </h3>

            <p className="mt-2 text-sm text-gray-600">
              Confirm to award <strong>+{pendingVote.points}</strong> points.
            </p>

            <div className="mt-3 text-sm">
              Yes: <strong>{pendingVote.yesCount}</strong> /{" "}
              {pendingVote.neededYes} needed
              {" · "}
              No: <strong>{pendingVote.noCount}</strong>
            </div>

            <div className="mt-2 text-sm text-gray-700">
              Time left:{" "}
              <strong>
                {Math.max(
                  0,
                  Math.ceil((pendingVote.expiresAt - voteNow) / 1000),
                )}
                s
              </strong>
            </div>

            {/* proposer can't vote */}
            {pendingVote.byPlayerId === socketId ? (
              <div className="mt-4 text-sm text-gray-500">
                Waiting for others to vote...
              </div>
            ) : (
              <div className="mt-4 flex gap-2 justify-end">
                <button
                  className="btn btn-outline-danger"
                  onClick={() =>
                    socket.emit(
                      "event:vote",
                      { id: pendingVote.id, vote: "no" },
                      (ack) => {
                        if (!ack?.ok)
                          console.warn("[UI] event:vote no failed:", ack);
                      },
                    )
                  }
                >
                  No
                </button>
                <button
                  className="btn btn-success"
                  onClick={() =>
                    socket.emit(
                      "event:vote",
                      { id: pendingVote.id, vote: "yes" },
                      (ack) => {
                        if (!ack?.ok)
                          console.warn("[UI] event:vote yes failed:", ack);
                      },
                    )
                  }
                >
                  Yes
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Button trigger modal */}
      {room?.matchup && (
        <div className="text-center my-3">
          <button
            type="button"
            className="btn btn-danger btn-lg"
            data-bs-toggle="modal"
            data-bs-target="#quizModal"
            disabled={!isUnlocked}
          >
            {isUnlocked
              ? "Bonus Points Quiz"
              : `Quiz Unlocks in ${fmt(remainingMs)}`}
          </button>

          {/* helper text for screen readers */}
          <div className="visually-hidden" aria-live="polite">
            {isUnlocked
              ? "Quiz unlocked"
              : `Quiz unlocks in ${fmt(remainingMs)}`}
          </div>
        </div>
      )}

      <div
        className="modal fade"
        id="quizModal"
        tabIndex={-1}
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
                matchup={room?.matchup}
                onAward={(delta) => {
                  const d = Number(delta);

                  // ✅ guard: if delta isn't a real number, do nothing (prevents NaN)
                  if (!Number.isFinite(d)) {
                    console.warn("onAward received non-numeric delta:", delta);
                    return;
                  }

                  if (actualMode === "single") {
                    setPoints((p) => (Number.isFinite(p) ? p : 0) + d);
                    return;
                  }

                  socket.emit("score:adjust", { delta: d }, (ack) => {
                    if (!ack?.ok)
                      return console.warn("Award failed:", ack?.error);

                    // ✅ your server returns { ok: true, newScore }
                    const next = Number(ack.newScore);
                    setPoints(Number.isFinite(next) ? next : 0);
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
      <h3 className="display-4 text-light text-center">Points: {me?.points}</h3>

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
