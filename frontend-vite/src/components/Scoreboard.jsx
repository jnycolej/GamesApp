import React, {useMemo, useState} from "react";
import { motion } from "framer-motion";

const Scoreboard = ({players= [], leaderIds = [], currentUserId }) => {

    const sorted = useMemo(() => {
        const clean = Array.isArray(players)
            ? players.filter((p) => p && typeof p === "object" && p.id)
            : [];
        return [...clean].sort((a, b) => (Number(b.points ?? b.score ?? 0) - Number(a.points ?? a.score ?? 0)));
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
                        ? "bg-warning-subtle"
                        : isMe
                        ? "bg-primary-subtle"
                        : "bg-white";

                    return (
                        <motion.div key={p.id} className="col-12 col-md-6 col-lg-4" layout>
                            <div
                                className={`d-flex justify-content-between align-items-center p-3 rounded shadow-sm ${bgClass}`}
                                title={p.connected ? "Connected" : "Disconnected"}
                            >
                                <div className="fw-semibold">
                                    {p.displayName || p.name || "Player"} {isMe && <span>(You)</span>}
                                    {isLeader && (
                                        <span className="ms-2" role="img" aria-label="Leader">👑</span>
                                    )}
                                </div>
                                <div className="text-nowrap">{score} pts</div>
                            </div>
                        </motion.div>
                    );
                })}
                {sorted.length === 0 && (
                    <div className="col-12">
                        <div className="p-3 rounded border bg-light text-muted">No players yet.</div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Scoreboard;