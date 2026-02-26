// /src/player/JoinCreateRoom.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import NavBar from "../components/NavBar";
import { getSport, SPORTS } from "@/config/sports";

import { MatchupSelect } from "@/features/room/components/MatchupSelect";
import { useRoomActions } from "@/features/room/hooks/useRoomActions";
import { openShare, copyInvite } from "@/features/room/hooks/useInviteShare";
import { inviteShareText } from "@/features/room/utils/invite";

export default function JoinCreateRoom() {
  const { game } = useParams(); // sportKey in the URL
  const nav = useNavigate();
  const loc = useLocation();

  const sport = getSport(game) ?? SPORTS.baseball;

  // form state
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [selectedMatchup, setSelectedMatchup] = useState(null);

  // invite UI
  const [inviteUrl, setInviteUrl] = useState(null);
  const [isHost, setIsHost] = useState(false);

  // deep link params
  const params = useMemo(() => new URLSearchParams(loc.search), [loc.search]);
  const deepRoom = (params.get("room") || "").toUpperCase();
  const deepToken = params.get("token") || null;

  const { busy, createRoom, joinRoom } = useRoomActions();

  // background style
  const backgroundStyle = useMemo(
    () => ({
      backgroundImage: `url(${sport.background})`,
      minHeight: "100vh",
      width: "100%",
      backgroundRepeat: "no-repeat",
      backgroundAttachment: "fixed",
      backgroundSize: "cover",
    }),
    [sport.background],
  );

  // load saved display name
  useEffect(() => {
    const saved = localStorage.getItem("displayName");
    if (saved) setName(saved);
  }, []);

  // prefill room code if coming from invite link
  useEffect(() => {
    if (deepRoom) setCode(deepRoom);
  }, [deepRoom]);

  const onCreate = async () => {
    const res = await createRoom({
      sportKey: game,
      name,
      matchup: selectedMatchup,
    });

    if (!res?.ok) return alert(res?.error ?? "Failed to create room");

    setIsHost(true);
    setInviteUrl(res.inviteUrl);

    nav(`/${game}/lobby/${res.roomCode}`);
  };

  const onJoin = async ({ forcedCode, forcedToken } = {}) => {
    const res = await joinRoom({
      sportKey: game,
      name,
      code: forcedCode ?? code,
      token: forcedToken ?? deepToken ?? null,
    });

    if (!res?.ok) return alert(res?.error ?? "Join failed");

    nav(`/${game}/lobby/${res.roomCode}`);
  };

  const shareText = (url) =>
    inviteShareText
      ? inviteShareText({ sportKey: game, url })
      : `Join my ${String(game).toUpperCase()} room on Sports Shuffle: ${url}\nIf the link doesn't open, open the app -> join -> enter the room code.`;

  return (
    <div className="p-5 gap-3" style={backgroundStyle}>
      <NavBar />

      <h2 className="display-1 text-center text-white">
        {sport.displayName} - Multiplayer
      </h2>

      {/* CREATE */}
      <div className="m-2 input-group" style={{ marginTop: 16 }}>
        <input
          placeholder="YOUR NAME"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="form-control"
        />

        <MatchupSelect
          sportKey={game}
          selected={selectedMatchup}
          onSelect={setSelectedMatchup}
        />

        <button className="btn btn-danger" onClick={onCreate} disabled={busy}>
          {busy ? "Creating..." : "Create Room"}
        </button>

        {isHost && inviteUrl && (
          <div
            className="alert alert-light mt-3 d-flex gap-2 align-items-center"
            style={{ opacity: 0.95 }}
          >
            <span className="me-2">Invite link ready:</span>

            <button
              className="btn btn-outline-primary btn-sm"
              onClick={() => openShare({ sportKey: game, inviteUrl })}
            >
              Share
            </button>

            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={() => copyInvite({ sportKey: game, inviteUrl })}
            >
              Copy
            </button>

            <a
              className="btn btn-outline-success btn-sm"
              href={`sms:&body=${encodeURIComponent(shareText(inviteUrl))}`}
            >
              Text
            </a>
          </div>
        )}
      </div>

      {/* JOIN */}
      <div className="input-group m-2" style={{ marginTop: 16 }}>
        <input
          placeholder="ROOM CODE"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="form-control"
          inputMode="text"
          style={{ textTransform: "uppercase" }}
        />

        <input
          placeholder="YOUR NAME"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="form-control"
        />

        <button className="btn btn-primary" onClick={() => onJoin()} disabled={busy}>
          {busy ? "Joining..." : "Join"}
        </button>
      </div>
    </div>
  );
}