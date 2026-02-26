import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";

const EventBar = ({ gameType }) => {
  let eventButtons = [{ title: "default", points: 2 }];

  switch (gameType) {
    case "football":
      eventButtons = [
        {
          title: "Touchdown",
          points: 6,
        },
        {
          title: "Interception",
          points: 10,
        },
        {
          title: "Field Goal",
          points: 3,
        },
        {
          title: "Fumble",
          points: 5,
        },
        {
             title: "Big Play (20+ Yards)",
             points: 10
         }
      ];
      break;
    case "baseball":
      eventButtons = [
        {
          title: "Score",
          points: 5,
        },
        {
            title: "3 and Out",
            points: 3
        },
        {
            title: "Home Run",
            points: 5
        },
        {
          title: "Double Score",
          points: 10
        },
        {
          title: "Grandslam",
          points: 15
        }
      ];
      break;
    case "basketball":
      eventButtons = [
        {
          title: "Dunk",
          points: 10
        },
        {
          title: "3 Pointer",
          points: 3
        },
        {
          title: "Steal",
          points: 4
        }
      ];
      break;
    default:
      break;
  }
  return (
    <div className="pt-5">
      {eventButtons.map((event) => {
        return <Button variant="" key={event.title} className="gap-2 p-2 mx-2">{event.title}</Button>;
      })}
    </div>
  );
};

export default EventBar;
