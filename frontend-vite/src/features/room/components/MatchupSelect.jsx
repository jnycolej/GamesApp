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

function matchupSignature(g) {
  const date = String(g?.date ?? "");
  const sport = String(g?.sport ?? "");
  const teams = Array.isArray(g?.teams) ? g.teams : [];
  // normalize spacing/case for stability
  const normTeams = teams.map((t) => String(t).trim()).join(" vs ");
  return `${sport}|${date}|${normTeams}`;
}

export function MatchupSelect({ sportKey, selected, onSelect }) {
  const raw = getTodaysMatchups({ sportKey });

  // Deduplicate while preserving first occurrence order
  const seen = new Set();
  const todaysGames = [];
  for (const g of raw) {
    const sig = matchupSignature(g);
    if (seen.has(sig)) continue;
    seen.add(sig);
    todaysGames.push(g);
  }

  // Use a value that’s stable + unique (index is fine here because list is rebuilt each render)
  const options = todaysGames.map((g, idx) => ({
    game: g,
    value: `${matchupSignature(g)}|${idx}`,
    key: `${matchupSignature(g)}|${idx}`,
    label: `${g.date} : ${(g.teams || []).join(" vs ")}`,
  }));

  const selectedSig = selected ? matchupSignature(selected) : null;
  const selectedOption =
    selectedSig ? options.find((o) => o.value.startsWith(selectedSig)) : null;

  const value = selectedOption?.value ?? "none";

  const handleChange = (val) => {
    if (val === "none") return onSelect(null);
    const found = options.find((o) => o.value === val)?.game ?? null;
    onSelect(found);
  };

  const buttonLabel = selected ? selected.teams.join(" vs ") : "Choose Teams";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">{buttonLabel}</Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="bg-light w-56">
        <DropdownMenuLabel className="text-center">Games Today</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuRadioGroup value={value} onValueChange={handleChange}>
          <DropdownMenuRadioItem value="none">Game not listed</DropdownMenuRadioItem>

          {options.length ? (
            options.map((o) => (
              <DropdownMenuRadioItem key={o.key} value={o.value} className="bg-stone-100">
                {o.label}
              </DropdownMenuRadioItem>
            ))
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