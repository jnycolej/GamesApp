import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FaCircle, FaRegCircle } from "react-icons/fa";

const Scoreboard = ({ players = [], leaderIds = [], currentUserId }) => {
  const sorted = useMemo(() => {
    const clean = Array.isArray(players)
      ? players.filter((p) => p && typeof p === "object" && p.id)
      : [];
    return [...clean].sort(
      (a, b) =>
        Number(b.points ?? b.score ?? 0) - Number(a.points ?? a.score ?? 0),
    );
  }, [players]);

  return (
    <div className="container my-3">
      <div className="row gy-2">
        {sorted.map((p) => {
          const score = Number(p.points ?? p.score ?? 0);
          const isLeader = Array.isArray(leaderIds) && leaderIds.includes(p.id);
          const isMe = p.id === currentUserId;

          //styles the colors of the leaderboad
          const bgClass = isLeader
            ? "bg-yellow-300/60 inset-shadow-sm inset-shadow-yellow-100"
            : isMe
              ? "bg-primary-subtle"
              : "bg-stone-50/70";

          return (
            <motion.div key={p.id} className="col-12 col-md-6 col-lg-4" layout>
              <div
                className={`d-flex justify-content-between align-items-center p-3 rounded shadow-sm ${bgClass}`}
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
                <div className="font-semibold text-xl">
                  {p.displayName || p.name || "Player"}{" "}
                  {isMe && <span>(You)</span>}
                  {isLeader && (
                    <span className="ms-2 rounded text-xl" role="img" aria-label="Leader">
                      👑
                    </span>
                  )}
                </div>
                <div className="text-nowrap font-bold text-shadow-lg text-lg">{score} pts</div>
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
