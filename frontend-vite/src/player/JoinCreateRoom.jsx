// src/player/JoinCreateRoom.jsx
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group";
import { getSocket } from "@/shared/socket";
import { useRoomActions } from "@/features/room/hooks/useRoomActions";
import { getSport, SPORTS } from "@/config/sports";
import { MatchupSelect } from "@/features/room/components/MatchupSelect";
import { inviteShareText } from "@/features/room/utils/invite";

import NavBar from "../components/NavBar";

export default function JoinCreateRoom() {
  const { game } = useParams();
  const nav = useNavigate();
  const loc = useLocation();

  const { busy, createRoom, joinRoom } = useRoomActions();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [selectedMatchup, setSelectedMatchup] = useState(null);
  const [state, setState] = useState(null);

  const [inviteUrl, setInviteUrl] = useState(null);
  const [isHost, setIsHost] = useState(false);

  const params = new URLSearchParams(loc.search);
  const deepRoom = (params.get("room") || "").toUpperCase();
  const deepToken = params.get("token") || null;

  const sport = getSport(game) ?? SPORTS.baseball;

  const backgroundStyle = {
    backgroundImage: `url(${sport.background})`,
    // minHeight: "100vh",
    // width: "100%",
    backgroundRepeat: "no-repeat",
    backgroundAttachment: "fixed",
    backgroundSize: "cover",
  };

  // load saved display name
  useEffect(() => {
    const saved = localStorage.getItem("displayName");
    if (saved) setName(saved);
  }, []);

  // listen for room updates (optional debug panel)
  useEffect(() => {
    const s = getSocket();
    const onUpd = (st) => setState(st);
    s.on("room:updated", onUpd);
    return () => s.off("room:updated", onUpd);
  }, []);

  // if deep link provides room, prefill code
  useEffect(() => {
    if (deepRoom) setCode(deepRoom);
  }, [deepRoom]);

  const handleCreateRoom = useCallback(async () => {
    const res = await createRoom({
      sportKey: game,
      name,
      matchup: selectedMatchup,
    });

    if (!res?.ok) return alert(res?.error ?? "Failed to create room");

    setIsHost(true);
    setInviteUrl(res.inviteUrl);
    nav(`/${game}/lobby/${res.roomCode}`);
  }, [createRoom, game, name, selectedMatchup, nav]);

  const handleJoinRoom = useCallback(
    async (forcedCode = null, forcedToken = null) => {
      const res = await joinRoom({
        sportKey: game,
        name,
        code: forcedCode ?? code,
        token: forcedToken ?? deepToken ?? null,
      });

      if (!res?.ok) return alert(res?.error ?? "Join failed");

      setState(res.state ?? null);
      nav(`/${game}/lobby/${res.roomCode}`);
    },
    [joinRoom, game, name, code, deepToken, nav],
  );

  // ✅ auto-join deep link once (so invite links "just work")
  // const autoJoinedRef = useRef(false);
  // useEffect(() => {
  //   if (autoJoinedRef.current) return;
  //   if (!deepRoom) return;

  //   // only auto-join if we have a token OR the user hit a join link explicitly
  //   // (if you want auto-join even without token, remove the deepToken check)
  //   autoJoinedRef.current = true;
  //   handleJoinRoom(deepRoom, deepToken);
  // }, [deepRoom, deepToken, handleJoinRoom]);

  const handleShare = useCallback(async () => {
    if (!inviteUrl) return;

    const text = `${inviteShareText({ sportKey: game, url: inviteUrl })}
If the link doesn't open, open the app -> join -> enter the room code.`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "Join my room", text, url: inviteUrl });
      } catch {}
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      window.location.href = `sms:&body=${encodeURIComponent(text)}`;
    } catch {
      alert("Couldn't share/copy on this device.");
    }
  }, [inviteUrl, game]);

  const handleCopyInvite = useCallback(async () => {
    if (!inviteUrl) return;

    const text = `${inviteShareText({ sportKey: game, url: inviteUrl })}
If the link doesn't open, open the app -> join -> enter the room code.`;

    await navigator.clipboard.writeText(text);
    alert("Invite copied!");
  }, [inviteUrl, game]);

  return (
    <div className="min-h-screen w-screen p-5" style={backgroundStyle}>
      <NavBar />

      <h2 className="!text-5xl text-shadow-md py-10 text-shadow-stone-900 text-center text-white">
        {game?.toUpperCase()} - Multiplayer
      </h2>

      {/* CREATE */}
      <div className="m-2 input-group p-3 !rounded" style={{ marginTop: 16 }}>
        <input
          placeholder="YOUR NAME"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="form-control !font-semibold !bg-stone-50/60"
        />
        <ButtonGroup>
          {/* ✅ pass sportKey */}
          <MatchupSelect
            sportKey={game}
            selected={selectedMatchup}
            onSelect={setSelectedMatchup}
          />
          <ButtonGroupSeparator />
          <Button
            variant=""
            className=""
            text="Create Room"
            onClick={handleCreateRoom}
            disabled={busy}
          >
            {busy ? "Creating..." : "Create Room"}
          </Button>
        </ButtonGroup>
      </div>

      {isHost && inviteUrl && (
        <div
          className="alert alert-light mt-3 p-3 d-flex gap-2 align-items-center"
          style={{ opacity: 0.95 }}
        >
          <span className="me-2">Invite link ready:</span>

          <button
            className="btn btn-outline-primary btn-sm"
            onClick={handleShare}
          >
            Share
          </button>

          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={handleCopyInvite}
          >
            Copy
          </button>

          <a
            className="btn btn-outline-success btn-sm"
            href={`sms:&body=${encodeURIComponent(
              `${inviteShareText({ sportKey: game, url: inviteUrl })}
If the link doesn't open, open the app -> join -> enter the room code.`,
            )}`}
          >
            Text
          </a>
        </div>
      )}

      {/* JOIN */}
      <div className="input-group p-3 m-2" style={{ marginTop: 16 }}>
        <input
          placeholder="ROOM CODE"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="form-control !font-semibold !bg-stone-50/60"
          inputMode="text"
          style={{ textTransform: "uppercase" }}
        />

        <input
          placeholder="YOUR NAME"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="form-control !font-semibold !bg-stone-50/60"
        />

        <button
          className="!text-lg bg-blue-600 px-7 rounded text-stone-50 font-semibold"
          onClick={() => handleJoinRoom()}
          disabled={busy}
        >
          {busy ? "Joining..." : "Join"}
        </button>
      </div>

      <pre
        className="display-4 text-dark !text-stone-50 text-center !bg-red-600/60 fw-bold"
        style={{
          marginLeft: 10,
          marginTop: 16,
          fontSize: "1rem",
          background: "rgba(255,255,255,0.7)",
          padding: 12,
          borderRadius: 8,
        }}
      >
        {state
          ? `Room Already Created. Start a new room or rejoin old one. ${code}`
          : "No room yet."}
      </pre>
    </div>
  );
}
