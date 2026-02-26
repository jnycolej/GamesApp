// features/room/components/MatchupSelect.jsx
import { getTodaysMatchups } from "../utils/getTodaysMatchups";
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

export function MatchupSelect({ sportKey, selected, onSelect }) {
  const todaysGames = getTodaysMatchups({ sportKey });

  const value = selected ? `${selected.date}:${selected.teams.join("-")}` : "none";

  const handleChange = (val) => {
    if (val === "none") return onSelect(null);
    const found = todaysGames.find((g) => `${g.date}:${g.teams.join("-")}` === val);
    onSelect(found ?? null);
  };

  const buttonLabel = selected ? selected.teams.join(" vs ") : "Choose Teams";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="" variant="">{buttonLabel}</Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="bg-light w-56">
        <DropdownMenuLabel className="text-center">Games Today</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuRadioGroup value={value} onValueChange={handleChange}>
          <DropdownMenuRadioItem value="none">Game not listed</DropdownMenuRadioItem>

          {todaysGames.length ? (
            todaysGames.map((g) => {
              const v = `${g.date}:${g.teams.join("-")}`;
              return (
                <DropdownMenuRadioItem key={v} value={v} className="bg-stone-100">
                  {g.date} : {g.teams.join(" vs ")}
                </DropdownMenuRadioItem>
              );
            })
          ) : (
            <DropdownMenuRadioItem value="none" disabled>
              No games today
            </DropdownMenuRadioItem>
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}