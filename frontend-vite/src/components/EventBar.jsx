import React, { useMemo, useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";

const REACTIONS = [
  { key: "nice", label: "🔥 Nice!" },
  { key: "lucky", label: "😂 Lucky" },
  { key: "rigged", label: "😤 Rigged" },
  { key: "brutal", label: "💀 Brutal" },
];

function fireSideCannons() {
  const end = Date.now() + 3000;
  const colors = ["#a786ff", "#fd8bbc", "#eca184", "#f8deb1"];

  const frame = () => {
    if (Date.now() > end) return;

    confetti({
      particleCount: 2,
      angle: 60,
      spread: 55,
      startVelocity: 60,
      origin: { x: 0, y: 0.5 },
      colors,
    });

    confetti({
      particleCount: 2,
      angle: 120,
      spread: 55,
      startVelocity: 60,
      origin: { x: 1, y: 0.5 },
      colors,
    });

    requestAnimationFrame(frame);
  };

  frame();
}

function fireSportsEmojiBurst(gameType) {
  const scalar = 2;

  const baseballEmoji = confetti.shapeFromText({ text: "⚾", scalar });
  const basketballEmoji = confetti.shapeFromText({ text: "🏀", scalar });
  const footballEmoji = confetti.shapeFromText({ text: "🏈", scalar });

  let chosenShape = baseballEmoji;
  switch (gameType) {
    case "football":
      chosenShape = footballEmoji;
      break;
    case "basketball":
      chosenShape = basketballEmoji;
      break;
    case "baseball":
    default:
      chosenShape = baseballEmoji;
      break;
  }

  const defaults = {
    spread: 360,
    ticks: 60,
    gravity: 0,
    decay: 0.96,
    startVelocity: 20,
    shapes: [chosenShape],
    scalar,
  };

  const shoot = () => {
    confetti({
      ...defaults,
      particleCount: 30,
    });

    confetti({
      ...defaults,
      particleCount: 10,
    });

    confetti({
      ...defaults,
      particleCount: 15,
      scalar: scalar / 2,
      shapes: ["circle"],
    });
  };

  setTimeout(shoot, 0);
  setTimeout(shoot, 100);
  setTimeout(shoot, 200);
}

const EventBar = ({
  gameType,
  onPropose,
  onReaction,
  disabled = false,
  cooldownSeconds = 0,
  confirmWindowMs = 1500,
}) => {
  const [pendingTitle, setPendingTitle] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
  if (disabled || cooldownSeconds > 0) {
    clearPending();
  }
}, [disabled, cooldownSeconds]);

  const eventButtons = useMemo(() => {
    switch (gameType) {
      case "football":
        return [
          { title: "Touchdown", points: 6 },
          { title: "Interception", points: 10 },
          { title: "Field Goal", points: 3 },
          { title: "Fumble", points: 5 },
          { title: "Big Play (20+ Yards)", points: 10 },
        ];
      case "baseball":
        return [
          { title: "Score", points: 5 },
          { title: "3 Up, 3 Down", points: 3 },
          { title: "Home Run", points: 5 },
          { title: "Double Score", points: 10 },
          { title: "Grand Slam", points: 15 },
        ];
      case "basketball":
        return [
          { title: "Dunk", points: 10 },
          { title: "3 Pointer", points: 3 },
          { title: "Steal", points: 4 },
        ];
      default:
        return [{ title: "Default", points: 2 }];
    }
  }, [gameType]);

  const clearPending = () => {
    setPendingTitle(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleTap = (eventObj) => {
    if (disabled || cooldownSeconds > 0) return;

    // first tap = arm confirmation
    if (pendingTitle !== eventObj.title) {
      setPendingTitle(eventObj.title);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setPendingTitle(null);
        timerRef.current = null;
      }, confirmWindowMs);

      return;
    }

    // second tap = confirm
    clearPending();
    onPropose?.(eventObj);
  };

  const handleReactionClick = (reaction) => {
    onReaction?.(reaction);
  };

  return (
    <div className="w-full px-3 pt-5">
      {(cooldownSeconds > 0 || disabled) && (
        <div className="mb-2 text-center text-sm text-white/80">
          {cooldownSeconds > 0
            ? `Event Bar cooldown: ${cooldownSeconds}s`
            : "Voting in progress…"}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto p-2">
        {eventButtons.map((eventObj) => {
          const isPending = pendingTitle === eventObj.title;
          const isLocked = disabled || cooldownSeconds > 0;

          return (
            <motion.div
              key={eventObj.title}
              whileTap={{ scale: isLocked ? 1 : 0.97 }}
              className="shrink-0"
            >
              <Button
                type="button"
                disabled={isLocked}
                onClick={() => handleTap(eventObj)}
                className={`gap-2 rounded px-4 ${
                  isPending ? "ring-2 ring-yellow-300" : ""
                }`}
              >
                <span>{eventObj.title}</span>
                <span className="opacity-80">+{eventObj.points}</span>
              </Button>
            </motion.div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 p-2">
        {REACTIONS.map((reaction) => (
          <Button
            key={reaction.key}
            type="button"
            className="rounded"
            onClick={() => handleReactionClick(reaction)}
          >
            {reaction.label}
          </Button>
        ))}

        <Button
          type="button"
          className="rounded"
          onClick={fireSideCannons}
        >
          Fire Side Cannons
        </Button>

        <Button
          type="button"
          className="rounded"
          onClick={() => fireSportsEmojiBurst(gameType)}
        >
          Celebrate
        </Button>
      </div>
    </div>
  );
};

export default EventBar;