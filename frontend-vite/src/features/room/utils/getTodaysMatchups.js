// features/room/utils/getTodaysMatchups.js
import { todaysDate } from "@/lib/utils/date";
import { gameSchedule } from "@/assets/data/gameSchedules";

export const getTodaysMatchups = ({ sportKey, date = todaysDate } = {}) => {
  if (!sportKey) return [];
  return gameSchedule.filter(
    (g) => g.date === date && g.sport === sportKey
  );
};