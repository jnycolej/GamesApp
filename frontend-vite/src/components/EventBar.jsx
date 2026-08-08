import React, { useMemo, useRef, useState, useEffect } from "react";
import { MoveUp, MoveDown, ArrowBigDown, ArrowBigUp } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const [pendingEventKey, setPendingEventKey] = useState(null);
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
          { key: "touchdown", title: "Touchdown", points: 6 },
          { key: "interception", title: "Interception", points: 10 },
          { key:"fumble", title: "Fumble", points: 5 },
          { key:"big_play", title: "Big Play (20+ Yards)", points: 10 },
        ];
      case "baseball":
        return [
          // { title: "Score", points: 5 },
          // {
          //   title: (
          //     <>
          //       3 <ArrowBigUp className="inline" />, 3{" "}
          //       <ArrowBigDown className="inline" />
          //     </>
          //   ),
          //   points: 3,
          // },
          { key:"home_run", title: "Home Run", points: 5 },
          { key:"double_score", title: "2x Score", points: 10 },
          { key: "grand_slam", title: "Grand Slam", points: 15 },
        ];
      case "basketball":
        return [
          { key: "dunk", title: "Dunk", points: 10 },
          { key: "three_pointer", title: "3 Pointer", points: 3 },
          { key: "steal", title: "Steal", points: 4 },
        ];
      default:
        return [];
    }
  }, [gameType]);

  const clearPending = () => {
    setPendingEventKey(null);
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
    if (pendingEventKey !== eventObj.key) {
      setPendingEventKey(eventObj.key);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setPendingEventKey(null);
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


      <div className="flex flex-col items-center gap-3 p-2">
        {/* Row 1: Reactions */}
        <div className="bg-zinc-900/30 rounded-lg ">
        <Accordion type="single" collapsible defaultValue="reactions">
          <AccordionItem value="reactions">
            <AccordionTrigger className="!text-stone-50 !text-4xl">
              Quick Reacts
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-wrap justify-center gap-2">
                {REACTIONS.map((reaction) => (
                  <Button
                    key={reaction.key}
                    className="rounded p-2 bg-stone-700/80 inset-shadow-sm inset-shadow-stone-100 text-zinc-50 font-semibold"
                    onClick={() => handleReactionClick(reaction)}
                  >
                    {reaction.label}
                  </Button>
                ))}
{/* 
                <Button
                  type="button"
                  className="rounded text-stone-100 inset-shadow-sm inset-shadow-stone-100 bg-stone-700/80 "
                  onClick={fireSideCannons}
                >
                  🎉{" "}
                </Button>

                <Button
                  className="rounded bg-stone-700/80 inset-shadow-sm inset-shadow-stone-100"
                  onClick={() =>
                    handleReactionClick(fireSportsEmojiBurst(gameType))
                  }
                >
                  🎊
                </Button> */}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>        
        </div>


        {/* Row 2: Event buttons */}
      {(cooldownSeconds > 0 || disabled) && (
        <div className="mb-2 text-center text-lg font-extrabold text-white/80">
          {cooldownSeconds > 0
            ? `Quick Points cooldown: ${cooldownSeconds}s`
            : "Voting in progress…"}
        </div>
      )}

        <p className="text-4xl text-center text-stone-50">Quick Points</p>
        <div className="flex flex-wrap justify-center gap-2">
          {eventButtons.map((eventObj) => {
            const isPending = pendingEventKey === eventObj.key;
            const isLocked = disabled || cooldownSeconds > 0;

            return (
              <motion.div
                key={eventObj.key}
                whileTap={{ scale: isLocked ? 1 : 0.97 }}
              >
                <Button
                  disabled={isLocked}
                  onClick={() => handleTap(eventObj)}
                  className={`gap-2 bg-rose-700 inset-shadow-sm tracking-tighter font-bold md:!text-xl inset-shadow-rose-300 rounded px-2 ${
                    isPending ? "ring-2 ring-sky-300/60" : ""
                  }`}
                >
                  <span>{eventObj.title}</span>
                  {/* <span className="opacity-80 text-sm">{eventObj.points}</span> */}
                </Button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default EventBar;
