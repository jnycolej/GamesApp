import React, { useMemo, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaCircle, FaRegCircle } from "react-icons/fa";

const getPlayerScore = (p) => Number(p?.points ?? p?.score ?? 0) || 0;

const Scoreboard = ({
  players = [],
  leaderIds = [],
  currentUserId,
  activeReaction = null,
}) => {
  const [displayScores, setDisplayScores] = useState({});
  const prevScoresRef = useRef({});

  const sorted = useMemo(() => {
    const clean = Array.isArray(players)
      ? players.filter((p) => p && typeof p === "object" && p.id)
      : [];

    return [...clean].sort((a, b) => getPlayerScore(b) - getPlayerScore(a));
  }, [players]);

  // Maintain displayed scores
  useEffect(() => {
    if (!sorted.length) return;

    setDisplayScores((prev) => {
      const next = { ...prev };

      for (const p of sorted) {
        if (next[p.id] == null) {
          next[p.id] = getPlayerScore(p);
        }
      }

      return next;
    });
  }, [sorted]);

  //Animate score changes
  useEffect(() => {
    if (!sorted.length) return;

    const animations = [];

    for (const p of sorted) {
      const id = p.id;
      const newScore = getPlayerScore(p);
      const oldScore =
        prevScoresRef.current[id] ?? displayScores[id] ?? newScore;

      if (newScore === oldScore) continue;

      const start = performance.now();
      const duration = 500;

      const animate = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const value = Math.round(oldScore + (newScore - oldScore) * progress);

        setDisplayScores((prev) => {
          if (prev[id] === value) return prev;
          return { ...prev, [id]: value };
        });

        if (progress < 1) {
          const frame = requestAnimationFrame(animate);
          animations.push(frame);
        }
      };

      const frame = requestAnimationFrame(animate);
      animations.push(frame);
    }

    const nextPrev = {};
    for (const p of sorted) {
      nextPrev[p.id] = getPlayerScore(p);
    }
    prevScoresRef.current = nextPrev;

    return () => {
      animations.forEach(cancelAnimationFrame);
    };
  }, [sorted]);

  return (
    <div className="container my-3">
      <div className="row gy-2">
        {sorted.map((p) => {
          const realScore = getPlayerScore(p);
          const displayScore = displayScores[p.id] ?? realScore;
          const isLeader = Array.isArray(leaderIds) && leaderIds.includes(p.id);
          const isMe = p.id === currentUserId;
          const isReacting = activeReaction?.playerId === p.id;
          const reactionDelta = Number(activeReaction?.delta ?? 0);

          const bgClass = isLeader
            ? "bg-yellow-300/60 inset-shadow-sm inset-shadow-yellow-100"
            : isMe
              ? "bg-primary-subtle"
              : "bg-stone-50/70";

          return (
            <motion.div
              key={p.id}
              className="col-12 col-md-6 col-lg-4"
              layout
              animate={
                isReacting
                  ? { x: [0, -8, 8, -6, 6, -3, 3, 0] }
                  : { x: 0 }
              }
              transition={{ duration: 0.2 }}
            >
              <div
                className={`relative d-flex justify-content-between align-items-center p-3 rounded shadow-sm transition-all duration-300 ${bgClass} ${
                  isReacting
                    ? "ring-4 ring-red-400/80 shadow-[0_0_30px_rgba(248,113,113,0.65)]"
                    : ""
                }`}
                title={p.connected ? "Connected" : "Disconnected"}
              >
                <div>
                  <FaCircle
                    className={`transition-all ${
                      p.isActive
                        ? "opacity-100 scale-100"
                        : "opacity-70 scale-90"
                    }`}
                    color={p.connected ? "white" : "red"}
                  />
                </div>

                <div
                  className={`font-semibold text-xl transition-all duration-300 ${
                    isReacting
                      ? "text-red-200 drop-shadow-[0_0_10px_rgba(255,120,120,0.95)]"
                      : ""
                  }`}
                >
                  {p.displayName || p.name || "Player"}{" "}
                  {isMe && <span>(You)</span>}
                  {isLeader && (
                    <span
                      className="ms-2 rounded text-xl"
                      role="img"
                      aria-label="Leader"
                    >
                      👑
                    </span>
                  )}
                </div>

                <div className="relative text-nowrap font-bold text-shadow-lg text-lg">
                  {displayScore} pts

                  <AnimatePresence>
                    {isReacting && reactionDelta > 0 && (
                      <motion.div
                        initial={{ y: 0, opacity: 1 }}
                        animate={{ y: -18, opacity: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.6 }}
                        className="absolute -top-5 right-0 text-red-300 text-sm font-bold pointer-events-none"
                      >
                        +{reactionDelta}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          );
        })}

        {sorted.length === 0 && (
          <div className="col-12">
            <div className="p-3 rounded border bg-light text-muted">
              No players yet.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Scoreboard;
