import React, { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const EventBar = ({
  gameType,
  onPropose,
  disabled = false,
  cooldownSeconds = 0,
  confirmWindowMs = 1500,
}) => {
  const [pendingTitle, setPendingTitle] = useState(null);
  const timerRef = useRef(null);

  const EventButtons = useMemo(() => {
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
          { title: "3 up, 3 Down", points: 3 },
          { title: "Home Run", points: 5 },
          { title: "Double Score", points: 10 },
          { title: "Grandslam", points: 15 },
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

  const handleTap = (eventObj) => {
    // first tap: arm confirmation
    if (pendingTitle !== eventObj.title) {
      setPendingTitle(eventObj.title);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setPendingTitle(null);
        timerRef.current = null;
      }, confirmWindowMs);

      return;
    }

    // second tap: confirm
    clearPending();
    onPropose?.(eventObj);
  };

  return (
    <div className="w-full px-3 pt-5">
      <div className="flex gap-2 overflow-x-auto p-2">
        {cooldownSeconds > 0 && (
          <div className="text-center text-sm text-white/80 mb-2">
            Event Bar cooldown: {cooldownSeconds}s
          </div>
        )}
        {disabled && pendingTitle == null && cooldownSeconds === 0 && (
          <div className="text-center text-sm text-white/80 mb-2">
            Voting in progress…
          </div>
        )}

        {EventButtons.map((eventObj) => {
          const isPending = pendingTitle === eventObj.title;

          return (
            <motion.div
              key={eventObj.title}
              whileTap={{ scale: 0.97 }}
              className="shrink-0"
            >
              <Button
                type="button"
                disabled={disabled}
                onClick={() => onPropose?.(eventObj)}
                variant="default"
                className={`gap-2 px-4 rounded ${isPending ? "ring-3 ring-yellow-300" : ""}`}
              >
                {eventObj.title}
                <span className="opacity-80">+{eventObj.points}</span>
              </Button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default EventBar;
